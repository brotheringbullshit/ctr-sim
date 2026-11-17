import {
  AppletId,
  BootStage2Header,
  CtrNandArchiveData,
  GameNoteRecord,
  Stage1Opcode,
  SystemConfig,
  SystemTitleEntry,
  TitleDatabaseEntry,
  TitlePackage,
  TitleTicket,
  UserSaveData,
} from '../nand/types';

export const FCRAM_TOTAL_BYTES = 128 * 1024 * 1024; // 128 MB FCRAM (CTR hardware)
export const WRAM_TOTAL_BYTES = 1024 * 1024; // 1 MB ARM9 Internal WRAM

export type MemoryRegionTag = 'WRAM_ARM9' | 'SYS_KERNEL' | 'HOME_CACHE' | 'APPMEM' | 'DSP_VRAM';

export interface RamAllocation {
  id: string;
  label: string;
  region: MemoryRegionTag;
  addressHex: string;
  bytes: number;
  allocatedAt: number;
}

export interface RamSnapshot {
  totalFcramBytes: number;
  usedFcramBytes: number;
  freeFcramBytes: number;
  wramUsedBytes: number;
  boot9Locked: boolean;
  otpLocked: boolean;
  activeProcess: AppletId | 'home_menu' | 'kernel';
  cacheHits: number;
  cacheWrites: number;
  allocations: RamAllocation[];
}

const APPLET_HEAP_BYTES: Record<AppletId, number> = {
  'health-safety': 4 * 1024 * 1024,
  'system-settings': 10 * 1024 * 1024,
  'activity-log': 8 * 1024 * 1024,
  'game-notes': 10 * 1024 * 1024,
  'sound-studio': 14 * 1024 * 1024,
  'mii-maker': 18 * 1024 * 1024,
  'camera-ar': 22 * 1024 * 1024,
  cartridge: 30 * 1024 * 1024,
  browser: 36 * 1024 * 1024,
};

export interface CartridgeRuntimeState {
  running: boolean;
  gameOver: boolean;
  shipX: number;
  score: number;
  enemies: Array<{ id: number; x: number; y: number; speed: number }>;
  bullets: Array<{ id: number; x: number; y: number }>;
  nextId: number;
}

const textEncoder = new TextEncoder();

/**
 * Simulated CTR Hardware Memory Controller (ARM9 WRAM + 128 MB FCRAM).
 * Stores decrypted firmware sections, resident Horizon OS config/save caches
 * (so reads/writes do not repeatedly hit IndexedDB NAND), DSP audio buffers,
 * 3D VRAM banners, and active applet APPMEM process heaps.
 */
class SimulatedRamController {
  // 256 KB byte-addressed scratch buffer backing ARM9 WRAM + resident OS structs
  private wramBuffer = new Uint8Array(256 * 1024);
  private allocations = new Map<string, RamAllocation>();
  private listeners = new Set<() => void>();

  // Hardware security latches in ARM9 SYSPROT/OTP
  private boot9Locked = false;
  private otpLocked = false;

  // Resident FCRAM decrypted OS caches (populated by BootROM / Process9 on boot)
  private firm0Opcodes: Stage1Opcode[] | null = null;
  private firm1Header: BootStage2Header | null = null;
  private configCache: SystemConfig | null = null;
  private titlesCache: SystemTitleEntry[] | null = null;
  private ctrNandCache: CtrNandArchiveData | null = null;
  private userDataCache: UserSaveData | null = null;
  private activeApplet: AppletId | null = null;

  // Per-applet volatile RAM scratchpads (cleared when freed or powered off)
  private cartridgeState: CartridgeRuntimeState | null = null;
  private gameNotesDraft: GameNoteRecord['strokes'] = [];

  private cacheHits = 0;
  private cacheWrites = 0;

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Powers down / zeroes volatile FCRAM and WRAM, resetting security latches and caches.
   */
  reset(): void {
    this.wramBuffer.fill(0);
    this.allocations.clear();
    this.boot9Locked = false;
    this.otpLocked = false;
    this.firm0Opcodes = null;
    this.firm1Header = null;
    this.configCache = null;
    this.titlesCache = null;
    this.ctrNandCache = null;
    this.userDataCache = null;
    this.activeApplet = null;
    this.cartridgeState = null;
    this.gameNotesDraft = [];
    this.cacheHits = 0;
    this.cacheWrites = 0;
    this.notify();
  }

  /**
   * Stage 0/1: Copies decrypted FIRM0 Stage 1 opcodes into ARM9 WRAM (0x08006000).
   */
  loadFirm0Section(opcodes: Stage1Opcode[], plaintextBytes: Uint8Array): Stage1Opcode[] {
    const copyLen = Math.min(plaintextBytes.byteLength, 64 * 1024);
    this.wramBuffer.set(plaintextBytes.subarray(0, copyLen), 0x6000);
    this.firm0Opcodes = opcodes;
    this.allocations.set('wram_firm0', {
      id: 'wram_firm0',
      label: 'FIRM0 Stage 1 Loader',
      region: 'WRAM_ARM9',
      addressHex: '0x08006000',
      bytes: Math.max(copyLen, 192 * 1024),
      allocatedAt: Date.now(),
    });
    this.cacheWrites++;
    this.notify();
    return opcodes;
  }

  getFirm0Opcodes(): Stage1Opcode[] | null {
    if (this.firm0Opcodes) this.cacheHits++;
    return this.firm0Opcodes;
  }

  /**
   * Stage 1: Loads decrypted FIRM1 sections (Kernel9 & Kernel11) into WRAM/FCRAM.
   */
  loadFirm1Section(header: BootStage2Header, plaintextBytes: Uint8Array): BootStage2Header {
    const copyLen = Math.min(plaintextBytes.byteLength, 96 * 1024);
    this.wramBuffer.set(plaintextBytes.subarray(0, copyLen), 0x16000);
    this.firm1Header = header;
    this.allocations.set('k9_k11_kernel', {
      id: 'k9_k11_kernel',
      label: 'Kernel9 & Kernel11 Core',
      region: 'SYS_KERNEL',
      addressHex: '0x1FF80000',
      bytes: 6 * 1024 * 1024,
      allocatedAt: Date.now(),
    });
    this.cacheWrites++;
    this.notify();
    return header;
  }

  lockBootrom(): void {
    this.boot9Locked = true;
    this.notify();
  }

  lockOtpAndInitSysmodules(sysmodules: string[]): void {
    this.otpLocked = true;
    this.allocations.set('horizon_sysmodules', {
      id: 'horizon_sysmodules',
      label: `Sysmodules (${sysmodules.length})`,
      region: 'SYS_KERNEL',
      addressHex: '0x20000000',
      bytes: 8 * 1024 * 1024,
      allocatedAt: Date.now(),
    });
    this.notify();
  }

  /**
   * Stage 2 / Runtime: Caches decrypted CTRNAND /rw/sys/ config in resident FCRAM.
   */
  writeSystemConfigCache(config: SystemConfig): void {
    const encoded = textEncoder.encode(JSON.stringify(config));
    this.configCache = config;
    this.allocations.set('cfg_ctrnand_rwsys', {
      id: 'cfg_ctrnand_rwsys',
      label: 'CTRNAND /rw/sys/ Cache',
      region: 'HOME_CACHE',
      addressHex: '0x20800000',
      bytes: Math.max(512 * 1024, Math.ceil(encoded.byteLength / 4096) * 4096),
      allocatedAt: Date.now(),
    });
    this.cacheWrites++;
    this.notify();
  }

  readSystemConfigCache(): SystemConfig | null {
    if (this.configCache) {
      this.cacheHits++;
    }
    return this.configCache;
  }

  /**
   * Stage 2: Caches decrypted CTRNAND_SYS titles, /title/ NCCH/TMD tree, and /dbs/ (title.db, import.db, ticket.db, certs.db) in FCRAM.
   */
  writeCtrNandCache(archive: CtrNandArchiveData): void {
    const encoded = textEncoder.encode(JSON.stringify(archive));
    this.ctrNandCache = archive;
    this.titlesCache = archive.titles;
    this.allocations.set('home_menu_shell', {
      id: 'home_menu_shell',
      label: 'HOME Menu & Title Cache',
      region: 'HOME_CACHE',
      addressHex: '0x21000000',
      bytes: 12 * 1024 * 1024,
      allocatedAt: Date.now(),
    });
    this.allocations.set('dbs_title_ticket', {
      id: 'dbs_title_ticket',
      label: `title.db (${archive.dbs.titleDb.length}) + ticket.db (${archive.dbs.ticketDb.length})`,
      region: 'HOME_CACHE',
      addressHex: '0x21A00000',
      bytes: Math.max(512 * 1024, Math.ceil(encoded.byteLength / 4096) * 4096),
      allocatedAt: Date.now(),
    });
    this.cacheWrites++;
    this.notify();
  }

  readCtrNandCache(): CtrNandArchiveData | null {
    if (this.ctrNandCache) this.cacheHits++;
    return this.ctrNandCache;
  }

  /**
   * Verifies that a Title ID exists in active title.db, has valid .tmd + NCCH .app files,
   * and holds a valid cryptographic Ticket (.tik) in ticket.db before Horizon OS boots it.
   */
  verifyTitleLaunch(titleId: string): {
    ok: boolean;
    reason?: string;
    ticket?: TitleTicket;
    pkg?: TitlePackage;
    dbEntry?: TitleDatabaseEntry;
  } {
    const ctr = this.ctrNandCache;
    if (!ctr) return { ok: true };
    this.cacheHits++;

    const dbEntry = ctr.dbs.titleDb.find((d) => d.titleId === titleId && d.state === 'Active');
    if (!dbEntry) {
      return { ok: false, reason: `Title ${titleId} is not registered in /dbs/title.db` };
    }

    const pkg = ctr.packages.find((p) => p.titleId === titleId);
    if (!pkg || pkg.tmd.contents.length === 0 || pkg.apps.length === 0 || pkg.apps[0].magic !== 'NCCH') {
      return { ok: false, reason: `Missing or corrupt .tmd / NCCH .app for ${titleId}` };
    }

    const ticket = ctr.dbs.ticketDb.find((t) => t.titleId === titleId);
    if (!ticket) {
      return { ok: false, reason: `No Ticket (.tik) for ${titleId} in /dbs/ticket.db` };
    }

    return { ok: true, ticket, pkg, dbEntry };
  }

  readTitlesCache(): SystemTitleEntry[] | null {
    if (this.titlesCache) this.cacheHits++;
    return this.titlesCache;
  }

  /**
   * Stage 2 / Runtime: Caches decrypted CTRNAND /data/<ID0>/ (slots, folders, Miis, notes, activity) in FCRAM.
   */
  writeUserDataCache(userData: UserSaveData): void {
    const encoded = textEncoder.encode(JSON.stringify(userData));
    this.userDataCache = userData;
    this.allocations.set('usr_ctrnand_data', {
      id: 'usr_ctrnand_data',
      label: 'CTRNAND /data/<ID0>/ Cache',
      region: 'HOME_CACHE',
      addressHex: '0x21C00000',
      bytes: Math.max(1024 * 1024, Math.ceil(encoded.byteLength / 4096) * 4096),
      allocatedAt: Date.now(),
    });
    this.cacheWrites++;
    this.notify();
  }

  readUserDataCache(): UserSaveData | null {
    if (this.userDataCache) this.cacheHits++;
    return this.userDataCache;
  }

  /**
   * Allocates APPMEM process heap when launching an applet.
   */
  allocateApplet(appletId: AppletId): void {
    if (this.activeApplet && this.activeApplet !== appletId) {
      this.freeApplet(this.activeApplet);
    }
    this.activeApplet = appletId;
    const heapSize = APPLET_HEAP_BYTES[appletId] ?? 8 * 1024 * 1024;
    this.allocations.set(`app_${appletId}`, {
      id: `app_${appletId}`,
      label: `APPMEM: ${appletId}`,
      region: 'APPMEM',
      addressHex: '0x22000000',
      bytes: heapSize,
      allocatedAt: Date.now(),
    });
    this.notify();
  }

  /**
   * Frees APPMEM process heap and volatile applet scratchpad when returning to HOME Menu.
   */
  freeApplet(appletId: AppletId): void {
    this.allocations.delete(`app_${appletId}`);
    if (this.activeApplet === appletId) {
      this.activeApplet = null;
    }
    if (appletId === 'cartridge') {
      this.cartridgeState = null;
    } else if (appletId === 'game-notes') {
      this.gameNotesDraft = [];
    }
    this.notify();
  }

  /**
   * Registers real decoded AudioBuffer PCM sample memory in the DSP audio region.
   */
  setDspAudioBuffer(name: string, pcmByteLength: number): void {
    if (pcmByteLength <= 0) {
      this.allocations.delete(`dsp_${name}`);
    } else {
      this.allocations.set(`dsp_${name}`, {
        id: `dsp_${name}`,
        label: `DSP PCM: ${name}`,
        region: 'DSP_VRAM',
        addressHex: '0x26000000',
        bytes: pcmByteLength,
        allocatedAt: Date.now(),
      });
    }
    this.notify();
  }

  /**
   * Registers active 3D WebGL Banner geometry/texture memory in DSP/VRAM region.
   */
  setVramBanner(kind: string | null, bytes: number): void {
    if (!kind || bytes <= 0) {
      this.allocations.delete('vram_banner_3d');
    } else {
      this.allocations.set('vram_banner_3d', {
        id: 'vram_banner_3d',
        label: `3D Banner VRAM (${kind})`,
        region: 'DSP_VRAM',
        addressHex: '0x26800000',
        bytes,
        allocatedAt: Date.now(),
      });
    }
    this.notify();
  }

  // Volatile applet state held inside simulated APPMEM
  getCartridgeState(): CartridgeRuntimeState | null {
    return this.cartridgeState;
  }

  setCartridgeState(next: CartridgeRuntimeState | null): void {
    this.cartridgeState = next;
  }

  getGameNotesDraft(): GameNoteRecord['strokes'] {
    return this.gameNotesDraft;
  }

  setGameNotesDraft(strokes: GameNoteRecord['strokes']): void {
    this.gameNotesDraft = strokes;
  }

  getSnapshot(): RamSnapshot {
    let usedFcramBytes = 0;
    let wramUsedBytes = 0;
    const allocations = Array.from(this.allocations.values());
    for (const a of allocations) {
      if (a.region === 'WRAM_ARM9') {
        wramUsedBytes += a.bytes;
      } else {
        usedFcramBytes += a.bytes;
      }
    }
    usedFcramBytes = Math.min(FCRAM_TOTAL_BYTES, usedFcramBytes);
    return {
      totalFcramBytes: FCRAM_TOTAL_BYTES,
      usedFcramBytes,
      freeFcramBytes: Math.max(0, FCRAM_TOTAL_BYTES - usedFcramBytes),
      wramUsedBytes: Math.min(WRAM_TOTAL_BYTES, wramUsedBytes),
      boot9Locked: this.boot9Locked,
      otpLocked: this.otpLocked,
      activeProcess: this.activeApplet ?? (this.titlesCache ? 'home_menu' : 'kernel'),
      cacheHits: this.cacheHits,
      cacheWrites: this.cacheWrites,
      allocations,
    };
  }
}

export const fcram = new SimulatedRamController();
