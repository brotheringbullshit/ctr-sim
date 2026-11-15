import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppletId,
  BootPhase,
  BootStage2Header,
  ConsoleThemeId,
  HomeFolder,
  LoadedSystemState,
  NAND_PARTITIONS,
  PartitionId,
  PartitionIntegrity,
  Stage1Opcode,
  SystemConfig,
  SystemTitleEntry,
  UserSaveData,
} from './nand/types';
import { nandDriver } from './nand/idbStorage';
import { auditAllPartitions, runBootSequence } from './bootloader/engine';
import { soundEngine } from './audio/soundEngine';
import { ConsoleShell } from './components/ConsoleShell';
import { BootScreenOverlay, PanicInfo } from './components/BootScreenOverlay';
import { TopScreenBanner } from './components/TopScreenBanner';
import { HomeMenuGrid } from './components/HomeMenuGrid';
import { HexInspectorModal } from './components/HexInspectorModal';
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
  NandToolApplet,
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
  const [provisionProgress, setProvisionProgress] = useState({ written: 0, total: 256, label: '' });
  const [stage1Step, setStage1Step] = useState<{ index: number; opcodes: Stage1Opcode[] }>({
    index: 0,
    opcodes: [],
  });
  const [stage2Mounts, setStage2Mounts] = useState<
    Array<{ mount: string; status: 'mounting' | 'ok' | 'error'; detail: string }>
  >([]);
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
  const [hexChunkModal, setHexChunkModal] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const busyTimerRef = useRef<number | null>(null);

  // Subscribe to real-time IndexedDB chunk I/O telemetry for the console NAND LED
  useEffect(() => {
    const unsub = nandDriver.subscribeIO(() => {
      setNandBusy(true);
      if (busyTimerRef.current) window.clearTimeout(busyTimerRef.current);
      busyTimerRef.current = window.setTimeout(() => setNandBusy(false), 180);
    });
    return unsub;
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
      setStage2Mounts([]);
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
          onProvisionProgress: (written, total, label) =>
            setProvisionProgress({ written, total, label }),
          onStage1Step: (index, opcodes) => setStage1Step({ index, opcodes }),
          onStage2Mount: (mount, status, detail) =>
            setStage2Mounts((prev) => {
              const idx = prev.findIndex((m) => m.mount === mount);
              if (idx === -1) return [...prev, { mount, status, detail }];
              const copy = [...prev];
              copy[idx] = { mount, status, detail };
              return copy;
            }),
          onPanic: (info) => {
            setPanicInfo(info);
            void refreshAudit();
          },
        },
        { slowStep: false, holdKey, abortSignal: ctrl.signal }
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
    setSystemState((prev) => (prev ? { ...prev, config: nextConfig } : prev));
    await nandDriver.saveSystemConfig(nextConfig);
    await refreshAudit();
  }, [refreshAudit]);

  const handleUpdateUserData = useCallback(async (nextUser: UserSaveData) => {
    setSystemState((prev) => (prev ? { ...prev, userData: nextUser } : prev));
    await nandDriver.saveUserData(nextUser);
    await refreshAudit();
  }, [refreshAudit]);

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
      if (item.appletId === 'cartridge' && !cartridgeInserted) {
        soundEngine.stopBannerJingle();
        return;
      }
      soundEngine.playBannerJingle(item.appletId);
    } else {
      soundEngine.stopBannerJingle();
    }
  }, [phase, activeApplet, systemState, openFolderId, selectedIndex, cartridgeInserted]);

  const handleLaunchApplet = useCallback(
    async (appletId: AppletId) => {
      if (!systemState) return;
      soundEngine.stopBannerJingle();
      const title = titlesByApplet[appletId];
      if (title) soundEngine.playConfirm();
      setActiveApplet(appletId);
      setAppletLaunchTime(Date.now());

      // Record launch in NAND_USERDATA activity log
      const existing = systemState.userData.activity[appletId];
      const nextActivity = {
        ...systemState.userData.activity,
        [appletId]: {
          appletId,
          launchCount: (existing?.launchCount ?? 0) + 1,
          totalSeconds: existing?.totalSeconds ?? 0,
          lastPlayed: new Date().toISOString().slice(0, 10),
        },
      };
      await handleUpdateUserData({ ...systemState.userData, activity: nextActivity });
    },
    [systemState, titlesByApplet, handleUpdateUserData]
  );

  const handleExitApplet = useCallback(async () => {
    if (!activeApplet || !systemState) {
      setActiveApplet(null);
      return;
    }
    soundEngine.playBack();
    const elapsedSec = appletLaunchTime
      ? Math.max(1, Math.round((Date.now() - appletLaunchTime) / 1000))
      : 1;
    const existing = systemState.userData.activity[activeApplet];
    if (existing) {
      const nextActivity = {
        ...systemState.userData.activity,
        [activeApplet]: {
          ...existing,
          totalSeconds: existing.totalSeconds + elapsedSec,
        },
      };
      await handleUpdateUserData({ ...systemState.userData, activity: nextActivity });
    }
    setActiveApplet(null);
    setAppletLaunchTime(null);
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
    setPhase('provisioning');
    setActiveApplet(null);
    await nandDriver.provisionFreshNand((written, total, label) => {
      setProvisionProgress({ written, total, label });
    });
    await startBoot('NONE');
  };

  const handleExportNandBin = async () => {
    const bytes = await nandDriver.exportFullNandBin();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ctr-sim-nand-${new Date().toISOString().slice(0, 10)}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportNandBin = async (file: File) => {
    const buf = await file.arrayBuffer();
    await nandDriver.importFullNandBin(new Uint8Array(buf));
    await refreshAudit();
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
          if (item.appletId === 'cartridge' && !cartridgeInserted) {
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
      heldBootKey,
      startBoot,
      handleExitApplet,
      handleLaunchApplet,
    ]
  );

  // Global keyboard bindings for effortless desktop testing
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
      } else if (e.key === 'Enter') {
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
  }, [handleDirection, handleConsoleButton]);

  // Render Top & Bottom screen contents based on BootPhase & Active Applet
  const renderScreen = (screen: 'top' | 'bottom') => {
    if (phase !== 'home_menu' || !systemState) {
      return (
        <BootScreenOverlay
          screen={screen}
          phase={phase}
          provisionProgress={provisionProgress}
          stage1Step={stage1Step}
          stage2Mounts={stage2Mounts}
          panicInfo={panicInfo}
          stage2ConfigHeader={stage2ConfigHeader}
          partitionChecks={partitionChecks}
          onRepairPartition={(id) => void handleRepairPartition(id)}
          onReboot={(hold) => void startBoot(hold)}
          onToggleStage2Flag={() => {}}
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
              onUpdateConfig={handleUpdateConfig}
              onFormatNand={() => void handleReflashAll()}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'game-notes':
          return (
            <GameNotesApplet
              screen={screen}
              userData={systemState.userData}
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
                await handleUpdateConfig({
                  ...systemState.config,
                  totalSteps: systemState.config.totalSteps + steps,
                  playCoins: Math.min(300, systemState.config.playCoins + coins),
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
              onUpdateUserData={handleUpdateUserData}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'cartridge':
          return (
            <CartridgeGameApplet
              screen={screen}
              userData={systemState.userData}
              onSaveHighScore={async (score) => {
                await handleUpdateUserData({
                  ...systemState.userData,
                  cartridgeHighScore: Math.max(systemState.userData.cartridgeHighScore, score),
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
              onUpdateUserData={handleUpdateUserData}
              onExit={() => void handleExitApplet()}
            />
          );
        case 'nand-tool':
          return (
            <NandToolApplet
              screen={screen}
              partitionChecks={partitionChecks ?? systemState.partitionChecks}
              onInspectPartition={(id) => {
                const spec = NAND_PARTITIONS.find((p) => p.id === id);
                if (spec) setHexChunkModal(spec.startChunk);
              }}
              onInspectChunk={(chunkIndex) => setHexChunkModal(chunkIndex)}
              onExportNandBin={handleExportNandBin}
              onImportNandBin={handleImportNandBin}
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
          void handleUpdateConfig({ ...systemState.config, gridRows: rows });
        }}
        onCycleBrightness={() => {
          soundEngine.playCursorTick();
          const next = ((systemState.config.brightness % 5) + 1) as 1 | 2 | 3 | 4 | 5;
          void handleUpdateConfig({ ...systemState.config, brightness: next });
        }}
        onCycleTheme={() => {
          soundEngine.playConfirm();
          const idx = THEME_CYCLE.indexOf(systemState.config.themeId);
          const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
          void handleUpdateConfig({ ...systemState.config, themeId: next });
        }}
        onMoveOrCreateFolder={(action) => {
          if (action.type === 'swap') {
            const slots = [...systemState.userData.slots];
            const tmp = slots[action.from];
            slots[action.from] = slots[action.to];
            slots[action.to] = tmp;
            soundEngine.playConfirm();
            void handleUpdateUserData({ ...systemState.userData, slots });
          } else {
            const folderId = `fld-${Date.now()}`;
            const slots = [...systemState.userData.slots];
            slots[action.slotIndex] = { type: 'folder', folderId };
            const folders: Record<string, HomeFolder> = {
              ...systemState.userData.folders,
              [folderId]: {
                id: folderId,
                name: 'New Folder',
                badgeChar: 'N',
                color: '#0d9488',
                items: ['health-safety'],
              },
            };
            soundEngine.playConfirm();
            void handleUpdateUserData({ ...systemState.userData, slots, folders });
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

      {hexChunkModal !== null && (
        <HexInspectorModal
          initialChunk={hexChunkModal}
          onClose={() => setHexChunkModal(null)}
          onMutated={() => void refreshAudit()}
          onExportNandBin={handleExportNandBin}
          onImportNandBin={handleImportNandBin}
        />
      )}
    </div>
  );
}
