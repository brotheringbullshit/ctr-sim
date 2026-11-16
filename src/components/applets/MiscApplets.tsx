import React, { useState } from 'react';
import {
  ChunkIOEvent,
  MiiProfile,
  NAND_PARTITIONS,
  PartitionId,
  PartitionIntegrity,
  SupportedLanguage,
  UserSaveData,
} from '../../nand/types';
import { CTR_KEYSLOTS } from '../../nand/crypto';
import { nandDriver } from '../../nand/idbStorage';
import { getLocalizedTitle, getTranslations } from '../../i18n/translations';

/* ==================== MII MAKER & PLAZA ==================== */
export const MiiMakerApplet: React.FC<{
  screen: 'top' | 'bottom';
  userData: UserSaveData;
  language?: SupportedLanguage;
  onUpdateUserData: (next: UserSaveData) => Promise<void>;
  onExit: () => void;
}> = ({ screen, userData, language, onUpdateUserData, onExit }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [newName, setNewName] = useState('');
  const selectedMii = userData.miis[selectedIdx] ?? userData.miis[0];
  const t = getTranslations(language);

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-gradient-to-b from-sky-100 to-emerald-50 text-slate-900 p-4 flex flex-col justify-between select-none">
        <div className="flex justify-between items-center border-b border-sky-200 pb-1">
          <span className="text-xs font-bold font-display text-sky-900">{t.miiTitle}</span>
          <span className="text-[10px] font-mono text-sky-700">{userData.miis.length} Miis in NAND</span>
        </div>

        {selectedMii && (
          <div className="flex items-center gap-4 my-auto bg-white/85 rounded-xl p-3 border border-sky-200">
            <div className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center relative border border-slate-200 bg-slate-50 shrink-0">
              <div
                className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center"
                style={{ backgroundColor: selectedMii.skinTone }}
              >
                <div className="flex gap-1.5">
                  <span className="w-1 h-1.5 rounded-full bg-slate-900" />
                  <span className="w-1 h-1.5 rounded-full bg-slate-900" />
                </div>
              </div>
              <div
                className="w-10 h-4 rounded-t-lg mt-0.5"
                style={{ backgroundColor: selectedMii.shirtColor }}
              />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">{selectedMii.name}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">&quot;{selectedMii.greeting}&quot;</div>
            </div>
          </div>
        )}

        <div className="text-[10px] text-sky-800">Mii characters stored inside NAND_USERDATA (chunks 160..255)</div>
      </div>
    );
  }

  const addMii = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const colors = ['#0284c7', '#10b981', '#e11d48', '#d97706', '#6366f1'];
    const mii: MiiProfile = {
      id: `mii-${Date.now()}`,
      name: trimmed,
      shirtColor: colors[userData.miis.length % colors.length],
      skinTone: '#fde6d0',
      hairColor: '#1e293b',
      hairStyle: 'spiky',
      favorite: false,
      greeting: 'Joined via CTR-SIM Mii Maker!',
    };
    await onUpdateUserData({ ...userData, miis: [...userData.miis, mii] });
    setNewName('');
    setSelectedIdx(userData.miis.length);
  };

  return (
    <div className="w-full h-full bg-white text-slate-900 p-2.5 flex flex-col justify-between">
      <div className="grid grid-cols-3 gap-1.5 overflow-y-auto thin-scroll max-h-28">
        {userData.miis.map((m, idx) => (
          <button
            key={m.id}
            onClick={() => setSelectedIdx(idx)}
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold truncate cursor-pointer ${
              idx === selectedIdx ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 my-1">
        <input
          type="text"
          maxLength={12}
          placeholder={`${t.miiName}...`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 px-2 py-1 rounded border border-slate-300 text-xs"
        />
        <button
          onClick={addMii}
          className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold cursor-pointer"
        >
          {t.miiSaveMii}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onExit}
          className="px-3 py-1 rounded bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
        >
          {t.returnHome}
        </button>
      </div>
    </div>
  );
};

/* ==================== CTR-NAND IN-CONSOLE TOOL ==================== */
type NandToolTab = 'partitions' | 'io_trace';

interface SharedNandToolState {
  tab: NandToolTab;
  selectedPartition: PartitionId;
  selectedIO: ChunkIOEvent | null;
  verbose: boolean;
  events: ChunkIOEvent[];
}

let sharedNandState: SharedNandToolState = {
  tab: 'partitions',
  selectedPartition: 'ncsd_hdr',
  selectedIO: null,
  verbose: true,
  events: [],
};

const nandListeners = new Set<() => void>();

function updateSharedNand(partial: Partial<SharedNandToolState>) {
  sharedNandState = { ...sharedNandState, ...partial };
  nandListeners.forEach((fn) => fn());
}

function useSharedNand() {
  const [, setTick] = useState(0);
  React.useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    nandListeners.add(fn);
    return () => {
      nandListeners.delete(fn);
    };
  }, []);
  return sharedNandState;
}

export interface NandToolAppletProps {
  screen: 'top' | 'bottom';
  partitionChecks: Record<PartitionId, PartitionIntegrity>;
  language?: SupportedLanguage;
  onInspectPartition: (id: PartitionId) => void;
  onInspectChunk?: (chunkIndex: number) => void;
  onExportNandBin: () => Promise<void>;
  onImportNandBin: (file: File) => Promise<void>;
  onExit: () => void;
}

export const NandToolApplet: React.FC<NandToolAppletProps> = ({
  screen,
  partitionChecks,
  language,
  onInspectPartition,
  onInspectChunk,
  onExportNandBin,
  onImportNandBin,
  onExit,
}) => {
  const shared = useSharedNand();
  const [binMsg, setBinMsg] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const t = getTranslations(language);

  // Sync with driver events
  React.useEffect(() => {
    updateSharedNand({
      events: nandDriver.getRecentIOEvents(),
      verbose: nandDriver.isVerbose(),
    });
    const unsub = nandDriver.subscribeIO(() => {
      updateSharedNand({
        events: nandDriver.getRecentIOEvents(),
      });
    });
    return unsub;
  }, []);

  const handleTestRead = async () => {
    try {
      const chunk = Math.floor(Math.random() * 256);
      await nandDriver.readChunk(chunk);
      setBinMsg(`Read test Chunk #${chunk} OK`);
    } catch (e) {
      setBinMsg(`Read error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleTestWrite = async () => {
    try {
      const dummy = new Uint8Array(16384);
      dummy.fill(0x5a);
      await nandDriver.writeChunk(200, dummy);
      setBinMsg('Wrote 16 KB test payload to Chunk #200');
    } catch (e) {
      setBinMsg(`Write error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (screen === 'top') {
    if (shared.tab === 'io_trace') {
      const activeEvent =
        shared.selectedIO ?? (shared.events.length > 0 ? shared.events[shared.events.length - 1] : null);
      const spec = activeEvent ? NAND_PARTITIONS.find((p) => p.id === activeEvent.partitionId) : null;
      const startHex = activeEvent
        ? '0x' + (activeEvent.chunkIndex * 16384).toString(16).padStart(6, '0').toUpperCase()
        : '0x000000';
      const endHex = activeEvent
        ? '0x' + ((activeEvent.chunkIndex + 1) * 16384 - 1).toString(16).padStart(6, '0').toUpperCase()
        : '0x003FFF';

      return (
        <div className="w-full h-full bg-slate-950 text-slate-100 p-3 font-mono text-[10px] flex flex-col justify-between select-none">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-2">
              <span className="text-sky-400 font-bold">CTR-NAND VERBOSE I/O TRACE</span>
              <span className="text-[9px] text-slate-400">
                LOGS: {shared.events.length} · CONSOLE: {shared.verbose ? 'ON' : 'OFF'}
              </span>
            </div>

            {activeEvent ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      activeEvent.op === 'write'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : activeEvent.op === 'corrupt'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    }`}
                  >
                    {activeEvent.op.toUpperCase()} OP
                  </span>
                  <span className="text-white font-semibold">
                    Chunk #{String(activeEvent.chunkIndex).padStart(3, '0')}
                  </span>
                  <span className="text-slate-400">({startHex}..{endHex})</span>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9.5px]">
                  <div>Partition : <span className="text-indigo-300">{spec?.name ?? activeEvent.partitionId}</span></div>
                  <div>Mount     : <span className="text-sky-300">{spec?.mountPoint ?? '/'}</span></div>
                  <div>Cipher    : <span className="text-amber-300">{activeEvent.keyslot ? `AES-128-CTR (${activeEvent.keyslot})` : 'RSA-2048 PKCS#1 v1.5'}</span></div>
                  <div>Timestamp : <span className="text-slate-300">+{activeEvent.timestamp.toFixed(1)}ms</span></div>
                </div>

                <div className="bg-slate-900/90 rounded p-1.5 border border-slate-800 text-[9px] text-slate-300">
                  <div className="text-slate-400 mb-0.5 font-semibold">I/O Context:</div>
                  <div>{activeEvent.details || 'Direct 16,384-byte sector block access via IndexedDB ObjectStore'}</div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 py-6 text-center text-[10px]">
                No I/O events recorded yet. Press &quot;Test Read&quot; or &quot;Test Write&quot; on bottom screen.
              </div>
            )}
          </div>

          <div className="text-[9px] text-slate-500 border-t border-slate-800/80 pt-1 flex justify-between">
            <span>Open DevTools Console (F12) to inspect formatted real-time logs</span>
            <span>window.ctrNand</span>
          </div>
        </div>
      );
    }

    // Default 'partitions' top view
    const spec = NAND_PARTITIONS.find((p) => p.id === shared.selectedPartition)!;
    const check = partitionChecks[shared.selectedPartition];

    return (
      <div className="w-full h-full bg-slate-950 text-slate-100 p-3 font-mono text-[10px] flex flex-col justify-between select-none">
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-2">
            <span className="text-indigo-400 font-bold">CTR-NAND SYSTEM INSPECTOR</span>
            <span className="text-[9px] text-slate-400">PARTITION AUDIT</span>
          </div>
          <div className="space-y-1">
            <div>Partition : <span className="text-white font-semibold">{spec.name}</span></div>
            <div>Mount     : <span className="text-sky-300">{spec.mountPoint}</span></div>
            <div>Chunks    : <span className="text-slate-300">{spec.startChunk}..{spec.endChunk} ({(spec.endChunk - spec.startChunk + 1) * 16} KB)</span></div>
            <div>Cipher    : <span className="text-amber-300">{shared.selectedPartition === 'ncsd_hdr' ? 'RSA-2048 Signed (Sector 0)' : `AES-128-CTR (${CTR_KEYSLOTS[shared.selectedPartition].slotHex})`}</span></div>
            <div>Magic     : <span className={check?.valid ? 'text-emerald-400' : 'text-rose-400'}>{check?.magicFound ?? spec.magic}</span></div>
            <div className="truncate">SHA-256   : <span className="text-slate-400">{check?.actualHash ?? '...'}</span></div>
          </div>
        </div>
        <div className="text-[9px] text-slate-400 border-t border-slate-800 pt-1">{spec.description}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 p-2 font-mono flex flex-col justify-between select-none">
      {/* Top Tab Bar & Verbose Toggle */}
      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800">
        <div className="flex gap-1">
          <button
            onClick={() => updateSharedNand({ tab: 'partitions' })}
            className={`px-2 py-0.5 rounded text-[9px] font-semibold cursor-pointer ${
              shared.tab === 'partitions'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Partitions
          </button>
          <button
            onClick={() => updateSharedNand({ tab: 'io_trace' })}
            className={`px-2 py-0.5 rounded text-[9px] font-semibold cursor-pointer ${
              shared.tab === 'io_trace'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Live I/O ({shared.events.length})
          </button>
        </div>
        <button
          onClick={() => {
            const next = !shared.verbose;
            nandDriver.setVerboseLogging(next);
            updateSharedNand({ verbose: next });
          }}
          className={`px-2 py-0.5 rounded text-[8.5px] font-semibold cursor-pointer border ${
            shared.verbose
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
          title="Toggle browser console.log verbose output"
        >
          Console Log: {shared.verbose ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Main Content Area */}
      {shared.tab === 'partitions' ? (
        <div className="grid grid-cols-2 gap-1 overflow-y-auto thin-scroll my-1 flex-1">
          {NAND_PARTITIONS.map((p) => {
            const valid = partitionChecks[p.id]?.valid ?? true;
            return (
              <button
                key={p.id}
                onClick={() => updateSharedNand({ selectedPartition: p.id })}
                className={`px-2 py-1 rounded border text-left text-[9.5px] cursor-pointer ${
                  shared.selectedPartition === p.id
                    ? 'bg-indigo-600/30 border-indigo-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <div className="font-semibold truncate">{p.name}</div>
                <div className={`text-[8.5px] ${valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {valid ? 'VALID' : 'CORRUPT'}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col flex-1 my-1 overflow-hidden">
          {/* Action Sub-bar for I/O operations */}
          <div className="flex items-center gap-1 mb-1">
            <button
              onClick={handleTestRead}
              className="px-1.5 py-0.5 rounded bg-sky-800 hover:bg-sky-700 text-sky-100 text-[8.5px] font-semibold cursor-pointer"
            >
              Test Read
            </button>
            <button
              onClick={handleTestWrite}
              className="px-1.5 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-[8.5px] font-semibold cursor-pointer"
            >
              Test Write
            </button>
            <button
              onClick={() => {
                nandDriver.clearRecentIO();
                updateSharedNand({ events: [], selectedIO: null });
                setBinMsg('Cleared I/O trace');
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[8.5px] font-semibold cursor-pointer"
            >
              Clear
            </button>
            <span className="text-[8.5px] text-slate-400 ml-auto truncate">
              {binMsg || 'Click event to inspect'}
            </span>
          </div>

          {/* Scrolling log list */}
          <div className="flex-1 overflow-y-auto thin-scroll space-y-1 bg-slate-950/60 p-1 rounded border border-slate-800">
            {shared.events.length === 0 ? (
              <div className="text-center text-slate-500 text-[9px] py-4">
                No I/O events. Click Test Read/Write or interact with Home.
              </div>
            ) : (
              [...shared.events].reverse().slice(0, 40).map((ev, idx) => {
                const isSelected = shared.selectedIO === ev;
                return (
                  <div
                    key={`${ev.chunkIndex}-${ev.timestamp}-${idx}`}
                    onClick={() => updateSharedNand({ selectedIO: ev })}
                    className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[8.5px] cursor-pointer font-mono border ${
                      isSelected
                        ? 'bg-sky-950/80 border-sky-500 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                    }`}
                  >
                    <span
                      className={`px-1 rounded text-[8px] font-bold ${
                        ev.op === 'write'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : ev.op === 'corrupt'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {ev.op === 'write' ? 'WR' : ev.op === 'corrupt' ? 'CORR' : 'RD'}
                    </span>
                    <span className="font-semibold text-slate-200">
                      #{String(ev.chunkIndex).padStart(3, '0')}
                    </span>
                    <span className="text-slate-400">
                      0x{(ev.chunkIndex * 16384).toString(16).padStart(6, '0').toUpperCase()}
                    </span>
                    <span className="text-indigo-300 truncate max-w-[70px]">
                      {ev.partitionId}
                    </span>
                    <span className="text-amber-400/80 ml-auto shrink-0 text-[8px]">
                      {ev.keyslot ? `[${ev.keyslot}]` : '[RSA]'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Status banner if present in partitions mode */}
      {shared.tab === 'partitions' && binMsg && (
        <div className="text-[8.5px] text-amber-300 truncate px-1">{binMsg}</div>
      )}

      {/* Footer Navigation Bar */}
      <div className="flex justify-between items-center gap-1 pt-1.5 border-t border-slate-800">
        <button
          onClick={() => {
            if (shared.tab === 'io_trace' && shared.selectedIO && onInspectChunk) {
              onInspectChunk(shared.selectedIO.chunkIndex);
            } else {
              onInspectPartition(shared.selectedPartition);
            }
          }}
          className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          {shared.tab === 'io_trace' && shared.selectedIO
            ? `Hex #${shared.selectedIO.chunkIndex}`
            : t.nandInspectPartition}
        </button>
        {shared.tab === 'partitions' && (
          <>
            <button
              onClick={async () => {
                try {
                  await onExportNandBin();
                  setBinMsg('Saved ctr-sim-nand.bin');
                } catch (err) {
                  setBinMsg(err instanceof Error ? err.message : 'Export failed');
                }
              }}
              className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[9px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              {t.nandExportBin}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-[9px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              {t.nandImportBin}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".bin,application/octet-stream"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  await onImportNandBin(file);
                } catch (err) {
                  setBinMsg(err instanceof Error ? err.message : 'Restore failed');
                }
              }}
              className="hidden"
            />
          </>
        )}
        <button
          onClick={onExit}
          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[9px] font-semibold cursor-pointer whitespace-nowrap ml-auto shrink-0"
        >
          {t.back}
        </button>
      </div>
    </div>
  );
};

/* ==================== HEALTH & SAFETY / CAMERA / BROWSER ==================== */
export const SimpleInfoApplet: React.FC<{
  kind: 'health-safety' | 'camera-ar' | 'browser';
  screen: 'top' | 'bottom';
  depth3D: number;
  language?: SupportedLanguage;
  onExit: () => void;
}> = ({ kind, screen, depth3D, language, onExit }) => {
  const t = getTranslations(language);
  const titleMeta = getLocalizedTitle(kind, language);

  if (kind === 'camera-ar') {
    if (screen === 'top') {
      return (
        <div className="w-full h-full bg-slate-950 text-white p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="text-[10px] font-mono text-pink-400 flex justify-between">
            <span>{titleMeta.shortName.toUpperCase()}</span>
            <span>3D: {Math.round(depth3D * 100)}%</span>
          </div>
          <div className="flex items-center justify-center gap-6 my-auto">
            <div
              className="w-16 h-16 rounded-full border-4 border-rose-500/70 flex items-center justify-center text-xs font-mono"
              style={{ transform: `translateX(${-depth3D * 12}px)` }}
            >
              L-EYE
            </div>
            <div
              className="w-16 h-16 rounded-full border-4 border-sky-400/70 flex items-center justify-center text-xs font-mono"
              style={{ transform: `translateX(${depth3D * 12}px)` }}
            >
              R-EYE
            </div>
          </div>
          <div className="text-[10px] text-slate-400 text-center">{titleMeta.description}</div>
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-slate-900 text-slate-200 p-3 flex flex-col justify-between">
        <div className="text-xs font-semibold">{titleMeta.fullName}</div>
        <p className="text-[11px] text-slate-400">{titleMeta.description}</p>
        <button onClick={onExit} className="w-full py-1.5 rounded bg-slate-800 text-xs font-semibold cursor-pointer">
          {t.returnHome}
        </button>
      </div>
    );
  }

  if (kind === 'browser') {
    if (screen === 'top') {
      return (
        <div className="w-full h-full bg-white text-slate-900 p-3.5 flex flex-col justify-between">
          <div className="bg-slate-100 rounded px-2 py-1 text-[10px] font-mono text-slate-600 border border-slate-200">
            ctr://nand.local/boot-architecture
          </div>
          <div className="my-auto space-y-1.5">
            <div className="text-sm font-bold font-display text-sky-800">{titleMeta.fullName}</div>
            <p className="text-[10.5px] text-slate-600 leading-relaxed">
              1. Boot9 &amp; Boot11 init AES/RSA engines and validate NCSD/FIRM.<br />
              2. Sections load to ARM9/ARM11, BootROM halves lock, CPUs jump.<br />
              3. Kernel9 (OTP lock + Process9) &amp; Kernel11 start pm, sm, fs, pxi &amp; NS (ErrDisp) before HOME loads.
            </p>
          </div>
          <div className="text-[10px] text-slate-400">{titleMeta.description}</div>
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-slate-50 text-slate-800 p-3 flex flex-col justify-between">
        <div className="text-xs font-semibold">{titleMeta.shortName}</div>
        <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200">
          {titleMeta.description}
        </div>
        <button onClick={onExit} className="w-full py-1.5 rounded bg-slate-800 text-white text-xs font-semibold cursor-pointer">
          {t.returnHome}
        </button>
      </div>
    );
  }

  // health-safety
  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-amber-50 text-slate-900 p-4 flex flex-col justify-between">
        <div className="text-sm font-bold font-display text-amber-900">{t.healthTitle}</div>
        <div className="space-y-1 text-[11px] text-slate-700 leading-relaxed">
          <p className="font-semibold text-amber-950">{t.healthWarning}</p>
          <p>• {t.health3DPrecaution}</p>
          <p>• {t.healthFatigueWarning}</p>
          <p className="text-[10px] text-amber-900 pt-1">{t.healthNandInfo}</p>
        </div>
        <div className="text-[10px] font-mono text-amber-800">Title ID: 0004001000021300</div>
      </div>
    );
  }
  return (
    <div className="w-full h-full bg-white text-slate-800 p-3 flex flex-col justify-between">
      <div className="text-xs font-semibold">{t.healthTitle}</div>
      <p className="text-[11px] text-slate-500">{t.healthNandInfo}</p>
      <button onClick={onExit} className="w-full py-1.5 rounded bg-slate-800 text-white text-xs font-semibold cursor-pointer">
        {t.returnHome}
      </button>
    </div>
  );
};
