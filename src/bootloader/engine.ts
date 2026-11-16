import { computeSHA256Hex, decryptPartition } from '../nand/crypto';
import { nandDriver } from '../nand/idbStorage';
import {
  parseCtrNandPartition,
  parseFirm0Partition,
  parseFirm1Partition,
  parseNcsdHeader,
  parseSysDataPartition,
  parseUserDataPartition,
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

  const ncsdRecords = ncsdParsed.ok ? ncsdParsed.records : null;

  for (const spec of NAND_PARTITIONS) {
    if (spec.id === 'ncsd_hdr') continue;
    const ciphertextBuf = await nandDriver.readPartition(spec.id);
    const actualHash = await computeSHA256Hex(ciphertextBuf);
    const expectedHash = ncsdRecords?.[spec.id]?.sha256 ?? 'UNKNOWN';

    let parseOk = false;
    let magicFound = '----';
    let reason: string | undefined;

    try {
      const decryptedBuf = await decryptPartition(spec.id, ciphertextBuf);

      if (spec.id === 'firm0_boot1') {
        const p = parseFirm0Partition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'firm1_stage2') {
        const p = parseFirm1Partition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'twl_sysdata') {
        const p = parseSysDataPartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'ctrnand_sys') {
        const p = parseCtrNandPartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      } else if (spec.id === 'nand_userdata') {
        const p = parseUserDataPartition(decryptedBuf);
        parseOk = p.ok;
        magicFound = p.magic;
        if (!p.ok) reason = p.reason;
      }
    } catch (err) {
      parseOk = false;
      reason = `AES decryption fault: ${err instanceof Error ? err.message : String(err)}`;
    }

    const hashMatch = ncsdRecords ? actualHash === expectedHash : true;
    const valid = parseOk && hashMatch;
    if (!valid && !reason) {
      reason = `SHA-256 mismatch against NCSD_HDR (${actualHash.slice(0, 12)}... != ${expectedHash.slice(0, 12)}...)`;
    }

    result[spec.id] = {
      id: spec.id,
      valid,
      magicFound: magicFound || '----',
      expectedMagic: spec.magic,
      actualHash,
      expectedHash,
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
    // 0. Ensure IndexedDB Virtual NAND (256 x 16KB chunks = 4.00 MB) is provisioned with AES-CTR
    const provisioned = await nandDriver.isProvisioned();
    if (!provisioned) {
      callbacks.onPhaseChange('provisioning');
      callbacks.onLog(makeLog('IDB', 'warn', 'Virtual NAND unformatted. Flashing AES-128-CTR encrypted chunks...', t0));
      await nandDriver.provisionFreshNand();
      callbacks.onLog(makeLog('IDB', 'ok', '4.00 MB AES-128-CTR encrypted NAND committed to IndexedDB.', t0));
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
        'Boot9 initializing AES/RSA engines, WRAM (0x08000000) & 128 MB FCRAM (0x20000000)',
        t0
      )
    );
    await wait(220);
    if (checkAbort()) return { outcome: 'aborted' };

    // ==================== 2. LOADING & CRYPTOGRAPHIC VALIDATION OF NCSD & FIRM ====================
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
        title: 'BOOTROM FATAL: NCSD RSA-2048 Signature Failed',
        detail: ncsdParsed.reason,
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
      makeLog('BOOTROM', 'ok', 'NCSD RSA-2048 signature verified with Root CA key · Table CRC32 OK', t0)
    );

    // Read & verify FIRM0 ciphertext
    const firm0Ciphertext = await nandDriver.readPartition('firm0_boot1');
    if (checkAbort()) return { outcome: 'aborted' };

    const firm0ActualHash = await computeSHA256Hex(firm0Ciphertext);
    const firm0ExpectedHash = ncsdParsed.records['firm0_boot1']?.sha256 ?? '';
    if (firm0ActualHash !== firm0ExpectedHash) {
      callbacks.onLog(makeLog('BOOTROM', 'error', 'FIRM0 SHA-256 digest mismatch! Chain of trust broken.', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'BOOTROM',
        partitionId: 'firm0_boot1',
        errorCode: '0xFE000104',
        title: 'BOOTROM SIGNATURE FAULT: FIRM0_BOOT1 Corrupted',
        detail: 'Boot9 SHA-256 validation of FIRM0 ciphertext failed against NCSD table digest.',
        expectedHash: firm0ExpectedHash,
        actualHash: firm0ActualHash,
      });
      return { outcome: 'panic' };
    }

    // Decrypt FIRM0 into ARM9 WRAM (0x08006000) via Keyslot 0x11
    const firm0Plaintext = await decryptPartition('firm0_boot1', firm0Ciphertext);
    const firm0Parsed = parseFirm0Partition(firm0Plaintext);
    if (!firm0Parsed.ok) {
      callbacks.onLog(makeLog('BOOTROM', 'error', `Decrypted FIRM0 header error: ${firm0Parsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'BOOTROM',
        partitionId: 'firm0_boot1',
        errorCode: '0xFE000108',
        title: 'BOOTROM DECRYPT FAULT: Corrupt FIRM Payload',
        detail: firm0Parsed.reason,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.firm0_boot1 = {
      id: 'firm0_boot1',
      valid: true,
      magicFound: firm0Parsed.magic,
      expectedMagic: 'FIRM',
      actualHash: firm0ActualHash,
      expectedHash: firm0ExpectedHash,
    };

    const opcodes = fcram.loadFirm0Section(firm0Parsed.data.opcodes, firm0Plaintext);
    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'ok',
        `FIRM0 decrypted into WRAM (0x08006000) · Entrypoints: ARM9 ${firm0Parsed.data.arm9Entry}, ARM11 ${firm0Parsed.data.arm11Entry}`,
        t0
      )
    );
    await wait(250);
    if (checkAbort()) return { outcome: 'aborted' };

    // Stage 1: Execute Boot9 FIRM Section Loader from WRAM
    callbacks.onPhaseChange('stage1');
    const cachedOpcodes = fcram.getFirm0Opcodes() ?? opcodes;
    callbacks.onLog(
      makeLog('STAGE1', 'info', `Executing ${firm0Parsed.data.splVersion} from WRAM (${cachedOpcodes.length} vectors)`, t0)
    );
    for (const op of cachedOpcodes) {
      if (checkAbort()) return { outcome: 'aborted' };
      callbacks.onLog(makeLog('STAGE1', 'info', `${op.pc} ${op.opcode} -> ${op.target}`, t0));
      await wait(160);
    }

    // Read & verify FIRM1 ciphertext
    const firm1Ciphertext = await nandDriver.readPartition('firm1_stage2');
    if (checkAbort()) return { outcome: 'aborted' };

    const firm1ActualHash = await computeSHA256Hex(firm1Ciphertext);
    const firm1ExpectedHash = ncsdParsed.records['firm1_stage2']?.sha256 ?? '';
    if (firm1ActualHash !== firm1ExpectedHash) {
      callbacks.onLog(makeLog('STAGE1', 'error', 'FIRM1 ciphertext SHA-256 mismatch! Stage 1 halted.', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE1',
        partitionId: 'firm1_stage2',
        errorCode: '0xD8E00204',
        title: 'FIRM VALIDATION PANIC: FIRM1 Corrupted',
        detail: 'Stage 1 Bootloader rejected FIRM1_STAGE2 because its SHA-256 digest does not match NCSD[2].',
        expectedHash: firm1ExpectedHash,
        actualHash: firm1ActualHash,
      });
      return { outcome: 'panic' };
    }

    const firm1Plaintext = await decryptPartition('firm1_stage2', firm1Ciphertext);
    const firm1Parsed = parseFirm1Partition(firm1Plaintext);
    if (!firm1Parsed.ok) {
      callbacks.onLog(makeLog('STAGE1', 'error', `Decrypted FIRM1 header error: ${firm1Parsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE1',
        partitionId: 'firm1_stage2',
        errorCode: '0xD8E00209',
        title: 'FIRM SECTION PANIC: Invalid Decrypted FIRM1',
        detail: firm1Parsed.reason,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.firm1_stage2 = {
      id: 'firm1_stage2',
      valid: true,
      magicFound: firm1Parsed.magic,
      expectedMagic: 'STG2',
      actualHash: firm1ActualHash,
      expectedHash: firm1ExpectedHash,
    };

    const stage2Header = fcram.loadFirm1Section(firm1Parsed.data, firm1Plaintext);
    fcram.lockBootrom();

    const arm9Entry = stage2Header.arm9Entry ?? firm0Parsed.data.arm9Entry ?? '0x08006000';
    const arm11Entry = stage2Header.arm11Entry ?? firm0Parsed.data.arm11Entry ?? '0x1FF80000';
    callbacks.onLog(
      makeLog(
        'STAGE1',
        'ok',
        `Boot9/Boot11 protected halves locked · Jumping to ${arm9Entry} (ARM9) & ${arm11Entry} (ARM11)`,
        t0
      )
    );
    await wait(280);
    if (checkAbort()) return { outcome: 'aborted' };

    // ==================== 3. LAUNCHING HORIZON OS ====================
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

    await wait(300);
    if (checkAbort()) return { outcome: 'aborted' };

    // Mount TWL_SYSDATA into FCRAM cache
    const sysCiphertext = await nandDriver.readPartition('twl_sysdata');
    if (checkAbort()) return { outcome: 'aborted' };
    const sysActualHash = await computeSHA256Hex(sysCiphertext);
    const sysExpectedHash = ncsdParsed.records['twl_sysdata']?.sha256 ?? '';
    if (sysActualHash !== sysExpectedHash) {
      callbacks.onLog(makeLog('STAGE2', 'error', 'TWL_SYSDATA ciphertext hash mismatch', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'twl_sysdata',
        errorCode: '0xD9004587',
        title: 'HORIZON OS FS PANIC: TWL_SYSDATA Corrupt',
        detail: 'Ciphertext integrity check failed on nand:/sys/config.bin before decryption.',
        expectedHash: sysExpectedHash,
        actualHash: sysActualHash,
      });
      return { outcome: 'panic' };
    }

    const sysPlaintext = await decryptPartition('twl_sysdata', sysCiphertext);
    const sysParsed = parseSysDataPartition(sysPlaintext);
    if (!sysParsed.ok) {
      callbacks.onLog(makeLog('STAGE2', 'error', `Decrypted TWL_SYSDATA invalid: ${sysParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'twl_sysdata',
        errorCode: '0xD9004587',
        title: 'HORIZON OS FS PANIC: TWL_SYSDATA Corrupt',
        detail: `Process9 failed to parse decrypted config.bin (${sysParsed.reason}).`,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.twl_sysdata = {
      id: 'twl_sysdata',
      valid: true,
      magicFound: sysParsed.magic,
      expectedMagic: 'CFG0',
      actualHash: sysActualHash,
      expectedHash: sysExpectedHash,
    };
    fcram.writeSystemConfigCache(sysParsed.data);
    const id0Short = sysParsed.data.identity?.id0.slice(0, 10) ?? '0000000000';
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'ok',
        `Mounted /rw/sys/SecureInfo_A (${sysParsed.data.region}) & /private/movable.sed (ID0: ${id0Short}...)`,
        t0
      )
    );
    await wait(240);

    // Mount CTRNAND_SYS into FCRAM cache
    const ctrCiphertext = await nandDriver.readPartition('ctrnand_sys');
    if (checkAbort()) return { outcome: 'aborted' };
    const ctrActualHash = await computeSHA256Hex(ctrCiphertext);
    const ctrExpectedHash = ncsdParsed.records['ctrnand_sys']?.sha256 ?? '';
    if (ctrActualHash !== ctrExpectedHash) {
      callbacks.onLog(makeLog('STAGE2', 'error', 'CTRNAND_SYS ciphertext hash mismatch', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'ctrnand_sys',
        errorCode: '0xD900458B',
        title: 'HORIZON OS FS PANIC: CTRNAND_SYS Corrupt',
        detail: 'Ciphertext integrity check failed on CTRNAND partition before decryption.',
        expectedHash: ctrExpectedHash,
        actualHash: ctrActualHash,
      });
      return { outcome: 'panic' };
    }

    const ctrPlaintext = await decryptPartition('ctrnand_sys', ctrCiphertext);
    const ctrParsed = parseCtrNandPartition(ctrPlaintext);
    if (!ctrParsed.ok) {
      callbacks.onLog(makeLog('STAGE2', 'error', `Decrypted CTRNAND invalid: ${ctrParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'ctrnand_sys',
        errorCode: '0xD900458B',
        title: 'HORIZON OS FS PANIC: CTRNAND_SYS Corrupt',
        detail: `Process9 could not read system titles (${ctrParsed.reason}).`,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.ctrnand_sys = {
      id: 'ctrnand_sys',
      valid: true,
      magicFound: ctrParsed.magic,
      expectedMagic: 'CND0',
      actualHash: ctrActualHash,
      expectedHash: ctrExpectedHash,
    };
    fcram.writeCtrNandCache(ctrParsed.data);
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'ok',
        `Mounted ctrnand:/title/ (${ctrParsed.data.packages.length} pkgs) & /dbs/ (title.db: ${ctrParsed.data.dbs.titleDb.length}, ticket.db: ${ctrParsed.data.dbs.ticketDb.length}, import.db: ${ctrParsed.data.dbs.importDb.length})`,
        t0
      )
    );
    await wait(240);

    // Mount NAND_USERDATA into FCRAM cache
    const usrCiphertext = await nandDriver.readPartition('nand_userdata');
    if (checkAbort()) return { outcome: 'aborted' };
    const usrActualHash = await computeSHA256Hex(usrCiphertext);
    const usrExpectedHash = ncsdParsed.records['nand_userdata']?.sha256 ?? '';
    if (usrActualHash !== usrExpectedHash) {
      callbacks.onLog(makeLog('STAGE2', 'error', 'NAND_USERDATA ciphertext hash mismatch', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'nand_userdata',
        errorCode: '0xC8A04471',
        title: 'HORIZON OS FS PANIC: NAND_USERDATA Save Corrupt',
        detail: 'Ciphertext integrity check failed on user save partition before decryption.',
        expectedHash: usrExpectedHash,
        actualHash: usrActualHash,
      });
      return { outcome: 'panic' };
    }

    const usrPlaintext = await decryptPartition('nand_userdata', usrCiphertext);
    const usrParsed = parseUserDataPartition(usrPlaintext);
    if (!usrParsed.ok) {
      callbacks.onLog(makeLog('STAGE2', 'error', `Decrypted NAND_USERDATA invalid: ${usrParsed.reason}`, t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'nand_userdata',
        errorCode: '0xC8A04471',
        title: 'HORIZON OS FS PANIC: NAND_USERDATA Save Corrupt',
        detail: `Failed to parse decrypted user save partition (${usrParsed.reason}).`,
      });
      return { outcome: 'panic' };
    }
    verifiedChecks.nand_userdata = {
      id: 'nand_userdata',
      valid: true,
      magicFound: usrParsed.magic,
      expectedMagic: 'USR0',
      actualHash: usrActualHash,
      expectedHash: usrExpectedHash,
    };
    fcram.writeUserDataCache(usrParsed.data);
    callbacks.onLog(makeLog('STAGE2', 'ok', 'Decrypted & cached nand:/data/ in FCRAM (User saves & folders)', t0));
    await wait(220);

    // pm launches NS -> initializes ErrDisp & LCDs
    callbacks.onLog(
      makeLog(
        'KERNEL',
        'info',
        `pm launched NS · Initializing ErrDisp & Top/Bottom LCDs -> Autoboot ${ctrParsed.data.homeMenuTitleId}`,
        t0
      )
    );

    const updatedConfig = {
      ...sysParsed.data,
      bootCount: sysParsed.data.bootCount + 1,
    };
    fcram.writeSystemConfigCache(updatedConfig);
    await nandDriver.saveSystemConfig(updatedConfig);

    await wait(380);
    if (checkAbort()) return { outcome: 'aborted' };

    callbacks.onPhaseChange('home_menu');
    callbacks.onLog(
      makeLog('HOME', 'ok', `Horizon OS HOME Menu (${ctrParsed.data.homeMenuTitleId}) active`, t0)
    );

    return {
      outcome: 'home_menu',
      state: {
        config: updatedConfig,
        titles: fcram.readTitlesCache() ?? ctrParsed.data.titles,
        ctrNand: fcram.readCtrNandCache() ?? ctrParsed.data,
        userData: fcram.readUserDataCache() ?? usrParsed.data,
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
