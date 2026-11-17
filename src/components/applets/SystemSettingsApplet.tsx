import React, { useEffect, useState } from 'react';
import {
  ConsoleThemeId,
  CtrNandArchiveData,
  NAND_PARTITIONS,
  SupportedLanguage,
  SystemConfig,
  TitleCategoryHigh,
  TitleTicket,
} from '../../nand/types';
import { HOME_THEMES } from '../themes';
import { getTranslations, SUPPORTED_LANGUAGES } from '../../i18n/translations';
import { soundEngine } from '../../audio/soundEngine';
import { fcram, RamSnapshot } from '../../ram/fcram';
import { getNandCidHex } from '../../nand/crypto';
import {
  CheckCircle2,
  Cpu,
  Database,
  FolderTree,
  Globe,
  HardDrive,
  KeyRound,
  Palette,
  ShieldAlert,
  Sliders,
  Volume2,
  Wifi,
} from 'lucide-react';

interface SystemSettingsProps {
  screen: 'top' | 'bottom';
  config: SystemConfig;
  ctrNand: CtrNandArchiveData;
  onUpdateConfig: (next: SystemConfig) => Promise<void>;
  onUpdateCtrNand: (next: CtrNandArchiveData) => Promise<void>;
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

type SettingsTab = 'config' | 'titles' | 'nand_fs';

// Lightweight shared view state synchronizing System Settings Top & Bottom LCD screens
let sharedSettingsUi: { tab: SettingsTab; selectedTitleId: string } = {
  tab: 'config',
  selectedTitleId: '0004000000030800',
};
const settingsUiListeners = new Set<() => void>();

function updateSettingsUi(patch: Partial<typeof sharedSettingsUi>) {
  sharedSettingsUi = { ...sharedSettingsUi, ...patch };
  settingsUiListeners.forEach((fn) => fn());
}

function useSettingsUi() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    settingsUiListeners.add(fn);
    return () => {
      settingsUiListeners.delete(fn);
    };
  }, []);
  return sharedSettingsUi;
}

function getCategoryLabel(high: TitleCategoryHigh): string {
  switch (high) {
    case '00040000':
      return 'Game';
    case '0004000E':
      return 'Update';
    case '00040010':
      return 'SysApp';
    case '00040030':
      return 'Applet';
    case '0004009B':
      return 'SysData';
    case '00048004':
      return 'DSiWare';
  }
}

export const SystemSettingsApplet: React.FC<SystemSettingsProps> = ({
  screen,
  config,
  ctrNand,
  onUpdateConfig,
  onUpdateCtrNand,
  onFormatNand,
  onExit,
}) => {
  const [ownerDraft, setOwnerDraft] = useState(config.ownerName);
  const [saving, setSaving] = useState(false);
  const [ram, setRam] = useState<RamSnapshot>(() => fcram.getSnapshot());
  const ui = useSettingsUi();
  const t = getTranslations(config.language);

  useEffect(() => {
    setOwnerDraft(config.ownerName);
  }, [config.ownerName]);

  useEffect(() => {
    if (screen !== 'top') return;
    setRam(fcram.getSnapshot());
    return fcram.subscribe(() => setRam(fcram.getSnapshot()));
  }, [screen]);

  const commit = async (patch: Partial<SystemConfig>) => {
    setSaving(true);
    soundEngine.playConfirm();
    try {
      const nextRegion = patch.region ?? config.region;
      const nextSerial = patch.serialNumber ?? config.serialNumber;
      const nextIdentity = config.identity
        ? {
            ...config.identity,
            secureInfoRegionByte: nextRegion,
            secureInfoSerial: nextSerial,
          }
        : undefined;
      await onUpdateConfig({
        ...config,
        ...patch,
        ...(nextIdentity ? { identity: nextIdentity } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  const commitCtrNand = async (next: CtrNandArchiveData) => {
    setSaving(true);
    soundEngine.playConfirm();
    try {
      await onUpdateCtrNand(next);
    } finally {
      setSaving(false);
    }
  };

  const finalizeStagedImport = async (titleId: string) => {
    const staged = ctrNand.dbs.importDb.find((e) => e.titleId === titleId);
    if (!staged) return;
    const pkg = ctrNand.packages.find((p) => p.titleId === titleId);
    const activeEntry = { ...staged, state: 'Active' as const };
    const nextTitleDb = [
      ...ctrNand.dbs.titleDb.filter((e) => e.titleId !== titleId),
      activeEntry,
    ];
    const nextImportDb = ctrNand.dbs.importDb.filter((e) => e.titleId !== titleId);

    const hasTicket = ctrNand.dbs.ticketDb.some((tk) => tk.titleId === titleId);
    const newTicket: TitleTicket = {
      ticketId: `TIK${titleId.slice(-13)}`,
      titleId,
      titleIdHigh: staged.titleIdHigh,
      titleIdLow: staged.titleIdLow,
      consoleId: '4A92C108',
      encryptedTitleKeyHex: `A4C9E102${titleId}77B10F22`,
      commonKeyIndex: 0,
      version: 1,
      issuer: 'Root-CA00000003-XS0000000c',
      source: 'NintendoSigned',
      signatureHex: pkg?.tmd.signatureHex ?? '91F2C084E71103AB',
      rightsMask: '0x00000003',
    };

    const nextPackages = ctrNand.packages.map((p) =>
      p.titleId === titleId
        ? {
            ...p,
            basePath: `ctrnand:/title/${p.titleIdHigh}/${p.titleIdLow}/content/`,
          }
        : p
    );

    await commitCtrNand({
      ...ctrNand,
      packages: nextPackages,
      dbs: {
        ...ctrNand.dbs,
        titleDb: nextTitleDb,
        importDb: nextImportDb,
        ticketDb: hasTicket ? ctrNand.dbs.ticketDb : [...ctrNand.dbs.ticketDb, newTicket],
      },
    });
  };

  const toggleTicketForTitle = async (titleId: string) => {
    const existing = ctrNand.dbs.ticketDb.find((tk) => tk.titleId === titleId);
    if (existing) {
      await commitCtrNand({
        ...ctrNand,
        dbs: {
          ...ctrNand.dbs,
          ticketDb: ctrNand.dbs.ticketDb.filter((tk) => tk.titleId !== titleId),
        },
      });
    } else {
      const high = titleId.slice(0, 8) as TitleCategoryHigh;
      const low = titleId.slice(8, 16);
      const restored: TitleTicket = {
        ticketId: `TIK${titleId.slice(-13)}`,
        titleId,
        titleIdHigh: high,
        titleIdLow: low,
        consoleId: '4A92C108',
        encryptedTitleKeyHex: `5C8E1920${titleId}B2441A09`,
        commonKeyIndex: 0,
        version: 1,
        issuer: 'Root-CA00000003-XS0000000c',
        source: 'NintendoSigned',
        signatureHex: 'E24F9100C8312B77',
        rightsMask: '0x00000003',
      };
      await commitCtrNand({
        ...ctrNand,
        dbs: {
          ...ctrNand.dbs,
          ticketDb: [...ctrNand.dbs.ticketDb, restored],
        },
      });
    }
  };

  const currentLangMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === config.language) ?? SUPPORTED_LANGUAGES[0];

  if (screen === 'top') {
    if (ui.tab === 'titles') {
      const pkg =
        ctrNand.packages.find((p) => p.titleId === ui.selectedTitleId) ?? ctrNand.packages[0];
      const ticket = pkg ? ctrNand.dbs.ticketDb.find((tk) => tk.titleId === pkg.titleId) : undefined;
      const dbActive = pkg
        ? ctrNand.dbs.titleDb.find((d) => d.titleId === pkg.titleId)
        : undefined;
      const dbImport = pkg
        ? ctrNand.dbs.importDb.find((d) => d.titleId === pkg.titleId)
        : undefined;
      const mainApp = pkg?.apps[0];

      return (
        <div className="w-full h-full bg-slate-950 text-slate-100 p-3 flex flex-col justify-between select-none font-mono text-[9.5px]">
          {pkg ? (
            <>
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="text-sky-400 font-bold truncate">
                    {pkg.shortName} ({pkg.productCode})
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[8.5px]">
                    TID {pkg.titleIdHigh}-{pkg.titleIdLow}
                  </span>
                </div>

                <div className="mt-1.5 space-y-1">
                  <div className="text-slate-300 truncate">
                    Path: <span className="text-emerald-300">{pkg.basePath}</span>
                  </div>

                  {/* 4-part Title Anatomy */}
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <div className="bg-slate-900 rounded p-1.5 border border-slate-800">
                      <div className="text-[8px] text-slate-400 uppercase">TMD ({pkg.tmd.fileName})</div>
                      <div className="text-slate-200 font-semibold">
                        Ver {pkg.tmd.versionString} · {pkg.tmd.contentCount} content(s)
                      </div>
                      <div className="text-[8px] text-slate-400 truncate">
                        Issuer: {pkg.tmd.signatureIssuer}
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded p-1.5 border border-slate-800">
                      <div className="text-[8px] text-slate-400 uppercase">
                        NCCH ({mainApp?.fileName ?? '00000000.app'})
                      </div>
                      <div className="text-slate-200 font-semibold">
                        ExeFS {mainApp?.exefs ? `${Math.round(mainApp.exefs.codeSizeBytes / 1024)}KB` : '0KB'} · RomFS{' '}
                        {mainApp?.romfs ? `${Math.round(mainApp.romfs.sizeBytes / 1024)}KB` : '0KB'}
                      </div>
                      <div className="text-[8px] text-sky-300 truncate">{mainApp?.cryptoType}</div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded p-1.5 border border-slate-800 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[8px] text-slate-400 uppercase">
                        Ticket (.tik in ticket.db) &amp; DB State
                      </div>
                      {ticket ? (
                        <div className="text-emerald-300 truncate">
                          #{ticket.ticketId} · Key {ticket.encryptedTitleKeyHex.slice(0, 12)}... ({ticket.source})
                        </div>
                      ) : (
                        <div className="text-rose-400 font-semibold">
                          NO TICKET IN /dbs/ticket.db — HOME Menu cannot boot
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
                        dbActive && ticket
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : dbImport
                          ? 'bg-amber-950 text-amber-300 border border-amber-700'
                          : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}
                    >
                      {dbImport ? 'import.db' : dbActive ? 'title.db' : 'UNREGISTERED'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[8.5px] text-slate-400 border-t border-slate-800 pt-1">
                <span>
                  title.db: {ctrNand.dbs.titleDb.length} · import.db: {ctrNand.dbs.importDb.length} · ticket.db:{' '}
                  {ctrNand.dbs.ticketDb.length}
                </span>
                <span>certs.db: {ctrNand.dbs.certsDb.length} CAs</span>
              </div>
            </>
          ) : null}
        </div>
      );
    }

    if (ui.tab === 'nand_fs') {
      const id = config.identity;
      return (
        <div className="w-full h-full bg-slate-950 text-slate-100 p-3 flex flex-col justify-between select-none font-mono text-[9px]">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="text-emerald-400 font-bold">eMMC NAND · CTRNAND VFS</span>
              <span className="text-[8px] text-slate-400">4.00 MB IDB (Old3DS 0x3AF00000)</span>
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <div className="bg-slate-900 rounded p-1.5 border border-slate-800">
                <div className="text-[8px] text-slate-400 uppercase">/rw/sys/ &amp; /private/</div>
                <div className="text-slate-200 truncate">
                  SecureInfo_A: <span className="text-sky-300">{id?.secureInfoRegionByte ?? config.region}</span> ({id?.secureInfoSerial ?? config.serialNumber})
                </div>
                <div className="text-slate-300 truncate">
                  LFCS_B: {id?.localFriendCodeSeedHex.slice(0, 14) ?? '...'}
                </div>
                <div className="text-amber-300 truncate">
                  movable.sed: {id?.movableSedKeyHex.slice(0, 14) ?? '...'}
                </div>
              </div>

              <div className="bg-slate-900 rounded p-1.5 border border-slate-800">
                <div className="text-[8px] text-slate-400 uppercase">CID-CTR &amp; /data/&lt;ID0&gt;/</div>
                <div className="text-cyan-300 truncate">CID: {getNandCidHex().slice(0, 16).toUpperCase()}...</div>
                <div className="text-emerald-300 truncate">ID0: {id?.id0 ?? '...'}</div>
                <div className="text-slate-400 truncate">
                  Slots: 0x03/0x04/0x06/0x07
                </div>
              </div>
            </div>

            <div className="mt-1.5 bg-slate-900 rounded p-1.5 border border-slate-800">
              <div className="text-[8px] text-slate-400 uppercase mb-0.5">Mounted CTRNAND Directories</div>
              <div className="flex flex-wrap gap-1 text-[8px]">
                {ctrNand.nandFsMeta.ctrnandDirs.map((dir) => (
                  <span key={dir} className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300">
                    {dir}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[8px] text-slate-400 border-t border-slate-800 pt-1 flex justify-between">
            <span>TWLN (FAT16 0x12E00) · TWLP (FAT12 0x09011A00)</span>
            <span>AGBSAVE: 0x0B100000 (0x30000)</span>
          </div>
        </div>
      );
    }

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
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            {/* Owner Profile Card */}
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-2xs">
              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                {t.ownerProfile}
              </div>
              <div className="font-bold text-slate-900 mt-0.5 text-xs truncate">{config.ownerName}</div>
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">SN: {config.serialNumber}</div>
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-semibold text-[9px]">
                <span>{currentLangMeta.flag}</span>
                <span>{currentLangMeta.label}</span>
              </div>
            </div>

            {/* NAND Config State Card */}
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-2xs">
              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                {t.nandConfigState}
              </div>
              <div className="font-bold text-sky-700 mt-0.5 text-xs truncate">
                {HOME_THEMES[config.themeId].name}
              </div>
              <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                {t.region}: {config.region} · {ctrNand.dbs.titleDb.length} Titles
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

          {/* Live Simulated FCRAM + WRAM Telemetry Card */}
          <div className="mt-2 bg-white rounded-lg px-2.5 py-1.5 border border-slate-200 shadow-2xs text-[9px]">
            <div className="flex items-center justify-between font-mono">
              <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                <Cpu className="w-3 h-3 text-sky-600" />
                FCRAM {(ram.usedFcramBytes / (1024 * 1024)).toFixed(1)} / 128 MB
              </span>
              <span className="text-slate-500">
                WRAM {Math.round(ram.wramUsedBytes / 1024)}KB · {ram.allocations.length} allocs · {ram.cacheHits} hits
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-sky-600 transition-all duration-200"
                style={{
                  width: `${Math.min(100, (ram.usedFcramBytes / ram.totalFcramBytes) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[9px] text-slate-500 border-t border-slate-200/90 pt-1">
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

  const selectedPkg =
    ctrNand.packages.find((p) => p.titleId === ui.selectedTitleId) ?? ctrNand.packages[0];
  const selectedIsStaged = selectedPkg
    ? ctrNand.dbs.importDb.some((d) => d.titleId === selectedPkg.titleId)
    : false;
  const selectedHasTicket = selectedPkg
    ? ctrNand.dbs.ticketDb.some((tk) => tk.titleId === selectedPkg.titleId)
    : false;
  const selectedTicketRemovable =
    selectedPkg?.mediaType === 'GAMECARD' || selectedPkg?.titleIdHigh === '00040000' || selectedPkg?.titleIdHigh === '0004000E';

  return (
    <div className="w-full h-full bg-slate-50 text-slate-900 p-2 flex flex-col justify-between select-none">
      {/* Sub-navigation Tabs matching 3DS Data Management */}
      <div className="flex items-center gap-1 pb-1.5 border-b border-slate-200 shrink-0 text-[10px]">
        <button
          onClick={() => updateSettingsUi({ tab: 'config' })}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer ${
            ui.tab === 'config'
              ? 'bg-sky-600 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-3 h-3" />
          <span>Settings</span>
        </button>
        <button
          onClick={() => updateSettingsUi({ tab: 'titles' })}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer ${
            ui.tab === 'titles'
              ? 'bg-sky-600 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Database className="w-3 h-3" />
          <span>Titles ({ctrNand.packages.length})</span>
        </button>
        <button
          onClick={() => updateSettingsUi({ tab: 'nand_fs' })}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer ${
            ui.tab === 'nand_fs'
              ? 'bg-sky-600 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <FolderTree className="w-3 h-3" />
          <span>NAND FS</span>
        </button>
      </div>

      {/* Main Content */}
      {ui.tab === 'config' ? (
        <div className="space-y-2 text-[11px] overflow-y-auto thin-scroll py-1 flex-1">
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commit({ ownerName: ownerDraft.trim() || 'Player 1' });
                }
              }}
              className="flex-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              onClick={() => void commit({ ownerName: ownerDraft.trim() || 'Player 1' })}
              disabled={saving}
              className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-[10px] font-semibold cursor-pointer shadow-2xs active:scale-95 transition-transform"
            >
              {t.save}
            </button>
          </div>

          {/* Multi-Language Selection */}
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
      ) : ui.tab === 'titles' ? (
        <div className="flex flex-col flex-1 min-h-0 py-1 gap-1.5">
          <div className="flex-1 overflow-y-auto thin-scroll space-y-1 pr-0.5">
            {ctrNand.packages.map((pkg) => {
              const selected = pkg.titleId === ui.selectedTitleId;
              const isStaged = ctrNand.dbs.importDb.some((d) => d.titleId === pkg.titleId);
              const hasTicket = ctrNand.dbs.ticketDb.some((tk) => tk.titleId === pkg.titleId);
              return (
                <button
                  key={pkg.titleId}
                  onClick={() => updateSettingsUi({ selectedTitleId: pkg.titleId })}
                  className={`w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded border text-left text-[9.5px] cursor-pointer ${
                    selected
                      ? 'bg-sky-50 border-sky-500 text-slate-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {pkg.shortName}{' '}
                      <span className="text-[8.5px] font-mono text-slate-500">{pkg.tmd.versionString}</span>
                    </div>
                    <div className="text-[8.5px] font-mono text-slate-500">
                      {pkg.titleIdHigh}-{pkg.titleIdLow} · {getCategoryLabel(pkg.titleIdHigh)} · {pkg.mediaType}
                    </div>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold shrink-0 ${
                      isStaged
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : hasTicket
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {isStaged ? 'import.db' : hasTicket ? '.tik OK' : 'NO .tik'}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedPkg && (selectedIsStaged || selectedTicketRemovable) && (
            <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded px-2 py-1 text-[9.5px] shrink-0">
              {selectedIsStaged ? (
                <>
                  <span className="text-amber-800 font-medium truncate">
                    Staged in /dbs/import.db
                  </span>
                  <button
                    onClick={() => void finalizeStagedImport(selectedPkg.titleId)}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shrink-0"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Install to title.db + .tik</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="text-slate-600 font-mono truncate">
                    ticket.db ({selectedPkg.titleId.slice(-8)})
                  </span>
                  <button
                    onClick={() => void toggleTicketForTitle(selectedPkg.titleId)}
                    disabled={saving}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer shrink-0 ${
                      selectedHasTicket
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {selectedHasTicket ? (
                      <>
                        <ShieldAlert className="w-3 h-3" />
                        <span>Revoke .tik</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3 h-3" />
                        <span>Install .tik</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto thin-scroll space-y-1 py-1 pr-0.5 font-mono text-[9px]">
          {NAND_PARTITIONS.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-slate-200 rounded px-2 py-1 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-bold text-slate-800 truncate">
                  {p.logicalPartition}{' '}
                  <span className="text-slate-500 font-normal">({p.filesystem})</span>
                </div>
                <div className="text-[8px] text-slate-500 truncate">
                  HW: {p.realOffsetHex} ({p.realSizeHex}) · Key {p.keyslotHex}
                </div>
              </div>
              <span className="text-[8.5px] text-sky-700 font-semibold shrink-0">
                {(p.endChunk - p.startChunk + 1) * 16} KB
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200 shrink-0">
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
