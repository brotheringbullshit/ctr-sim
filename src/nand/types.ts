export const CHUNK_SIZE = 16384; // 16 KB per IDB chunk
export const TOTAL_CHUNKS = 256; // 256 chunks = 4.00 MB Virtual NAND

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
  filesystem: 'Raw Binary' | 'FAT16';
  logicalPartition: string;
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
    filesystem: 'Raw Binary',
    logicalPartition: 'NCSD / FIRM0',
    mountPoint: 'raw:/0x000000',
    startChunk: 0,
    endChunk: 0,
    magic: 'NCSD',
    color: '#6366f1',
    description: 'RSA-2048 signature block, partition table, NAND geometry, and SHA-256 digests for Boot9.',
    requiredBy: 'Boot9 / Boot11 (Stage 0)',
  },
  {
    id: 'firm0_boot1',
    name: 'FIRM0_BOOT1',
    label: 'FIRM0 Core Kernel',
    filesystem: 'Raw Binary',
    logicalPartition: 'FIRM0',
    mountPoint: 'firm0:/',
    startChunk: 1,
    endChunk: 15,
    magic: 'FIRM',
    color: '#0284c7',
    description: 'Stores core NATIVE_FIRM ARM9/ARM11 kernel entrypoints and BootROM lockout section loader.',
    requiredBy: 'Boot9 -> FIRM Validation',
  },
  {
    id: 'firm1_stage2',
    name: 'FIRM1_STAGE2',
    label: 'FIRM1 Backup Kernel',
    filesystem: 'Raw Binary',
    logicalPartition: 'FIRM1',
    mountPoint: 'firm1:/',
    startChunk: 16,
    endChunk: 47,
    magic: 'STG2',
    color: '#0d9488',
    description: 'Backup NATIVE_FIRM, Kernel9 (OTP lock + Process9), Kernel11 sysmodules, and NS shell.',
    requiredBy: 'FIRM Entry -> Horizon OS',
  },
  {
    id: 'twl_sysdata',
    name: 'TWL_SYSDATA',
    label: 'TWLN / TWLP & RW Identity',
    filesystem: 'FAT16',
    logicalPartition: 'TWLN / TWLP',
    mountPoint: 'nand:/rw/sys/',
    startChunk: 48,
    endChunk: 79,
    magic: 'CFG0',
    color: '#d97706',
    description: 'TWLN/TWLP DS compatibility config, SecureInfo_A, LocalFriendCodeSeed_B, and movable.sed.',
    requiredBy: 'Stage 2 & HOME Menu',
  },
  {
    id: 'ctrnand_sys',
    name: 'CTRNAND_SYS',
    label: 'CTRNAND OS & Databases',
    filesystem: 'FAT16',
    logicalPartition: 'CTRNAND',
    mountPoint: 'ctrnand:/',
    startChunk: 80,
    endChunk: 159,
    magic: 'CND0',
    color: '#059669',
    description: 'Primary CTRNAND partition: /title/ (.tmd + .app NCCH), /dbs/ (ticket.db, certs.db, title.db, import.db).',
    requiredBy: 'Stage 2 & HOME Menu',
  },
  {
    id: 'nand_userdata',
    name: 'NAND_USERDATA',
    label: 'CTRNAND Data & AGBSAVE',
    filesystem: 'FAT16',
    logicalPartition: 'CTRNAND /data/<ID0> & AGBSAVE',
    mountPoint: 'nand:/data/',
    startChunk: 160,
    endChunk: 255,
    magic: 'USR0',
    color: '#e11d48',
    description: '/data/<ID0>/ sysdata/extdata, HOME Menu layout, Mii DB, Game Notes, and AGBSAVE VC scratchpad.',
    requiredBy: 'HOME Menu & Applets',
  },
];

export type ConsoleThemeId = 'classic-white' | 'dark-charcoal' | 'cobalt-blue' | 'famicom-red' | 'mint-cream';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'it' | 'ja' | 'pt';

export interface ConsoleIdentityFiles {
  id0: string; // 32-char hex derived from /private/movable.sed
  id1: string; // 32-char hex SD subdirectory under Nintendo 3DS/<ID0>/
  movableSedKeyHex: string; // 32-char hex KeyY in /private/movable.sed
  secureInfoRegionByte: 'USA' | 'EUR' | 'JPN'; // /rw/sys/SecureInfo_A
  secureInfoSerial: string;
  localFriendCodeSeedHex: string; // /rw/sys/LocalFriendCodeSeed_B
}

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
  identity?: ConsoleIdentityFiles;
}

export type AppletId =
  | 'health-safety'
  | 'cartridge'
  | 'system-settings'
  | 'mii-maker'
  | 'activity-log'
  | 'sound-studio'
  | 'game-notes'
  | 'browser'
  | 'camera-ar';

export type TitleCategoryHigh =
  | '00040000' // Standard / Retail / eShop Title
  | '0004000E' // Game Update / Patch
  | '00040010' // System Application
  | '00040030' // System Applet
  | '0004009B' // System Data Archive
  | '00048004'; // DSiWare (TWLN)

export interface NcchExeFsInfo {
  codeSizeBytes: number;
  iconSizeBytes: number;
  bannerSizeBytes: number;
  hash: string;
}

export interface NcchRomFsInfo {
  sizeBytes: number;
  levelCount: number;
  hash: string;
}

export interface NcchAppFile {
  fileName: string; // e.g. '00000000.app'
  magic: 'NCCH';
  partitionId: string;
  programId: string;
  productCode: string;
  makerCode: string;
  contentIndex: number;
  totalSizeBytes: number;
  cryptoType: 'CTR-NAND-Unencrypted' | 'NCCH-FixedKey' | 'SD-MovableSed-AES';
  exefs?: NcchExeFsInfo;
  romfs?: NcchRomFsInfo;
}

export interface TmdContentRecord {
  contentId: string; // 8-char hex e.g. '00000001'
  index: number;
  type: 'MainContent' | 'Manual' | 'SystemData';
  sizeBytes: number;
  sha256: string;
}

export interface TitleMetadataTmd {
  fileName: string; // e.g. '00000001.tmd'
  titleId: string; // 16-char hex
  titleVersion: number;
  versionString: string;
  titleType: TitleCategoryHigh;
  saveDataSizeBytes: number;
  sysVersion: string;
  contentCount: number;
  contents: TmdContentRecord[];
  signatureIssuer: string; // 'Root-CA00000003-CP0000000b'
  signatureHex: string;
}

export interface TitleTicket {
  ticketId: string; // 16-char hex
  titleId: string; // 16-char hex
  titleIdHigh: TitleCategoryHigh;
  titleIdLow: string; // 8-char hex
  consoleId: string;
  encryptedTitleKeyHex: string; // 32-char hex
  commonKeyIndex: number;
  version: number;
  issuer: string; // 'Root-CA00000003-XS0000000c'
  source: 'NintendoSigned' | 'SystemPreinstalled' | 'LocalHomebrew';
  signatureHex: string;
  rightsMask: string;
}

export interface TitleDatabaseEntry {
  titleId: string;
  titleIdHigh: TitleCategoryHigh;
  titleIdLow: string;
  name: string;
  productCode: string;
  version: string;
  titleVersion: number;
  mediaType: 'NAND' | 'SD' | 'GAMECARD' | 'TWLN';
  installPath: string;
  tmdFile: string;
  appFiles: string[];
  sizeBytes: number;
  blocks: number;
  state: 'Active' | 'StagedImport';
  launchableAppletId?: AppletId;
}

export interface TitlePackage {
  titleId: string;
  titleIdHigh: TitleCategoryHigh;
  titleIdLow: string;
  productCode: string;
  publisher: string;
  shortName: string;
  fullName: string;
  mediaType: 'NAND' | 'SD' | 'GAMECARD' | 'TWLN';
  basePath: string; // '/title/<TID_High>/<TID_Low>/content/'
  tmd: TitleMetadataTmd;
  apps: NcchAppFile[];
  appletId?: AppletId;
  blocks: number;
  description: string;
}

export interface CertChainEntry {
  name: string;
  issuer: string;
  keyType: 'RSA-4096' | 'RSA-2048';
  fingerprintSha256: string;
}

export interface CtrNandArchiveData {
  homeMenuTitleId: string;
  sharedFontHash: string;
  titles: SystemTitleEntry[];
  packages: TitlePackage[];
  dbs: {
    titleDb: TitleDatabaseEntry[];
    importDb: TitleDatabaseEntry[];
    ticketDb: TitleTicket[];
    certsDb: CertChainEntry[];
  };
  nandFsMeta: {
    ctrnandDirs: string[];
    twlnDirs: string[];
    twlpDirs: string[];
    agbsaveMagic: string;
  };
}

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
  sysdataArchives?: string[];
  extdataArchives?: string[];
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
  ctrNand: CtrNandArchiveData;
  userData: UserSaveData;
  stage1Opcodes: Stage1Opcode[];
  stage2Header: BootStage2Header;
  partitionChecks: Record<PartitionId, PartitionIntegrity>;
}
