import { ConsoleThemeId } from '../nand/types';

export interface HomeThemeStyle {
  id: ConsoleThemeId;
  name: string;
  topBg: string;
  topPatternColor: string;
  topText: string;
  topSubtext: string;
  bottomBg: string;
  bottomGridLine: string;
  trayBg: string;
  trayBorder: string;
  topTabBg: string;
  topTabBorder: string;
  topTabIcon: string;
  slotBg: string;
  slotBorder: string;
  slotText: string;
  accent: string;
  accentText: string;
  barBg: string;
  barBorder: string;
}

export const HOME_THEMES: Record<ConsoleThemeId, HomeThemeStyle> = {
  'classic-white': {
    id: 'classic-white',
    name: 'Basic White',
    topBg: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
    topPatternColor: 'rgba(148, 163, 184, 0.22)',
    topText: '#0f172a',
    topSubtext: '#475569',
    bottomBg: 'linear-gradient(180deg, #f2f6fb 0%, #e7eef6 55%, #eef3f9 100%)',
    bottomGridLine: 'rgba(148, 163, 184, 0.24)',
    trayBg: 'linear-gradient(180deg, #d7d5ce 0%, #e3e1da 100%)',
    trayBorder: '#c2c0b8',
    topTabBg: 'linear-gradient(180deg, #f3f7fc 0%, #dde6f2 100%)',
    topTabBorder: '#bcc8d8',
    topTabIcon: '#5c83aa',
    slotBg: '#ffffff',
    slotBorder: '#cbd5e1',
    slotText: '#334155',
    accent: '#0284c7',
    accentText: '#ffffff',
    barBg: 'linear-gradient(180deg, rgba(248,250,252,0.55) 0%, rgba(255,255,255,0.92) 100%)',
    barBorder: 'rgba(203, 213, 225, 0.75)',
  },
  'dark-charcoal': {
    id: 'dark-charcoal',
    name: 'Basic Black',
    topBg: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    topPatternColor: 'rgba(148, 163, 184, 0.1)',
    topText: '#f8fafc',
    topSubtext: '#94a3b8',
    bottomBg: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    bottomGridLine: 'rgba(100, 116, 139, 0.2)',
    trayBg: 'linear-gradient(180deg, #0b1220 0%, #162033 100%)',
    trayBorder: '#334155',
    topTabBg: 'linear-gradient(180deg, #334155 0%, #1e293b 100%)',
    topTabBorder: '#475569',
    topTabIcon: '#93c5fd',
    slotBg: '#334155',
    slotBorder: '#475569',
    slotText: '#f1f5f9',
    accent: '#38bdf8',
    accentText: '#0f172a',
    barBg: 'rgba(15, 23, 42, 0.9)',
    barBorder: '#334155',
  },
  'cobalt-blue': {
    id: 'cobalt-blue',
    name: 'Cobalt Sky',
    topBg: 'linear-gradient(180deg, #e0f2fe 0%, #bae6fd 100%)',
    topPatternColor: 'rgba(2, 132, 199, 0.12)',
    topText: '#0c4a6e',
    topSubtext: '#0369a1',
    bottomBg: 'linear-gradient(180deg, #e0f2fe 0%, #bae6fd 100%)',
    bottomGridLine: 'rgba(14, 165, 233, 0.2)',
    trayBg: 'linear-gradient(180deg, #cbe6fa 0%, #dbeefe 100%)',
    trayBorder: '#93c5fd',
    topTabBg: 'linear-gradient(180deg, #f0f9ff 0%, #cce8fc 100%)',
    topTabBorder: '#7dd3fc',
    topTabIcon: '#0284c7',
    slotBg: '#f0f9ff',
    slotBorder: '#7dd3fc',
    slotText: '#0c4a6e',
    accent: '#0284c7',
    accentText: '#ffffff',
    barBg: 'rgba(240, 249, 255, 0.92)',
    barBorder: '#7dd3fc',
  },
  'famicom-red': {
    id: 'famicom-red',
    name: 'Famicom Red',
    topBg: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)',
    topPatternColor: 'rgba(225, 29, 72, 0.1)',
    topText: '#881337',
    topSubtext: '#be123c',
    bottomBg: 'linear-gradient(180deg, #fff1f2 0%, #fecdd3 100%)',
    bottomGridLine: 'rgba(225, 29, 72, 0.16)',
    trayBg: 'linear-gradient(180deg, #f8d4da 0%, #fce3e7 100%)',
    trayBorder: '#fda4af',
    topTabBg: 'linear-gradient(180deg, #fff5f6 0%, #ffdbe0 100%)',
    topTabBorder: '#fda4af',
    topTabIcon: '#be123c',
    slotBg: '#fffbfb',
    slotBorder: '#fda4af',
    slotText: '#881337',
    accent: '#e11d48',
    accentText: '#ffffff',
    barBg: 'rgba(255, 251, 251, 0.94)',
    barBorder: '#fda4af',
  },
  'mint-cream': {
    id: 'mint-cream',
    name: 'Mint Cream',
    topBg: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
    topPatternColor: 'rgba(5, 150, 105, 0.1)',
    topText: '#064e3b',
    topSubtext: '#047857',
    bottomBg: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
    bottomGridLine: 'rgba(16, 185, 129, 0.18)',
    trayBg: 'linear-gradient(180deg, #c6ece0 0%, #daf5ec 100%)',
    trayBorder: '#6ee7b7',
    topTabBg: 'linear-gradient(180deg, #f0fdf8 0%, #cff5e6 100%)',
    topTabBorder: '#6ee7b7',
    topTabIcon: '#047857',
    slotBg: '#ffffff',
    slotBorder: '#6ee7b7',
    slotText: '#064e3b',
    accent: '#059669',
    accentText: '#ffffff',
    barBg: 'rgba(255, 255, 255, 0.92)',
    barBorder: '#6ee7b7',
  },
};
