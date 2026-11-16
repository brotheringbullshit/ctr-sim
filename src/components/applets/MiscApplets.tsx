import React, { useState } from 'react';
import {
  MiiProfile,
  SupportedLanguage,
  UserSaveData,
} from '../../nand/types';
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
  const [saving, setSaving] = useState(false);
  const safeIdx = Math.min(selectedIdx, Math.max(0, userData.miis.length - 1));
  const selectedMii = userData.miis[safeIdx] ?? userData.miis[0];
  const t = getTranslations(language);

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-gradient-to-b from-sky-100 to-emerald-50 text-slate-900 p-4 flex flex-col justify-between select-none">
        <div className="flex justify-between items-center border-b border-sky-200 pb-1">
          <span className="text-xs font-bold font-display text-sky-900">{t.miiTitle}</span>
          <span className="text-[10px] font-mono text-sky-700">{userData.miis.length} Miis in FCRAM/NAND</span>
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

        <div className="text-[10px] text-sky-800">Mii characters cached in FCRAM &amp; persisted to NAND_USERDATA</div>
      </div>
    );
  }

  const addMii = async () => {
    const trimmed = newName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full h-full bg-white text-slate-900 p-2.5 flex flex-col justify-between">
      <div className="grid grid-cols-3 gap-1.5 overflow-y-auto thin-scroll max-h-28">
        {userData.miis.map((m, idx) => (
          <button
            key={m.id}
            onClick={() => setSelectedIdx(idx)}
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold truncate cursor-pointer ${
              idx === safeIdx ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 text-slate-700 border-slate-200'
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addMii();
            }
          }}
          className="flex-1 px-2 py-1 rounded border border-slate-300 text-xs"
        />
        <button
          onClick={() => void addMii()}
          disabled={saving || !newName.trim()}
          className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white text-[10px] font-semibold cursor-pointer"
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
