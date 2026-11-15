import { computeSHA256Hex, decryptPartition, verifyRsa2048 } from '../nand/crypto';
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
  Stage1Opcode,
} from '../nand/types';
import { soundEngine } from '../audio/soundEngine';

export interface BootCallbacks {
  onPhaseChange: (phase: BootPhase) => void;
  onLog: (entry: BootLogEntry) => void;
  onProvisionProgress?: (written: number, total: number, label: string) => void;
  onStage1Step?: (opcodeIndex: number, opcodes: Stage1Opcode[]) => void;
  onStage2Mount?: (mountPoint: string, status: 'mounting' | 'ok' | 'error', detail: string) => void;
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
  slowStep: boolean;
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
      // Decrypt the raw partition ciphertext using its AES-128-CTR hardware keyslot
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
  const stepWait = async (normalMs: number, slowMs: number) => {
    await wait(options.slowStep ? slowMs : normalMs);
  };

  // Eagerly pre-load and decode startup sound into RAM during boot to eliminate playback delay
  void soundEngine.preloadStartupSound();

  try {
    // 0. Ensure IndexedDB Virtual NAND (256 x 16KB chunks = 4.00 MB) is provisioned with AES-CTR
    const provisioned = await nandDriver.isProvisioned();
    if (!provisioned) {
      callbacks.onPhaseChange('provisioning');
      callbacks.onLog(makeLog('IDB', 'warn', 'Virtual NAND unencrypted or unformatted. Flashing AES-128-CTR encrypted chunks...', t0));
      await nandDriver.provisionFreshNand((written, total, label) => {
        callbacks.onProvisionProgress?.(written, total, label);
        callbacks.onLog(makeLog('IDB', 'info', `Flashed ${written}/${total} chunks · ${label}`, t0));
      });
      callbacks.onLog(makeLog('IDB', 'ok', '4.00 MB AES-128-CTR encrypted NAND committed to IndexedDB.', t0));
      await stepWait(250, 600);
    }
    if (checkAbort()) return { outcome: 'aborted' };

    if (options.holdKey === 'START') {
      callbacks.onLog(makeLog('BOOTROM', 'warn', 'Hardware [START] held -> Opening CTR-NAND Recovery Manager', t0));
      const checks = await auditAllPartitions();
      callbacks.onPhaseChange('nand_recovery');
      return { outcome: 'nand_recovery', partitionChecks: checks };
    }

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
    await stepWait(240, 500);
    if (checkAbort()) return { outcome: 'aborted' };

    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'info',
        'Boot9 initializing AES/RSA hardware engines & loading Boot9 Keyslot 0x11',
        t0
      )
    );
    await stepWait(240, 500);
    if (checkAbort()) return { outcome: 'aborted' };

    // ==================== 2. LOADING & CRYPTOGRAPHIC VALIDATION OF NCSD & FIRM ====================
    // Read NCSD Master Header in Sector 0
    const ncsdBuf = await nandDriver.readPartition('ncsd_hdr');
    const ncsdParsed = await parseNcsdHeader(ncsdBuf);
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
    callbacks.onLog(
      makeLog('BOOTROM', 'ok', 'NCSD RSA-2048 signature verified with Root CA key · Table CRC32 OK', t0)
    );

    // Read FIRM0 ciphertext (chunks 1..15)
    const firm0Ciphertext = await nandDriver.readPartition('firm0_boot1', options.slowStep ? 35 : 0);
    if (checkAbort()) return { outcome: 'aborted' };

    // Verify SHA-256 of FIRM0 ciphertext against NCSD table
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

    // REAL AES-128-CTR DECRYPTION: Boot9 decrypts FIRM0 into RAM using Keyslot 0x11
    callbacks.onLog(makeLog('BOOTROM', 'info', 'Boot9 AES Engine: Decrypting FIRM0 (Keyslot 0x11, AES-128-CTR)...', t0));
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

    callbacks.onLog(
      makeLog(
        'BOOTROM',
        'ok',
        `FIRM0 decrypted successfully · Entrypoints: ARM9 ${firm0Parsed.data.arm9Entry}, ARM11 ${firm0Parsed.data.arm11Entry}`,
        t0
      )
    );
    await stepWait(300, 500);
    if (checkAbort()) return { outcome: 'aborted' };

    // Stage 1: Execute Boot9 FIRM Section Loader
    callbacks.onPhaseChange('stage1');
    const opcodes = firm0Parsed.data.opcodes;
    callbacks.onLog(
      makeLog('STAGE1', 'info', `Executing ${firm0Parsed.data.splVersion} (${opcodes.length} vectors)`, t0)
    );

    for (let i = 0; i < opcodes.length; i++) {
      if (checkAbort()) return { outcome: 'aborted' };
      const op = opcodes[i];
      callbacks.onStage1Step?.(i, opcodes);
      callbacks.onLog(makeLog('STAGE1', 'info', `${op.pc} ${op.opcode} -> ${op.target} (${op.detail})`, t0));
      await stepWait(220, 420);
    }

    // Read FIRM1 ciphertext (chunks 16..47)
    const firm1Ciphertext = await nandDriver.readPartition('firm1_stage2', options.slowStep ? 22 : 0);
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

    // REAL AES-128-CTR DECRYPTION: Boot9 decrypts FIRM1 sections (Kernel9, Kernel11, Process9)
    callbacks.onLog(makeLog('STAGE1', 'info', 'Boot9 AES Engine: Decrypting FIRM1 sections (Keyslot 0x11)...', t0));
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

    const arm9Entry = firm1Parsed.data.arm9Entry ?? firm0Parsed.data.arm9Entry ?? '0x08006000';
    const arm11Entry = firm1Parsed.data.arm11Entry ?? firm0Parsed.data.arm11Entry ?? '0x1FF80000';

    callbacks.onLog(
      makeLog(
        'STAGE1',
        'ok',
        `Boot9 & Boot11 protected halves locked (SYSPROT9/11) · Jumping to ${arm9Entry} (ARM9) & ${arm11Entry} (ARM11)`,
        t0
      )
    );
    await stepWait(340, 550);
    if (checkAbort()) return { outcome: 'aborted' };

    // ==================== 3. LAUNCHING HORIZON OS (Kernel9/Kernel11, Process9, pm, sm, fs, pxi, NS) ====================
    callbacks.onPhaseChange('stage2');
    const stage2Header = firm1Parsed.data;
    callbacks.onLog(
      makeLog(
        'STAGE2',
        'info',
        `Kernel9 locking OTP memory & launching Process9; Kernel11 initializing core environment & spawning sysmodules`,
        t0
      )
    );

    if (options.holdKey === 'SELECT') {
      callbacks.onLog(makeLog('STAGE2', 'warn', 'Hardware [SELECT] held -> Entering FIRM Boot Configuration', t0));
      const checks = await auditAllPartitions();
      callbacks.onPhaseChange('stage2_config');
      return { outcome: 'stage2_config', header: stage2Header, partitionChecks: checks };
    }

    await stepWait(380, 550);
    if (checkAbort()) return { outcome: 'aborted' };

    callbacks.onLog(
      makeLog('STAGE2', 'info', 'Process Manager (pm) started sm, fs, and pxi (IPC) · Process9 initialized Keyslots 0x16, 0x25, 0x3D', t0)
    );

    // Mount TWL_SYSDATA (nand:/sys/) via Process9 + fs (AES-128-CTR Keyslot 0x16)
    callbacks.onStage2Mount?.('nand:/sys/', 'mounting', 'Process9 decrypting nand:/sys/ (Keyslot 0x16)');
    const sysCiphertext = await nandDriver.readPartition('twl_sysdata', options.slowStep ? 18 : 0);
    if (checkAbort()) return { outcome: 'aborted' };
    const sysActualHash = await computeSHA256Hex(sysCiphertext);
    if (sysActualHash !== ncsdParsed.records['twl_sysdata']?.sha256) {
      callbacks.onStage2Mount?.('nand:/sys/', 'error', 'SHA-256 mismatch against NCSD_HDR');
      callbacks.onLog(makeLog('STAGE2', 'error', 'TWL_SYSDATA ciphertext hash mismatch', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'twl_sysdata',
        errorCode: '0xD9004587',
        title: 'HORIZON OS FS PANIC: TWL_SYSDATA Corrupt',
        detail: 'Ciphertext integrity check failed on nand:/sys/config.bin before decryption.',
        expectedHash: ncsdParsed.records['twl_sysdata']?.sha256,
        actualHash: sysActualHash,
      });
      return { outcome: 'panic' };
    }

    // REAL AES-128-CTR DECRYPTION: Process9 decrypts TWL_SYSDATA
    const sysPlaintext = await decryptPartition('twl_sysdata', sysCiphertext);
    const sysParsed = parseSysDataPartition(sysPlaintext);
    if (!sysParsed.ok) {
      callbacks.onStage2Mount?.('nand:/sys/', 'error', sysParsed.reason);
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
    callbacks.onStage2Mount?.('nand:/sys/', 'ok', `Owner: ${sysParsed.data.ownerName} · Theme: ${sysParsed.data.themeId}`);
    callbacks.onLog(makeLog('STAGE2', 'ok', `Decrypted & mounted nand:/sys/ (Owner: ${sysParsed.data.ownerName})`, t0));
    await stepWait(300, 500);

    // Mount CTRNAND_SYS (ctrnand:/title/) via Process9 + fs (AES-128-CTR Keyslot 0x25)
    callbacks.onStage2Mount?.('ctrnand:/title/', 'mounting', 'Process9 decrypting ctrnand:/title/ (Keyslot 0x25)');
    const ctrCiphertext = await nandDriver.readPartition('ctrnand_sys', options.slowStep ? 10 : 0);
    if (checkAbort()) return { outcome: 'aborted' };
    const ctrActualHash = await computeSHA256Hex(ctrCiphertext);
    if (ctrActualHash !== ncsdParsed.records['ctrnand_sys']?.sha256) {
      callbacks.onStage2Mount?.('ctrnand:/title/', 'error', 'SHA-256 mismatch against NCSD_HDR');
      callbacks.onLog(makeLog('STAGE2', 'error', 'CTRNAND_SYS ciphertext hash mismatch', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'ctrnand_sys',
        errorCode: '0xD900458B',
        title: 'HORIZON OS FS PANIC: CTRNAND_SYS Corrupt',
        detail: 'Ciphertext integrity check failed on CTRNAND partition before decryption.',
        expectedHash: ncsdParsed.records['ctrnand_sys']?.sha256,
        actualHash: ctrActualHash,
      });
      return { outcome: 'panic' };
    }

    // REAL AES-128-CTR DECRYPTION: Process9 decrypts CTRNAND
    const ctrPlaintext = await decryptPartition('ctrnand_sys', ctrCiphertext);
    const ctrParsed = parseCtrNandPartition(ctrPlaintext);
    if (!ctrParsed.ok) {
      callbacks.onStage2Mount?.('ctrnand:/title/', 'error', ctrParsed.reason);
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
    callbacks.onStage2Mount?.(
      'ctrnand:/title/',
      'ok',
      `${ctrParsed.data.titles.length} titles decrypted · HOME ${ctrParsed.data.homeMenuTitleId}`
    );
    callbacks.onLog(
      makeLog('STAGE2', 'ok', `Decrypted & mounted ctrnand:/title/ (${ctrParsed.data.titles.length} applets + HOME)`, t0)
    );
    await stepWait(300, 500);

    // Mount NAND_USERDATA (nand:/data/) via Process9 + fs (AES-128-CTR Keyslot 0x3D)
    callbacks.onStage2Mount?.('nand:/data/', 'mounting', 'Process9 decrypting nand:/data/ (Keyslot 0x3D)');
    const usrCiphertext = await nandDriver.readPartition('nand_userdata', options.slowStep ? 8 : 0);
    if (checkAbort()) return { outcome: 'aborted' };
    const usrActualHash = await computeSHA256Hex(usrCiphertext);
    if (usrActualHash !== ncsdParsed.records['nand_userdata']?.sha256) {
      callbacks.onStage2Mount?.('nand:/data/', 'error', 'SHA-256 mismatch against NCSD_HDR');
      callbacks.onLog(makeLog('STAGE2', 'error', 'NAND_USERDATA ciphertext hash mismatch', t0));
      callbacks.onPhaseChange('panic');
      callbacks.onPanic({
        stage: 'STAGE2',
        partitionId: 'nand_userdata',
        errorCode: '0xC8A04471',
        title: 'HORIZON OS FS PANIC: NAND_USERDATA Save Corrupt',
        detail: 'Ciphertext integrity check failed on user save partition before decryption.',
        expectedHash: ncsdParsed.records['nand_userdata']?.sha256,
        actualHash: usrActualHash,
      });
      return { outcome: 'panic' };
    }

    // REAL AES-128-CTR DECRYPTION: Process9 decrypts NAND_USERDATA
    const usrPlaintext = await decryptPartition('nand_userdata', usrCiphertext);
    const usrParsed = parseUserDataPartition(usrPlaintext);
    if (!usrParsed.ok) {
      callbacks.onStage2Mount?.('nand:/data/', 'error', usrParsed.reason);
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
    callbacks.onStage2Mount?.(
      'nand:/data/',
      'ok',
      `${usrParsed.data.notes.length} notes · ${usrParsed.data.miis.length} Miis · Grid OK`
    );
    callbacks.onLog(makeLog('STAGE2', 'ok', 'Decrypted & mounted nand:/data/ (User saves & folders)', t0));
    await stepWait(300, 500);

    // pm launches NS module -> initializes ErrDisp & LCD display driver
    callbacks.onLog(
      makeLog(
        'KERNEL',
        'info',
        `pm launched NS (Nintendo Shell) · Initializing ErrDisp & Top/Bottom LCDs -> Autoboot ${ctrParsed.data.homeMenuTitleId}`,
        t0
      )
    );

    // Increment boot counter & encrypt back to TWL_SYSDATA (Keyslot 0x16)
    const updatedConfig = {
      ...sysParsed.data,
      bootCount: sysParsed.data.bootCount + 1,
    };
    await nandDriver.saveSystemConfig(updatedConfig);

    const finalChecks = await auditAllPartitions();
    await stepWait(500, 750);
    if (checkAbort()) return { outcome: 'aborted' };

    callbacks.onPhaseChange('home_menu');
    callbacks.onLog(
      makeLog('HOME', 'ok', `Horizon OS HOME Menu (${ctrParsed.data.homeMenuTitleId}) active`, t0)
    );

    return {
      outcome: 'home_menu',
      state: {
        config: updatedConfig,
        titles: ctrParsed.data.titles,
        userData: usrParsed.data,
        stage1Opcodes: opcodes,
        stage2Header,
        partitionChecks: finalChecks,
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
