import React, { useEffect, useState } from 'react';
import {
  AppletId,
  HomeFolder,
  HomeSlotItem,
  SystemConfig,
  SystemTitleEntry,
} from '../nand/types';
import { HOME_THEMES } from './themes';
import { getLocalizedTitle, getTranslations } from '../i18n/translations';
import {
  BatteryCharging,
  Camera,
  Volume2,
  Wifi,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { Banner3DViewport } from './Banner3DViewport';
import { BannerSceneKind } from './banner3d/bannerModels';

interface TopScreenBannerProps {
  config: SystemConfig;
  selectedItem: HomeSlotItem | null;
  openFolder: HomeFolder | null;
  titlesByApplet: Record<string, SystemTitleEntry>;
  folders: Record<string, HomeFolder>;
  cartridgeInserted: boolean;
  cartridgeTicketValid?: boolean;
  cartridgeUpdateVersion?: string | null;
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
  cartridgeTicketValid = true,
  cartridgeUpdateVersion = null,
  depth3D,
  suspendedApplet,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [audioBlocked, setAudioBlocked] = useState(() => soundEngine.isAutoplayBlocked);

  useEffect(() => {
    return soundEngine.subscribeBlocked(setAudioBlocked);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const theme = HOME_THEMES[config.themeId] ?? HOME_THEMES['classic-white'];
  const t = getTranslations(config.language);

  const datePart = `${now.getMonth() + 1}/${now.getDate()} (${now.toLocaleDateString([], { weekday: 'short' })})`;
  const timePart = `${String(now.getHours()).padStart(2, '0')} ${String(now.getMinutes()).padStart(2, '0')}`;

  // Resolve 3D scene target & bottom caption label
  let bannerKind: BannerSceneKind = 'empty-slot';
  let folderColor: string | undefined;
  let folderBadgeChar: string | undefined;
  let captionLabel: string | null = null;

  if (selectedItem?.type === 'folder') {
    const folder = folders[selectedItem.folderId];
    if (folder) {
      bannerKind = 'folder';
      folderColor = folder.color;
      folderBadgeChar = folder.badgeChar;
      captionLabel = folder.name;
    }
  } else if (selectedItem?.type === 'app') {
    const appletId = selectedItem.appletId;
    if (appletId === 'cartridge' && !cartridgeInserted) {
      bannerKind = 'empty-cartridge';
      captionLabel = t.noCartridge;
    } else if (appletId === 'cartridge' && !cartridgeTicketValid) {
      bannerKind = 'empty-cartridge';
      captionLabel = 'No Ticket (.tik) in ticket.db';
    } else {
      bannerKind = appletId;
      const baseTitle =
        getLocalizedTitle(appletId, config.language).fullName ||
        titlesByApplet[appletId]?.fullName ||
        null;
      captionLabel =
        baseTitle && appletId === 'cartridge' && cartridgeUpdateVersion
          ? `${baseTitle} (${cartridgeUpdateVersion})`
          : baseTitle;
    }
  }

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col select-none"
      style={{ background: theme.topBg }}
    >
      {/* Authentic 3DS Scrolling Rounded-Square Tile Backdrop */}
      <div className="absolute -inset-12 pointer-events-none grid grid-cols-8 gap-2.5 opacity-60 ctr-tile-drift">
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
        className="relative z-10 flex items-center justify-between px-2.5 py-1 text-[10px] font-medium shrink-0"
        style={{ color: theme.topText }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/88 border border-slate-300/80 text-slate-700 font-semibold shadow-2xs">
            <Wifi className={`w-2.5 h-2.5 ${config.wirelessEnabled ? 'text-sky-600' : 'opacity-35'}`} />
            <span>{config.wirelessEnabled ? t.enabled : t.disabled}</span>
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
            <span className="font-semibold text-amber-700">{t.suspended}</span>
          )}
        </div>

        <div className="flex items-center gap-2 font-semibold tabular-nums">
          {audioBlocked && (
            <button
              onClick={() => soundEngine.playStartupSound()}
              title={t.soundNotice}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/95 text-slate-900 text-[9px] font-bold cursor-pointer"
            >
              <Volume2 className="w-2.5 h-2.5" />
              <span>{t.soundButton}</span>
            </button>
          )}
          <span>{datePart}</span>
          <span>{timePart}</span>
          <BatteryCharging className="w-4 h-4 text-amber-500" />
        </div>
      </div>

      {/* True Real-Time 3D WebGL Software Banner Stage */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden pb-1.5">
        <div className="flex-1 w-full min-h-0">
          <Banner3DViewport
            kind={bannerKind}
            folderColor={folderColor}
            folderBadgeChar={folderBadgeChar}
            depth3D={depth3D}
          />
        </div>
        {captionLabel && (
          <div className="px-4 py-0.5 rounded-full bg-white/94 border border-slate-300/80 shadow-xs text-[11px] font-bold text-slate-800 max-w-[85%] truncate shrink-0 pointer-events-none">
            {captionLabel}
          </div>
        )}
      </div>

      {/* Bottom 3DS Hint Bar matching reference image */}
      <div className="relative z-10 flex items-center justify-between px-2.5 py-1 bg-white/85 border-t border-slate-200/80 text-[9px] font-mono text-slate-600 shrink-0">
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
