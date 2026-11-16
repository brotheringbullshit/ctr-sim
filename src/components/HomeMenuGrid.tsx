import React, { useEffect, useRef, useState } from 'react';
import {
  AppletId,
  HomeFolder,
  HomeSlotItem,
  SystemConfig,
  SystemTitleEntry,
  UserSaveData,
} from '../nand/types';
import { HOME_THEMES } from './themes';
import { getTranslations, getLocalizedTitle } from '../i18n/translations';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Disc,
  Folder,
  FolderPlus,
  Palette,
  PenLine,
  Sun,
  Wrench,
} from 'lucide-react';

interface HomeMenuGridProps {
  config: SystemConfig;
  userData: UserSaveData;
  titlesByApplet: Record<string, SystemTitleEntry>;
  selectedIndex: number;
  openFolderId: string | null;
  cartridgeInserted: boolean;
  cartridgeTicketValid?: boolean;
  cartridgeUpdateVersion?: string | null;
  onSelectIndex: (index: number) => void;
  onLaunchApplet: (appletId: AppletId) => void;
  onOpenFolder: (folderId: string | null) => void;
  onChangeGridRows: (rows: 1 | 2 | 3) => void;
  onCycleBrightness: () => void;
  onCycleTheme: () => void;
  onMoveOrCreateFolder: (
    action: { type: 'swap'; from: number; to: number } | { type: 'create_folder'; slotIndex: number }
  ) => void;
}

export const HomeMenuGrid: React.FC<HomeMenuGridProps> = ({
  config,
  userData,
  titlesByApplet,
  selectedIndex,
  openFolderId,
  cartridgeInserted,
  cartridgeTicketValid = true,
  cartridgeUpdateVersion = null,
  onSelectIndex,
  onLaunchApplet,
  onOpenFolder,
  onChangeGridRows,
  onCycleBrightness,
  onCycleTheme,
  onMoveOrCreateFolder,
}) => {
  const [movingFromIndex, setMovingFromIndex] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showHomeSettings, setShowHomeSettings] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const trayScrollRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);

  const theme = HOME_THEMES[config.themeId] ?? HOME_THEMES['classic-white'];
  const t = getTranslations(config.language);
  const activeFolder: HomeFolder | null = openFolderId ? userData.folders[openFolderId] ?? null : null;

  const displayedItems: HomeSlotItem[] = activeFolder
    ? activeFolder.items.map((appletId: AppletId) => ({ type: 'app', appletId }))
    : userData.slots;

  const selectedItem = displayedItems[selectedIndex] ?? null;

  const updateScrollArrows = () => {
    const scroller = trayScrollRef.current;
    if (!scroller) return;
    setCanScrollLeft(scroller.scrollLeft > 4);
    setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4);
  };

  useEffect(() => {
    const el = tileRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = window.setTimeout(updateScrollArrows, 220);
    return () => window.clearTimeout(timer);
  }, [selectedIndex, config.gridRows, openFolderId]);

  useEffect(() => {
    if (displayedItems.length > 0 && selectedIndex >= displayedItems.length) {
      onSelectIndex(displayedItems.length - 1);
    }
  }, [displayedItems.length, selectedIndex, onSelectIndex]);

  useEffect(() => {
    updateScrollArrows();
    const onResize = () => updateScrollArrows();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [displayedItems.length, config.gridRows, openFolderId]);

  const scrollTrayBy = (deltaFraction: number) => {
    const scroller = trayScrollRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: scroller.clientWidth * deltaFraction, behavior: 'smooth' });
  };

  const handleTrayWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const scroller = trayScrollRef.current;
    if (!scroller) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scroller.scrollLeft += e.deltaY;
      updateScrollArrows();
    }
  };

  const handleTileClick = (idx: number, item: HomeSlotItem) => {
    if (!activeFolder && movingFromIndex !== null) {
      if (movingFromIndex !== idx) {
        onMoveOrCreateFolder({ type: 'swap', from: movingFromIndex, to: idx });
      }
      setMovingFromIndex(null);
      onSelectIndex(idx);
      return;
    }

    if (selectedIndex === idx) {
      if (item.type === 'app') {
        if (item.appletId === 'cartridge' && (!cartridgeInserted || !cartridgeTicketValid)) {
          onLaunchApplet(item.appletId);
          return;
        }
        onLaunchApplet(item.appletId);
      } else if (item.type === 'folder') {
        onOpenFolder(item.folderId);
        onSelectIndex(0);
      }
    } else {
      onSelectIndex(idx);
    }
  };

  const handlePrimaryOpen = () => {
    if (!selectedItem) return;
    if (selectedItem.type === 'app') {
      if (selectedItem.appletId === 'cartridge' && (!cartridgeInserted || !cartridgeTicketValid)) {
        onLaunchApplet(selectedItem.appletId);
        return;
      }
      onLaunchApplet(selectedItem.appletId);
    } else if (selectedItem.type === 'folder') {
      onOpenFolder(selectedItem.folderId);
      onSelectIndex(0);
    } else if (selectedItem.type === 'empty' && !activeFolder) {
      onMoveOrCreateFolder({ type: 'create_folder', slotIndex: selectedIndex });
    }
  };

  const cycleGridZoom = () => {
    const next = ((config.gridRows % 3) + 1) as 1 | 2 | 3;
    onChangeGridRows(next);
  };

  // Responsive tile size based on grid rows
  const tileSizeClass =
    config.gridRows === 1
      ? 'w-24 h-24 sm:w-28 sm:h-28'
      : config.gridRows === 2
      ? 'w-16 h-16 sm:w-20 sm:h-20'
      : 'w-12 h-12 sm:w-14 sm:h-14';

  const gridRowsStyle: React.CSSProperties = {
    gridTemplateRows: `repeat(${config.gridRows}, auto)`,
    gap: config.gridRows === 1 ? '16px' : config.gridRows === 2 ? '12px' : '8px',
  };

  return (
    <div
      className="absolute inset-0 flex flex-col select-none overflow-hidden"
      style={{ background: theme.bottomBg }}
    >
      {/* ==================== TOP UTILITY STRIP ==================== */}
      <div
        className="relative flex items-center justify-between shrink-0 border-b h-11 sm:h-12"
        style={{
          borderColor: 'rgba(148, 163, 184, 0.32)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.65)',
        }}
      >
        {/* Left Corner Tab: Home + Wrench */}
        <button
          onClick={() => setShowHomeSettings((v) => !v)}
          title="HOME Menu Settings"
          className="h-full px-3.5 flex items-center justify-center cursor-pointer transition-brightness hover:brightness-105 active:brightness-95 shrink-0 rounded-br-2xl"
          style={{
            background: theme.topTabBg,
            borderRight: `1px solid ${theme.topTabBorder}`,
            borderBottom: `1px solid ${theme.topTabBorder}`,
            color: theme.topTabIcon,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(15,23,42,0.06)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 36 24" className="w-6 h-5">
              <path d="M4 11L12.5 4L21 11V19.5H15.5V14.5H9.5V19.5H4V11Z" fill="currentColor" opacity="0.92" />
              <path d="M28.5 5.5a4.2 4.2 0 0 0-5.1 5.3l-5.6 5.6a1.7 1.7 0 0 0 2.4 2.4l5.6-5.6a4.2 4.2 0 0 0 5.3-5.1l-2.3 2.3-2.1-2.1 1.8-2.8Z" fill="currentColor" />
            </svg>
          </div>
        </button>

        {/* Center 4 Unboxed 3DS Utility Icons */}
        <div className="flex-1 min-w-0 flex items-center justify-evenly px-2">
          {/* 1. Game Notes */}
          <button
            onClick={() => onLaunchApplet('game-notes')}
            title="Game Notes"
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
          >
            <svg viewBox="0 0 32 32" className="w-full h-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]">
              <path d="M6 26l2-7.5L22.5 4l5.5 5.5L13.5 24z" fill="#facc15" stroke="#ca8a04" strokeWidth="2" strokeLinejoin="round" />
              <path d="M19.5 7l5.5 5.5" stroke="#fef08a" strokeWidth="2.5" />
              <path d="M6 26l4-1.2-2.8-2.8z" fill="#78350f" />
            </svg>
          </button>

          {/* 2. Mii Maker */}
          <button
            onClick={() => onLaunchApplet('mii-maker')}
            title="Mii Maker & Plaza"
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
          >
            <svg viewBox="0 0 32 32" className="w-full h-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]">
              <rect x="4" y="4" width="24" height="24" rx="5" fill="#fff7ed" stroke="#f97316" strokeWidth="2.6" />
              <circle cx="11.5" cy="13.5" r="1.7" fill="#f97316" />
              <circle cx="20.5" cy="13.5" r="1.7" fill="#f97316" />
              <path d="M10.5 19c1.5 2.4 9.5 2.4 11 0" fill="none" stroke="#f97316" strokeWidth="2.3" strokeLinecap="round" />
            </svg>
          </button>

          {/* 3. Activity Log */}
          <button
            onClick={() => onLaunchApplet('activity-log')}
            title="Activity Log"
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
          >
            <svg viewBox="0 0 32 32" className="w-full h-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]">
              <path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h15A3.5 3.5 0 0 1 27 7.5v12a3.5 3.5 0 0 1-3.5 3.5H14l-5 4.5V23H8.5A3.5 3.5 0 0 1 5 19.5v-12Z" fill="#ecfdf5" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
              <line x1="10" y1="10.5" x2="22" y2="10.5" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="10" y1="14.5" x2="22" y2="14.5" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="10" y1="18.5" x2="17.5" y2="18.5" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>

          {/* 4. Browser */}
          <button
            onClick={() => onLaunchApplet('browser')}
            title="Internet Browser"
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
          >
            <svg viewBox="0 0 32 32" className="w-full h-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]">
              <circle cx="16" cy="16" r="11.5" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2.4" />
              <ellipse cx="16" cy="16" rx="5.5" ry="11.5" fill="none" stroke="#0284c7" strokeWidth="1.9" />
              <line x1="4.5" y1="16" x2="27.5" y2="16" stroke="#0284c7" strokeWidth="1.9" />
              <line x1="6.5" y1="10.5" x2="25.5" y2="10.5" stroke="#0284c7" strokeWidth="1.7" />
              <line x1="6.5" y1="21.5" x2="25.5" y2="21.5" stroke="#0284c7" strokeWidth="1.7" />
            </svg>
          </button>
        </div>

        {/* Right Corner Tab: Grid Zoom */}
        <button
          onClick={cycleGridZoom}
          title={`Grid Zoom (${config.gridRows} rows)`}
          className="h-full px-3.5 flex items-center justify-center cursor-pointer transition-brightness hover:brightness-105 active:brightness-95 shrink-0 rounded-bl-2xl"
          style={{
            background: theme.topTabBg,
            borderLeft: `1px solid ${theme.topTabBorder}`,
            borderBottom: `1px solid ${theme.topTabBorder}`,
            color: theme.topTabIcon,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(15,23,42,0.06)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        </button>
      </div>

      {/* ==================== FOLDER BREADCRUMB BAR ==================== */}
      {activeFolder && (
        <div
          className="mx-3 mt-1.5 px-3 h-8 rounded-t-xl flex items-center justify-between font-semibold shrink-0 bg-white/90 border border-b-0 border-slate-300/80 text-xs shadow-xs"
          style={{ color: theme.slotText }}
        >
          <button
            onClick={() => {
              onOpenFolder(null);
              onSelectIndex(0);
            }}
            className="inline-flex items-center gap-1 hover:underline cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to HOME</span>
          </button>
          <span className="truncate max-w-[200px]">{activeFolder.name}</span>
        </div>
      )}

      {/* ==================== CENTRAL HORIZONTAL SOFTWARE TRAY ==================== */}
      <div
        className={`flex-1 min-h-0 mx-3 ${activeFolder ? 'mb-1 rounded-b-3xl' : 'my-2 rounded-3xl'} relative overflow-hidden flex items-center`}
        style={{
          background: theme.trayBg,
          border: `1px solid ${theme.trayBorder}`,
          boxShadow: 'inset 0 2px 6px rgba(15, 23, 42, 0.1), 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        {/* Left Scroll Chevron */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTrayBy(-0.65)}
            aria-label="Scroll Left"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-6 h-16 rounded-r-full bg-white/95 border border-l-0 border-slate-300/90 flex items-center justify-center text-[#36c2a8] hover:bg-white cursor-pointer shadow-md"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.8]" />
          </button>
        )}

        {/* Horizontal Track */}
        <div
          ref={trayScrollRef}
          onScroll={updateScrollArrows}
          onWheel={handleTrayWheel}
          className="w-full h-full overflow-x-auto overflow-y-hidden no-scrollbar flex items-center px-4"
        >
          <div className="grid grid-flow-col auto-cols-max items-center content-center" style={gridRowsStyle}>
            {displayedItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isMovingSource = idx === movingFromIndex;

              return (
                <div
                  key={idx}
                  ref={(el) => {
                    tileRefs.current[idx] = el;
                  }}
                  className={`relative shrink-0 ${tileSizeClass}`}
                >
                  {/* Selection Bracket */}
                  {isSelected && (
                    <div className="absolute inset-[-6px] pointer-events-none z-10">
                      <span className="absolute top-0 left-0 w-3.5 h-3.5 border-t-4 border-l-4 border-[#15e3a1] rounded-tl-lg" />
                      <span className="absolute top-0 right-0 w-3.5 h-3.5 border-t-4 border-r-4 border-[#15e3a1] rounded-tr-lg" />
                      <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-4 border-l-4 border-[#15e3a1] rounded-bl-lg" />
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-4 border-r-4 border-[#15e3a1] rounded-br-lg" />
                    </div>
                  )}

                  {item.type === 'empty' ? (
                    <button
                      onClick={() => handleTileClick(idx, item)}
                      className={`w-full h-full flex items-center justify-center transition-transform cursor-pointer rounded-2xl ${
                        isSelected ? 'scale-[1.02] bg-slate-200 border border-slate-400 shadow' : 'bg-white/40 border border-slate-300/50 hover:bg-white/60'
                      }`}
                    >
                      {movingFromIndex !== null ? (
                        <span className="text-xs font-bold text-slate-600">Drop</span>
                      ) : (
                        <span className="w-3/4 h-3/4 rounded-xl bg-slate-900/5 border border-slate-900/10 shadow-inner" />
                      )}
                    </button>
                  ) : item.type === 'folder' ? (
                    <button
                      onClick={() => handleTileClick(idx, item)}
                      className={`w-full h-full flex items-center justify-center transition-transform cursor-pointer p-1.5 rounded-2xl bg-gradient-to-b from-white to-slate-100 border border-slate-300 shadow-sm ${
                        isSelected ? 'scale-[1.03]' : 'hover:scale-[1.01]'
                      } ${isMovingSource ? 'ring-2 ring-amber-500' : ''}`}
                    >
                      <div
                        className="w-full h-full flex items-center justify-center text-white relative rounded-xl"
                        style={{ backgroundColor: userData.folders[item.folderId]?.color ?? '#0284c7' }}
                      >
                        <Folder className="w-1/2 h-1/2" />
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center shadow">
                          {userData.folders[item.folderId]?.badgeChar ?? 'F'}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTileClick(idx, item)}
                      className={`relative w-full h-full flex items-center justify-center transition-transform cursor-pointer p-1.5 rounded-2xl bg-gradient-to-b from-white to-slate-100 border border-slate-300 shadow-sm ${
                        isSelected ? 'scale-[1.03]' : 'hover:scale-[1.01]'
                      } ${isMovingSource ? 'ring-2 ring-amber-500' : ''} ${
                        item.appletId === 'cartridge' && !cartridgeTicketValid ? 'opacity-65' : ''
                      }`}
                    >
                      {renderGlossyTile(item.appletId, item.appletId === 'cartridge' && !cartridgeInserted)}
                      {item.appletId === 'cartridge' && cartridgeInserted && !cartridgeTicketValid && (
                        <span className="absolute -bottom-1 -right-1 px-1 py-0.5 rounded bg-rose-600 text-white text-[8px] font-mono font-bold shadow">
                          NO TIK
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Scroll Chevron */}
        {canScrollRight && (
          <button
            onClick={() => scrollTrayBy(0.65)}
            aria-label="Scroll Right"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-16 rounded-l-full bg-white/95 border border-r-0 border-slate-300/90 flex items-center justify-center text-[#36c2a8] hover:bg-white cursor-pointer shadow-md"
          >
            <ChevronRight className="w-5 h-5 stroke-[2.8]" />
          </button>
        )}
      </div>

      {/* ==================== BOTTOM FOOTER BAR ==================== */}
      <div
        className="flex items-center justify-between gap-2 px-3 border-t shrink-0 h-10 sm:h-11"
        style={{
          background: theme.barBg,
          borderColor: theme.barBorder,
        }}
      >
        <button
          onClick={() => {
            if (selectedItem?.type === 'app') setShowManual((v) => !v);
          }}
          disabled={!selectedItem || selectedItem.type !== 'app'}
          className="px-3 py-1 rounded-lg font-semibold border transition-colors disabled:opacity-35 cursor-pointer whitespace-nowrap text-xs shadow-2xs"
          style={{
            borderColor: theme.slotBorder,
            color: theme.slotText,
            backgroundColor: theme.slotBg,
          }}
        >
          {t.manual}
        </button>

        <div className="font-medium truncate opacity-80 min-w-0 text-center text-xs px-2" style={{ color: theme.slotText }}>
          {movingFromIndex !== null
            ? t.swapTiles
            : selectedItem?.type === 'app'
            ? selectedItem.appletId === 'cartridge' && !cartridgeInserted
              ? t.noCartridge
              : selectedItem.appletId === 'cartridge' && !cartridgeTicketValid
              ? 'Missing Ticket (.tik)'
              : getLocalizedTitle(selectedItem.appletId, config.language).shortName
            : selectedItem?.type === 'folder'
            ? userData.folders[selectedItem.folderId]?.name
            : t.emptySlot}
        </div>

        <button
          onClick={handlePrimaryOpen}
          disabled={
            !selectedItem ||
            (selectedItem.type === 'app' &&
              selectedItem.appletId === 'cartridge' &&
              (!cartridgeInserted || !cartridgeTicketValid)) ||
            (selectedItem.type === 'empty' && Boolean(activeFolder))
          }
          className="px-3.5 py-1 rounded-lg font-bold transition-opacity disabled:opacity-35 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-xs shadow-2xs"
          style={{
            backgroundColor: theme.accent,
            color: theme.accentText,
          }}
        >
          {selectedItem?.type === 'empty' ? (
            <>
              <FolderPlus className="w-4 h-4" />
              <span>{t.folder}</span>
            </>
          ) : (
            <span>{t.open}</span>
          )}
        </button>
      </div>

      {/* ==================== QUICK HOME MENU SETTINGS POPOVER ==================== */}
      {showHomeSettings && (
        <div className="absolute inset-0 bg-slate-950/92 text-slate-100 p-5 flex flex-col justify-between z-30">
          <div>
            <div className="font-bold text-sky-400 text-base mb-3">{t.homeSettings}</div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <button
                onClick={onCycleBrightness}
                className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">{t.brightness} ({config.brightness}/5)</span>
              </button>
              <button
                onClick={onCycleTheme}
                className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Palette className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="truncate">{t.theme}: {theme.name}</span>
              </button>
              {!activeFolder && (
                <button
                  onClick={() => {
                    setMovingFromIndex(movingFromIndex === null ? selectedIndex : null);
                    setShowHomeSettings(false);
                  }}
                  className="col-span-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-center cursor-pointer font-semibold"
                >
                  {movingFromIndex !== null ? t.cancel : t.arrange}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowHomeSettings(false)}
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold cursor-pointer text-xs shadow"
          >
            {t.close}
          </button>
        </div>
      )}

      {/* ==================== MANUAL / TITLE INFO OVERLAY ==================== */}
      {showManual && selectedItem?.type === 'app' && (
        <div className="absolute inset-0 bg-slate-950/94 text-slate-100 p-5 flex flex-col justify-between z-30">
          <div>
            <div className="font-bold text-sky-400 text-base">
              {getLocalizedTitle(selectedItem.appletId, config.language).fullName}
            </div>
            <div className="font-mono text-slate-400 text-[11px] mt-1">
              Title ID: {titlesByApplet[selectedItem.appletId]?.titleId ?? '00040000'} ·{' '}
              {selectedItem.appletId === 'cartridge' && cartridgeUpdateVersion
                ? `${titlesByApplet[selectedItem.appletId]?.version ?? 'v1.0.0'} (+Update ${cartridgeUpdateVersion})`
                : titlesByApplet[selectedItem.appletId]?.version ?? 'v1.0.0'}
            </div>
            {selectedItem.appletId === 'cartridge' && !cartridgeTicketValid && (
              <div className="mt-2 px-2.5 py-1.5 rounded bg-rose-950/70 border border-rose-500/40 text-rose-200 text-[11px] font-mono">
                No Ticket (.tik) found in /dbs/ticket.db for 0004000000030800. Restore it in System Settings → Titles.
              </div>
            )}
            <p className="text-slate-300 text-xs mt-3 leading-relaxed">
              {getLocalizedTitle(selectedItem.appletId, config.language).description}
            </p>
          </div>
          <button
            onClick={() => setShowManual(false)}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-semibold cursor-pointer text-xs shadow"
          >
            {t.close} {t.manual}
          </button>
        </div>
      )}
    </div>
  );
};

function renderGlossyTile(id: AppletId, emptyCard: boolean) {
  if (emptyCard) {
    return (
      <div className="w-full h-full rounded-xl bg-slate-200 flex items-center justify-center text-slate-400">
        <Disc className="w-1/2 h-1/2" />
      </div>
    );
  }

  switch (id) {
    case 'health-safety':
      return (
        <div className="w-full h-full rounded-xl bg-white flex items-center justify-center">
          <svg viewBox="0 0 60 56" className="w-[78%] h-[78%]">
            <polygon points="30,5 56,50 4,50" fill="#fde047" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
            <rect x="27.5" y="18" width="5" height="16" rx="2" fill="#0f172a" />
            <circle cx="30" cy="41.5" r="3" fill="#0f172a" />
          </svg>
        </div>
      );
    case 'camera-ar':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-b from-amber-400 via-orange-400 to-orange-500 flex items-center justify-center p-2">
          <svg viewBox="0 0 48 38" className="w-[82%] h-[72%]">
            <rect x="7" y="4" width="11" height="5" rx="2" fill="#ffffff" />
            <rect x="3" y="8" width="42" height="27" rx="6" fill="#ffffff" />
            <circle cx="24" cy="21.5" r="8" fill="#f97316" />
            <circle cx="24" cy="21.5" r="4.2" fill="#fed7aa" />
            <circle cx="37" cy="14" r="2.2" fill="#fdba74" />
          </svg>
        </div>
      );
    case 'mii-maker':
      return (
        <div className="w-full h-full rounded-xl bg-white flex items-center justify-center">
          <svg viewBox="0 0 64 36" className="w-[88%] h-[68%]">
            <text x="6" y="28" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="24" fill="#ffffff" stroke="#475569" strokeWidth="2.5">M</text>
            <text x="31" y="28" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="24" fill="#ffffff" stroke="#0d9488" strokeWidth="2.4">i</text>
            <text x="43" y="28" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="24" fill="#ffffff" stroke="#0284c7" strokeWidth="2.4">i</text>
          </svg>
        </div>
      );
    case 'sound-studio':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-b from-sky-400 via-blue-500 to-blue-600 flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-[74%] h-[74%]">
            <path d="M17 34V12l19-3.5v22" fill="none" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 17.5l19-3.5" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="13.5" cy="35" r="5" fill="#ffffff" />
            <circle cx="32.5" cy="31.5" r="5" fill="#ffffff" />
          </svg>
        </div>
      );
    case 'system-settings':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-b from-slate-200 to-slate-400 flex items-center justify-center text-slate-800">
          <Wrench className="w-1/2 h-1/2" />
        </div>
      );
    case 'activity-log':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-b from-emerald-400 to-teal-600 flex items-end justify-center gap-1.5 p-3">
          <span className="w-2.5 h-1/3 bg-amber-200 rounded-t-xs" />
          <span className="w-2.5 h-2/3 bg-white rounded-t-xs" />
          <span className="w-2.5 h-full bg-amber-300 rounded-t-xs" />
          <span className="w-2.5 h-1/2 bg-white rounded-t-xs" />
        </div>
      );
    case 'game-notes':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-b from-amber-300 to-yellow-500 flex items-center justify-center text-white">
          <PenLine className="w-1/2 h-1/2" />
        </div>
      );
    case 'browser':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 flex items-center justify-center text-white">
          <svg viewBox="0 0 32 32" className="w-[68%] h-[68%]">
            <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <ellipse cx="16" cy="16" rx="5" ry="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="5" y1="16" x2="27" y2="16" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      );
    case 'cartridge':
      return (
        <div className="w-full h-full rounded-xl bg-gradient-to-br from-slate-900 to-sky-600 flex items-center justify-center">
          <svg viewBox="0 0 48 36" className="w-[72%] h-[62%]">
            <polygon points="24,3 30,22 24,18 18,22" fill="#e0f2fe" />
            <polygon points="24,9 44,25 28,21" fill="#38bdf8" />
            <polygon points="24,9 4,25 20,21" fill="#0284c7" />
          </svg>
        </div>
      );
  }
}
