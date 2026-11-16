import React, { useEffect, useState } from 'react';
import { SupportedLanguage, UserSaveData } from '../../nand/types';
import { soundEngine } from '../../audio/soundEngine';
import { getTranslations } from '../../i18n/translations';

interface SoundStudioProps {
  screen: 'top' | 'bottom';
  userData: UserSaveData;
  language?: SupportedLanguage;
  onUpdateUserData: (next: UserSaveData) => Promise<void>;
  onExit: () => void;
}

const SCALE_NOTES = [
  { label: 'C5', freq: 523.25 },
  { label: 'D5', freq: 587.33 },
  { label: 'E5', freq: 659.25 },
  { label: 'F5', freq: 698.46 },
  { label: 'G5', freq: 783.99 },
  { label: 'A5', freq: 880.0 },
  { label: 'B5', freq: 987.77 },
  { label: 'C6', freq: 1046.5 },
];

export const SoundStudioApplet: React.FC<SoundStudioProps> = ({
  screen,
  userData,
  language,
  onUpdateUserData,
  onExit,
}) => {
  const [pattern, setPattern] = useState<number[]>(userData.synthPattern);
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const t = getTranslations(language);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => {
        const next = (prev + 1) % pattern.length;
        const note = SCALE_NOTES[pattern[next] ?? 0];
        soundEngine.playTone(note.freq, 0.14, 'triangle', 0.25);
        return next;
      });
    }, 220);
    return () => clearInterval(timer);
  }, [playing, pattern]);

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-slate-950 text-rose-50 p-3.5 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
          <div className="text-xs font-bold font-display text-rose-400">{t.soundTitle}</div>
          <div className="text-[10px] font-mono text-slate-400">{t.soundSynthStudio}</div>
        </div>

        <div className="flex-1 flex items-end justify-center gap-2 py-3">
          {pattern.map((noteIdx, step) => {
            const heightPct = 20 + ((noteIdx + 1) / SCALE_NOTES.length) * 75;
            const isCurrent = playing && activeStep === step;
            return (
              <div key={step} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                <div
                  className={`w-full rounded-t transition-all duration-100 ${
                    isCurrent ? 'bg-rose-400' : 'bg-rose-600/60'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
                <span className="text-[9px] font-mono text-slate-400">{SCALE_NOTES[noteIdx]?.label}</span>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-slate-400 font-mono flex justify-between">
          <span>{playing ? `#${activeStep + 1}` : 'NAND_USERDATA'}</span>
          <span>{t.synced}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-rose-50 text-slate-900 p-2.5 flex flex-col justify-between">
      <div className="grid grid-cols-4 gap-1.5">
        {pattern.map((noteIdx, step) => (
          <button
            key={step}
            onClick={() => {
              const nextIdx = (noteIdx + 1) % SCALE_NOTES.length;
              const next = [...pattern];
              next[step] = nextIdx;
              setPattern(next);
              soundEngine.playTone(SCALE_NOTES[nextIdx].freq, 0.12, 'triangle', 0.25);
            }}
            className="py-2 rounded-lg border border-rose-200 bg-white hover:bg-rose-100 flex flex-col items-center cursor-pointer"
          >
            <span className="text-[9px] font-mono text-slate-400">STEP {step + 1}</span>
            <span className="text-xs font-bold text-rose-600">{SCALE_NOTES[noteIdx]?.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-200">
        <div className="flex gap-1.5">
          <button
            onClick={() => setPlaying((p) => !p)}
            className={`px-3 py-1 rounded text-[10px] font-semibold cursor-pointer ${
              playing ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {playing ? t.soundStop : t.soundPlay}
          </button>
          <button
            onClick={() => onUpdateUserData({ ...userData, synthPattern: pattern })}
            className="px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-700 text-[10px] font-semibold cursor-pointer"
          >
            {t.save}
          </button>
        </div>
        <button
          onClick={onExit}
          className="px-3 py-1 rounded bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
        >
          {t.back}
        </button>
      </div>
    </div>
  );
};
