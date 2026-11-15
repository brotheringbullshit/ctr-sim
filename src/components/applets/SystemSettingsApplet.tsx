import React, { useState } from 'react';
import { ConsoleThemeId, SupportedLanguage, SystemConfig } from '../../nand/types';
import { HOME_THEMES } from '../themes';
import { getTranslations, SUPPORTED_LANGUAGES } from '../../i18n/translations';
import { soundEngine } from '../../audio/soundEngine';
import { Globe, HardDrive, Palette, Sliders, Volume2, Wifi } from 'lucide-react';

interface SystemSettingsProps {
  screen: 'top' | 'bottom';
  config: SystemConfig;
  onUpdateConfig: (next: SystemConfig) => Promise<void>;
  onFormatNand: () => void;
  onExit: () => void;
}

const THEME_IDS: ConsoleThemeId[] = [
  'classic-white',
  'dark-charcoal',
  'cobalt-blue',
  'famicom-red',
  'mint-cream',
];

export const SystemSettingsApplet: React.FC<SystemSettingsProps> = ({
  screen,
  config,
  onUpdateConfig,
  onFormatNand,
  onExit,
}) => {
  const [ownerDraft, setOwnerDraft] = useState(config.ownerName);
  const [saving, setSaving] = useState(false);
  const t = getTranslations(config.language);

  const commit = async (patch: Partial<SystemConfig>) => {
    setSaving(true);
    soundEngine.playConfirm();
    try {
      await onUpdateConfig({ ...config, ...patch });
    } finally {
      setSaving(false);
    }
  };

  const currentLangMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === config.language) ?? SUPPORTED_LANGUAGES[0];

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-gradient-to-b from-slate-100 to-slate-200 text-slate-900 p-3.5 flex flex-col justify-between select-none font-sans">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-slate-700" />
              <span className="text-xs font-bold font-display text-slate-800 tracking-tight">
                {t.settingsTitle}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
              {config.firmwareVersion}
            </div>
          </div>

          {/* Cards Grid */}
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px]">
            {/* Owner Profile Card */}
            <div className="bg-white rounded-lg p-2.5 border border-slate-200 shadow-2xs">
              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                {t.ownerProfile}
              </div>
              <div className="font-bold text-slate-900 mt-0.5 text-xs truncate">{config.ownerName}</div>
              <div className="text-[9px] font-mono text-slate-500 mt-1">SN: {config.serialNumber}</div>
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-semibold text-[9px]">
                <span>{currentLangMeta.flag}</span>
                <span>{currentLangMeta.label}</span>
              </div>
            </div>

            {/* NAND Config State Card */}
            <div className="bg-white rounded-lg p-2.5 border border-slate-200 shadow-2xs">
              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                {t.nandConfigState}
              </div>
              <div className="font-bold text-sky-700 mt-0.5 text-xs truncate">
                {HOME_THEMES[config.themeId].name}
              </div>
              <div className="text-[9px] font-mono text-slate-500 mt-1">
                {t.region}: {config.region} · #{config.bootCount}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[9px]">
                <span
                  className={`px-1.5 py-0.2 rounded font-bold ${
                    config.soundEnabled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {t.audio} {config.soundEnabled ? 'ON' : 'OFF'}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded font-bold ${
                    config.wirelessEnabled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {t.wifi} {config.wirelessEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[9px] text-slate-500 border-t border-slate-200/90 pt-1.5">
          <div className="flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-amber-600" />
            <span>{t.persistedInfo}</span>
          </div>
          <span className="font-mono font-medium text-slate-600">
            {saving ? t.writingIdb : t.synced}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 p-2.5 flex flex-col justify-between overflow-y-auto thin-scroll select-none">
      <div className="space-y-2.5 text-[11px]">
        {/* Profile Name */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-slate-600 w-16 shrink-0">
            {t.ownerProfile}
          </label>
          <input
            type="text"
            maxLength={14}
            value={ownerDraft}
            onChange={(e) => setOwnerDraft(e.target.value)}
            className="flex-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            onClick={() => commit({ ownerName: ownerDraft.trim() || 'Player 1' })}
            className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold cursor-pointer shadow-2xs active:scale-95 transition-transform"
          >
            {t.save}
          </button>
        </div>

        {/* Multi-Language Selection (7 Authentic 3DS Languages) */}
        <div>
          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 mb-1">
            <Globe className="w-3 h-3 text-sky-600" />
            <span>{t.language}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = config.language === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => commit({ language: lang.code })}
                  className={`flex items-center justify-between px-1.5 py-1 rounded text-[9px] font-semibold border cursor-pointer transition-all ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                  }`}
                  title={`${lang.label} (${lang.regionHint})`}
                >
                  <span className="truncate">{lang.label}</span>
                  <span className="text-[10px] ml-1 shrink-0">{lang.flag}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Theme Picker */}
        <div>
          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 mb-1">
            <Palette className="w-3 h-3 text-amber-600" />
            <span>{t.theme}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {THEME_IDS.map((tid) => (
              <button
                key={tid}
                onClick={() => commit({ themeId: tid })}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer transition-colors ${
                  config.themeId === tid
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {HOME_THEMES[tid].name}
              </button>
            ))}
          </div>
        </div>

        {/* Region + Hardware Toggles */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-600 mr-1">{t.region}</span>
            {(['USA', 'EUR', 'JPN'] as const).map((reg) => (
              <button
                key={reg}
                onClick={() =>
                  commit({
                    region: reg,
                    firmwareVersion: `Ver. 11.17.0-50${reg[0]}`,
                  })
                }
                className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                  config.region === reg
                    ? 'bg-slate-800 text-white border-slate-800 font-bold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {reg}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => commit({ wirelessEnabled: !config.wirelessEnabled })}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                config.wirelessEnabled
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              <Wifi className="w-2.5 h-2.5" />
              <span>{t.wifi}</span>
            </button>
            <button
              onClick={() => commit({ soundEnabled: !config.soundEnabled })}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                config.soundEnabled
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              <Volume2 className="w-2.5 h-2.5" />
              <span>{t.audio}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 mt-1">
        <button
          onClick={onFormatNand}
          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold cursor-pointer active:scale-95 transition-transform"
        >
          {t.formatNand}
        </button>
        <button
          onClick={onExit}
          className="px-3.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold cursor-pointer shadow-xs active:scale-95 transition-transform"
        >
          {t.returnHome}
        </button>
      </div>
    </div>
  );
};
