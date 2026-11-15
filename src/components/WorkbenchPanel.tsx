import React, { useState } from 'react';
import {
  BootLogEntry,
  BootPhase,
  CHUNK_SIZE,
  NAND_PARTITIONS,
  PartitionId,
  PartitionIntegrity,
  TOTAL_CHUNKS,
} from '../nand/types';
import { getPartitionForChunk } from '../nand/idbStorage';
import { Disc, RotateCcw, ShieldAlert, Wrench, Eye, Zap } from 'lucide-react';

interface WorkbenchPanelProps {
  phase: BootPhase;
  logs: BootLogEntry[];
  slowStep: boolean;
  onToggleSlowStep: () => void;
  cartridgeInserted: boolean;
  onToggleCartridge: () => void;
  onReboot: (hold?: 'NONE' | 'SELECT' | 'START') => void;
  partitionChecks: Record<PartitionId, PartitionIntegrity> | null;
  activeChunks: Record<number, 'read' | 'write' | 'corrupt'>;
  onInspectChunk: (chunkIndex: number) => void;
  onCorruptPartition: (id: PartitionId) => void;
  onRepairPartition: (id: PartitionId) => void;
  onReflashAll: () => void;
}

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({
  phase,
  logs,
  slowStep,
  onToggleSlowStep,
  cartridgeInserted,
  onToggleCartridge,
  onReboot,
  partitionChecks,
  activeChunks,
  onInspectChunk,
  onCorruptPartition,
  onRepairPartition,
  onReflashAll,
}) => {
  const [tab, setTab] = useState<'boot' | 'nand'>('boot');

  const stageStatus = (stage: 'bootrom' | 'stage1' | 'stage2' | 'home') => {
    const order: Record<BootPhase, number> = {
      off: 0,
      provisioning: 0,
      bootrom: 1,
      stage1: 2,
      stage2: 3,
      stage2_config: 3,
      nand_recovery: 2,
      panic: -1,
      home_menu: 4,
    };
    const cur = order[phase];
    const target = stage === 'bootrom' ? 1 : stage === 'stage1' ? 2 : stage === 'stage2' ? 3 : 4;
    if (phase === 'panic') return 'HALTED';
    if (cur > target || (cur === 4 && target === 4)) return 'VERIFIED';
    if (cur === target) return 'ACTIVE';
    return 'IDLE';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Segmented Navigation Bar */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
        <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg">
          <button
            onClick={() => setTab('boot')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'boot' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Boot Pipeline
          </button>
          <button
            onClick={() => setTab('nand')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'nand' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            IDB NAND Explorer
          </button>
        </div>

        <button
          onClick={onToggleCartridge}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
            cartridgeInserted
              ? 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>{cartridgeInserted ? 'Eject Game Card' : 'Insert Game Card'}</span>
        </button>
      </div>

      {tab === 'boot' ? (
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
          {/* 4-Stage Boot Chain Stepper */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 font-display">
                Execution Chain
              </h2>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={slowStep}
                  onChange={onToggleSlowStep}
                  className="rounded border-slate-300 accent-sky-600 cursor-pointer"
                />
                <span>Slow-Step Boot</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'bootrom' as const, label: '01. BootROM', sub: 'NCSD & FIRM0 SHA-256' },
                { key: 'stage1' as const, label: '02. Stage 1 SPL', sub: 'FIRM0 VM & FIRM1 Check' },
                { key: 'stage2' as const, label: '03. Stage 2 Kernel', sub: 'Mount Sys/CTR/User NAND' },
                { key: 'home' as const, label: '04. HOME Menu', sub: '00040030-00008F02' },
              ].map((s) => {
                const st = stageStatus(s.key);
                const stColor =
                  st === 'VERIFIED'
                    ? 'text-emerald-700'
                    : st === 'ACTIVE'
                    ? 'text-sky-700'
                    : st === 'HALTED'
                    ? 'text-rose-700'
                    : 'text-slate-400';

                return (
                  <div
                    key={s.key}
                    className={`p-2.5 rounded-lg border transition-colors ${
                      st === 'ACTIVE'
                        ? 'border-sky-300 bg-sky-50/70'
                        : st === 'HALTED'
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-900">{s.label}</span>
                      <span className={`text-[10px] font-mono font-bold ${stColor}`}>{st}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">{s.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Boot Override Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onReboot('NONE')}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cold Reboot</span>
            </button>
            <button
              onClick={() => onReboot('SELECT')}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Boot Stage 2 Setup (SELECT)
            </button>
            <button
              onClick={() => onReboot('START')}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Boot Recovery (START)
            </button>
          </div>

          {/* Live Boot & IndexedDB I/O Log */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700">Boot &amp; IDB Telemetry Log</span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">{logs.length} events</span>
            </div>
            <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 p-3 overflow-y-auto thin-scroll font-mono text-[11px] space-y-1">
              {logs.map((entry) => {
                const lvlColor =
                  entry.level === 'ok'
                    ? 'text-emerald-400'
                    : entry.level === 'warn'
                    ? 'text-amber-300'
                    : entry.level === 'error'
                    ? 'text-rose-400'
                    : 'text-sky-300';
                return (
                  <div key={entry.id} className="flex items-start gap-2 leading-snug">
                    <span className="text-slate-500 w-12 shrink-0 text-right tabular-nums">
                      {entry.timestampMs}ms
                    </span>
                    <span className={`w-16 shrink-0 font-semibold ${lvlColor}`}>
                      {entry.stage}
                    </span>
                    <span className="text-slate-200 break-words">{entry.message}</span>
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div className="text-slate-500">Waiting for power-on sequence...</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto thin-scroll p-4 gap-4">
          {/* 256-Chunk Live IndexedDB Map */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 font-display">
                  256 x 16 KB IndexedDB Chunk Array
                </h2>
                <p className="text-[11px] text-slate-500">
                  Click any chunk cell to inspect raw bytes in Hex. Flashes live on read/write.
                </p>
              </div>
              <button
                onClick={onReflashAll}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Re-flash All NAND
              </button>
            </div>

            <div className="grid grid-cols-16 gap-1 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              {Array.from({ length: TOTAL_CHUNKS }).map((_, idx) => {
                const pid = getPartitionForChunk(idx);
                const spec = NAND_PARTITIONS.find((p) => p.id === pid)!;
                const activeOp = activeChunks[idx];
                const isCorruptPartition = partitionChecks?.[pid]?.valid === false;

                let bg = spec.color;
                let opacity = 0.55;
                if (isCorruptPartition) {
                  bg = '#e11d48';
                  opacity = 0.9;
                }
                if (activeOp === 'read') {
                  bg = '#38bdf8';
                  opacity = 1;
                } else if (activeOp === 'write') {
                  bg = '#34d399';
                  opacity = 1;
                } else if (activeOp === 'corrupt') {
                  bg = '#fb7185';
                  opacity = 1;
                }

                return (
                  <button
                    key={idx}
                    onClick={() => onInspectChunk(idx)}
                    title={`Chunk #${idx} · ${spec.name} · 0x${(idx * CHUNK_SIZE).toString(16).toUpperCase()}`}
                    className="aspect-square rounded-[2px] transition-opacity hover:ring-1 hover:ring-white cursor-pointer"
                    style={{ backgroundColor: bg, opacity }}
                  />
                );
              })}
            </div>
          </div>

          {/* Partition Table with Corrupt / Repair / Hex Controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">
                NAND Partitions (Required by Bootloader &amp; HOME Menu)
              </h3>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {NAND_PARTITIONS.map((p) => {
                const check = partitionChecks?.[p.id];
                const valid = check ? check.valid : true;
                const sizeKB = (p.endChunk - p.startChunk + 1) * 16;

                return (
                  <div key={p.id} className="p-2.5 bg-white hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-slate-900">{p.name}</span>
                            <span className="text-[11px] text-slate-500 truncate">
                              {p.mountPoint} · {sizeKB} KB
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{p.description}</div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold shrink-0 ${
                          valid ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {valid ? `VALID (${check?.magicFound ?? p.magic})` : 'CORRUPT'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-500 truncate">Used by: {p.requiredBy}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onInspectChunk(p.startChunk)}
                          className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Hex</span>
                        </button>
                        <button
                          onClick={() => onCorruptPartition(p.id)}
                          className="px-2 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                          title="Flip bytes in IDB without updating NCSD to test bootloader failure handling"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Corrupt</span>
                        </button>
                        <button
                          onClick={() => onRepairPartition(p.id)}
                          className="px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>Repair</span>
                        </button>
                      </div>
                    </div>

                    {!valid && check?.reason && (
                      <div className="mt-1.5 text-[10px] font-mono text-rose-700 bg-rose-50 px-2 py-1 rounded flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{check.reason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
