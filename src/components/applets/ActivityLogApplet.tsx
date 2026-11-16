import React from 'react';
import { AppletId, SystemConfig, SystemTitleEntry, UserSaveData } from '../../nand/types';
import { getLocalizedTitle, getTranslations } from '../../i18n/translations';
import { Coins, Footprints } from 'lucide-react';

interface ActivityLogProps {
  screen: 'top' | 'bottom';
  config: SystemConfig;
  userData: UserSaveData;
  titlesByApplet: Record<string, SystemTitleEntry>;
  onEarnSteps: (steps: number, coins: number) => Promise<void>;
  onExit: () => void;
}

export const ActivityLogApplet: React.FC<ActivityLogProps> = ({
  screen,
  config,
  userData,
  titlesByApplet,
  onEarnSteps,
  onExit,
}) => {
  const entries = Object.values(userData.activity).sort((a, b) => b.totalSeconds - a.totalSeconds);
  const t = getTranslations(config.language);

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-emerald-50 text-slate-900 p-3.5 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between border-b border-emerald-200 pb-1">
          <div className="text-xs font-bold font-display text-emerald-950">
            {getLocalizedTitle('activity-log', config.language).shortName}
          </div>
          <div className="text-[10px] font-mono text-emerald-700">{t.activityDailyLog}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 my-auto">
          <div className="bg-white rounded-xl p-3 border border-emerald-200 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Footprints className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500">{t.activityTodaySteps}</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                {config.totalSteps.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 border border-amber-200 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500">{t.activityPlayCoins}</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                {config.playCoins} / 300
              </div>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-emerald-800">{t.activitySoftwareLibrary} · TWL_SYSDATA</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white text-slate-900 p-2.5 flex flex-col justify-between">
      <div className="flex-1 overflow-y-auto thin-scroll space-y-1 pr-1">
        {entries.map((rec) => {
          const localized = getLocalizedTitle(rec.appletId as AppletId, config.language);
          const title = titlesByApplet[rec.appletId];
          const mins = Math.max(1, Math.round(rec.totalSeconds / 60));
          return (
            <div
              key={rec.appletId}
              className="flex items-center justify-between px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[11px]"
            >
              <span className="font-semibold text-slate-800 truncate">
                {localized?.shortName ?? title?.shortName ?? rec.appletId}
              </span>
              <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                {rec.launchCount}x · {mins}m
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 mt-1">
        <button
          onClick={() => onEarnSteps(100, 1)}
          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer"
        >
          {t.activityWalkPedometer}
        </button>
        <button
          onClick={onExit}
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-semibold cursor-pointer"
        >
          {t.returnHome}
        </button>
      </div>
    </div>
  );
};
