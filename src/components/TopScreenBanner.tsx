import React, { useEffect, useState } from 'react';
import {
  AppletId,
  HomeFolder,
  HomeSlotItem,
  SystemConfig,
  SystemTitleEntry,
} from '../nand/types';
import { HOME_THEMES } from './themes';
import { getTranslations, getLocalizedTitle } from '../i18n/translations';
import {
  BatteryCharging,
  Camera,
  Disc,
  FolderOpen,
  Volume2,
  Wifi,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';

interface TopScreenBannerProps {
  config: SystemConfig;
  selectedItem: HomeSlotItem | null;
  openFolder: HomeFolder | null;
  titlesByApplet: Record<string, SystemTitleEntry>;
  folders: Record<string, HomeFolder>;
  cartridgeInserted: boolean;
  depth3D: number; // 0 to 1
  suspendedApplet: AppletId | null;
}

export const TopScreenBanner: React.FC<TopScreenBannerProps> = ({
  config,
  selectedItem,
  openFolder,
  titlesByApplet,
  folders,
  cartridgeInserted,
  depth3D,
  suspendedApplet,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [phaseTick, setPhaseTick] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(() => soundEngine.isAutoplayBlocked);

  useEffect(() => {
    return soundEngine.subscribeBlocked(setAudioBlocked);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (ts: number) => {
      setPhaseTick((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const theme = HOME_THEMES[config.themeId] ?? HOME_THEMES['classic-white'];
  const t = getTranslations(config.language);
  const datePart = `${now.getMonth() + 1}/${now.getDate()} (${now.toLocaleDateString([], { weekday: 'short' })})`;
  const timePart = `${String(now.getHours()).padStart(2, '0')} ${String(now.getMinutes()).padStart(2, '0')}`;

  const pxShift = Math.sin(phaseTick * 1.45) * (2.5 + depth3D * 8);
  const pyShift = Math.cos(phaseTick * 1.1) * (1.5 + depth3D * 4);
  const rotY = Math.sin(phaseTick * 1.2) * (14 + depth3D * 14);
  const stereoSplit = depth3D * 3.5;
  const tileDrift = (phaseTick * 14) % 44;

  const stereoShadow =
    depth3D > 0.08
      ? `${-stereoSplit}px 0 0 rgba(244,63,94,0.34), ${stereoSplit}px 0 0 rgba(14,165,233,0.34), 0 14px 24px rgba(15,23,42,0.22)`
      : '0 10px 22px rgba(15,23,42,0.16)';

  const renderAppBanner = (appletId: AppletId) => {
    const transform3D = `perspective(520px) translate3d(${pxShift * 0.65}px, ${pyShift * 0.65}px, 0) rotateY(${rotY}deg)`;

    switch (appletId) {
      case 'health-safety':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            {/* Soft radial safety aura */}
            <div
              className="absolute w-36 h-24 rounded-full bg-amber-300/30 blur-md"
              style={{ transform: `translate3d(${-pxShift * 0.4}px, 8px, 0)` }}
            />
            <div className="relative flex flex-col items-center" style={{ transform: transform3D }}>
              <svg viewBox="0 0 120 105" className="w-24 h-22 drop-shadow-xl">
                <defs>
                  <linearGradient id="hsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fde047" />
                    <stop offset="100%" stopColor="#eab308" />
                  </linearGradient>
                </defs>
                <polygon
                  points="60,8 112,96 8,96"
                  fill="url(#hsGrad)"
                  stroke="#0f172a"
                  strokeWidth="6"
                  strokeLinejoin="round"
                />
                <rect x="54.5" y="34" width="11" height="32" rx="5" fill="#0f172a" />
                <circle cx="60" cy="80" r="6" fill="#0f172a" />
              </svg>
              <div className="w-20 h-2.5 rounded-full bg-slate-900/15 mt-0.5 blur-[1px]" />
            </div>
          </div>
        );

      case 'camera-ar':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div
              className="absolute w-40 h-24 rounded-full bg-orange-300/25 blur-md"
              style={{ transform: `translate3d(${-pxShift * 0.5}px, 4px, 0)` }}
            />
            <div className="relative flex items-center justify-center" style={{ transform: transform3D }}>
              {/* 3D Orange & White Camera matching reference */}
              <div
                className="w-30 h-21 rounded-2xl bg-gradient-to-b from-amber-400 via-orange-500 to-orange-600 border-[4px] border-white flex items-center justify-center relative"
                style={{ boxShadow: stereoShadow }}
              >
                {/* Top shutter button */}
                <div className="absolute -top-3 left-5 w-7 h-2.5 rounded-t-md bg-white border border-slate-200 shadow-xs" />
                {/* Viewfinder flash */}
                <div className="absolute top-2.5 right-3 w-4 h-2.5 rounded-sm bg-white/95 shadow-inner" />
                {/* Outer lens ring */}
                <div className="w-13 h-13 rounded-full bg-white flex items-center justify-center shadow-md">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-700 via-sky-400 to-amber-200 border-[3px] border-orange-500 relative flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white/70 -translate-x-1 -translate-y-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'mii-maker':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            {/* Background floating Mii silhouettes */}
            <div
              className="absolute flex items-end gap-16 opacity-65"
              style={{ transform: `translate3d(${-pxShift * 0.45}px, ${-pyShift * 0.4}px, 0)` }}
            >
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-amber-200 border border-amber-400" />
                <div className="w-8 h-5 rounded-t-lg bg-sky-500 mt-0.5" />
              </div>
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-rose-200 border border-rose-300" />
                <div className="w-8 h-5 rounded-t-lg bg-emerald-500 mt-0.5" />
              </div>
            </div>
            {/* Center 3D Mii Wordmark Block */}
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="px-6 py-3 rounded-2xl bg-white border-2 border-slate-200 flex items-center gap-0.5"
                style={{ boxShadow: stereoShadow }}
              >
                <span className="text-3xl font-extrabold font-display tracking-tight text-slate-700">M</span>
                <span className="text-3xl font-extrabold font-display tracking-tight text-teal-500">i</span>
                <span className="text-3xl font-extrabold font-display tracking-tight text-sky-500">i</span>
              </div>
            </div>
          </div>
        );

      case 'sound-studio':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            {/* Animated sound wave rings */}
            <div
              className="absolute w-32 h-32 rounded-full border-2 border-sky-400/35"
              style={{ transform: `scale(${0.95 + Math.sin(phaseTick * 3.5) * 0.14})` }}
            />
            <div
              className="absolute w-24 h-24 rounded-full border-2 border-blue-500/40"
              style={{ transform: `scale(${0.9 + Math.cos(phaseTick * 3.5) * 0.12})` }}
            />
            {/* Glossy 3D Music Note Tile */}
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-26 h-22 rounded-2xl bg-gradient-to-b from-sky-400 via-blue-500 to-blue-700 border-[4px] border-white flex items-center justify-center"
                style={{ boxShadow: stereoShadow }}
              >
                <svg viewBox="0 0 64 64" className="w-13 h-13 drop-shadow">
                  <path
                    d="M24 44V16l24-4v28"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M24 22l24-4" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="19" cy="46" r="7" fill="#ffffff" />
                  <circle cx="43" cy="42" r="7" fill="#ffffff" />
                </svg>
              </div>
            </div>
          </div>
        );

      case 'system-settings':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-28 h-22 rounded-2xl bg-gradient-to-b from-slate-100 via-slate-300 to-slate-400 border-[4px] border-white flex items-center justify-center relative overflow-hidden"
                style={{ boxShadow: stereoShadow }}
              >
                {/* Rotating Gear SVG */}
                <svg
                  viewBox="0 0 64 64"
                  className="w-16 h-16 text-slate-500/40 absolute"
                  style={{ transform: `rotate(${phaseTick * 35}deg)` }}
                >
                  <circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="7 5" />
                </svg>
                {/* Metallic Wrench SVG */}
                <svg
                  viewBox="0 0 64 64"
                  className="w-13 h-13 relative z-10 drop-shadow"
                  style={{ transform: `rotate(${Math.sin(phaseTick * 1.6) * 14}deg)` }}
                >
                  <path
                    d="M44 12a10 10 0 0 0-12 13L15 42a4 4 0 0 0 6 6l17-17a10 10 0 0 0 13-12l-6 6-5-5 4-8z"
                    fill="#1e293b"
                    stroke="#0284c7"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        );

      case 'activity-log':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-28 h-22 rounded-2xl bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-700 border-[4px] border-white p-3 flex items-end justify-center gap-2 relative"
                style={{ boxShadow: stereoShadow }}
              >
                {[
                  { h: 0.45, color: '#fef08a' },
                  { h: 0.72, color: '#ffffff' },
                  { h: 0.96, color: '#fde047' },
                  { h: 0.62, color: '#ffffff' },
                ].map((bar, i) => {
                  const wave = 0.86 + Math.sin(phaseTick * 3.2 + i * 0.9) * 0.14;
                  return (
                    <div
                      key={i}
                      className="w-3.5 rounded-t-sm shadow-xs"
                      style={{
                        height: `${Math.round(bar.h * wave * 100)}%`,
                        backgroundColor: bar.color,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'game-notes':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-26 h-22 rounded-2xl bg-gradient-to-b from-amber-200 via-amber-300 to-yellow-500 border-[4px] border-white flex flex-col justify-center px-3 relative"
                style={{ boxShadow: stereoShadow }}
              >
                {/* Ruled notepad lines */}
                <div className="space-y-1.5 opacity-45">
                  <div className="h-0.5 bg-amber-900 rounded" />
                  <div className="h-0.5 bg-amber-900 rounded" />
                  <div className="h-0.5 bg-amber-900 rounded w-3/4" />
                </div>
                {/* Floating Pencil */}
                <svg
                  viewBox="0 0 64 64"
                  className="w-11 h-11 absolute right-1.5 bottom-1.5 drop-shadow"
                  style={{ transform: `rotate(${Math.sin(phaseTick * 2.2) * 8}deg)` }}
                >
                  <path d="M14 50l4-12L42 14l8 8L26 46z" fill="#ffffff" stroke="#b45309" strokeWidth="3" strokeLinejoin="round" />
                  <path d="M38 18l8 8" stroke="#f59e0b" strokeWidth="4" />
                </svg>
              </div>
            </div>
          </div>
        );

      case 'nand-tool':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-30 h-22 rounded-2xl bg-gradient-to-b from-indigo-600 via-slate-800 to-slate-950 border-[4px] border-white flex flex-col items-center justify-center relative"
                style={{ boxShadow: stereoShadow }}
              >
                {/* Gold silicon pins */}
                <div className="flex gap-1.5 mb-1">
                  {[0, 1, 2, 3, 4].map((p) => (
                    <span key={p} className="w-2 h-1.5 rounded-t-xs bg-amber-400" />
                  ))}
                </div>
                <div className="px-2.5 py-1 rounded bg-slate-950 border border-indigo-400/60 text-center">
                  <div className="text-[10px] font-mono font-bold text-emerald-300 tracking-wider">CTR-NAND</div>
                  <div className="text-[8px] font-mono text-indigo-300">256x16K IDB</div>
                </div>
                <div className="flex gap-1.5 mt-1">
                  {[0, 1, 2, 3, 4].map((p) => (
                    <span key={p} className="w-2 h-1.5 rounded-b-xs bg-amber-400" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'browser':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-24 h-24 rounded-full bg-gradient-to-b from-sky-300 via-sky-500 to-blue-700 border-[4px] border-white flex items-center justify-center relative overflow-hidden"
                style={{ boxShadow: stereoShadow }}
              >
                <svg
                  viewBox="0 0 64 64"
                  className="w-16 h-16 text-white/95"
                  style={{ transform: `rotate(${phaseTick * 18}deg)` }}
                >
                  <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="3" />
                  <ellipse cx="32" cy="32" rx="11" ry="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  <line x1="8" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="2.5" />
                  <line x1="12" y1="20" x2="52" y2="20" stroke="currentColor" strokeWidth="2" />
                  <line x1="12" y1="44" x2="52" y2="44" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
            </div>
          </div>
        );

      case 'cartridge':
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative" style={{ transform: transform3D }}>
              <div
                className="w-34 h-22 rounded-2xl bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-600 border-[4px] border-white flex flex-col items-center justify-center relative overflow-hidden"
                style={{ boxShadow: stereoShadow }}
              >
                {/* Perspective star-grid floor */}
                <div
                  className="absolute inset-x-0 bottom-0 h-8 opacity-40"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)',
                    backgroundSize: '10px 8px',
                    transform: 'perspective(120px) rotateX(55deg)',
                  }}
                />
                {/* 3D Starfighter */}
                <svg viewBox="0 0 80 48" className="w-16 h-10 relative z-10 drop-shadow-md">
                  <polygon points="40,4 50,30 40,24 30,30" fill="#e0f2fe" />
                  <polygon points="40,12 72,34 46,28" fill="#0ea5e9" />
                  <polygon points="40,12 8,34 34,28" fill="#0284c7" />
                </svg>
                <span className="text-[10px] font-display font-extrabold text-white tracking-wider relative z-10">
                  STARBURST 3D
                </span>
              </div>
            </div>
          </div>
        );
    }
  };

  const renderBannerStage = () => {
    if (selectedItem?.type === 'empty' || !selectedItem) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div
            className="w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center"
            style={{
              borderColor: theme.topSubtext,
              opacity: 0.35,
              transform: `translate3d(${pxShift * 0.35}px, ${pyShift * 0.35}px, 0)`,
            }}
          />
        </div>
      );
    }

    if (selectedItem.type === 'folder') {
      const folder = folders[selectedItem.folderId];
      if (!folder) return null;
      return (
        <div className="flex flex-col items-center justify-center h-full px-6">
          <div
            className="w-24 h-20 rounded-2xl flex items-center justify-center border-4 border-white relative"
            style={{
              backgroundColor: folder.color,
              transform: `perspective(460px) translate3d(${pxShift * 0.6}px, ${pyShift * 0.6}px, 0) rotateY(${rotY}deg)`,
              boxShadow: stereoShadow,
            }}
          >
            <FolderOpen className="w-10 h-10 text-white" />
            <span className="absolute -bottom-2 -right-2 w-7 h-7 rounded-lg bg-white text-slate-900 font-bold text-sm flex items-center justify-center shadow">
              {folder.badgeChar}
            </span>
          </div>
          <div className="mt-2.5 px-4 py-0.5 rounded-full bg-white/90 border border-slate-200 shadow-xs text-[11px] font-bold text-slate-800">
            {folder.name}
          </div>
        </div>
      );
    }

    const appletId = selectedItem.appletId;
    if (appletId === 'cartridge' && !cartridgeInserted) {
      return (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
          <div className="w-18 h-18 rounded-2xl border-2 border-dashed border-slate-400/60 flex items-center justify-center mb-2">
            <Disc className="w-8 h-8 text-slate-400" />
          </div>
          <div className="text-xs font-semibold" style={{ color: theme.topText }}>
            There is nothing inserted in the Game Card slot.
          </div>
        </div>
      );
    }

    const title = titlesByApplet[appletId];
    if (!title) return null;

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-2 relative">
        <div className="flex-1 w-full flex items-center justify-center min-h-0">
          {renderAppBanner(appletId)}
        </div>
        <div className="px-4 py-0.5 rounded-full bg-white/92 border border-slate-300/80 shadow-xs text-[11px] font-bold text-slate-800 max-w-[85%] truncate shrink-0">
          {title.fullName}
        </div>
      </div>
    );
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col select-none"
      style={{ background: theme.topBg }}
    >
      {/* Authentic 3DS Scrolling Rounded-Square Tile Backdrop */}
      <div
        className="absolute -inset-12 pointer-events-none grid grid-cols-8 gap-2.5 opacity-60"
        style={{
          transform: `translate3d(${-tileDrift}px, 0, 0)`,
        }}
      >
        {Array.from({ length: 48 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl"
            style={{ backgroundColor: theme.topPatternColor }}
          />
        ))}
      </div>

      {/* Top Status Strip matching real 3DS */}
      <div
        className="relative z-10 flex items-center justify-between px-2.5 py-1 text-[10px] font-medium"
        style={{ color: theme.topText }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/85 border border-slate-300/80 text-slate-700 font-semibold shadow-2xs">
            <Wifi className={`w-2.5 h-2.5 ${config.wirelessEnabled ? 'text-sky-600' : 'opacity-35'}`} />
            <span>{config.wirelessEnabled ? 'Enabled' : 'Disabled'}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-bold tabular-nums">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-600 text-[8px] font-extrabold text-amber-950 flex items-center justify-center">
              C
            </span>
            <span>{config.playCoins}</span>
          </span>
          {openFolder && (
            <span className="font-semibold text-sky-700 truncate max-w-[90px]">{openFolder.name}</span>
          )}
          {suspendedApplet && (
            <span className="font-semibold text-amber-700">Suspended</span>
          )}
        </div>

        <div className="flex items-center gap-2 font-semibold tabular-nums">
          {audioBlocked && (
            <button
              onClick={() => soundEngine.playStartupSound()}
              title="Browser blocked startup audio — click to play"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/90 text-slate-900 text-[9px] font-bold cursor-pointer"
            >
              <Volume2 className="w-2.5 h-2.5" />
              <span>Sound</span>
            </button>
          )}
          <span>{datePart}</span>
          <span>{timePart}</span>
          <BatteryCharging className="w-4 h-4 text-amber-500" />
        </div>
      </div>

      {/* Center 3D Software Banner Stage */}
      <div className="relative z-10 flex-1 overflow-hidden">{renderBannerStage()}</div>

      {/* Bottom 3DS Hint Bar matching reference image */}
      <div className="relative z-10 flex items-center justify-between px-2.5 py-1 bg-white/80 border-t border-slate-200/80 text-[9px] font-mono text-slate-600">
        <div className="flex items-center gap-1">
          <Camera className="w-3 h-3" />
          <span className="px-1 rounded border border-slate-400 bg-white font-bold">Y</span>
        </div>
        <div className="flex items-center gap-1">
          {depth3D > 0.05 && <span className="mr-2 text-sky-700 font-bold">3D {Math.round(depth3D * 100)}%</span>}
          <Camera className="w-3 h-3" />
          <span className="px-1 rounded border border-slate-400 bg-white font-bold">L</span>
          <span>+</span>
          <span className="px-1 rounded border border-slate-400 bg-white font-bold">R</span>
        </div>
      </div>
    </div>
  );
};
