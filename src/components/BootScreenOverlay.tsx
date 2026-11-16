import React from 'react';
import {
  BootPhase,
  BootStage2Header,
  NAND_PARTITIONS,
  PartitionId,
  PartitionIntegrity,
} from '../nand/types';

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
  onReboot: (hold?: 'NONE' | 'SELECT' | 'START') => void;
}

export const BootScreenOverlay: React.FC<BootScreenProps> = ({
  screen,
  phase,
  panicInfo,
  stage2ConfigHeader,
  partitionChecks,
  onRepairPartition,
  onReboot,
}) => {
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
    if (screen === 'top') {
      return (
        <div className="w-full h-full bg-slate-950 text-slate-100 p-3.5 font-mono text-[10px] flex flex-col justify-between">
          <div>
            <div className="text-sky-400 font-bold text-xs border-b border-slate-800 pb-1 mb-2">
              HORIZON OS · FIRM BOOT CONFIGURATION
            </div>
            {stage2ConfigHeader && (
              <div className="space-y-1">
                <div>Kernel Version : <span className="text-white">{stage2ConfigHeader.kernelVersion}</span></div>
                <div>Build Tag      : <span className="text-white">{stage2ConfigHeader.buildTag}</span></div>
                <div>ARM9 / ARM11   : <span className="text-sky-300">{stage2ConfigHeader.arm9Entry ?? '0x08006000'} / {stage2ConfigHeader.arm11Entry ?? '0x1FF80000'}</span></div>
                <div>Sysmodules     : <span className="text-slate-300">{(stage2ConfigHeader.sysmodules ?? ['Process9', 'pm', 'sm', 'fs', 'pxi', 'NS', 'ErrDisp']).join(' · ')}</span></div>
                <div>Autoboot Title : <span className="text-emerald-400">{stage2ConfigHeader.autobootTitleId} (HOME)</span></div>
              </div>
            )}
            <div className="mt-2.5 text-slate-400 text-[9px]">
              Boot9/Boot11 protected halves locked · OTP locked by Kernel9.
            </div>
          </div>
          <div className="text-slate-500 text-[9px]">Press [START] or click Continue to boot HOME Menu</div>
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-slate-950 text-slate-200 p-3 font-mono text-[10px] flex flex-col justify-between">
        <div>
          <div className="text-slate-400 mb-2">MOUNT TABLE IN FIRM1_STAGE2:</div>
          <div className="space-y-1">
            {stage2ConfigHeader?.mountEntries.map((m) => (
              <div key={m.mount} className="flex justify-between bg-slate-900 px-2 py-1 rounded border border-slate-800">
                <span className="text-sky-300">{m.mount}</span>
                <span className="text-slate-400">{m.partition}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onReboot('NONE')}
            className="flex-1 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] cursor-pointer"
          >
            Save &amp; Boot HOME Menu
          </button>
          <button
            onClick={() => onReboot('START')}
            className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 cursor-pointer"
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
