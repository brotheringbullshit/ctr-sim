export const MEDIA_UNIT_SIZE = 512; // 0x200 bytes per eMMC media unit
export const CHUNK_SIZE = 16384; // 16 KB per IDB chunk (32 media units)
export const TOTAL_CHUNKS = 256; // 256 chunks = 4.00 MB compact backing store (8,192 media units)
export const REAL_OLD3DS_NAND_BYTES = 0x3af00000; // ~943 MiB real Old3DS eMMC image

export type PartitionId =
  | 'ncsd_hdr'
  | 'twl_nand'
  | 'agbsave'
  | 'firm0'
  | 'firm1'
  | 'ctrnand';

export type DataPartitionId = Exclude<PartitionId, 'ncsd_hdr'>;

export interface PartitionSpec {
  id: PartitionId;
  name: string;
  label: string;
  filesystem: 'Raw Binary' | 'FAT16' | 'FAT16 / FAT12';
  logicalPartition: string;
  mountPoint: string;
  startChunk: number;
  endChunk: number; // inclusive
  realOffsetHex: string;
  realSizeHex: string;
  ncsdIndex?: number;
  ncsdFsType?: number;
  ncsdCryptType?: number;
  keyslotHex: string;
  magic: string;
  color: string;
  description: string;
  requiredBy: string;
}

export const NAND_PARTITIONS: PartitionSpec[] = [
  {
    id: 'ncsd_hdr',
    name: 'NCSD_HDR',
    label: 'NCSD Header + TWL MBR',
    filesystem: 'Raw Binary',
    logicalPartition: 'NCSD (0x000..0x1FF)',
    mountPoint: 'raw:/0x000000',
    startChunk: 0,
    endChunk: 0,
    realOffsetHex: '0x00000000',
    realSizeHex: '0x00000200',
    keyslotHex: 'RSA-2048 (0x100..0x1FF) + 0x03 (MBR 0x1BE)',
    magic: 'NCSD',
    color: '#6366f1',
    description: 'Sector 0: RSA-2048 signature (0x000..0x0FF), NCSD table (0x100..0x15F), and encrypted TWL MBR (0x1BE..0x1FF).',
    requiredBy: 'Boot9 / Boot11 (Stage 0)',
  },
  {
    id: 'twl_nand',
    name: 'TWL',
    label: 'TWLN (FAT16) + TWLP (FAT12)',
    filesystem: 'FAT16 / FAT12',
    logicalPartition: 'NCSD[0] · TWLN + TWLP',
    mountPoint: 'twln:/ + twlp:/',
    startChunk: 1,
    endChunk: 31,
    realOffsetHex: '0x00000000',
    realSizeHex: '0x0B100000',
    ncsdIndex: 0,
    ncsdFsType: 1,
    ncsdCryptType: 1,
    keyslotHex: '0x03 (TWL CID CTR)',
    magic: 'TWL0',
    color: '#d97706',
    description: 'MBR-partitioned TWL region: TWLN FAT16 (real 0x12E00) for DSiWare/DS config + TWLP FAT12 (real 0x09011A00) for DSi photos/audio.',
    requiredBy: 'TWL_FIRM & Stage 2',
  },
  {
    id: 'agbsave',
    name: 'AGBSAVE',
    label: 'GBA VC Save Scratchpad',
    filesystem: 'Raw Binary',
    logicalPartition: 'NCSD[1] · AGBSAVE',
    mountPoint: 'agbsave:/',
    startChunk: 32,
    endChunk: 43, // 12 chunks = 196,608 B = 0x30000 exact real 3DS size!
    realOffsetHex: '0x0B100000',
    realSizeHex: '0x00030000',
    ncsdIndex: 1,
    ncsdFsType: 4,
    ncsdCryptType: 2,
    keyslotHex: '0x07 / 0x24 (CID CTR)',
    magic: '.SAV',
    color: '#e11d48',
    description: 'Dedicated 192 KB (0x30000) raw binary scratchpad holding Game Boy Advance Virtual Console (AGB_FIRM) save data.',
    requiredBy: 'AGB_FIRM',
  },
  {
    id: 'firm0',
    name: 'FIRM0',
    label: 'NATIVE_FIRM Primary',
    filesystem: 'Raw Binary',
    logicalPartition: 'NCSD[2] · FIRM0',
    mountPoint: 'firm0:/',
    startChunk: 44,
    endChunk: 59,
    realOffsetHex: '0x0B130000',
    realSizeHex: '0x00400000',
    ncsdIndex: 2,
    ncsdFsType: 3,
    ncsdCryptType: 2,
    keyslotHex: '0x06 (CID CTR)',
    magic: 'FIRM',
    color: '#0284c7',
    description: 'Primary NATIVE_FIRM image (4 MiB slot on real hardware): ARM9/ARM11 kernel sections, Process9, and sysmodules.',
    requiredBy: 'Boot9 -> FIRM0 Boot',
  },
  {
    id: 'firm1',
    name: 'FIRM1',
    label: 'NATIVE_FIRM Backup',
    filesystem: 'Raw Binary',
    logicalPartition: 'NCSD[3] · FIRM1',
    mountPoint: 'firm1:/',
    startChunk: 60,
    endChunk: 75,
    realOffsetHex: '0x0B530000',
    realSizeHex: '0x00400000',
    ncsdIndex: 3,
    ncsdFsType: 3,
    ncsdCryptType: 2,
    keyslotHex: '0x06 (CID CTR)',
    magic: 'FIRM',
    color: '#0d9488',
    description: 'Failover NATIVE_FIRM backup image (4 MiB slot on real hardware); Boot9 falls back to FIRM1 if FIRM0 is corrupt.',
    requiredBy: 'Boot9 Failover FIRM',
  },
  {
    id: 'ctrnand',
    name: 'CTRNAND',
    label: 'CTRNAND OS, Titles & Data',
    filesystem: 'FAT16',
    logicalPartition: 'NCSD[4] · CTRNAND',
    mountPoint: 'ctrnand:/',
    startChunk: 76,
    endChunk: 255,
    realOffsetHex: '0x0B930000',
    realSizeHex: '0x2F5D0000',
    ncsdIndex: 4,
    ncsdFsType: 1,
    ncsdCryptType: 2,
    keyslotHex: '0x04 (Old3DS CID CTR)',
    magic: 'FAT16',
    color: '#059669',
    description: 'MBR + FAT16 volume "CTR" containing OS/Applet NCCH .app/.tmd files (/title/), /dbs/, /data/<ID0>/, /rw/sys/, and /private/movable.sed.',
    requiredBy: 'Kernel9 & Horizon OS',
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

export interface FirmBinaryPayload {
  magic: 'FIRM';
  slotName: 'FIRM0' | 'FIRM1';
  arm9Entry: string;
  arm11Entry: string;
  splVersion: string;
  opcodes: Stage1Opcode[];
  stage2Header: BootStage2Header;
}

export interface TwlPartitionData {
  twlnFilesystem: 'FAT16';
  twlnRealOffsetHex: string; // '0x00012E00'
  twlpFilesystem: 'FAT12';
  twlpRealOffsetHex: string; // '0x09011A00'
  twlSystemVersion: string;
  dsiWareTitleIds: string[];
  twlpPhotoSlots: number;
  twlpSoundSlots: number;
}

export interface AgbSaveData {
  magic: '.SAV';
  realOffsetHex: string; // '0x0B100000'
  realSizeHex: string; // '0x00030000'
  titleId: string;
  saveType: string;
  populated: boolean;
  cmacHex: string;
}

export interface CtrNandVolumeData {
  config: SystemConfig;
  archive: CtrNandArchiveData;
  userData: UserSaveData;
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
