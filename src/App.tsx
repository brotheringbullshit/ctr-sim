import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppletId,
  BootPhase,
  BootStage2Header,
  ConsoleThemeId,
  CtrNandArchiveData,
  HomeFolder,
  LoadedSystemState,
  PartitionId,
  PartitionIntegrity,
  SystemConfig,
  SystemTitleEntry,
  UserSaveData,
} from './nand/types';
import { nandDriver } from './nand/idbStorage';
import { auditAllPartitions, runBootSequence } from './bootloader/engine';
import { soundEngine } from './audio/soundEngine';
import { fcram } from './ram/fcram';
import { ConsoleShell } from './components/ConsoleShell';
import { BootScreenOverlay, PanicInfo } from './components/BootScreenOverlay';
import { TopScreenBanner } from './components/TopScreenBanner';
import { HomeMenuGrid } from './components/HomeMenuGrid';
import { SystemSettingsApplet } from './components/applets/SystemSettingsApplet';
import { GameNotesApplet } from './components/applets/GameNotesApplet';
import { ActivityLogApplet } from './components/applets/ActivityLogApplet';
import { SoundStudioApplet } from './components/applets/SoundStudioApplet';
import {
  CartridgeGameApplet,
  fireStarburstLaser,
  moveStarburstShip,
} from './components/applets/CartridgeGameApplet';
import {
  MiiMakerApplet,
  SimpleInfoApplet,
} from './components/applets/MiscApplets';

const THEME_CYCLE: ConsoleThemeId[] = [
  'classic-white',
  'dark-charcoal',
  'cobalt-blue',
  'famicom-red',
  'mint-cream',
];

export default function App() {
  const [phase, setPhase] = useState<BootPhase>('bootrom');
  const [panicInfo, setPanicInfo] = useState<PanicInfo | null>(null);
  const [stage2ConfigHeader, setStage2ConfigHeader] = useState<BootStage2Header | null>(null);
  const [partitionChecks, setPartitionChecks] = useState<Record<PartitionId, PartitionIntegrity> | null>(null);

  const [systemState, setSystemState] = useState<LoadedSystemState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [activeApplet, setActiveApplet] = useState<AppletId | null>(null);
  const [appletLaunchTime, setAppletLaunchTime] = useState<number | null>(null);

  const [cartridgeInserted] = useState(true);
  const [depth3D, setDepth3D] = useState(0.35);
  const [nandBusy, setNandBusy] = useState(false);
  const [heldBootKey, setHeldBootKey] = useState<'NONE' | 'SELECT' | 'START'>('NONE');

  const abortRef = useRef<AbortController | null>(null);
  const busyTimerRef = useRef<number | null>(null);

  // Subscribe to IndexedDB chunk I/O pulses for the physical NAND LED
  useEffect(() => {
    const unsub = nandDriver.subscribeIO(() => {
      setNandBusy(true);
      if (busyTimerRef.current) window.clearTimeout(busyTimerRef.current);
      busyTimerRef.current = window.setTimeout(() => setNandBusy(false), 180);
    });
    return () => {
      unsub();
      if (busyTimerRef.current) window.clearTimeout(busyTimerRef.current);
    };
  }, []);

  const refreshAudit = useCallback(async () => {
    try {
      const checks = await auditAllPartitions();
      setPartitionChecks(checks);
    } catch {
      // Ignore if unprovisioned
    }
  }, []);

  const startBoot = useCallback(
    async (holdKey: 'NONE' | 'SELECT' | 'START' = 'NONE') => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setPanicInfo(null);
      setActiveApplet(null);
      setOpenFolderId(null);
      setSelectedIndex(0);
      setSystemState(null);

      const res = await runBootSequence(
        {
          onPhaseChange: (p) => setPhase(p),
          onLog: (entry) => {
            const levelStyle =
              entry.level === 'ok'
                ? 'color: #34d399; font-weight: bold;'
                : entry.level === 'warn'
                ? 'color: #fbbf24; font-weight: bold;'
                : entry.level === 'error'
                ? 'color: #f87171; font-weight: bold;'
                : 'color: #38bdf8;';
            console.log(
              `%c[CTR-BOOT +${String(entry.timestampMs).padStart(4, ' ')}ms] %c[${entry.stage}] %c${entry.message}`,
              'color: #64748b; font-family: monospace;',
              levelStyle + ' font-family: monospace;',
              'color: #f1f5f9; font-family: monospace;'
            );
          },
          onPanic: (info) => {
            setPanicInfo(info);
            void refreshAudit();
          },
        },
        { holdKey, abortSignal: ctrl.signal }
      );

      if (res.outcome === 'home_menu') {
        setSystemState(res.state);
        setPartitionChecks(res.state.partitionChecks);
        soundEngine.enabled = res.state.config.soundEnabled;
        soundEngine.playStartupSound();
      } else if (res.outcome === 'stage2_config') {
        setStage2ConfigHeader(res.header);
        setPartitionChecks(res.partitionChecks);
      } else if (res.outcome === 'nand_recovery') {
        setPartitionChecks(res.partitionChecks);
      }
    },
    [refreshAudit]
  );

  // Initial cold boot on mount
  useEffect(() => {
    void startBoot('NONE');
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titlesByApplet = useMemo(() => {
    const map: Record<string, SystemTitleEntry> = {};
    systemState?.titles.forEach((t) => {
      map[t.appletId] = t;
    });
    return map;
  }, [systemState]);

  const handleUpdateConfig = useCallback(async (nextConfig: SystemConfig) => {
    soundEngine.enabled = nextConfig.soundEnabled;
    fcram.writeSystemConfigCache(nextConfig);
    setSystemState((prev) => (prev ? { ...prev, config: nextConfig } : prev));
    await nandDriver.saveSystemConfig(nextConfig);
  }, []);

  const handleUpdateUserData = useCallback(async (nextUser: UserSaveData) => {
    fcram.writeUserDataCache(nextUser);
    setSystemState((prev) => (prev ? { ...prev, userData: nextUser } : prev));
    await nandDriver.saveUserData(nextUser);
  }, []);

  const handleUpdateCtrNand = useCallback(async (nextCtr: CtrNandArchiveData) => {
    fcram.writeCtrNandCache(nextCtr);
    setSystemState((prev) =>
      prev ? { ...prev, ctrNand: nextCtr, titles: nextCtr.titles } : prev
    );
    await nandDriver.saveCtrNandArchive(nextCtr);
  }, []);

  const cartridgeTicketValid = useMemo(() => {
    if (!systemState) return true;
    return systemState.ctrNand.dbs.ticketDb.some(
      (tk) => tk.titleId === '0004000000030800'
    );
  }, [systemState]);

  const cartridgeUpdateVersion = useMemo(() => {
    if (!systemState) return null;
    const updEntry = systemState.ctrNand.dbs.titleDb.find(
      (e) => e.titleId === '0004000E00030800' && e.state === 'Active'
    );
    const updTicket = systemState.ctrNand.dbs.ticketDb.some(
      (tk) => tk.titleId === '0004000E00030800'
    );
    if (!updEntry || !updTicket) return null;
    return updEntry.version;
  }, [systemState]);

  // Play each application's distinct banner jingle when selected on the HOME Menu
  const firstBootDoneRef = useRef(false);
  useEffect(() => {
    if (phase !== 'home_menu' || activeApplet || !systemState) {
      soundEngine.stopBannerJingle();
      return;
    }
    if (!firstBootDoneRef.current) {
      firstBootDoneRef.current = true;
      return;
    }
    const folder = openFolderId ? systemState.userData.folders[openFolderId] : null;
    const items = folder
      ? folder.items.map((id) => ({ type: 'app' as const, appletId: id }))
      : systemState.userData.slots;
    const item = items[selectedIndex];
    if (item?.type === 'app') {
      if (item.appletId === 'cartridge' && (!cartridgeInserted || !cartridgeTicketValid)) {
        soundEngine.stopBannerJingle();
        return;
      }
      soundEngine.playBannerJingle(item.appletId);
    } else {
      soundEngine.stopBannerJingle();
    }
  }, [phase, activeApplet, systemState, openFolderId, selectedIndex, cartridgeInserted, cartridgeTicketValid]);

  const handleLaunchApplet = useCallback(
    async (appletId: AppletId) => {
      if (!systemState) return;
      soundEngine.stopBannerJingle();

      // Verify Title ID registration in title.db, .tmd + NCCH .app files, and .tik license in ticket.db
      const titleEntry = titlesByApplet[appletId];
      if (titleEntry) {
        const launchCheck = fcram.verifyTitleLaunch(titleEntry.titleId);
        if (!launchCheck.ok) {
          soundEngine.playError();
          console.warn(`[HORIZON NS] Launch blocked for ${titleEntry.titleId}: ${launchCheck.reason}`);
          return;
        }
        soundEngine.playConfirm();
      }

      // Allocate simulated APPMEM heap inside 128 MB FCRAM
      fcram.allocateApplet(appletId);
      setActiveApplet(appletId);
      setAppletLaunchTime(Date.now());

      // Read latest userData from resident FCRAM cache to avoid stale closures
      const currentUserData = fcram.readUserDataCache() ?? systemState.userData;
      const existing = currentUserData.activity[appletId];
      const nextActivity = {
        ...currentUserData.activity,
        [appletId]: {
          appletId,
          launchCount: (existing?.launchCount ?? 0) + 1,
          totalSeconds: existing?.totalSeconds ?? 0,
          lastPlayed: new Date().toISOString().slice(0, 10),
        },
      };
      await handleUpdateUserData({ ...currentUserData, activity: nextActivity });
    },
    [systemState, titlesByApplet, handleUpdateUserData]
  );

  const handleExitApplet = useCallback(async () => {
    if (!activeApplet || !systemState) {
      setActiveApplet(null);
      return;
    }
    soundEngine.playBack();
    const exitingApplet = activeApplet;
    const elapsedSec = appletLaunchTime
      ? Math.max(1, Math.round((Date.now() - appletLaunchTime) / 1000))
      : 1;

    setActiveApplet(null);
    setAppletLaunchTime(null);
    fcram.freeApplet(exitingApplet);

    const currentUserData = fcram.readUserDataCache() ?? systemState.userData;
    const existing = currentUserData.activity[exitingApplet];
    if (existing) {
      const nextActivity = {
        ...currentUserData.activity,
        [exitingApplet]: {
          ...existing,
          totalSeconds: existing.totalSeconds + elapsedSec,
        },
      };
      await handleUpdateUserData({ ...currentUserData, activity: nextActivity });
    }
  }, [activeApplet, appletLaunchTime, systemState, handleUpdateUserData]);

  const handleRepairPartition = async (id: PartitionId) => {
    await nandDriver.repairPartition(id);
    soundEngine.playConfirm();
    await refreshAudit();
    if (phase === 'panic') {
      void startBoot('NONE');
    }
  };

  const handleReflashAll = async () => {
    abortRef.current?.abort();
    fcram.reset();
    soundEngine.stopBannerJingle();
    setPhase('provisioning');
    setActiveApplet(null);
    await nandDriver.provisionFreshNand();
    await startBoot('NONE');
  };

  // Directional navigation on console D-Pad / Circle Pad / Keyboard
  const handleDirection = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (activeApplet === 'cartridge') {
        if (dir === 'left') moveStarburstShip(-12);
        if (dir === 'right') moveStarburstShip(12);
        return;
      }
      if (phase !== 'home_menu' || activeApplet || !systemState) return;

      const folder = openFolderId ? systemState.userData.folders[openFolderId] : null;
      const total = folder ? folder.items.length : systemState.userData.slots.length;
      const rows = systemState.config.gridRows;

      setSelectedIndex((prev) => {
        let next = prev;
        if (dir === 'up') {
          if (prev % rows > 0) next = prev - 1;
        } else if (dir === 'down') {
          if (prev % rows < rows - 1 && prev + 1 < total) next = prev + 1;
        } else if (dir === 'left') {
          if (prev - rows >= 0) next = prev - rows;
        } else if (dir === 'right') {
          if (prev + rows < total) next = prev + rows;
        }
        if (next !== prev) soundEngine.playCursorTick();
        return next;
      });
    },
    [activeApplet, phase, systemState, openFolderId]
  );

  const handleConsoleButton = useCallback(
    (btn: 'A' | 'B' | 'X' | 'Y' | 'SELECT' | 'START' | 'HOME' | 'POWER') => {
      if (btn === 'POWER') {
        if (phase === 'off') {
          const override = heldBootKey;
          setHeldBootKey('NONE');
          void startBoot(override);
        } else {
          abortRef.current?.abort();
          soundEngine.stopBannerJingle();
          fcram.reset();
          setPhase('off');
          setActiveApplet(null);
        }
        return;
      }

      if (phase === 'off' && (btn === 'START' || btn === 'SELECT')) {
        setHeldBootKey((prev) => (prev === btn ? 'NONE' : btn));
        return;
      }

      if (btn === 'HOME') {
        if (activeApplet) {
          void handleExitApplet();
        } else if (openFolderId) {
          soundEngine.playBack();
          setOpenFolderId(null);
          setSelectedIndex(0);
        }
        return;
      }

      if (activeApplet === 'cartridge' && btn === 'A') {
        fireStarburstLaser();
        return;
      }

      if (phase === 'stage2_config' && btn === 'START') {
        void startBoot('NONE');
        return;
      }

      if (phase !== 'home_menu' || !systemState) return;

      if (btn === 'B' && openFolderId && !activeApplet) {
        soundEngine.playBack();
        setOpenFolderId(null);
        setSelectedIndex(0);
        return;
      }

      if (btn === 'A' && !activeApplet) {
        const folder = openFolderId ? systemState.userData.folders[openFolderId] : null;
        const items = folder
          ? folder.items.map((id) => ({ type: 'app' as const, appletId: id }))
          : systemState.userData.slots;
        const item = items[selectedIndex];
        if (!item) return;
        if (item.type === 'app') {
          if (item.appletId === 'cartridge' && (!cartridgeInserted || !cartridgeTicketValid)) {
            soundEngine.playError();
            return;
          }
          void handleLaunchApplet(item.appletId);
        } else if (item.type === 'folder') {
          soundEngine.playConfirm();
          setOpenFolderId(item.folderId);
          setSelectedIndex(0);
        }
      }
    },
    [
      phase,
      activeApplet,
      openFolderId,
      systemState,
      selectedIndex,
      cartridgeInserted,
      cartridgeTicketValid,
      heldBootKey,
      startBoot,
      handleExitApplet,
      handleLaunchApplet,
    ]
  );

  // Global keyboard bindings for desktop control
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDirection('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleDirection('right');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleDirection('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleDirection('down');
      } else if (e.key === 'Enter' || (e.key === ' ' && activeApplet === 'cartridge')) {
        e.preventDefault();
        handleConsoleButton('A');
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        handleConsoleButton('B');
      } else if (e.key.toLowerCase() === 'h') {
        handleConsoleButton('HOME');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeApplet, handleDirection, handleConsoleButton]);

  // Render Top & Bottom screen contents based on BootPhase & Active Applet
  const renderScreen = (screen: 'top' | 'bottom') => {
    if (phase !== 'home_menu' || !systemState) {
      return (
        <BootScreenOverlay
          screen={screen}
          phase={phase}
          panicInfo={panicInfo}
          stage2ConfigHeader={stage2ConfigHeader}
          partitionChecks={partitionChecks}
          onRepairPartition={(id) => void handleRepairPartition(id)}
          onRefreshAudit={refreshAudit}
          onReboot={(hold) => void startBoot(hold)}
        />
      );
    }

    if (activeApplet) {
      switch (activeApplet) {
        case 'system-settings':
          return (
            <SystemSettingsApplet
              screen={screen}
              config={systemState.config}
              ctrNand={systemState.ctrNand}
              onUpdateConfig={handleUpdateConfig}
              onUpdateCtrNand={handleUpdateCtrNand}
              onFormatNand={() => void handleReflashAll()}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'game-notes':
          return (
            <GameNotesApplet
              screen={screen}
              userData={systemState.userData}
              language={systemState.config.language}
              onUpdateUserData={handleUpdateUserData}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'activity-log':
          return (
            <ActivityLogApplet
              screen={screen}
              config={systemState.config}
              userData={systemState.userData}
              titlesByApplet={titlesByApplet}
              onEarnSteps={async (steps, coins) => {
                soundEngine.playConfirm();
                const latestCfg = fcram.readSystemConfigCache() ?? systemState.config;
                await handleUpdateConfig({
                  ...latestCfg,
                  totalSteps: latestCfg.totalSteps + steps,
                  playCoins: Math.min(300, latestCfg.playCoins + coins),
                });
              }}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'sound-studio':
          return (
            <SoundStudioApplet
              screen={screen}
              userData={systemState.userData}
              language={systemState.config.language}
              onUpdateUserData={handleUpdateUserData}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'cartridge':
          return (
            <CartridgeGameApplet
              screen={screen}
              userData={systemState.userData}
              language={systemState.config.language}
              onSaveHighScore={async (score) => {
                const latestUser = fcram.readUserDataCache() ?? systemState.userData;
                await handleUpdateUserData({
                  ...latestUser,
                  cartridgeHighScore: Math.max(latestUser.cartridgeHighScore, score),
                });
              }}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'mii-maker':
          return (
            <MiiMakerApplet
              screen={screen}
              userData={systemState.userData}
              language={systemState.config.language}
              onUpdateUserData={handleUpdateUserData}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'health-safety':
        case 'camera-ar':
        case 'browser':
          return (
            <SimpleInfoApplet
              kind={activeApplet}
              screen={screen}
              depth3D={depth3D}
              language={systemState.config.language}
              onExit={() => void handleExitApplet()}
            />
          );
      }
    }

    const activeFolder = openFolderId ? systemState.userData.folders[openFolderId] ?? null : null;
    const displayedItems = activeFolder
      ? activeFolder.items.map((id) => ({ type: 'app' as const, appletId: id }))
      : systemState.userData.slots;
    const selectedItem = displayedItems[selectedIndex] ?? null;

    if (screen === 'top') {
      return (
        <TopScreenBanner
          config={systemState.config}
          selectedItem={selectedItem}
          openFolder={activeFolder}
          titlesByApplet={titlesByApplet}
          folders={systemState.userData.folders}
          cartridgeInserted={cartridgeInserted}
          cartridgeTicketValid={cartridgeTicketValid}
          cartridgeUpdateVersion={cartridgeUpdateVersion}
          depth3D={depth3D}
          suspendedApplet={activeApplet}
        />
      );
    }

    return (
      <HomeMenuGrid
        config={systemState.config}
        userData={systemState.userData}
        titlesByApplet={titlesByApplet}
        selectedIndex={selectedIndex}
        openFolderId={openFolderId}
        cartridgeInserted={cartridgeInserted}
        cartridgeTicketValid={cartridgeTicketValid}
        cartridgeUpdateVersion={cartridgeUpdateVersion}
        onSelectIndex={(idx) => {
          soundEngine.playCursorTick();
          setSelectedIndex(idx);
        }}
        onLaunchApplet={(id) => void handleLaunchApplet(id)}
        onOpenFolder={(fid) => {
          soundEngine.playConfirm();
          setOpenFolderId(fid);
        }}
        onChangeGridRows={(rows) => {
          soundEngine.playCursorTick();
          const latestCfg = fcram.readSystemConfigCache() ?? systemState.config;
          void handleUpdateConfig({ ...latestCfg, gridRows: rows });
        }}
        onCycleBrightness={() => {
          soundEngine.playCursorTick();
          const latestCfg = fcram.readSystemConfigCache() ?? systemState.config;
          const next = ((latestCfg.brightness % 5) + 1) as 1 | 2 | 3 | 4 | 5;
          void handleUpdateConfig({ ...latestCfg, brightness: next });
        }}
        onCycleTheme={() => {
          soundEngine.playConfirm();
          const latestCfg = fcram.readSystemConfigCache() ?? systemState.config;
          const idx = THEME_CYCLE.indexOf(latestCfg.themeId);
          const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
          void handleUpdateConfig({ ...latestCfg, themeId: next });
        }}
        onMoveOrCreateFolder={(action) => {
          const latestUser = fcram.readUserDataCache() ?? systemState.userData;
          if (action.type === 'swap') {
            const slots = [...latestUser.slots];
            const tmp = slots[action.from];
            slots[action.from] = slots[action.to];
            slots[action.to] = tmp;
            soundEngine.playConfirm();
            void handleUpdateUserData({ ...latestUser, slots });
          } else {
            const folderId = `fld-${Date.now()}`;
            const slots = [...latestUser.slots];
            slots[action.slotIndex] = { type: 'folder', folderId };
            const folders: Record<string, HomeFolder> = {
              ...latestUser.folders,
              [folderId]: {
                id: folderId,
                name: 'New Folder',
                badgeChar: 'N',
                color: '#0d9488',
                items: ['health-safety'],
              },
            };
            soundEngine.playConfirm();
            void handleUpdateUserData({ ...latestUser, slots, folders });
          }
        }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-4 sm:p-6">
      <main className="w-full flex items-center justify-center">
        <ConsoleShell
          topScreen={renderScreen('top')}
          bottomScreen={renderScreen('bottom')}
          poweredOn={phase !== 'off'}
          nandBusy={nandBusy}
          wirelessOn={phase === 'home_menu' ? (systemState?.config.wirelessEnabled ?? true) : false}
          brightness={systemState?.config.brightness ?? 4}
          depth3D={depth3D}
          heldBootKey={heldBootKey}
          onChangeDepth3D={setDepth3D}
          onPressDirection={handleDirection}
          onPressButton={handleConsoleButton}
        />
      </main>
    </div>
  );
}
