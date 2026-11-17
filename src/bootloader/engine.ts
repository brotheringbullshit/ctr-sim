import { computeSHA256Hex, decryptPartition, getNandCidHex } from '../nand/crypto';
import { nandDriver } from '../nand/idbStorage';
import {
  parseAgbSavePartition,
  parseCtrNandVolumePartition,
  parseFirmPartition,
  parseNcsdHeader,
  parseTwlPartition,
} from '../nand/payloads';
import {
  BootLogEntry,
  BootPhase,
  BootStage2Header,
  LoadedSystemState,
  NAND_PARTITIONS,
  PartitionId,
  PartitionIntegrity,
} from '../nand/types';
import { soundEngine } from '../audio/soundEngine';
import { fcram } from '../ram/fcram';

export interface BootCallbacks {
  onPhaseChange: (phase: BootPhase) => void;
  onLog: (entry: BootLogEntry) => void;
  onPanic: (info: {
    stage: 'BOOTROM' | 'STAGE1' | 'STAGE2';
    partitionId: PartitionId;
    errorCode: string;
    title: string;
    detail: string;
    expectedHash?: string;
    actualHash?: string;
  }) => void;
}

export interface BootOptions {
  holdKey?: 'NONE' | 'SELECT' | 'START';
  abortSignal?: AbortSignal;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeLog(
  stage: BootLogEntry['stage'],
  level: BootLogEntry['level'],
  message: string,
  startTime: number
): BootLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampMs: Math.round(performance.now() - startTime),
    stage,
    level,
    message,
  };
}

export async function auditAllPartitions(): Promise<Record<PartitionId, PartitionIntegrity>> {
  const result = {} as Record<PartitionId, PartitionIntegrity>;

  const ncsdBuf = await nandDriver.readPartition('ncsd_hdr');
  const ncsdParsed = await parseNcsdHeader(ncsdBuf);
  const ncsdHash = await computeSHA256Hex(ncsdBuf);

  result.ncsd_hdr = {
    id: 'ncsd_hdr',
    valid: ncsdParsed.ok,
    magicFound: ncsdParsed.magic || '----',
    expectedMagic: 'NCSD',
    actualHash: ncsdHash,
    expectedHash: ncsdHash,
    reason: ncsdParsed.ok ? undefined : ncsdParsed.reason,
  };

  for (const spec of NAND_PARTITIONS) {
    if (spec.id === 'ncsd_hdr') continue;
    const ciphertextBuf = await nandDriver.readPartition(spec.id);
    const actualHash = await computeSHA256Hex(ciphertextBuf);

    let parseOk = false;
    let magicFound = '----';
    let reason: string | undefined;

    try {
      const decryptedBuf = await decryptPartition(spec.id, ciphertextBuf);

      if (spec.id === 'twl_nand') {
        const p = parseTwlPartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'agbsave') {
        const p = parseAgbSavePartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'firm0' || spec.id === 'firm1') {
        const p = parseFirmPartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'ctrnand') {
        const p = parseCtrNandVolumePartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      }
    } catch (err) {
      parseOk = false;
      reason = `AES-CTR decryption fault: ${err instanceof Error ? err.message : String(err)}`;
    }

    result[spec.id] = {
      id: spec.id,
      valid: parseOk,
      magicFound: magicFound || '----',
      expectedMagic: spec.magic,
      actualHash,
      expectedHash: actualHash,
      reason,
    };
  }

  return result;
}

export async function runBootSequence(
  callbacks: BootCallbacks,
  options: BootOptions
): Promise<
  | { outcome: 'home_menu'; state: LoadedSystemState }
  | { outcome: 'stage2_config'; header: BootStage2Header; partitionChecks: Record<PartitionId, PartitionIntegrity> }
  | { outcome: 'nand_recovery'; partitionChecks: Record<PartitionId, PartitionIntegrity> }
  | { outcome: 'panic' }
  | { outcome: 'aborted' }
> {
  const t0 = performance.now();
  const checkAbort = () => options.abortSignal?.aborted ?? false;

  // Cold boot clears volatile WRAM & FCRAM
  fcram.reset();

  // Eagerly pre-load and decode startup sound into DSP RAM during boot for zero playback delay
  void soundEngine.preloadStartupSound();

  try {
    // 0. Ensure IndexedDB Virtual NAND (256 x 16KB chunks = 4.00 MB) is provisioned with CID-derived AES-CTR
    const provisioned = await nandDriver.isProvisioned();
    if (!provisioned) {
      callbacks.onPhaseChange('provisioning');
      callbacks.onLog(
        makeLog('IDB', 'warn', 'Virtual NAND unformatted. Flashing CID-derived AES-128-CTR eMMC image...', t0)
      );
      await nandDriver.provisionFreshNand();
      callbacks.onLog(
        makeLog(
          'IDB',
          'ok',
          `4.00 MB Virtual eMMC committed (CID: ${getNandCidHex().slice(0, 12).toUpperCase()}...)`,
          t0
        )
      );
      await wait(250);
    } else {
      await nandDriver.loadPersistedKeyslots();
    }
    if (checkAbort()) return { outcome: 'aborted' };

    if (options.holdKey === 'START') {
      callbacks.onLog(makeLog('BOOTROM', 'warn', 'Hardware [START] held -> Opening CTR-NAND Recovery Manager', t0));
      const checks = await auditAllPartitions();
      callbacks.onPhaseChange('nand_recovery');
      return { outcome: 'nand_recovery', partitionChecks: checks };
    }

    const verifiedChecks = {} as Record<PartitionId, PartitionIntegrity>;

    // ==================== 1. POWER-ON & BOOTROM EXECUTION (Boot9 & Boot11) ====================
    callbacks.onPhaseChange('bootrom');
    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'info',
        'Power-On: ARM9 executing Boot9 (0xFFFF0000), ARM11 executing Boot11 (0x00010000)',
        t0
      )
    );
    await wait(220);
    if (checkAbort()) return { outcome: 'aborted' };

    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'info',
        `Boot9 derived CTR nonces from SHA-256(NAND_CID=${getNandCidHex().slice(0, 12).toUpperCase()}...) · WRAM & 128 MB FCRAM ready`,
        t0
      )
    );
    await wait(220);
    if (checkAbort()) return { outcome: 'aborted' };

    // ==================== 2. SECTOR 0 NCSD + ENCRYPTED TWL MBR VALIDATION ====================
    const ncsdBuf = await nandDriver.readPartition('ncsd_hdr');
    const ncsdParsed = await parseNcsdHeader(ncsdBuf);
    const ncsdHash = await computeSHA256Hex(ncsdBuf);
    if (!ncsdParsed.ok) {
      callbacks.onLog(makeLog('BOOTROM', 'error', `PANIC: ${ncsdParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'BOOTROM',
        partitionId: 'ncsd_hdr',
        errorCode: '0xFE000001',
        title: 'BOOTROM FATAL: NCSD Sector 0 / TWL MBR Failed',
        detail: ncsdParsed.reason,
        actualHash: ncsdHash,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.ncsd_hdr = {
      id: 'ncsd_hdr',
      valid: true,
      magicFound: ncsdParsed.magic,
      expectedMagic: 'NCSD',
      actualHash: ncsdHash,
      expectedHash: ncsdHash,
    };
    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'ok',
        `NCSD RSA-2048 OK (0x100..0x1FF · Sim Boot9 NAND Key) · TWL MBR 0x55AA OK (Keyslot 0x03)`,
        t0
      )
    );

    // ==================== 3. FIRM0 / FIRM1 FAILOVER BOOT ====================
    const firm0Ciphertext = await nandDriver.readPartition('firm0');
    if (checkAbort()) return { outcome: 'aborted' };
    const firm0Hash = await computeSHA256Hex(firm0Ciphertext);
    const firm0Plaintext = await decryptPartition('firm0', firm0Ciphertext);
    const firm0Parsed = parseFirmPartition(firm0Plaintext);

    const firm1Ciphertext = await nandDriver.readPartition('firm1');
    if (checkAbort()) return { outcome: 'aborted' };
    const firm1Hash = await computeSHA256Hex(firm1Ciphertext);
    const firm1Plaintext = await decryptPartition('firm1', firm1Ciphertext);
    const firm1Parsed = parseFirmPartition(firm1Plaintext);

    verifiedChecks.firm0 = {
      id: 'firm0',
      valid: firm0Parsed.ok,
      magicFound: firm0Parsed.magic || '----',
      expectedMagic: 'FIRM',
      actualHash: firm0Hash,
      expectedHash: firm0Hash,
      reason: firm0Parsed.ok ? undefined : firm0Parsed.reason,
    };
    verifiedChecks.firm1 = {
      id: 'firm1',
      valid: firm1Parsed.ok,
      magicFound: firm1Parsed.magic || '----',
      expectedMagic: 'FIRM',
      actualHash: firm1Hash,
      expectedHash: firm1Hash,
      reason: firm1Parsed.ok ? undefined : firm1Parsed.reason,
    };

    let activeFirmSlot: 'FIRM0' | 'FIRM1';
    let activeFirmPayload;
    let activeFirmPlaintext: Uint8Array;

    if (firm0Parsed.ok) {
      activeFirmSlot = 'FIRM0';
      activeFirmPayload = firm0Parsed.data;
      activeFirmPlaintext = firm0Plaintext;
      if (!firm1Parsed.ok) {
        callbacks.onLog(
          makeLog('BOOTROM', 'warn', `Backup NATIVE_FIRM (FIRM1) invalid: ${firm1Parsed.reason}`, t0)
        );
      }
    } else if (firm1Parsed.ok) {
      activeFirmSlot = 'FIRM1';
      activeFirmPayload = firm1Parsed.data;
      activeFirmPlaintext = firm1Plaintext;
      callbacks.onLog(
        makeLog(
          'BOOTROM',
          'warn',
          `FIRM0 decrypt/parse failed (${firm0Parsed.reason}) -> Boot9 failing over to FIRM1!`,
          t0
        )
      );
    } else {
      callbacks.onLog(
        makeLog(
          'BOOTROM',
          'error',
          `Both FIRM0 (${firm0Parsed.reason}) and FIRM1 (${firm1Parsed.reason}) failed!`,
          t0
        )
      );
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'BOOTROM',
        partitionId: 'firm0',
        errorCode: '0xFE000108',
        title: 'BOOTROM DECRYPT FAULT: FIRM0 & FIRM1 Corrupt',
        detail: `FIRM0: ${firm0Parsed.reason} | FIRM1: ${firm1Parsed.reason}`,
        actualHash: firm0Hash,
      });
      return { outcome: 'panic' };
    }

    const opcodes = fcram.loadFirm0Section(activeFirmPayload.opcodes, activeFirmPlaintext);
    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'ok',
        `${activeFirmSlot} decrypted via Keyslot 0x06 into WRAM (0x08006000) · Entry: ARM9 ${activeFirmPayload.arm9Entry}, ARM11 ${activeFirmPayload.arm11Entry}`,
        t0
      )
    );
    await wait(240);
    if (checkAbort()) return { outcome: 'aborted' };

    // Stage 1: Execute FIRM ARM9/ARM11 Kernel Loader
    callbacks.onPhaseChange('stage1');
    const cachedOpcodes = fcram.getFirm0Opcodes() ?? opcodes;
    callbacks.onLog(
      makeLog('STAGE1', 'info', `Executing ${activeFirmPayload.splVersion} (${cachedOpcodes.length} vectors)`, t0)
    );
    for (const op of cachedOpcodes) {
      if (checkAbort()) return { outcome: 'aborted' };
      callbacks.onLog(makeLog('STAGE1', 'info', `${op.pc} ${op.opcode} -> ${op.target}`, t0));
      await wait(140);
    }

    const stage2Header = fcram.loadFirm1Section(activeFirmPayload.stage2Header, activeFirmPlaintext);
    fcram.lockBootrom();

    callbacks.onLog(
      makeLog(
        'STAGE1',
        'ok',
        `Boot9/Boot11 protected halves locked · Jumping to ${activeFirmPayload.arm9Entry} (ARM9) & ${activeFirmPayload.arm11Entry} (ARM11)`,
        t0
      )
    );
    await wait(240);
    if (checkAbort()) return { outcome: 'aborted' };

    // ==================== 4. LAUNCHING HORIZON OS ====================
    callbacks.onPhaseChange('stage2');
    fcram.lockOtpAndInitSysmodules(stage2Header.sysmodules ?? ['Process9', 'pm', 'sm', 'fs', 'pxi', 'NS', 'ErrDisp']);
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'info',
        'Kernel9 locked OTP & launched Process9 · Kernel11 spawned pm, sm, fs, pxi in FCRAM',
        t0
      )
    );

    if (options.holdKey === 'SELECT') {
      callbacks.onLog(makeLog('STAGE2', 'warn', 'Hardware [SELECT] held -> Entering FIRM Boot Configuration', t0));
      const checks = await auditAllPartitions();
      callbacks.onPhaseChange('stage2_config');
      return { outcome: 'stage2_config', header: stage2Header, partitionChecks: checks };
    }

    await wait(240);
    if (checkAbort()) return { outcome: 'aborted' };

    // Mount TWL (TWLN FAT16 + TWLP FAT12) via Keyslot 0x03
    const twlCiphertext = await nandDriver.readPartition('twl_nand');
    if (checkAbort()) return { outcome: 'aborted' };
    const twlHash = await computeSHA256Hex(twlCiphertext);
    const twlPlaintext = await decryptPartition('twl_nand', twlCiphertext);
    const twlParsed = parseTwlPartition(twlPlaintext);
    if (!twlParsed.ok) {
      callbacks.onLog(makeLog('STAGE2', 'error', `Decrypted TWL partition invalid: ${twlParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'twl_nand',
        errorCode: '0xD9004587',
        title: 'HORIZON OS FS PANIC: TWL (TWLN/TWLP) Corrupt',
        detail: `Keyslot 0x03 TWL-CID-CTR decryption/parse failed (${twlParsed.reason}).`,
        actualHash: twlHash,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.twl_nand = {
      id: 'twl_nand',
      valid: true,
      magicFound: twlParsed.magic,
      expectedMagic: 'TWL0',
      actualHash: twlHash,
      expectedHash: twlHash,
    };
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'ok',
        `Mounted TWLN (FAT16 @ ${twlParsed.data.twlnRealOffsetHex}) & TWLP (FAT12 @ ${twlParsed.data.twlpRealOffsetHex}) via Keyslot 0x03`,
        t0
      )
    );

    // Mount AGBSAVE (0x30000 exact) via Keyslot 0x07
    const agbCiphertext = await nandDriver.readPartition('agbsave');
    if (checkAbort()) return { outcome: 'aborted' };
    const agbHash = await computeSHA256Hex(agbCiphertext);
    const agbPlaintext = await decryptPartition('agbsave', agbCiphertext);
    const agbParsed = parseAgbSavePartition(agbPlaintext);
    if (!agbParsed.ok) {
      callbacks.onLog(makeLog('STAGE2', 'error', `Decrypted AGBSAVE invalid: ${agbParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'agbsave',
        errorCode: '0xC8A04471',
        title: 'HORIZON OS FS PANIC: AGBSAVE Corrupt',
        detail: `Process9 failed to parse AGBSAVE 0x30000 scratchpad (${agbParsed.reason}).`,
        actualHash: agbHash,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.agbsave = {
      id: 'agbsave',
      valid: true,
      magicFound: agbParsed.magic,
      expectedMagic: '.SAV',
      actualHash: agbHash,
      expectedHash: agbHash,
    };
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'ok',
        `Verified AGBSAVE scratchpad (0x30000 / 192 KB @ ${agbParsed.data.realOffsetHex}) via Keyslot 0x07`,
        t0
      )
    );
    await wait(180);

    // Mount CTRNAND FAT16 Volume via Keyslot 0x04
    const ctrCiphertext = await nandDriver.readPartition('ctrnand');
    if (checkAbort()) return { outcome: 'aborted' };
    const ctrHash = await computeSHA256Hex(ctrCiphertext);
    const ctrPlaintext = await decryptPartition('ctrnand', ctrCiphertext);
    const ctrParsed = parseCtrNandVolumePartition(ctrPlaintext);
    if (!ctrParsed.ok) {
      callbacks.onLog(makeLog('STAGE2', 'error', `Decrypted CTRNAND FAT16 invalid: ${ctrParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'ctrnand',
        errorCode: '0xD900458B',
        title: 'HORIZON OS FS PANIC: CTRNAND Corrupt',
        detail: `Process9 failed to mount ctrnand:/ via Keyslot 0x04 (${ctrParsed.reason}).`,
        actualHash: ctrHash,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.ctrnand = {
      id: 'ctrnand',
      valid: true,
      magicFound: ctrParsed.magic,
      expectedMagic: 'FAT16',
      actualHash: ctrHash,
      expectedHash: ctrHash,
    };

    const { config, archive, userData } = ctrParsed.data;
    fcram.writeSystemConfigCache(config);
    fcram.writeCtrNandCache(archive);
    fcram.writeUserDataCache(userData);

    const id0Short = config.identity?.id0.slice(0, 10) ?? '0000000000';
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'ok',
        `Mounted ctrnand:/ (MBR 0x06 · FAT16 Vol "CTR" · Keyslot 0x04 · ID0 ${id0Short}... · ${archive.packages.length} /title/ pkgs · title.db ${archive.dbs.titleDb.length})`,
        t0
      )
    );
    await wait(220);

    // pm launches NS -> initializes ErrDisp & LCDs
    callbacks.onLog(
      makeLog(
        'KERNEL',
        'info',
        `pm launched NS · Initializing ErrDisp & Top/Bottom LCDs -> Autoboot ${archive.homeMenuTitleId}`,
        t0
      )
    );

    const updatedConfig = {
      ...config,
      bootCount: config.bootCount + 1,
    };
    fcram.writeSystemConfigCache(updatedConfig);
    await nandDriver.saveSystemConfig(updatedConfig);

    await wait(340);
    if (checkAbort()) return { outcome: 'aborted' };

    callbacks.onPhaseChange('home_menu');
    callbacks.onLog(
      makeLog('HOME', 'ok', `Horizon OS HOME Menu (${archive.homeMenuTitleId}) active`, t0)
    );

    return {
      outcome: 'home_menu',
      state: {
        config: updatedConfig,
        titles: fcram.readTitlesCache() ?? archive.titles,
        ctrNand: fcram.readCtrNandCache() ?? archive,
        userData: fcram.readUserDataCache() ?? userData,
        stage1Opcodes: cachedOpcodes,
        stage2Header,
        partitionChecks: verifiedChecks,
      },
    };
  } catch (err) {
    callbacks.onLog(
      makeLog('KERNEL', 'error', `Unexpected boot fault: ${err instanceof Error ? err.message : String(err)}`, t0)
    );
    callbacks.onPhaseChange('panic');
    callbacks.onPanic({
      stage: 'BOOTROM',
      partitionId: 'ncsd_hdr',
      errorCode: '0xFFFFFFFF',
      title: 'HARDWARE EXCEPTION',
      detail: err instanceof Error ? err.message : String(err),
    });
    return { outcome: 'panic' };
  }
}
