import React, { useRef, useState } from 'react';
import {
  BootPhase,
  BootStage2Header,
  NAND_PARTITIONS,
  PartitionId,
  PartitionIntegrity,
} from '../nand/types';
import { nandDriver } from '../nand/idbStorage';
import {
  areKeyslotsDefault,
  exportAesKeyDbBinary,
  exportCtrKeyBundle,
  parseKeyBundleFile,
  PartitionKeyOverrideMap,
} from '../nand/crypto';
import { soundEngine } from '../audio/soundEngine';

export interface PanicInfo {
  stage: 'BOOTROM' | 'STAGE1' | 'STAGE2';
  partitionId: PartitionId;
  errorCode: string;
  title: string;
  detail: string;
  expectedHash?: string;
  actualHash?: string;
}

interface BootScreenProps {
  screen: 'top' | 'bottom';
  phase: BootPhase;
  panicInfo: PanicInfo | null;
  stage2ConfigHeader: BootStage2Header | null;
  partitionChecks: Record<PartitionId, PartitionIntegrity> | null;
  onRepairPartition: (id: PartitionId) => void;
  onRefreshAudit?: () => Promise<void>;
  onReboot: (hold?: 'NONE' | 'SELECT' | 'START') => void;
}

function triggerDownload(filename: string, data: Uint8Array | string, mime: string) {
  const blobPart: BlobPart =
    typeof data === 'string'
      ? data
      : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  const blob = new Blob([blobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

interface FirmBackupUiState {
  configTab: 'mounts' | 'nand_backup';
  busyOp: boolean;
  statusMsg: { ok: boolean; text: string } | null;
  stagedKeys: { fileName: string; map: PartitionKeyOverrideMap } | null;
}

let sharedFirmBackupUi: FirmBackupUiState = {
  configTab: 'mounts',
  busyOp: false,
  statusMsg: null,
  stagedKeys: null,
};

const firmBackupListeners = new Set<() => void>();

function updateFirmBackupUi(patch: Partial<FirmBackupUiState>) {
  sharedFirmBackupUi = { ...sharedFirmBackupUi, ...patch };
  firmBackupListeners.forEach((fn) => fn());
}

export const BootScreenOverlay: React.FC<BootScreenProps> = ({
  screen,
  phase,
  panicInfo,
  stage2ConfigHeader,
  partitionChecks,
  onRepairPartition,
  onRefreshAudit,
  onReboot,
}) => {
  const [, setTick] = useState(0);
  React.useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    firmBackupListeners.add(fn);
    return () => {
      firmBackupListeners.delete(fn);
    };
  }, []);

  const { configTab, busyOp, statusMsg, stagedKeys } = sharedFirmBackupUi;
  const setConfigTab = (tab: 'mounts' | 'nand_backup') => updateFirmBackupUi({ configTab: tab });

  const keyFileInputRef = useRef<HTMLInputElement | null>(null);
  const nandFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDumpEncryptedWithKeys = async () => {
    if (sharedFirmBackupUi.busyOp) return;
    updateFirmBackupUi({ busyOp: true });
    try {
      const encBin = await nandDriver.dumpNandImage('encrypted');
      const keysJson = JSON.stringify(exportCtrKeyBundle(), null, 2);
      triggerDownload('ctr-sim-nand-enc.bin', encBin, 'application/octet-stream');
      window.setTimeout(() => {
        triggerDownload('ctr-sim-keys.json', keysJson, 'application/json');
      }, 150);
      soundEngine.playConfirm();
      updateFirmBackupUi({
        statusMsg: {
          ok: true,
          text: 'Dumped encrypted NAND (4.00 MB) + ctr-sim-keys.json',
        },
      });
    } catch (err) {
      soundEngine.playError();
      updateFirmBackupUi({
        statusMsg: {
          ok: false,
          text: err instanceof Error ? err.message : 'Failed to dump encrypted NAND',
        },
      });
    } finally {
      updateFirmBackupUi({ busyOp: false });
    }
  };

  const handleDumpDecrypted = async () => {
    if (sharedFirmBackupUi.busyOp) return;
    updateFirmBackupUi({ busyOp: true });
    try {
      const decBin = await nandDriver.dumpNandImage('decrypted');
      triggerDownload('ctr-sim-nand-dec.bin', decBin, 'application/octet-stream');
      soundEngine.playConfirm();
      updateFirmBackupUi({
        statusMsg: {
          ok: true,
          text: 'Dumped decrypted NAND .bin (4.00 MB plaintext)',
        },
      });
    } catch (err) {
      soundEngine.playError();
      updateFirmBackupUi({
        statusMsg: {
          ok: false,
          text: err instanceof Error ? err.message : 'Failed to dump decrypted NAND',
        },
      });
    } finally {
      updateFirmBackupUi({ busyOp: false });
    }
  };

  const handleDumpKeysOnly = (format: 'json' | 'bin') => {
    try {
      if (format === 'json') {
        const keysJson = JSON.stringify(exportCtrKeyBundle(), null, 2);
        triggerDownload('ctr-sim-keys.json', keysJson, 'application/json');
        updateFirmBackupUi({
          statusMsg: { ok: true, text: 'Exported ctr-sim-keys.json (AES-128-CTR + RSA pubkey)' },
        });
      } else {
        const bin = exportAesKeyDbBinary();
        triggerDownload('aeskeydb.bin', bin, 'application/octet-stream');
        updateFirmBackupUi({
          statusMsg: { ok: true, text: `Exported aeskeydb.bin (${bin.byteLength} bytes)` },
        });
      }
      soundEngine.playConfirm();
    } catch (err) {
      soundEngine.playError();
      updateFirmBackupUi({
        statusMsg: {
          ok: false,
          text: err instanceof Error ? err.message : 'Failed to export encryption keys',
        },
      });
    }
  };

  const handleKeyFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const map = parseKeyBundleFile(bytes);
      updateFirmBackupUi({
        stagedKeys: { fileName: file.name, map },
        statusMsg: {
          ok: true,
          text: `Loaded keys from ${file.name} (${Object.keys(map).length} slots)`,
        },
      });
      soundEngine.playConfirm();
    } catch (err) {
      soundEngine.playError();
      updateFirmBackupUi({
        statusMsg: {
          ok: false,
          text: err instanceof Error ? err.message : 'Invalid keyfile',
        },
      });
    }
  };

  const handleNandRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    updateFirmBackupUi({ busyOp: true });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const res = await nandDriver.restoreNandImage(bytes, sharedFirmBackupUi.stagedKeys?.map);
      if (onRefreshAudit) {
        await onRefreshAudit();
      }
      soundEngine.playConfirm();
      updateFirmBackupUi({
        statusMsg: {
          ok: res.validPartitions === NAND_PARTITIONS.length,
          text: `Restored ${res.mode.toUpperCase()} .bin (${res.validPartitions}/${NAND_PARTITIONS.length} valid${
            res.usedCustomKeys ? ' · custom keys' : ''
          })`,
        },
      });
    } catch (err) {
      soundEngine.playError();
      updateFirmBackupUi({
        statusMsg: {
          ok: false,
          text: err instanceof Error ? err.message : 'NAND restore failed',
        },
      });
    } finally {
      updateFirmBackupUi({ busyOp: false });
    }
  };

  const handleResetDefaultKeys = async () => {
    updateFirmBackupUi({ busyOp: true });
    try {
      await nandDriver.resetKeyslotsToDefault();
      if (onRefreshAudit) {
        await onRefreshAudit();
      }
      soundEngine.playConfirm();
      updateFirmBackupUi({
        stagedKeys: null,
        statusMsg: { ok: true, text: 'Restored factory Boot9 OTP AES keyslots' },
      });
    } finally {
      updateFirmBackupUi({ busyOp: false });
    }
  };

  if (
    phase === 'off' ||
    phase === 'provisioning' ||
    phase === 'bootrom' ||
    phase === 'stage1' ||
    phase === 'stage2'
  ) {
    return <div className="w-full h-full bg-black" />;
  }

  if (phase === 'panic' && panicInfo) {
    const errWord = panicInfo.errorCode.replace(/^0x/i, '').padStart(8, '0').toUpperCase();
    const h0 = (panicInfo.actualHash ?? 'FFFFFFFFFFFFFFFF').slice(0, 8).toUpperCase();
    const h1 = (panicInfo.actualHash ?? 'FFFFFFFFFFFFFFFF').slice(8, 16).toUpperCase();
    const h2 = (panicInfo.expectedHash ?? '0000000000000000').slice(0, 8).toUpperCase();
    const h3 = (panicInfo.expectedHash ?? '0000000000000000').slice(8, 16).toUpperCase();

    const bootromErrCode =
      panicInfo.partitionId === 'ncsd_hdr'
        ? '00F800FE'
        : panicInfo.partitionId === 'firm0_boot1'
        ? '00F800FF'
        : '00F800EF';

    if (screen === 'top') {
      return (
        <div
          className="w-full h-full p-3 font-mono select-none leading-[1.35] text-[11px] tracking-wide"
          style={{ backgroundColor: '#0000FE', color: '#FFFF00' }}
        >
          <div>BOOTROM 8046</div>
          <div>ERRCODE: {bootromErrCode}</div>
          <div className="pl-[4.8rem] text-[#FFFFFF]/95">
            <div>{errWord} {h0}</div>
            <div>{h1} {h2}</div>
            <div>{h3} 00000000</div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="w-full h-full p-3 font-mono select-none leading-[1.35] text-[11px] tracking-wide"
        style={{ backgroundColor: '#0000FE', color: '#FFFF00' }}
      >
        <div>BOOTROM 8046</div>
        <div>ERRCODE: {bootromErrCode}</div>
        <div className="pl-[4.8rem]">
          <div>FFFFFFFF FFFFFFFF</div>
          <div>00000000 00000000</div>
        </div>
      </div>
    );
  }

  if (phase === 'stage2_config') {
    const validCount = partitionChecks
      ? Object.values(partitionChecks).filter((p) => p.valid).length
      : NAND_PARTITIONS.length;
    const isFactoryKeys = areKeyslotsDefault();

    if (screen === 'top') {
      return (
        <div className="w-full h-full bg-slate-950 text-slate-100 p-3 font-mono text-[10px] flex flex-col justify-between">
          <div>
            <div className="text-sky-400 font-bold text-xs border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between">
              <span>HORIZON OS · FIRM BOOT CONFIGURATION</span>
              <span className="text-[9px] text-slate-400">STAGE 2</span>
            </div>
            {stage2ConfigHeader && (
              <div className="space-y-0.5 text-[9.5px]">
                <div>Kernel Version : <span className="text-white">{stage2ConfigHeader.kernelVersion}</span></div>
                <div>Build Tag      : <span className="text-white">{stage2ConfigHeader.buildTag}</span></div>
                <div>ARM9 / ARM11   : <span className="text-sky-300">{stage2ConfigHeader.arm9Entry ?? '0x08006000'} / {stage2ConfigHeader.arm11Entry ?? '0x1FF80000'}</span></div>
                <div>Sysmodules     : <span className="text-slate-300">{(stage2ConfigHeader.sysmodules ?? ['Process9', 'pm', 'sm', 'fs', 'pxi', 'NS', 'ErrDisp']).join(' · ')}</span></div>
                <div>Autoboot Title : <span className="text-emerald-400">{stage2ConfigHeader.autobootTitleId} (HOME)</span></div>
              </div>
            )}

            <div className="mt-2 p-2 rounded bg-slate-900/90 border border-slate-800 space-y-0.5 text-[9px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">eMMC NAND Image :</span>
                <span className={validCount === NAND_PARTITIONS.length ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  4.00 MB · {validCount}/{NAND_PARTITIONS.length} Partitions OK
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">AES-128 Keyslots:</span>
                <span className={isFactoryKeys ? 'text-sky-300' : 'text-amber-300 font-semibold'}>
                  0x11 / 0x16 / 0x25 / 0x3D ({isFactoryKeys ? 'Factory OTP' : 'Custom'})
                </span>
              </div>
            </div>

            {statusMsg && (
              <div
                className={`mt-1.5 px-2 py-1 rounded border text-[9px] truncate ${
                  statusMsg.ok
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                }`}
              >
                {statusMsg.text}
              </div>
            )}
          </div>
          <div className="text-slate-500 text-[9px] flex items-center justify-between">
            <span>Boot9/Boot11 protected · OTP locked</span>
            <span>Press [START] to boot HOME</span>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-slate-950 text-slate-200 p-2.5 font-mono text-[10px] flex flex-col justify-between">
        {/* Hidden file pickers */}
        <input
          ref={keyFileInputRef}
          type="file"
          accept=".json,.bin"
          className="hidden"
          onChange={(e) => void handleKeyFileSelected(e)}
        />
        <input
          ref={nandFileInputRef}
          type="file"
          accept=".bin,.img"
          className="hidden"
          onChange={(e) => void handleNandRestoreFileSelected(e)}
        />

        {/* Tab Header */}
        <div className="flex gap-1.5 mb-2 shrink-0">
          <button
            onClick={() => setConfigTab('mounts')}
            className={`flex-1 py-1 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
              configTab === 'mounts'
                ? 'bg-sky-600/30 border-sky-400 text-sky-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Mount Table
          </button>
          <button
            onClick={() => setConfigTab('nand_backup')}
            className={`flex-1 py-1 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
              configTab === 'nand_backup'
                ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            NAND &amp; Keys Backup
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll pr-0.5">
          {configTab === 'mounts' ? (
            <div className="space-y-1">
              <div className="text-[9px] text-slate-400 mb-1">MOUNT TABLE IN FIRM1_STAGE2:</div>
              {stage2ConfigHeader?.mountEntries.map((m) => (
                <div
                  key={m.mount}
                  className="flex justify-between bg-slate-900 px-2 py-1.5 rounded border border-slate-800"
                >
                  <span className="text-sky-300">{m.mount}</span>
                  <span className="text-slate-400">{m.partition}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Dump Section */}
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="text-[9px] font-bold text-sky-400 uppercase tracking-wider">
                  Dump NAND &amp; Encryption Keys
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    disabled={busyOp}
                    onClick={() => void handleDumpEncryptedWithKeys()}
                    className="px-2 py-1.5 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold text-[9.5px] cursor-pointer text-center"
                  >
                    Dump Enc NAND + Keys
                  </button>
                  <button
                    disabled={busyOp}
                    onClick={() => void handleDumpDecrypted()}
                    className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-100 font-semibold text-[9.5px] cursor-pointer text-center"
                  >
                    Dump Decrypted .bin
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    disabled={busyOp}
                    onClick={() => handleDumpKeysOnly('json')}
                    className="flex-1 py-1 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[9px] cursor-pointer"
                  >
                    Keys (.json)
                  </button>
                  <button
                    disabled={busyOp}
                    onClick={() => handleDumpKeysOnly('bin')}
                    className="flex-1 py-1 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[9px] cursor-pointer"
                  >
                    aeskeydb.bin
                  </button>
                </div>
              </div>

              {/* Restore Section */}
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                    Restore NAND (.bin Enc / Dec)
                  </span>
                  {(!isFactoryKeys || stagedKeys) && (
                    <button
                      disabled={busyOp}
                      onClick={() => void handleResetDefaultKeys()}
                      className="text-[8.5px] text-amber-300 hover:underline cursor-pointer"
                    >
                      Reset OTP Keys
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={busyOp}
                    onClick={() => keyFileInputRef.current?.click()}
                    className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[9px] cursor-pointer shrink-0"
                  >
                    {stagedKeys ? 'Keyfile Loaded ✓' : 'Optional Keyfile'}
                  </button>
                  <button
                    disabled={busyOp}
                    onClick={() => nandFileInputRef.current?.click()}
                    className="flex-1 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-[9.5px] cursor-pointer"
                  >
                    {busyOp ? 'Working...' : 'Restore NAND .bin (Enc/Dec)'}
                  </button>
                </div>
                <div className="text-[8.5px] text-slate-400 truncate">
                  {stagedKeys
                    ? `Using keys: ${stagedKeys.fileName}`
                    : 'Auto-detects Encrypted or Decrypted 4.00 MB NAND .bin'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 mt-2 shrink-0">
          <button
            onClick={() => onReboot('NONE')}
            className="flex-1 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10.5px] cursor-pointer"
          >
            Save &amp; Boot HOME Menu
          </button>
          <button
            onClick={() => onReboot('START')}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px] border border-slate-700 cursor-pointer"
          >
            Recovery
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'nand_recovery') {
    if (screen === 'top') {
      return (
        <div className="w-full h-full bg-slate-950 text-slate-100 p-3 font-mono text-[10px] flex flex-col justify-between">
          <div>
            <div className="text-amber-400 font-bold text-xs border-b border-slate-800 pb-1 mb-2">
              CTR-NAND RECOVERY MANAGER (STAGE 1 SHELL)
            </div>
            <div className="space-y-1">
              {NAND_PARTITIONS.map((p) => {
                const check = partitionChecks?.[p.id];
                const ok = check?.valid ?? true;
                return (
                  <div key={p.id} className="flex items-center justify-between text-[9px] bg-slate-900/70 px-2 py-0.5 rounded">
                    <span className="text-slate-200 font-medium">{p.name}</span>
                    <span className="text-slate-500">ch {p.startChunk}..{p.endChunk}</span>
                    <span className={ok ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      {ok ? `VALID (${check?.magicFound})` : 'CORRUPT'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-[9px] text-slate-500">Select a partition on the touch screen to repair.</div>
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-slate-950 text-slate-200 p-2.5 font-mono text-[10px] flex flex-col justify-between">
        <div className="space-y-1 overflow-y-auto thin-scroll pr-1">
          {NAND_PARTITIONS.map((p) => {
            const check = partitionChecks?.[p.id];
            const ok = check?.valid ?? true;
            return (
              <div key={p.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded px-2 py-1">
                <div>
                  <div className="text-white text-[10px] font-semibold">{p.name}</div>
                  <div className="text-[9px] text-slate-400">{ok ? 'SHA-256 OK' : check?.reason ?? 'Corrupt'}</div>
                </div>
                <button
                  onClick={() => onRepairPartition(p.id)}
                  className={`px-2 py-1 rounded text-[9px] font-semibold cursor-pointer ${
                    ok
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {ok ? 'Re-flash' : 'Repair'}
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => onReboot('NONE')}
          className="mt-2 w-full py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] cursor-pointer"
        >
          Boot HOME Menu
        </button>
      </div>
    );
  }

  return null;
};
