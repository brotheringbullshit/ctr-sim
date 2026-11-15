export const CHUNK_SIZE = 16384; // 16 KB per IDB chunk
export const TOTAL_CHUNKS = 256; // 256 chunks = 4.00 MB Virtual NAND
export const TOTAL_NAND_BYTES = CHUNK_SIZE * TOTAL_CHUNKS;

export type PartitionId =
  | 'ncsd_hdr'
  | 'firm0_boot1'
  | 'firm1_stage2'
  | 'twl_sysdata'
  | 'ctrnand_sys'
  | 'nand_userdata';

export interface PartitionSpec {
  id: PartitionId;
  name: string;
  label: string;
  mountPoint: string;
  startChunk: number;
  endChunk: number; // inclusive
  magic: string;
  color: string;
  description: string;
  requiredBy: string;
}

export const NAND_PARTITIONS: PartitionSpec[] = [
  {
    id: 'ncsd_hdr',
    name: 'NCSD_HDR',
    label: 'NCSD Master Header',
    mountPoint: 'raw:/0x000000',
    startChunk: 0,
    endChunk: 0,
    magic: 'NCSD',
    color: '#6366f1', // indigo
    description: 'RSA-2048 signature block, partition table, NAND geometry, and SHA-256 digests for Boot9.',
    requiredBy: 'Boot9 / Boot11 (Stage 0)',
  },
  {
    id: 'firm0_boot1',
    name: 'FIRM0_BOOT1',
    label: 'FIRM Header & Loader',
    mountPoint: 'firm0:/',
    startChunk: 1,
    endChunk: 15,
    magic: 'FIRM',
    color: '#0284c7', // sky
    description: 'Signed FIRM header, ARM9/ARM11 entrypoints, BootROM lockout vectors, and section loader.',
    requiredBy: 'Boot9 -> FIRM Validation',
  },
  {
    id: 'firm1_stage2',
    name: 'FIRM1_STAGE2',
    label: 'Horizon OS FIRM Sections',
    mountPoint: 'firm1:/',
    startChunk: 16,
    endChunk: 47,
    magic: 'STG2',
    color: '#0d9488', // teal
    description: 'Kernel9 (OTP lock + Process9), Kernel11, pm/sm/fs/pxi services, and NS (ErrDisp) shell.',
    requiredBy: 'FIRM Entry -> Horizon OS',
  },
  {
    id: 'twl_sysdata',
    name: 'TWL_SYSDATA',
    label: 'System Config & Keys',
    mountPoint: 'nand:/sys/',
    startChunk: 48,
    endChunk: 79,
    magic: 'CFG0',
    color: '#d97706', // amber
    description: 'Owner profile, active theme, grid zoom, brightness, Play Coins, and Wi-Fi.',
    requiredBy: 'Stage 2 & HOME Menu',
  },
  {
    id: 'ctrnand_sys',
    name: 'CTRNAND_SYS',
    label: 'CTRNAND System Applets',
    mountPoint: 'ctrnand:/title/',
    startChunk: 80,
    endChunk: 159,
    magic: 'CND0',
    color: '#059669', // emerald
    description: 'HOME Menu binary manifest, system applets, icon palettes, and audio chimes.',
    requiredBy: 'Stage 2 & HOME Menu',
  },
  {
    id: 'nand_userdata',
    name: 'NAND_USERDATA',
    label: 'User Saves & Layout',
    mountPoint: 'nand:/data/',
    startChunk: 160,
    endChunk: 255,
    magic: 'USR0',
    color: '#e11d48', // rose
    description: 'HOME grid icon ordering, folders, Game Notes drawings, Activity Log, Mii roster.',
    requiredBy: 'HOME Menu & Applets',
  },
];

export type ConsoleThemeId = 'classic-white' | 'dark-charcoal' | 'cobalt-blue' | 'famicom-red' | 'mint-cream';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'it' | 'ja' | 'pt';

export interface SystemConfig {
  ownerName: string;
  language: SupportedLanguage;
  region: 'USA' | 'EUR' | 'JPN';
  serialNumber: string;
  firmwareVersion: string;
  themeId: ConsoleThemeId;
  gridRows: 1 | 2 | 3;
  brightness: 1 | 2 | 3 | 4 | 5;
  soundEnabled: boolean;
  wirelessEnabled: boolean;
  playCoins: number;
  totalSteps: number;
  bootCount: number;
  autobootHome: boolean;
  showSplashBanner: boolean;
}

export type AppletId =
  | 'health-safety'
  | 'cartridge'
  | 'system-settings'
  | 'mii-maker'
  | 'activity-log'
  | 'sound-studio'
  | 'game-notes'
  | 'nand-tool'
  | 'browser'
  | 'camera-ar';

export interface SystemTitleEntry {
  titleId: string;
  appletId: AppletId;
  shortName: string;
  fullName: string;
  publisher: string;
  version: string;
  accentColor: string;
  secondaryColor: string;
  chimeFreqs: number[];
  blocks: number;
  description: string;
}

export interface HomeFolder {
  id: string;
  name: string;
  badgeChar: string;
  color: string;
  items: AppletId[];
}

export type HomeSlotItem =
  | { type: 'app'; appletId: AppletId }
  | { type: 'folder'; folderId: string }
  | { type: 'empty' };

export interface GameNoteRecord {
  id: string;
  title: string;
  createdAt: string;
  strokes: Array<{
    color: string;
    width: number;
    points: Array<[number, number]>;
  }>;
}

export interface ActivityRecord {
  appletId: AppletId;
  launchCount: number;
  totalSeconds: number;
  lastPlayed: string;
}

export interface MiiProfile {
  id: string;
  name: string;
  shirtColor: string;
  skinTone: string;
  hairColor: string;
  hairStyle: 'spiky' | 'bob' | 'parted' | 'cap';
  favorite: boolean;
  greeting: string;
}

export interface UserSaveData {
  slots: HomeSlotItem[];
  folders: Record<string, HomeFolder>;
  notes: GameNoteRecord[];
  activity: Record<string, ActivityRecord>;
  miis: MiiProfile[];
  synthPattern: number[]; // 8-step note indices
  cartridgeHighScore: number;
}

export interface Stage1Opcode {
  pc: string;
  opcode: string;
  target: string;
  detail: string;
}

export interface BootStage2Header {
  magic: string;
  kernelVersion: string;
  buildTag: string;
  autobootTitleId: string;
  arm9Entry?: string;
  arm11Entry?: string;
  sysmodules?: string[];
  mountEntries: Array<{ mount: string; partition: PartitionId; required: boolean }>;
}

export interface PartitionIntegrity {
  id: PartitionId;
  valid: boolean;
  magicFound: string;
  expectedMagic: string;
  actualHash: string;
  expectedHash: string;
  reason?: string;
}

export type BootPhase =
  | 'off'
  | 'provisioning'
  | 'bootrom'
  | 'stage1'
  | 'stage2'
  | 'stage2_config'
  | 'nand_recovery'
  | 'panic'
  | 'home_menu';

export interface BootLogEntry {
  id: string;
  timestampMs: number;
  stage: 'IDB' | 'BOOTROM' | 'STAGE1' | 'STAGE2' | 'KERNEL' | 'HOME';
  level: 'info' | 'ok' | 'warn' | 'error';
  message: string;
}

export interface ChunkIOEvent {
  chunkIndex: number;
  op: 'read' | 'write' | 'corrupt';
  partitionId: PartitionId;
  timestamp: number;
}

export interface LoadedSystemState {
  config: SystemConfig;
  titles: SystemTitleEntry[];
  userData: UserSaveData;
  stage1Opcodes: Stage1Opcode[];
  stage2Header: BootStage2Header;
  partitionChecks: Record<PartitionId, PartitionIntegrity>;
}
