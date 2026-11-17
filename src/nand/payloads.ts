import {
  AgbSaveData,
  BootStage2Header,
  CertChainEntry,
  CHUNK_SIZE,
  ConsoleIdentityFiles,
  CtrNandArchiveData,
  CtrNandVolumeData,
  FirmBinaryPayload,
  MEDIA_UNIT_SIZE,
  NAND_PARTITIONS,
  NcchAppFile,
  PartitionId,
  Stage1Opcode,
  SystemConfig,
  SystemTitleEntry,
  TitleCategoryHigh,
  TitleDatabaseEntry,
  TitleMetadataTmd,
  TitlePackage,
  TitleTicket,
  TOTAL_CHUNKS,
  TwlPartitionData,
  UserSaveData,
} from './types';
import {
  bytesToHex,
  computeCRC32,
  cryptTwlMbrBytes,
  decodeUtf8,
  encodeUtf8,
  getNandCidHex,
  hexToBytes,
  readAsciiFixed,
  readUint32LE,
  signRsa2048,
  verifyRsa2048,
  writeAsciiFixed,
  writeUint32LE,
} from './crypto';
import { buildFat16MbrImage, Fat16BuildFile, jsonToBytes, parseFat16MbrImage } from './fat16';

export function getPartitionByteSize(id: PartitionId): number {
  const spec = NAND_PARTITIONS.find((p) => p.id === id);
  if (!spec) throw new Error(`Unknown partition ${id}`);
  return (spec.endChunk - spec.startChunk + 1) * CHUNK_SIZE;
}

function deterministicHex(seed: string, hexLen: number): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let out = '';
  let round = 0;
  while (out.length < hexLen) {
    const input = `${seed}:${round++}`;
    for (let i = 0; i < input.length; i++) {
      h1 ^= input.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ input.charCodeAt(i), 0x85ebca6b) >>> 0;
    }
    out += h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  return out.slice(0, hexLen);
}

export function getDefaultConsoleIdentity(
  region: 'USA' | 'EUR' | 'JPN' = 'USA',
  serialNumber = 'CW70492184'
): ConsoleIdentityFiles {
  const movableSedKeyHex = deterministicHex(`CTR_MOVABLE_SED:${serialNumber}`, 32);
  const id0 = deterministicHex(`ID0:${movableSedKeyHex}`, 32);
  const id1 = deterministicHex(`ID1:SDMC_CTR:${serialNumber}`, 32);
  return {
    id0,
    id1,
    movableSedKeyHex,
    secureInfoRegionByte: region,
    secureInfoSerial: serialNumber,
    localFriendCodeSeedHex: deterministicHex(`LFCS_B:${serialNumber}`, 32),
  };
}

export function getDefaultSystemConfig(): SystemConfig {
  return {
    ownerName: 'Player 1',
    language: 'en',
    region: 'USA',
    serialNumber: 'CW70492184',
    firmwareVersion: 'Ver. 11.17.0-50U',
    themeId: 'classic-white',
    gridRows: 2,
    brightness: 4,
    soundEnabled: true,
    wirelessEnabled: true,
    playCoins: 14,
    totalSteps: 1480,
    bootCount: 1,
    identity: getDefaultConsoleIdentity('USA', 'CW70492184'),
  };
}

export function getDefaultSystemTitles(): SystemTitleEntry[] {
  return [
    {
      titleId: '0004001000021300',
      appletId: 'health-safety',
      shortName: 'Health & Safety',
      fullName: 'Health and Safety Information',
      publisher: 'Nintendo',
      version: 'v1.0.2',
      accentColor: '#f59e0b',
      secondaryColor: '#fef3c7',
      chimeFreqs: [523.25, 659.25],
      blocks: 12,
      description: 'Important hardware safety, 3D viewing guidelines, and virtual NAND documentation.',
    },
    {
      titleId: '0004000000030800',
      appletId: 'cartridge',
      shortName: 'Game Card',
      fullName: 'Starburst Pilot 3D (Game Card)',
      publisher: 'CTR Studio',
      version: 'v1.2.0',
      accentColor: '#0284c7',
      secondaryColor: '#bae6fd',
      chimeFreqs: [440, 554.37, 659.25, 880],
      blocks: 512,
      description: 'Playable dual-screen arcade shooter stored on the simulated Game Card slot.',
    },
    {
      titleId: '0004001000021000',
      appletId: 'system-settings',
      shortName: 'System Settings',
      fullName: 'System Settings',
      publisher: 'Nintendo',
      version: 'v11.17',
      accentColor: '#475569',
      secondaryColor: '#cbd5e1',
      chimeFreqs: [392, 493.88, 587.33],
      blocks: 48,
      description: 'Configure Owner Profile, HOME Theme, LCD Brightness, Audio, and NAND Format.',
    },
    {
      titleId: '0004001000021700',
      appletId: 'mii-maker',
      shortName: 'Mii Maker',
      fullName: 'Mii Maker & Plaza',
      publisher: 'Nintendo',
      version: 'v2.1.0',
      accentColor: '#0ea5e9',
      secondaryColor: '#e0f2fe',
      chimeFreqs: [523.25, 587.33, 659.25, 783.99],
      blocks: 64,
      description: 'Create and customize Mii characters persisted directly into NAND_USERDATA.',
    },
    {
      titleId: '0004001000021200',
      appletId: 'activity-log',
      shortName: 'Activity Log',
      fullName: 'Activity Log',
      publisher: 'Nintendo',
      version: 'v1.4.0',
      accentColor: '#10b981',
      secondaryColor: '#d1fae5',
      chimeFreqs: [440, 523.25, 659.25],
      blocks: 36,
      description: 'Inspect real software playtime records and earn Play Coins via the step pedometer.',
    },
    {
      titleId: '0004001000021500',
      appletId: 'sound-studio',
      shortName: '3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      publisher: 'Nintendo',
      version: 'v1.5.1',
      accentColor: '#f43f5e',
      secondaryColor: '#ffe4e6',
      chimeFreqs: [329.63, 440, 554.37, 659.25],
      blocks: 58,
      description: 'Synthesizer chime sequencer and live oscilloscope rendered on the top 3D screen.',
    },
    {
      titleId: '0004003000008B02',
      appletId: 'game-notes',
      shortName: 'Game Notes',
      fullName: 'Game Notes',
      publisher: 'Nintendo',
      version: 'v1.1.0',
      accentColor: '#eab308',
      secondaryColor: '#fef9c3',
      chimeFreqs: [587.33, 739.99, 880],
      blocks: 24,
      description: 'Touchscreen stylus sketchpad saved as vector stroke records inside IDB NAND chunks.',
    },
    {
      titleId: '0004003000008C02',
      appletId: 'browser',
      shortName: 'Net Browser',
      fullName: 'Internet Browser',
      publisher: 'Nintendo',
      version: 'v1.7.5',
      accentColor: '#06b6d4',
      secondaryColor: '#cffafe',
      chimeFreqs: [493.88, 659.25],
      blocks: 72,
      description: 'Simulated local CTR-Net intranet guide explaining the 3DS dual-ARM boot chain.',
    },
    {
      titleId: '0004001000021400',
      appletId: 'camera-ar',
      shortName: '3DS Camera',
      fullName: 'Nintendo 3DS Camera',
      publisher: 'Nintendo',
      version: 'v1.3.0',
      accentColor: '#ec4899',
      secondaryColor: '#fce7f3',
      chimeFreqs: [523.25, 783.99],
      blocks: 40,
      description: 'Interactive stereographic optical viewfinder & test-pattern depth calibrator.',
    },
  ];
}

interface RawTitleBlueprint {
  titleId: string;
  productCode: string;
  publisher: string;
  shortName: string;
  fullName: string;
  version: string;
  titleVersion: number;
  mediaType: 'NAND' | 'SD' | 'GAMECARD' | 'TWLN';
  blocks: number;
  exefsKb: number;
  romfsKb: number;
  hasManual?: boolean;
  stagedImport?: boolean;
  appletId?: SystemTitleEntry['appletId'];
  description: string;
}

const CTR_TITLE_BLUEPRINTS: RawTitleBlueprint[] = [
  {
    titleId: '0004000000030800',
    productCode: 'CTR-P-SBPT',
    publisher: 'CTR Studio',
    shortName: 'Starburst Pilot 3D',
    fullName: 'Starburst Pilot 3D (Game Card)',
    version: 'v1.2.0',
    titleVersion: 12288,
    mediaType: 'GAMECARD',
    blocks: 512,
    exefsKb: 256,
    romfsKb: 4864,
    hasManual: true,
    appletId: 'cartridge',
    description: 'Playable dual-screen arcade shooter mounted via Game Card / NCSD NCCH container.',
  },
  {
    titleId: '0004000E00030800',
    productCode: 'CTR-U-SBPT',
    publisher: 'CTR Studio',
    shortName: 'Starburst Update',
    fullName: 'Starburst Pilot 3D Update Ver. 1.2.1',
    version: 'v1.2.1',
    titleVersion: 12304,
    mediaType: 'SD',
    blocks: 38,
    exefsKb: 128,
    romfsKb: 384,
    stagedImport: true,
    description: 'Staged title update patch in import.db ready for final installation into title.db & ticket.db.',
  },
  {
    titleId: '0004001000021000',
    productCode: 'CTR-N-HAAE',
    publisher: 'Nintendo',
    shortName: 'System Settings',
    fullName: 'System Settings',
    version: 'v11.17',
    titleVersion: 11264,
    mediaType: 'NAND',
    blocks: 48,
    exefsKb: 192,
    romfsKb: 1024,
    appletId: 'system-settings',
    description: 'Configure Owner Profile, Language, Theme, Data Management, and FCRAM/NAND state.',
  },
  {
    titleId: '0004001000021100',
    productCode: 'CTR-N-HADE',
    publisher: 'Nintendo',
    shortName: 'Download Play',
    fullName: 'Nintendo 3DS Download Play',
    version: 'v2.0.0',
    titleVersion: 2048,
    mediaType: 'NAND',
    blocks: 32,
    exefsKb: 160,
    romfsKb: 640,
    description: 'Local wireless DLP receiver built into CTRNAND system application partition.',
  },
  {
    titleId: '0004001000021200',
    productCode: 'CTR-N-HACE',
    publisher: 'Nintendo',
    shortName: 'Activity Log',
    fullName: 'Activity Log',
    version: 'v1.4.0',
    titleVersion: 1040,
    mediaType: 'NAND',
    blocks: 36,
    exefsKb: 144,
    romfsKb: 768,
    appletId: 'activity-log',
    description: 'Reads Play Coins & software playtime logs stored in NAND_USERDATA.',
  },
  {
    titleId: '0004001000021300',
    productCode: 'CTR-N-HAEE',
    publisher: 'Nintendo',
    shortName: 'Health & Safety',
    fullName: 'Health and Safety Information',
    version: 'v1.0.2',
    titleVersion: 1026,
    mediaType: 'NAND',
    blocks: 12,
    exefsKb: 96,
    romfsKb: 256,
    appletId: 'health-safety',
    description: 'Mandatory pre-install safety & stereoscopic 3D viewing notice stored on CTRNAND.',
  },
  {
    titleId: '0004001000021400',
    productCode: 'CTR-N-HAFE',
    publisher: 'Nintendo',
    shortName: '3DS Camera',
    fullName: 'Nintendo 3DS Camera',
    version: 'v1.3.0',
    titleVersion: 3072,
    mediaType: 'NAND',
    blocks: 40,
    exefsKb: 176,
    romfsKb: 896,
    appletId: 'camera-ar',
    description: 'Stereoscopic camera viewfinder & AR target test applet.',
  },
  {
    titleId: '0004001000021500',
    productCode: 'CTR-N-HAGE',
    publisher: 'Nintendo',
    shortName: '3DS Sound',
    fullName: 'Nintendo 3DS Sound',
    version: 'v1.5.1',
    titleVersion: 5120,
    mediaType: 'NAND',
    blocks: 58,
    exefsKb: 208,
    romfsKb: 1280,
    appletId: 'sound-studio',
    description: 'DSP audio playback studio & 8-step synthesizer.',
  },
  {
    titleId: '0004001000021700',
    productCode: 'CTR-N-HAJE',
    publisher: 'Nintendo',
    shortName: 'Mii Maker',
    fullName: 'Mii Maker & Plaza',
    version: 'v2.1.0',
    titleVersion: 4096,
    mediaType: 'NAND',
    blocks: 64,
    exefsKb: 224,
    romfsKb: 1536,
    appletId: 'mii-maker',
    description: 'Create Mii characters backed by CFL_DB archive in CTRNAND & user save data.',
  },
  {
    titleId: '0004001000021800',
    productCode: 'CTR-N-HAKE',
    publisher: 'Nintendo',
    shortName: 'Face Raiders',
    fullName: 'Face Raiders',
    version: 'v1.0.0',
    titleVersion: 1024,
    mediaType: 'NAND',
    blocks: 92,
    exefsKb: 240,
    romfsKb: 2048,
    description: 'Built-in CTRNAND gyro/camera AR mini-game.',
  },
  {
    titleId: '0004001000021900',
    productCode: 'CTR-N-HALE',
    publisher: 'Nintendo',
    shortName: 'Nintendo eShop',
    fullName: 'Nintendo eShop',
    version: 'v11.17',
    titleVersion: 17408,
    mediaType: 'NAND',
    blocks: 84,
    exefsKb: 288,
    romfsKb: 1792,
    description: 'Title distribution client interacting with import.db, title.db & ticket.db.',
  },
  {
    titleId: '0004003000008B02',
    productCode: 'CTR-N-HMAE',
    publisher: 'Nintendo',
    shortName: 'Game Notes',
    fullName: 'Game Notes',
    version: 'v1.1.0',
    titleVersion: 1024,
    mediaType: 'NAND',
    blocks: 24,
    exefsKb: 112,
    romfsKb: 512,
    appletId: 'game-notes',
    description: 'Resident HOME background applet for stylus memos saved in extdata.',
  },
  {
    titleId: '0004003000008C02',
    productCode: 'CTR-N-HNBE',
    publisher: 'Nintendo',
    shortName: 'Internet Browser',
    fullName: 'Internet Browser',
    version: 'v1.7.5',
    titleVersion: 5120,
    mediaType: 'NAND',
    blocks: 72,
    exefsKb: 320,
    romfsKb: 1408,
    appletId: 'browser',
    description: 'System applet browser (00040030) launched suspended over active titles.',
  },
  {
    titleId: '0004003000008F02',
    productCode: 'CTR-N-HMME',
    publisher: 'Nintendo',
    shortName: 'HOME Menu',
    fullName: 'Nintendo 3DS HOME Menu',
    version: 'v11.17',
    titleVersion: 24576,
    mediaType: 'NAND',
    blocks: 44,
    exefsKb: 256,
    romfsKb: 960,
    description: 'Autoboot shell (0004003000008F02) launched by pm/NS on Stage 2 handoff.',
  },
  {
    titleId: '0004003000009402',
    productCode: 'CTR-N-HFRE',
    publisher: 'Nintendo',
    shortName: 'Friend List',
    fullName: 'Friend List Applet',
    version: 'v1.2.0',
    titleVersion: 2048,
    mediaType: 'NAND',
    blocks: 18,
    exefsKb: 96,
    romfsKb: 320,
    description: 'System Applet bound to LocalFriendCodeSeed_B in /rw/sys/.',
  },
  {
    titleId: '0004003000009502',
    productCode: 'CTR-N-HNTE',
    publisher: 'Nintendo',
    shortName: 'Notifications',
    fullName: 'Notifications Applet',
    version: 'v1.1.0',
    titleVersion: 1024,
    mediaType: 'NAND',
    blocks: 16,
    exefsKb: 88,
    romfsKb: 288,
    description: 'System Applet handling SpotPass and background title notices.',
  },
  {
    titleId: '0004009B00010202',
    productCode: 'CTR-N-CFL0',
    publisher: 'Nintendo',
    shortName: 'CFL Data Archive',
    fullName: 'Mii Character Data Archive',
    version: 'v1.0.0',
    titleVersion: 1024,
    mediaType: 'NAND',
    blocks: 8,
    exefsKb: 0,
    romfsKb: 256,
    description: 'System Data Archive (0004009B) holding shared Mii morph/feature assets.',
  },
  {
    titleId: '0004009B00010402',
    productCode: 'CTR-N-REG0',
    publisher: 'Nintendo',
    shortName: 'Region Manifest',
    fullName: 'Country & Region Archive',
    version: 'v1.0.0',
    titleVersion: 1024,
    mediaType: 'NAND',
    blocks: 4,
    exefsKb: 0,
    romfsKb: 128,
    description: 'System Data Archive (0004009B) containing country/timezone tables.',
  },
  {
    titleId: '0004009B00014002',
    productCode: 'CTR-N-FNT0',
    publisher: 'Nintendo',
    shortName: 'Shared Font Archive',
    fullName: 'Shared System Font (CBFNT)',
    version: 'v1.0.0',
    titleVersion: 2048,
    mediaType: 'NAND',
    blocks: 14,
    exefsKb: 0,
    romfsKb: 512,
    description: 'System Data Archive (0004009B) providing BCFNT bitmap fonts to applets.',
  },
  {
    titleId: '000480044B513945',
    productCode: 'TWL-N-KQ9E',
    publisher: 'Nintendo',
    shortName: 'DSiWare TWL Utility',
    fullName: 'TWLN Compatibility Title',
    version: 'v1.0.0',
    titleVersion: 256,
    mediaType: 'TWLN',
    blocks: 20,
    exefsKb: 128,
    romfsKb: 256,
    description: 'TWL_FIRM DSiWare title stored inside the TWLN FAT16 partition.',
  },
];

export function buildPackageAndTicketFromBlueprint(
  bp: RawTitleBlueprint,
  source: TitleTicket['source'] = 'SystemPreinstalled'
): { pkg: TitlePackage; dbEntry: TitleDatabaseEntry; ticket: TitleTicket } {
  const titleIdHigh = bp.titleId.slice(0, 8) as TitleCategoryHigh;
  const titleIdLow = bp.titleId.slice(8, 16);
  const basePath =
    bp.mediaType === 'TWLN'
      ? `twln:/title/${titleIdHigh}/${titleIdLow}/content/`
      : bp.mediaType === 'SD'
      ? `sdmc:/Nintendo 3DS/<ID0>/<ID1>/title/${titleIdHigh}/${titleIdLow}/content/`
      : bp.mediaType === 'GAMECARD'
      ? `gamecard:/ncch/${bp.titleId}/content/`
      : `ctrnand:/title/${titleIdHigh}/${titleIdLow}/content/`;

  const mainCid = '00000000';
  const mainAppName = `${mainCid}.app`;
  const mainSize = (bp.exefsKb + bp.romfsKb) * 1024;
  const apps: TitlePackage['apps'] = [
    {
      fileName: mainAppName,
      magic: 'NCCH',
      partitionId: bp.titleId,
      programId: bp.titleId,
      productCode: bp.productCode,
      makerCode: bp.publisher === 'Nintendo' ? '01' : 'CT',
      contentIndex: 0,
      totalSizeBytes: mainSize,
      cryptoType:
        bp.mediaType === 'SD'
          ? 'SD-MovableSed-AES'
          : bp.mediaType === 'NAND'
          ? 'CTR-NAND-Unencrypted'
          : 'NCCH-FixedKey',
      ...(bp.exefsKb > 0
        ? {
            exefs: {
              codeSizeBytes: bp.exefsKb * 1024,
              iconSizeBytes: 14 * 1024,
              bannerSizeBytes: 24 * 1024,
              hash: deterministicHex(`EXEFS:${bp.titleId}:${bp.version}`, 64),
            },
          }
        : {}),
      romfs: {
        sizeBytes: bp.romfsKb * 1024,
        levelCount: 3,
        hash: deterministicHex(`ROMFS:${bp.titleId}:${bp.version}`, 64),
      },
    },
  ];

  const tmdContents: TitlePackage['tmd']['contents'] = [
    {
      contentId: mainCid,
      index: 0,
      type: bp.exefsKb > 0 ? 'MainContent' : 'SystemData',
      sizeBytes: mainSize,
      sha256: deterministicHex(`CONTENT0:${bp.titleId}:${bp.version}`, 64),
    },
  ];

  if (bp.hasManual) {
    const manualCid = '00000001';
    const manualBytes = 64 * 1024;
    apps.push({
      fileName: `${manualCid}.app`,
      magic: 'NCCH',
      partitionId: bp.titleId,
      programId: bp.titleId,
      productCode: bp.productCode,
      makerCode: bp.publisher === 'Nintendo' ? '01' : 'CT',
      contentIndex: 1,
      totalSizeBytes: manualBytes,
      cryptoType: 'NCCH-FixedKey',
      romfs: {
        sizeBytes: manualBytes,
        levelCount: 1,
        hash: deterministicHex(`MANUAL:${bp.titleId}:${bp.version}`, 64),
      },
    });
    tmdContents.push({
      contentId: manualCid,
      index: 1,
      type: 'Manual',
      sizeBytes: manualBytes,
      sha256: deterministicHex(`CONTENT1:${bp.titleId}:${bp.version}`, 64),
    });
  }

  const tmdFile = '00000001.tmd';
  const totalBytes = tmdContents.reduce((sum, c) => sum + c.sizeBytes, 0);

  const pkg: TitlePackage = {
    titleId: bp.titleId,
    titleIdHigh,
    titleIdLow,
    productCode: bp.productCode,
    publisher: bp.publisher,
    shortName: bp.shortName,
    fullName: bp.fullName,
    mediaType: bp.mediaType,
    basePath,
    appletId: bp.appletId,
    blocks: bp.blocks,
    description: bp.description,
    tmd: {
      fileName: tmdFile,
      titleId: bp.titleId,
      titleVersion: bp.titleVersion,
      versionString: bp.version,
      titleType: titleIdHigh,
      saveDataSizeBytes: bp.appletId ? 65536 : 0,
      sysVersion: '0004013800000002',
      contentCount: tmdContents.length,
      contents: tmdContents,
      signatureIssuer: 'Root-CA00000003-CP0000000b',
      signatureHex: deterministicHex(`TMD_SIG:${bp.titleId}:${bp.titleVersion}`, 64),
    },
    apps,
  };

  const dbEntry: TitleDatabaseEntry = {
    titleId: bp.titleId,
    titleIdHigh,
    titleIdLow,
    name: bp.fullName,
    productCode: bp.productCode,
    version: bp.version,
    titleVersion: bp.titleVersion,
    mediaType: bp.mediaType,
    installPath: basePath,
    tmdFile,
    appFiles: apps.map((a) => a.fileName),
    sizeBytes: totalBytes,
    blocks: bp.blocks,
    state: bp.stagedImport ? 'StagedImport' : 'Active',
    launchableAppletId: bp.appletId,
  };

  const ticket: TitleTicket = {
    ticketId: deterministicHex(`TIK_ID:${bp.titleId}`, 16),
    titleId: bp.titleId,
    titleIdHigh,
    titleIdLow,
    consoleId: bp.mediaType === 'NAND' ? '00000000' : '4A92C108',
    encryptedTitleKeyHex: deterministicHex(`TITLEKEY:${bp.titleId}`, 32),
    commonKeyIndex: titleIdHigh === '00040000' || titleIdHigh === '0004000E' ? 0 : 1,
    version: 1,
    issuer: 'Root-CA00000003-XS0000000c',
    source: bp.mediaType === 'GAMECARD' ? 'NintendoSigned' : source,
    signatureHex: deterministicHex(`TIK_SIG:${bp.titleId}`, 64),
    rightsMask: '0x00000003',
  };

  return { pkg, dbEntry, ticket };
}

export function getDefaultCertsDb(): CertChainEntry[] {
  return [
    {
      name: 'Root',
      issuer: 'Nintendo Root CA',
      keyType: 'RSA-4096',
      fingerprintSha256: deterministicHex('CERT_ROOT', 32),
    },
    {
      name: 'CA00000003',
      issuer: 'Root',
      keyType: 'RSA-2048',
      fingerprintSha256: deterministicHex('CERT_CA3', 32),
    },
    {
      name: 'XS0000000c',
      issuer: 'Root-CA00000003',
      keyType: 'RSA-2048',
      fingerprintSha256: deterministicHex('CERT_XS0C', 32),
    },
    {
      name: 'CP0000000b',
      issuer: 'Root-CA00000003',
      keyType: 'RSA-2048',
      fingerprintSha256: deterministicHex('CERT_CP0B', 32),
    },
  ];
}

export function getDefaultCtrNandArchive(titles = getDefaultSystemTitles()): CtrNandArchiveData {
  const packages: TitlePackage[] = [];
  const titleDb: TitleDatabaseEntry[] = [];
  const importDb: TitleDatabaseEntry[] = [];
  const ticketDb: TitleTicket[] = [];

  for (const bp of CTR_TITLE_BLUEPRINTS) {
    const built = buildPackageAndTicketFromBlueprint(bp);
    packages.push(built.pkg);
    if (bp.stagedImport) {
      importDb.push(built.dbEntry);
    } else {
      titleDb.push(built.dbEntry);
      ticketDb.push(built.ticket);
    }
  }

  return {
    homeMenuTitleId: '0004003000008F02',
    sharedFontHash: '7a9e31c4f02b',
    titles,
    packages,
    dbs: {
      titleDb,
      importDb,
      ticketDb,
      certsDb: getDefaultCertsDb(),
    },
    nandFsMeta: {
      ctrnandDirs: ['/title/', '/dbs/', '/data/<ID0>/', '/rw/sys/', '/private/'],
      twlnDirs: ['/title/', '/shared1/', '/shared2/', '/sys/'],
      twlpDirs: ['/photo/', '/sound/'],
      agbsaveMagic: '.AGB',
    },
  };
}

export function getDefaultUserSaveData(): UserSaveData {
  return {
    slots: [
      { type: 'app', appletId: 'cartridge' },
      { type: 'app', appletId: 'health-safety' },
      { type: 'app', appletId: 'camera-ar' },
      { type: 'app', appletId: 'sound-studio' },
      { type: 'app', appletId: 'mii-maker' },
      { type: 'app', appletId: 'system-settings' },
      { type: 'app', appletId: 'activity-log' },
      { type: 'app', appletId: 'game-notes' },
      { type: 'app', appletId: 'browser' },
      { type: 'folder', folderId: 'fld-sys' },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
      { type: 'empty' },
    ],
    folders: {
      'fld-sys': {
        id: 'fld-sys',
        name: 'System Utilities',
        badgeChar: 'U',
        color: '#0284c7',
        items: ['system-settings', 'browser'],
      },
    },
    notes: [
      {
        id: 'note-welcome',
        title: 'Boot Chain Memo',
        createdAt: '2026-11-15',
        strokes: [
          {
            color: '#0f172a',
            width: 3,
            points: [
              [36, 48],
              [56, 36],
              [78, 52],
              [104, 38],
              [130, 56],
            ],
          },
          {
            color: '#0284c7',
            width: 3,
            points: [
              [44, 90],
              [120, 90],
              [160, 74],
              [210, 96],
            ],
          },
        ],
      },
    ],
    activity: {
      'system-settings': { appletId: 'system-settings', launchCount: 2, totalSeconds: 185, lastPlayed: '2026-11-15' },
      'sound-studio': { appletId: 'sound-studio', launchCount: 1, totalSeconds: 62, lastPlayed: '2026-11-15' },
    },
    miis: [
      {
        id: 'mii-1',
        name: 'Player 1',
        shirtColor: '#0284c7',
        skinTone: '#fde6d0',
        hairColor: '#1e293b',
        hairStyle: 'spiky',
        favorite: true,
        greeting: 'Ready to inspect encrypted NAND chunks!',
      },
      {
        id: 'mii-2',
        name: 'Satoru',
        shirtColor: '#10b981',
        skinTone: '#f8d9bd',
        hairColor: '#0f172a',
        hairStyle: 'parted',
        favorite: false,
        greeting: 'Direct to you on CTR-SIM.',
      },
      {
        id: 'mii-3',
        name: 'Aoi',
        shirtColor: '#e11d48',
        skinTone: '#fce2cb',
        hairColor: '#7c2d12',
        hairStyle: 'bob',
        favorite: false,
        greeting: 'Play Coins earned today!',
      },
    ],
    synthPattern: [0, 2, 4, 7, 4, 2, 5, 7],
    cartridgeHighScore: 420,
    sysdataArchives: ['00010017 (HOME)', '00010022 (Activity)', '00010026 (CECD)'],
    extdataArchives: ['0000008f (HOME Cache)', '00000217 (Mii Plaza)', '00000000 (Notes)'],
  };
}

export function getDefaultStage1Opcodes(): Stage1Opcode[] {
  return [
    { pc: '0xFFFF0000', opcode: 'BOOT9_RST', target: 'ARM9+ARM11', detail: 'Execute Boot9 (0xFFFF0000) & Boot11 (0x00010000) factory ROMs' },
    { pc: '0xFFFF0120', opcode: 'CRYPTO_INIT', target: 'AES/RSA', detail: 'Init AES/RSA hardware engines, secret/public keys & NAND flash' },
    { pc: '0xFFFF0380', opcode: 'FIRM_READ', target: 'NCSD/FIRM', detail: 'Read NCSD & FIRM headers from internal NAND storage' },
    { pc: '0xFFFF0740', opcode: 'VERIFY_SIG', target: 'SHA256+RSA', detail: 'Validate FIRM SHA-256 digest & RSA-2048 signature trust chain' },
    { pc: '0xFFFF0B10', opcode: 'LOAD_SECT', target: 'ARM9/ARM11', detail: 'Extract Kernel9 (0x08006000) & Kernel11 (0x1FF80000) sections' },
    { pc: '0xFFFF0E90', opcode: 'BOOTROM_LCK', target: 'SYSPROT9/11', detail: 'Permanently lock protected halves of Boot9 & Boot11 ROMs' },
    { pc: '0xFFFF0FF0', opcode: 'JMP_FIRM', target: 'ENTRYPOINTS', detail: 'Jump ARM9 -> 0x08006000 and ARM11 -> 0x1FF80000' },
  ];
}

export function getDefaultStage2Header(): BootStage2Header {
  return {
    magic: 'FIRM',
    kernelVersion: 'NATIVE_FIRM 2.58-0 (Kernel9 / Kernel11)',
    buildTag: 'HORIZON-OS-11.17.0-50U',
    autobootTitleId: '0004003000008F02', // Real USA HOME Menu Title ID
    arm9Entry: '0x08006000',
    arm11Entry: '0x1FF80000',
    sysmodules: ['Process9', 'pm', 'sm', 'fs', 'pxi', 'NS', 'ErrDisp'],
    mountEntries: [
      { mount: 'twln:/ + twlp:/', partition: 'twl_nand', required: true },
      { mount: 'agbsave:/', partition: 'agbsave', required: false },
      { mount: 'ctrnand:/', partition: 'ctrnand', required: true },
    ],
  };
}

export function getDefaultFirmPayload(slotName: 'FIRM0' | 'FIRM1' = 'FIRM0'): FirmBinaryPayload {
  return {
    magic: 'FIRM',
    slotName,
    arm9Entry: '0x08006000',
    arm11Entry: '0x1FF80000',
    splVersion: 'NATIVE_FIRM 2.58-0',
    opcodes: getDefaultStage1Opcodes(),
    stage2Header: getDefaultStage2Header(),
  };
}

export function getDefaultTwlPartitionData(): TwlPartitionData {
  return {
    twlnFilesystem: 'FAT16',
    twlnRealOffsetHex: '0x00012E00',
    twlpFilesystem: 'FAT12',
    twlpRealOffsetHex: '0x09011A00',
    twlSystemVersion: 'TWL_FIRM 1.4.5U',
    dsiWareTitleIds: ['000480044B513945'],
    twlpPhotoSlots: 0,
    twlpSoundSlots: 0,
  };
}

export function getDefaultAgbSaveData(): AgbSaveData {
  return {
    magic: '.SAV',
    realOffsetHex: '0x0B100000',
    realSizeHex: '0x00030000',
    titleId: '0004000000000000',
    saveType: 'SRAM / Flash 128K',
    populated: false,
    cmacHex: deterministicHex('AGBSAVE_MAC_CTR', 32),
  };
}

export function getDefaultCtrNandVolume(): CtrNandVolumeData {
  return {
    config: getDefaultSystemConfig(),
    archive: getDefaultCtrNandArchive(),
    userData: getDefaultUserSaveData(),
  };
}

// Aligns an offset up to a 512-byte media unit (sector) boundary
function alignUp512(offset: number): number {
  return (offset + 511) & ~511;
}

// Writes a clean human-readable ASCII/UTF-8 section after the tagged JSON payload (never covered by LCG junk)
function writeReadableSection(
  buf: Uint8Array,
  startOffset: number,
  maxEndOffset: number,
  lines: string[]
): number {
  const aligned = alignUp512(startOffset);
  if (aligned >= maxEndOffset) return aligned;
  const textBytes = encodeUtf8(lines.join('\n') + '\n');
  const writable = Math.min(textBytes.length, maxEndOffset - aligned);
  if (writable > 0) {
    buf.set(textBytes.subarray(0, writable), aligned);
  }
  return aligned + writable;
}

// Helper: build a tagged binary partition buffer with 32B header + CRC32 + readable JSON + erased 0xFF flash
function buildTaggedBinary(magic: string, totalSize: number, payloadObj: unknown): Uint8Array {
  const buf = new Uint8Array(totalSize);
  buf.fill(0xff, 0x20); // Erased NAND flash state (no LCG pseudo-random junk filler)

  let payloadBytes = encodeUtf8(JSON.stringify(payloadObj, null, 2) + '\n');
  if (0x20 + payloadBytes.length > totalSize) {
    payloadBytes = encodeUtf8(JSON.stringify(payloadObj));
  }
  if (0x20 + payloadBytes.length > totalSize) {
    throw new Error(`Payload for ${magic} exceeds partition size (${payloadBytes.length} > ${totalSize})`);
  }

  writeAsciiFixed(buf, 0x00, magic, 4);
  writeUint32LE(buf, 0x04, 1);
  writeUint32LE(buf, 0x08, payloadBytes.length);
  writeUint32LE(buf, 0x0c, computeCRC32(payloadBytes));
  writeAsciiFixed(buf, 0x10, `CTR_${magic}_OK`, 16);

  buf.set(payloadBytes, 0x20);
  return buf;
}

export function parseTaggedBinary<T>(
  buf: Uint8Array,
  expectedMagic: string
): { ok: true; data: T; magic: string } | { ok: false; magic: string; reason: string } {
  const magic = readAsciiFixed(buf, 0x00, 4);
  if (magic !== expectedMagic) {
    return {
      ok: false,
      magic,
      reason: `Magic mismatch at 0x00: expected "${expectedMagic}", found "${magic || '0x0000'}"`,
    };
  }
  const version = readUint32LE(buf, 0x04);
  if (version !== 1) {
    return {
      ok: false,
      magic,
      reason: `Unsupported binary header version (${version})`,
    };
  }
  const len = readUint32LE(buf, 0x08);
  const storedCrc = readUint32LE(buf, 0x0c);
  if (len === 0 || 0x20 + len > buf.length) {
    return {
      ok: false,
      magic,
      reason: `Corrupt payload length (${len} bytes) exceeds partition bounds`,
    };
  }
  const slice = buf.slice(0x20, 0x20 + len);
  const actualCrc = computeCRC32(slice);
  if (actualCrc !== storedCrc) {
    return {
      ok: false,
      magic,
      reason: `CRC32 checksum mismatch (expected 0x${storedCrc.toString(16).toUpperCase()}, got 0x${actualCrc.toString(16).toUpperCase()})`,
    };
  }
  try {
    const parsed = JSON.parse(decodeUtf8(slice)) as T;
    return { ok: true, data: parsed, magic };
  } catch (err) {
    return {
      ok: false,
      magic,
      reason: `JSON/struct decode fault: ${err instanceof Error ? err.message : 'invalid payload'}`,
    };
  }
}

export function buildTwlPartition(data: TwlPartitionData = getDefaultTwlPartitionData()): Uint8Array {
  const size = getPartitionByteSize('twl_nand');
  const buf = buildTaggedBinary('TWL0', size, data);
  const payloadEnd = 0x20 + readUint32LE(buf, 0x08);
  const twlpOffset = (24 - 1) * CHUNK_SIZE; // Chunk 24 = TWLP start inside twl_nand

  writeReadableSection(buf, payloadEnd, twlpOffset, [
    '=== TWL PARTITION VFS MANIFEST (NCSD[0]) ===',
    `TWLN (${data.twlnFilesystem}, real ${data.twlnRealOffsetHex}): /sys/dev.kp /shared1 /shared2 /title/00030004`,
    `TWLP (${data.twlpFilesystem}, real ${data.twlpRealOffsetHex}): /photo/ (${data.twlpPhotoSlots} slots) /sound/ (${data.twlpSoundSlots} slots)`,
    `TWL System: ${data.twlSystemVersion}`,
    `Installed DSiWare TIDs: ${data.dsiWareTitleIds.join(', ') || 'none'}`,
  ]);

  // Write clean FAT12 Volume Boot Record marker at TWLP boundary (chunk 24)
  if (twlpOffset + 0x200 <= buf.length && payloadEnd < twlpOffset) {
    buf.fill(0x00, twlpOffset, twlpOffset + 0x200);
    buf[twlpOffset + 0x00] = 0xeb;
    buf[twlpOffset + 0x01] = 0x3c;
    buf[twlpOffset + 0x02] = 0x90;
    writeAsciiFixed(buf, twlpOffset + 0x03, 'MSDOS5.0', 8);
    buf[twlpOffset + 0x0b] = 0x00; // 512 bytes/sector
    buf[twlpOffset + 0x0c] = 0x02;
    buf[twlpOffset + 0x0d] = 0x04;
    buf[twlpOffset + 0x15] = 0xf8;
    writeAsciiFixed(buf, twlpOffset + 0x2b, 'TWLP_FAT12 ', 11);
    writeAsciiFixed(buf, twlpOffset + 0x36, 'FAT12   ', 8);
    buf[twlpOffset + 0x1fe] = 0x55;
    buf[twlpOffset + 0x1ff] = 0xaa;
  }

  return buf;
}

export function parseTwlPartition(buf: Uint8Array) {
  return parseTaggedBinary<TwlPartitionData>(buf, 'TWL0');
}

export function buildAgbSavePartition(data: AgbSaveData = getDefaultAgbSaveData()): Uint8Array {
  const size = getPartitionByteSize('agbsave'); // Exact 0x30000 = 192 KB
  const buf = buildTaggedBinary('.SAV', size, data);
  const payloadEnd = 0x20 + readUint32LE(buf, 0x08);
  writeReadableSection(buf, payloadEnd, size, [
    '=== AGBSAVE SCRATCHPAD (NCSD[1] · 0x30000 = 192 KB) ===',
    `Real Offset: ${data.realOffsetHex} | Size: ${data.realSizeHex} | Title: ${data.titleId}`,
    `Save Format: ${data.saveType} | Populated: ${String(data.populated)} | CMAC: ${data.cmacHex}`,
    'Remaining erased flash bytes (0xFF) represent unprogrammed AGB_FIRM save space.',
  ]);
  return buf;
}

export function parseAgbSavePartition(buf: Uint8Array) {
  return parseTaggedBinary<AgbSaveData>(buf, '.SAV');
}

export function buildFirmPartition(
  slotName: 'FIRM0' | 'FIRM1' = 'FIRM0',
  payload: FirmBinaryPayload = getDefaultFirmPayload(slotName)
): Uint8Array {
  const size = getPartitionByteSize(slotName === 'FIRM0' ? 'firm0' : 'firm1');
  const fullPayload = { ...payload, slotName };
  const buf = buildTaggedBinary('FIRM', size, fullPayload);
  const payloadEnd = 0x20 + readUint32LE(buf, 0x08);
  writeReadableSection(buf, payloadEnd, size, [
    `=== ${slotName} (${fullPayload.splVersion}) KERNEL MANIFEST ===`,
    `ARM9 Entry: ${fullPayload.arm9Entry} | ARM11 Entry: ${fullPayload.arm11Entry}`,
    `Kernel: ${fullPayload.stage2Header.kernelVersion} (${fullPayload.stage2Header.buildTag})`,
    `Autoboot HOME TID: ${fullPayload.stage2Header.autobootTitleId}`,
    `Sysmodules: ${(fullPayload.stage2Header.sysmodules ?? []).join(', ')}`,
    'Mounts:',
    ...fullPayload.stage2Header.mountEntries.map(
      (m) => `  ${m.mount.padEnd(20)} -> ${m.partition} (required=${String(m.required)})`
    ),
  ]);
  return buf;
}

export function parseFirmPartition(buf: Uint8Array) {
  return parseTaggedBinary<FirmBinaryPayload>(buf, 'FIRM');
}

function buildTaggedDbFile(magic: string, count: number, payload: unknown): Uint8Array {
  const body = jsonToBytes(payload);
  const out = new Uint8Array(16 + body.byteLength);
  writeAsciiFixed(out, 0x00, magic, 4);
  writeUint32LE(out, 0x04, 1); // DB format version
  writeUint32LE(out, 0x08, count);
  writeUint32LE(out, 0x0c, computeCRC32(body));
  out.set(body, 0x10);
  return out;
}

function parseTaggedDbFile<T>(bytes: Uint8Array | undefined, expectedMagic: string, label: string): T {
  if (!bytes || bytes.byteLength < 16) {
    throw new Error(`Missing CTRNAND database file ${label}`);
  }
  const magic = readAsciiFixed(bytes, 0x00, 4);
  if (magic !== expectedMagic) {
    throw new Error(`Corrupt DB magic in ${label} (expected "${expectedMagic}", found "${magic}")`);
  }
  const body = bytes.subarray(0x10);
  const storedCrc = readUint32LE(bytes, 0x0c);
  if (computeCRC32(body) !== storedCrc) {
    throw new Error(`CRC32 mismatch inside ${label}`);
  }
  return JSON.parse(decodeUtf8(body)) as T;
}

function encodeSecureInfoA(config: SystemConfig): Uint8Array {
  const out = new Uint8Array(288);
  writeAsciiFixed(out, 0x00, 'CTR-SINF', 8);
  out[0x100] = config.region === 'JPN' ? 0x00 : config.region === 'USA' ? 0x01 : 0x02;
  writeAsciiFixed(out, 0x101, config.serialNumber.slice(0, 15), 15);
  writeAsciiFixed(out, 0x110, config.region, 4);
  return out;
}

function encodeLocalFriendCodeSeedB(identity: ConsoleIdentityFiles): Uint8Array {
  const out = new Uint8Array(272);
  writeAsciiFixed(out, 0x00, 'LFCS', 4);
  const seedBytes = hexToBytes(identity.localFriendCodeSeedHex.padEnd(32, '0').slice(0, 32));
  out.set(seedBytes.subarray(0, 16), 0x100);
  return out;
}

function encodeMovableSed(identity: ConsoleIdentityFiles): Uint8Array {
  const meta = jsonToBytes({ id0: identity.id0, id1: identity.id1 });
  const out = new Uint8Array(Math.max(320, 0x120 + meta.byteLength));
  writeAsciiFixed(out, 0x00, 'SEED', 4);
  out[0x04] = 0x01; // initialized flag
  const keyY = hexToBytes(identity.movableSedKeyHex.padEnd(32, '0').slice(0, 32));
  out.set(keyY.subarray(0, 16), 0x110);
  out.set(meta, 0x120);
  return out;
}

function encodeTmdFile(tmd: TitlePackage['tmd']): Uint8Array {
  const body = jsonToBytes(tmd);
  const out = new Uint8Array(16 + body.byteLength);
  writeAsciiFixed(out, 0x00, 'TMD0', 4);
  writeUint32LE(out, 0x04, tmd.titleVersion);
  writeUint32LE(out, 0x08, tmd.contentCount);
  writeUint32LE(out, 0x0c, computeCRC32(body));
  out.set(body, 0x10);
  return out;
}

function encodeNcchAppFile(
  pkg: TitlePackage,
  app: TitlePackage['apps'][number],
  appletEntry?: SystemTitleEntry
): Uint8Array {
  const manifestObj = {
    app,
    packageMeta: {
      titleId: pkg.titleId,
      titleIdHigh: pkg.titleIdHigh,
      titleIdLow: pkg.titleIdLow,
      productCode: pkg.productCode,
      publisher: pkg.publisher,
      shortName: pkg.shortName,
      fullName: pkg.fullName,
      mediaType: pkg.mediaType,
      basePath: pkg.basePath,
      appletId: pkg.appletId,
      blocks: pkg.blocks,
      description: pkg.description,
    },
    appletEntry: app.contentIndex === 0 ? appletEntry : undefined,
  };
  const body = jsonToBytes(manifestObj);
  const out = new Uint8Array(0x200 + body.byteLength);

  // Authentic NCCH header layout (0x000..0x1FF): "NCCH" magic at 0x100
  writeAsciiFixed(out, 0x100, 'NCCH', 4);
  writeUint32LE(out, 0x104, Math.ceil(out.byteLength / MEDIA_UNIT_SIZE)); // Content size in 0x200 MU
  const tidBytes = hexToBytes(pkg.titleId.padStart(16, '0').slice(0, 16));
  out.set(tidBytes, 0x108); // Partition ID
  writeAsciiFixed(out, 0x110, app.makerCode || '01', 2);
  out[0x112] = 0x02; // NCCH v2
  out.set(tidBytes, 0x118); // Program ID
  writeAsciiFixed(out, 0x150, pkg.productCode.slice(0, 16), 16);
  writeUint32LE(out, 0x188, computeCRC32(body)); // ExeFS/Manifest digest check

  out.set(body, 0x200);
  return out;
}

export function buildCtrNandVolumePartition(
  volume: CtrNandVolumeData = getDefaultCtrNandVolume()
): Uint8Array {
  const size = getPartitionByteSize('ctrnand');
  const config: SystemConfig = {
    ...volume.config,
    identity:
      volume.config.identity ??
      getDefaultConsoleIdentity(volume.config.region, volume.config.serialNumber),
  };
  const id = config.identity!;
  const titlesByApplet = new Map<string, SystemTitleEntry>();
  for (const t of volume.archive.titles) {
    titlesByApplet.set(t.appletId, t);
  }

  const files: Fat16BuildFile[] = [];

  // 1. /rw/sys/ & /private/ console identity & configuration
  files.push({ path: '/rw/sys/SecureInfo_A', data: encodeSecureInfoA(config), readOnly: true });
  files.push({
    path: '/rw/sys/LocalFriendCodeSeed_B',
    data: encodeLocalFriendCodeSeedB(id),
    readOnly: true,
  });
  files.push({
    path: '/rw/sys/config.json',
    data: jsonToBytes({
      ownerName: config.ownerName,
      language: config.language,
      region: config.region,
      serialNumber: config.serialNumber,
      firmwareVersion: config.firmwareVersion,
      themeId: config.themeId,
      gridRows: config.gridRows,
      brightness: config.brightness,
      soundEnabled: config.soundEnabled,
      wirelessEnabled: config.wirelessEnabled,
      playCoins: config.playCoins,
      totalSteps: config.totalSteps,
      bootCount: config.bootCount,
    }),
  });
  files.push({ path: '/private/movable.sed', data: encodeMovableSed(id), readOnly: true });

  // 2. /dbs/ databases (title.db, import.db, ticket.db, certs.db)
  files.push({
    path: '/dbs/title.db',
    data: buildTaggedDbFile('TDB0', volume.archive.dbs.titleDb.length, volume.archive.dbs.titleDb),
  });
  files.push({
    path: '/dbs/import.db',
    data: buildTaggedDbFile('IDB0', volume.archive.dbs.importDb.length, volume.archive.dbs.importDb),
  });
  files.push({
    path: '/dbs/ticket.db',
    data: buildTaggedDbFile('TIKD', volume.archive.dbs.ticketDb.length, volume.archive.dbs.ticketDb),
  });
  files.push({
    path: '/dbs/certs.db',
    data: buildTaggedDbFile('CERT', volume.archive.dbs.certsDb.length, volume.archive.dbs.certsDb),
    readOnly: true,
  });

  // 3. Actual OS & Applet Title Packages under /title/<TID_High>/<TID_Low>/content/
  for (const pkg of volume.archive.packages) {
    const contentDir = `/title/${pkg.titleIdHigh}/${pkg.titleIdLow}/content`;
    files.push({
      path: `${contentDir}/${pkg.tmd.fileName}`,
      data: encodeTmdFile(pkg.tmd),
    });
    const appletEntry = pkg.appletId ? titlesByApplet.get(pkg.appletId) : undefined;
    for (const app of pkg.apps) {
      files.push({
        path: `${contentDir}/${app.fileName}`,
        data: encodeNcchAppFile(pkg, app, appletEntry),
      });
    }
  }

  // 4. User SysData & ExtData under /data/<ID0>/
  const dataRoot = `/data/${id.id0}`;
  files.push({
    path: `${dataRoot}/sysdata/00010017/home.json`,
    data: jsonToBytes({
      homeMenuTitleId: volume.archive.homeMenuTitleId,
      sharedFontHash: volume.archive.sharedFontHash,
      slots: volume.userData.slots,
      folders: volume.userData.folders,
      sysdataArchives: volume.userData.sysdataArchives ?? [
        '00010017 (HOME)',
        '00010022 (Activity)',
        '00010026 (CECD)',
      ],
    }),
  });
  files.push({
    path: `${dataRoot}/sysdata/00010022/activity.json`,
    data: jsonToBytes(volume.userData.activity),
  });
  files.push({
    path: `${dataRoot}/extdata/00000000/notes.json`,
    data: jsonToBytes({
      notes: volume.userData.notes,
      extdataArchives: volume.userData.extdataArchives ?? [
        '0000008f (HOME Cache)',
        '00000217 (Mii Plaza)',
        '00000000 (Notes)',
      ],
    }),
  });
  files.push({
    path: `${dataRoot}/extdata/00000217/miis.json`,
    data: jsonToBytes(volume.userData.miis),
  });
  files.push({
    path: `${dataRoot}/extdata/0000055d/audio_game.json`,
    data: jsonToBytes({
      synthPattern: volume.userData.synthPattern,
      cartridgeHighScore: volume.userData.cartridgeHighScore,
      nandFsMeta: volume.archive.nandFsMeta,
    }),
  });

  return buildFat16MbrImage(size, 'CTR', files);
}

export function parseCtrNandVolumePartition(
  buf: Uint8Array
): { ok: true; data: CtrNandVolumeData; magic: string } | { ok: false; magic: string; reason: string } {
  const fat = parseFat16MbrImage(buf);
  if (!fat.ok) {
    return {
      ok: false,
      magic: readAsciiFixed(buf, 0x236, 5) || '----',
      reason: fat.reason,
    };
  }
  if (fat.volumeLabel !== 'CTR') {
    return {
      ok: false,
      magic: fat.filesystemType,
      reason: `Unexpected FAT16 volume label "${fat.volumeLabel}" (expected "CTR")`,
    };
  }

  try {
    // 1. Parse /rw/sys/ & /private/movable.sed
    const secInfo = fat.files.get('/rw/sys/SecureInfo_A');
    if (!secInfo || readAsciiFixed(secInfo, 0x00, 8) !== 'CTR-SINF') {
      throw new Error('Missing or corrupt /rw/sys/SecureInfo_A');
    }
    const regionByte = secInfo[0x100];
    const secRegion: 'USA' | 'EUR' | 'JPN' =
      regionByte === 0x00 ? 'JPN' : regionByte === 0x02 ? 'EUR' : 'USA';
    const secSerial = readAsciiFixed(secInfo, 0x101, 15) || 'CW70492184';

    const lfcsBytes = fat.files.get('/rw/sys/LocalFriendCodeSeed_B');
    if (!lfcsBytes || readAsciiFixed(lfcsBytes, 0x00, 4) !== 'LFCS') {
      throw new Error('Missing or corrupt /rw/sys/LocalFriendCodeSeed_B');
    }
    const lfcsHex = bytesToHex(lfcsBytes.subarray(0x100, 0x110));

    const movableBytes = fat.files.get('/private/movable.sed');
    if (!movableBytes || readAsciiFixed(movableBytes, 0x00, 4) !== 'SEED') {
      throw new Error('Missing or corrupt /private/movable.sed');
    }
    const movableSedKeyHex = bytesToHex(movableBytes.subarray(0x110, 0x120));
    const movableMeta = JSON.parse(decodeUtf8(movableBytes.subarray(0x120))) as {
      id0: string;
      id1: string;
    };

    const configBytes = fat.files.get('/rw/sys/config.json');
    if (!configBytes) throw new Error('Missing /rw/sys/config.json');
    const rawConfig = JSON.parse(decodeUtf8(configBytes)) as SystemConfig;

    const config: SystemConfig = {
      ...rawConfig,
      region: rawConfig.region ?? secRegion,
      serialNumber: rawConfig.serialNumber ?? secSerial,
      language: rawConfig.language ?? 'en',
      identity: {
        id0: movableMeta.id0,
        id1: movableMeta.id1,
        movableSedKeyHex,
        secureInfoRegionByte: rawConfig.region ?? secRegion,
        secureInfoSerial: rawConfig.serialNumber ?? secSerial,
        localFriendCodeSeedHex: lfcsHex,
      },
    };

    // 2. Parse /dbs/*.db
    const titleDb = parseTaggedDbFile<TitleDatabaseEntry[]>(
      fat.files.get('/dbs/title.db'),
      'TDB0',
      '/dbs/title.db'
    );
    const importDb = parseTaggedDbFile<TitleDatabaseEntry[]>(
      fat.files.get('/dbs/import.db'),
      'IDB0',
      '/dbs/import.db'
    );
    const ticketDb = parseTaggedDbFile<TitleTicket[]>(
      fat.files.get('/dbs/ticket.db'),
      'TIKD',
      '/dbs/ticket.db'
    );
    const certsDb = parseTaggedDbFile<CertChainEntry[]>(
      fat.files.get('/dbs/certs.db'),
      'CERT',
      '/dbs/certs.db'
    );

    // 3. Reconstruct OS & Applet TitlePackages + SystemTitleEntry[] directly from /title/<High>/<Low>/content/
    const contentBuckets = new Map<
      string,
      { tmd?: TitleMetadataTmd; apps: NcchAppFile[]; pkgMeta?: Omit<TitlePackage, 'tmd' | 'apps'>; applet?: SystemTitleEntry }
    >();

    for (const [path, fileBytes] of fat.files.entries()) {
      const m = /^\/title\/([0-9A-Fa-f]{8})\/([0-9A-Fa-f]{8})\/content\/(.+)$/.exec(path);
      if (!m) continue;
      const tidKey = `${m[1].toUpperCase()}${m[2].toUpperCase()}`;
      let bucket = contentBuckets.get(tidKey);
      if (!bucket) {
        bucket = { apps: [] };
        contentBuckets.set(tidKey, bucket);
      }
      const fname = m[3];
      if (fname.endsWith('.tmd')) {
        bucket.tmd = parseTaggedDbFile<TitleMetadataTmd>(fileBytes, 'TMD0', path);
      } else if (fname.endsWith('.app')) {
        if (fileBytes.byteLength < 0x200 || readAsciiFixed(fileBytes, 0x100, 4) !== 'NCCH') {
          throw new Error(`Invalid NCCH magic inside ${path}`);
        }
        const body = fileBytes.subarray(0x200);
        if (computeCRC32(body) !== readUint32LE(fileBytes, 0x188)) {
          throw new Error(`NCCH payload CRC32 mismatch inside ${path}`);
        }
        const parsedApp = JSON.parse(decodeUtf8(body)) as {
          app: NcchAppFile;
          packageMeta: Omit<TitlePackage, 'tmd' | 'apps'>;
          appletEntry?: SystemTitleEntry;
        };
        bucket.apps.push(parsedApp.app);
        if (!bucket.pkgMeta) bucket.pkgMeta = parsedApp.packageMeta;
        if (parsedApp.appletEntry) bucket.applet = parsedApp.appletEntry;
      }
    }

    const packages: TitlePackage[] = [];
    const titles: SystemTitleEntry[] = [];
    for (const bucket of contentBuckets.values()) {
      if (bucket.tmd && bucket.pkgMeta) {
        bucket.apps.sort((a, b) => a.contentIndex - b.contentIndex);
        packages.push({
          ...bucket.pkgMeta,
          tmd: bucket.tmd,
          apps: bucket.apps,
        });
      }
      if (bucket.applet && (bucket.applet.appletId as string) !== 'nand-tool') {
        titles.push(bucket.applet);
      }
    }
    if (packages.length === 0) {
      throw new Error('CTRNAND FAT16 /title/ directory contains zero valid title packages');
    }

    // 4. Parse /data/<ID0>/ User SysData & ExtData
    const dataRoot = `/data/${movableMeta.id0}`;
    const homeFile = fat.files.get(`${dataRoot}/sysdata/00010017/home.json`);
    const activityFile = fat.files.get(`${dataRoot}/sysdata/00010022/activity.json`);
    const notesFile = fat.files.get(`${dataRoot}/extdata/00000000/notes.json`);
    const miisFile = fat.files.get(`${dataRoot}/extdata/00000217/miis.json`);
    const audioGameFile = fat.files.get(`${dataRoot}/extdata/0000055d/audio_game.json`);

    if (!homeFile || !activityFile || !notesFile || !miisFile || !audioGameFile) {
      throw new Error(`Missing user data archives under ${dataRoot}`);
    }

    const homeJson = JSON.parse(decodeUtf8(homeFile)) as {
      homeMenuTitleId: string;
      sharedFontHash: string;
      slots: UserSaveData['slots'];
      folders: UserSaveData['folders'];
      sysdataArchives: string[];
    };
    const activity = JSON.parse(decodeUtf8(activityFile)) as UserSaveData['activity'];
    const notesJson = JSON.parse(decodeUtf8(notesFile)) as {
      notes: UserSaveData['notes'];
      extdataArchives: string[];
    };
    const miis = JSON.parse(decodeUtf8(miisFile)) as UserSaveData['miis'];
    const audioGameJson = JSON.parse(decodeUtf8(audioGameFile)) as {
      synthPattern: number[];
      cartridgeHighScore: number;
      nandFsMeta: CtrNandArchiveData['nandFsMeta'];
    };

    const userData: UserSaveData = {
      slots: homeJson.slots.map((slot) =>
        slot.type === 'app' && (slot.appletId as string) === 'nand-tool' ? { type: 'empty' } : slot
      ),
      folders: homeJson.folders,
      notes: notesJson.notes,
      activity,
      miis,
      synthPattern: audioGameJson.synthPattern,
      cartridgeHighScore: audioGameJson.cartridgeHighScore,
      sysdataArchives: homeJson.sysdataArchives,
      extdataArchives: notesJson.extdataArchives,
    };

    const archive: CtrNandArchiveData = {
      homeMenuTitleId: homeJson.homeMenuTitleId,
      sharedFontHash: homeJson.sharedFontHash,
      titles,
      packages,
      dbs: { titleDb, importDb, ticketDb, certsDb },
      nandFsMeta: audioGameJson.nandFsMeta,
    };

    return {
      ok: true,
      magic: fat.filesystemType,
      data: { config, archive, userData },
    };
  } catch (err) {
    return {
      ok: false,
      magic: fat.filesystemType,
      reason: err instanceof Error ? err.message : 'Failed reading CTRNAND FAT16 files',
    };
  }
}

export interface NcsdPartitionTableEntry {
  index: number;
  partitionId: PartitionId;
  offsetMu: number;
  lengthMu: number;
  fsType: number;
  cryptType: number;
}

export interface TwlMbrEntry {
  name: 'TWLN' | 'TWLP';
  filesystem: 'FAT16' | 'FAT12';
  typeByte: number;
  startLba: number;
  sectorCount: number;
}

/**
 * Builds the authentic 3DS NAND NCSD Header in Sector 0 (0x000..0x1FF):
 *  - 0x000..0x0FF (256B): RSA-2048 signature over 0x100..0x1FF (Sim Boot9 NAND Key)
 *  - 0x100..0x103 (4B):   "NCSD" magic
 *  - 0x104..0x107 (4B):   Total NAND size in 0x200-byte media units (0x2000 = 4.00 MB image)
 *  - 0x108..0x10F (8B):   Media ID = 0 (all zeros for NAND)
 *  - 0x110..0x117 (8B):   FS-Type table [0x01=TWL, 0x04=AGBSAVE, 0x03=FIRM0, 0x03=FIRM1, 0x01=CTRNAND, 0, 0, 0]
 *  - 0x118..0x11F (8B):   Crypt-Type table [0x01=TWL, 0x02=CTR, 0x02, 0x02, 0x02, 0, 0, 0]
 *  - 0x120..0x15F (64B):  8-entry (offset_mu, length_mu) partition table in media units
 *  - 0x160..0x1BD (94B):  Zeroed reserved bytes
 *  - 0x1BE..0x1FF (66B):  AES-128-CTR encrypted TWL MBR (Keyslot 0x03 + TWL CID CTR):
 *                           - Entry 0: TWLN (FAT16, type 0x06, LBA 32..767)
 *                           - Entry 1: TWLP (FAT12, type 0x01, LBA 768..1023)
 *                           - 0x1FE..0x1FF: 0x55 0xAA boot signature (encrypted inside MBR!)
 */
export async function buildNcsdHeader(): Promise<Uint8Array> {
  const size = getPartitionByteSize('ncsd_hdr');
  const buf = new Uint8Array(size);
  const musPerChunk = CHUNK_SIZE / MEDIA_UNIT_SIZE; // 32 media units per 16 KB chunk

  // 0x100: Magic & total media units
  writeAsciiFixed(buf, 0x100, 'NCSD', 4);
  writeUint32LE(buf, 0x104, TOTAL_CHUNKS * musPerChunk); // 0x2000 MU (4.00 MB)
  // 0x108..0x10F remains 0 (Media ID = 0 for NAND)

  // 0x110..0x117: FS-type table, 0x118..0x11F: Crypt-type table, 0x120..0x15F: (offset, len) in MU
  const ncsdSpecs = NAND_PARTITIONS.filter((p) => p.ncsdIndex !== undefined).sort(
    (a, b) => (a.ncsdIndex ?? 0) - (b.ncsdIndex ?? 0)
  );

  for (const spec of ncsdSpecs) {
    const idx = spec.ncsdIndex!;
    buf[0x110 + idx] = spec.ncsdFsType ?? 0;
    buf[0x118 + idx] = spec.ncsdCryptType ?? 0;
    // NCSD[0] (TWL) starts at LBA 0 (0x0) spanning chunks 0..31 (0x400 MU)
    const offsetMu = spec.id === 'twl_nand' ? 0 : spec.startChunk * musPerChunk;
    const endChunk = spec.endChunk;
    const lengthMu =
      spec.id === 'twl_nand'
        ? (endChunk + 1) * musPerChunk
        : (endChunk - spec.startChunk + 1) * musPerChunk;
    writeUint32LE(buf, 0x120 + idx * 8, offsetMu);
    writeUint32LE(buf, 0x120 + idx * 8 + 4, lengthMu);
  }

  // 0x1BE..0x1FF (66 bytes): Plaintext TWL MBR -> encrypted with Keyslot 0x03 + TWL CID CTR!
  const mbrPlain = new Uint8Array(66);
  // Entry 0 (TWLN FAT16, type 0x06): chunks 1..23 -> LBA 32, len 736 sectors
  mbrPlain[0x04] = 0x06; // FAT16
  writeUint32LE(mbrPlain, 0x08, 32);
  writeUint32LE(mbrPlain, 0x0c, 23 * musPerChunk);
  // Entry 1 (TWLP FAT12, type 0x01): chunks 24..31 -> LBA 768, len 256 sectors
  mbrPlain[0x10 + 0x04] = 0x01; // FAT12
  writeUint32LE(mbrPlain, 0x10 + 0x08, 24 * musPerChunk);
  writeUint32LE(mbrPlain, 0x10 + 0x0c, 8 * musPerChunk);
  // Authentic MBR boot signature 0x55 0xAA at 0x1FE..0x1FF (relative offset 64..65 in mbrPlain)
  mbrPlain[64] = 0x55;
  mbrPlain[65] = 0xaa;

  const mbrEncrypted = await cryptTwlMbrBytes(mbrPlain);
  buf.set(mbrEncrypted, 0x1be);

  // Sign 0x100..0x1FF (authentic 256-byte NCSD header body) into 0x000..0x0FF
  const sigBytes = await signRsa2048(buf.slice(0x100, 0x200));
  buf.set(sigBytes, 0x00);

  // Fill remainder of Chunk 0 (0x200..0x3FFF) with erased flash (0xFF) plus a compact readable map at 0x200
  buf.fill(0xff, 0x200);
  writeReadableSection(buf, 0x200, size, [
    '=== CTR-SIM eMMC NCSD PARTITION MAP (Sector 0 @ 0x000..0x1FF) ===',
    `NAND_CID: ${getNandCidHex().toUpperCase()}`,
    `NCSD Signed Range: 0x100..0x1FF (SIM_BOOT9_NAND_KEY) | TWL MBR: 0x1BE..0x1FF (Keyslot 0x03)`,
    ...NAND_PARTITIONS.filter((p) => p.id !== 'ncsd_hdr').map(
      (p) =>
        `  NCSD[${p.ncsdIndex}] ${p.name.padEnd(8)} | Sim: ch ${String(p.startChunk).padStart(3)}..${String(p.endChunk).padStart(3)} (0x${(p.startChunk * CHUNK_SIZE).toString(16).padStart(6, '0')}) | Real Old3DS: ${p.realOffsetHex} (${p.realSizeHex}) | ${p.keyslotHex}`
    ),
  ]);

  return buf;
}

export async function parseNcsdHeader(
  buf: Uint8Array
): Promise<
  | {
      ok: true;
      magic: string;
      totalMediaUnits: number;
      entries: NcsdPartitionTableEntry[];
      mbrEntries: TwlMbrEntry[];
    }
  | { ok: false; magic: string; reason: string }
> {
  if (buf.byteLength < 0x200) {
    return { ok: false, magic: '', reason: 'Sector 0 truncated (< 512 bytes)' };
  }

  // 1. Verify RSA-2048 signature at 0x000..0x0FF over exact NCSD header body 0x100..0x1FF
  const signature = buf.slice(0x00, 0x100);
  const signedBody = buf.slice(0x100, 0x200);
  const rsaValid = await verifyRsa2048(signature, signedBody);
  if (!rsaValid) {
    return {
      ok: false,
      magic: readAsciiFixed(buf, 0x100, 4),
      reason: 'Boot9 RSA-2048 signature verification failed over 0x100..0x1FF',
    };
  }

  // 2. Validate NCSD magic & Media Units
  const magic = readAsciiFixed(buf, 0x100, 4);
  if (magic !== 'NCSD') {
    return {
      ok: false,
      magic,
      reason: `NCSD magic missing at 0x100 (expected "NCSD", found "${magic || '0x0000'}")`,
    };
  }

  const musPerChunk = CHUNK_SIZE / MEDIA_UNIT_SIZE;
  const expectedMus = TOTAL_CHUNKS * musPerChunk;
  const totalMediaUnits = readUint32LE(buf, 0x104);
  if (totalMediaUnits !== expectedMus) {
    return {
      ok: false,
      magic,
      reason: `Invalid NCSD media unit count (${totalMediaUnits}, expected ${expectedMus})`,
    };
  }

  // 3. Parse 8-entry FS-Type (0x110), Crypt-Type (0x118), and (offset, length) table (0x120..0x15F)
  const expectedOrder: PartitionId[] = ['twl_nand', 'agbsave', 'firm0', 'firm1', 'ctrnand'];
  const entries: NcsdPartitionTableEntry[] = [];
  for (let i = 0; i < 5; i++) {
    const pid = expectedOrder[i];
    const spec = NAND_PARTITIONS.find((p) => p.id === pid)!;
    const offsetMu = readUint32LE(buf, 0x120 + i * 8);
    const lengthMu = readUint32LE(buf, 0x120 + i * 8 + 4);
    const fsType = buf[0x110 + i];
    const cryptType = buf[0x118 + i];
    const expOff = pid === 'twl_nand' ? 0 : spec.startChunk * musPerChunk;
    const expLen =
      pid === 'twl_nand'
        ? (spec.endChunk + 1) * musPerChunk
        : (spec.endChunk - spec.startChunk + 1) * musPerChunk;
    if (offsetMu !== expOff || lengthMu !== expLen || fsType !== spec.ncsdFsType) {
      return {
        ok: false,
        magic,
        reason: `NCSD[${i}] geometry/FS mismatch for ${spec.name}`,
      };
    }
    entries.push({ index: i, partitionId: pid, offsetMu, lengthMu, fsType, cryptType });
  }

  // 4. Decrypt encrypted TWL MBR at 0x1BE..0x1FF using Keyslot 0x03 + TWL CID CTR & verify 0x55 0xAA at 0x1FE
  const mbrEncrypted = buf.slice(0x1be, 0x200);
  const mbrPlain = await cryptTwlMbrBytes(mbrEncrypted);
  if (mbrPlain[64] !== 0x55 || mbrPlain[65] !== 0xaa) {
    return {
      ok: false,
      magic,
      reason: `TWL MBR decrypt/signature fault at 0x1FE (got 0x${mbrPlain[64].toString(16)}${mbrPlain[65].toString(16)}, expected 0x55AA — wrong NAND CID or Keyslot 0x03)`,
    };
  }

  const mbrEntries: TwlMbrEntry[] = [
    {
      name: 'TWLN',
      filesystem: 'FAT16',
      typeByte: mbrPlain[0x04],
      startLba: readUint32LE(mbrPlain, 0x08),
      sectorCount: readUint32LE(mbrPlain, 0x0c),
    },
    {
      name: 'TWLP',
      filesystem: 'FAT12',
      typeByte: mbrPlain[0x10 + 0x04],
      startLba: readUint32LE(mbrPlain, 0x10 + 0x08),
      sectorCount: readUint32LE(mbrPlain, 0x10 + 0x0c),
    },
  ];

  return { ok: true, magic, totalMediaUnits, entries, mbrEntries };
}

