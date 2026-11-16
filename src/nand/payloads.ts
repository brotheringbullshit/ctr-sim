import {
  CertChainEntry,
  CHUNK_SIZE,
  ConsoleIdentityFiles,
  CtrNandArchiveData,
  NAND_PARTITIONS,
  PartitionId,
  SystemConfig,
  SystemTitleEntry,
  TitleCategoryHigh,
  TitleDatabaseEntry,
  TitlePackage,
  TitleTicket,
  UserSaveData,
  Stage1Opcode,
  BootStage2Header,
} from './types';
import {
  computeCRC32,
  computeSHA256Hex,
  decodeUtf8,
  encodeUtf8,
  readAsciiFixed,
  readUint32LE,
  signRsa2048,
  verifyRsa2048,
  writeAsciiFixed,
  writeUint32LE,
} from './crypto';

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
    magic: 'STG2',
    kernelVersion: 'NATIVE_FIRM 2.58-0 (Kernel9 / Kernel11)',
    buildTag: 'HORIZON-OS-11.17.0-50U',
    autobootTitleId: '0004003000008F02', // Real USA HOME Menu Title ID
    arm9Entry: '0x08006000',
    arm11Entry: '0x1FF80000',
    sysmodules: ['Process9', 'pm', 'sm', 'fs', 'pxi', 'NS', 'ErrDisp'],
    mountEntries: [
      { mount: 'nand:/sys/', partition: 'twl_sysdata', required: true },
      { mount: 'ctrnand:/title/', partition: 'ctrnand_sys', required: true },
      { mount: 'nand:/data/', partition: 'nand_userdata', required: false },
    ],
  };
}

// Helper: build a tagged binary partition buffer with header + CRC32 + JSON payload + structured filler
function buildTaggedBinary(magic: string, totalSize: number, payloadObj: unknown, fillerSeed: number): Uint8Array {
  const buf = new Uint8Array(totalSize);
  const payloadBytes = encodeUtf8(JSON.stringify(payloadObj));

  // Header layout (32 bytes):
  // 0x00..0x03: Magic (4 bytes)
  // 0x04..0x07: Format Version (1)
  // 0x08..0x0B: Payload Byte Length
  // 0x0C..0x0F: Payload CRC32
  // 0x10..0x1F: Partition Signature Tag
  if (0x20 + payloadBytes.length > totalSize) {
    throw new Error(`Payload for ${magic} exceeds partition size (${payloadBytes.length} > ${totalSize})`);
  }

  writeAsciiFixed(buf, 0x00, magic, 4);
  writeUint32LE(buf, 0x04, 1);
  writeUint32LE(buf, 0x08, payloadBytes.length);
  writeUint32LE(buf, 0x0c, computeCRC32(payloadBytes));
  writeAsciiFixed(buf, 0x10, `CTR_${magic}_OK`, 16);

  buf.set(payloadBytes, 0x20);

  // Fill remaining space with deterministic binary pattern (looks authentic in Hex Viewer)
  let x = (fillerSeed * 2654435761) >>> 0;
  for (let i = 0x20 + payloadBytes.length; i < totalSize; i++) {
    if (i > totalSize - 4096) {
      buf[i] = 0xff; // erased NAND flash tail
    } else {
      x = (1664525 * x + 1013904223) >>> 0;
      buf[i] = (x >>> 24) & 0xff;
    }
  }
  return buf;
}

export function parseTaggedBinary<T>(buf: Uint8Array, expectedMagic: string): { ok: true; data: T; magic: string } | { ok: false; magic: string; reason: string } {
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

export function buildFirm0Partition(opcodes = getDefaultStage1Opcodes()): Uint8Array {
  const size = getPartitionByteSize('firm0_boot1');
  return buildTaggedBinary(
    'FIRM',
    size,
    {
      arm9Entry: '0x08006000',
      arm11Entry: '0x1FF80000',
      splVersion: 'BOOT9-FIRM-LOADER-1.4',
      opcodes,
    },
    101
  );
}

export function parseFirm0Partition(buf: Uint8Array) {
  return parseTaggedBinary<{
    arm9Entry: string;
    arm11Entry: string;
    splVersion: string;
    opcodes: Stage1Opcode[];
  }>(buf, 'FIRM');
}

export function buildFirm1Partition(header = getDefaultStage2Header()): Uint8Array {
  const size = getPartitionByteSize('firm1_stage2');
  return buildTaggedBinary('STG2', size, header, 202);
}

export function parseFirm1Partition(buf: Uint8Array) {
  return parseTaggedBinary<BootStage2Header>(buf, 'STG2');
}

export function buildSysDataPartition(config = getDefaultSystemConfig()): Uint8Array {
  const size = getPartitionByteSize('twl_sysdata');
  return buildTaggedBinary('CFG0', size, config, 303);
}

export function parseSysDataPartition(buf: Uint8Array) {
  const parsed = parseTaggedBinary<SystemConfig>(buf, 'CFG0');
  if (parsed.ok) {
    if (!parsed.data.language) parsed.data.language = 'en';
    if (!parsed.data.identity) {
      parsed.data.identity = getDefaultConsoleIdentity(parsed.data.region, parsed.data.serialNumber);
    } else {
      parsed.data.identity.secureInfoRegionByte = parsed.data.region;
      parsed.data.identity.secureInfoSerial = parsed.data.serialNumber;
    }
  }
  return parsed;
}

export function buildCtrNandPartition(
  archive: CtrNandArchiveData = getDefaultCtrNandArchive()
): Uint8Array {
  const size = getPartitionByteSize('ctrnand_sys');
  return buildTaggedBinary('CND0', size, archive, 404);
}

export function parseCtrNandPartition(buf: Uint8Array) {
  const parsed = parseTaggedBinary<CtrNandArchiveData>(buf, 'CND0');
  if (parsed.ok) {
    parsed.data.titles = (parsed.data.titles ?? []).filter(
      (t) => (t.appletId as string) !== 'nand-tool'
    );
    // Auto-hydrate older v2 CTRNAND payloads lacking full packages/dbs
    if (!parsed.data.packages || !parsed.data.dbs || !parsed.data.nandFsMeta) {
      const defaults = getDefaultCtrNandArchive(
        parsed.data.titles.length > 0 ? parsed.data.titles : getDefaultSystemTitles()
      );
      parsed.data.packages = parsed.data.packages ?? defaults.packages;
      parsed.data.dbs = parsed.data.dbs ?? defaults.dbs;
      parsed.data.nandFsMeta = parsed.data.nandFsMeta ?? defaults.nandFsMeta;
    }
  }
  return parsed;
}

export function buildUserDataPartition(saveData = getDefaultUserSaveData()): Uint8Array {
  const size = getPartitionByteSize('nand_userdata');
  return buildTaggedBinary('USR0', size, saveData, 505);
}

export function parseUserDataPartition(buf: Uint8Array) {
  const parsed = parseTaggedBinary<UserSaveData>(buf, 'USR0');
  if (parsed.ok) {
    // Strip legacy nand-tool references from previously formatted IndexedDB saves
    parsed.data.slots = parsed.data.slots.map((slot) =>
      slot.type === 'app' && (slot.appletId as string) === 'nand-tool' ? { type: 'empty' } : slot
    );
    for (const folder of Object.values(parsed.data.folders)) {
      folder.items = folder.items.filter((id) => (id as string) !== 'nand-tool');
    }
    delete parsed.data.activity['nand-tool'];
    if (!parsed.data.sysdataArchives) {
      parsed.data.sysdataArchives = ['00010017 (HOME)', '00010022 (Activity)', '00010026 (CECD)'];
    }
    if (!parsed.data.extdataArchives) {
      parsed.data.extdataArchives = ['0000008f (HOME Cache)', '00000217 (Mii Plaza)', '00000000 (Notes)'];
    }
  }
  return parsed;
}

export interface NcsdPartitionRecord {
  id: PartitionId;
  startChunk: number;
  endChunk: number;
  sha256: string;
}

/**
 * Builds the authentic NCSD Master Header in Sector 0.
 * Offset 0x000..0x0FF: Real 256-byte RSA-2048 signature over the partition table (0x100..0x4FF).
 * Offset 0x100..0x103: Magic "NCSD"
 * Offset 0x104..0x107: Total NAND size in chunks (256)
 * Offset 0x108..0x11F: Media ID & Serial
 * Offset 0x120..0x123: Header CRC32
 * Offset 0x130..0x4FF: 5 Encrypted Partition Records (startChunk, endChunk, SHA-256 of encrypted bytes)
 */
export async function buildNcsdHeader(
  partitionBuffers: Record<Exclude<PartitionId, 'ncsd_hdr'>, Uint8Array>
): Promise<Uint8Array> {
  const size = getPartitionByteSize('ncsd_hdr');
  const buf = new Uint8Array(size);

  // 0x100: NCSD magic
  writeAsciiFixed(buf, 0x100, 'NCSD', 4);
  writeUint32LE(buf, 0x104, 256); // 256 chunks
  writeUint32LE(buf, 0x108, CHUNK_SIZE); // 16384 bytes
  writeAsciiFixed(buf, 0x10c, 'CTR-001-VIRTUAL', 20);

  const orderedIds: Array<Exclude<PartitionId, 'ncsd_hdr'>> = [
    'firm0_boot1',
    'firm1_stage2',
    'twl_sysdata',
    'ctrnand_sys',
    'nand_userdata',
  ];

  let entryOffset = 0x130;
  for (const id of orderedIds) {
    const spec = NAND_PARTITIONS.find((p) => p.id === id)!;
    const hashHex = await computeSHA256Hex(partitionBuffers[id]);
    writeAsciiFixed(buf, entryOffset, id, 16);
    writeUint32LE(buf, entryOffset + 16, spec.startChunk);
    writeUint32LE(buf, entryOffset + 20, spec.endChunk);
    writeAsciiFixed(buf, entryOffset + 24, hashHex, 64);
    entryOffset += 96;
  }

  // CRC32 over partition table 0x130..0x500
  const tableCrc = computeCRC32(buf.slice(0x130, 0x500));
  writeUint32LE(buf, 0x120, tableCrc);

  buf[0x5fe] = 0x55;
  buf[0x5ff] = 0xaa;

  // Real RSA-2048 signing: Sign the partition table 0x100..0x500 using the Root CA Private Key
  const sigBytes = await signRsa2048(buf.slice(0x100, 0x500));
  buf.set(sigBytes, 0x00);

  return buf;
}

export async function buildNcsdHeaderFromHashes(
  hashes: Record<Exclude<PartitionId, 'ncsd_hdr'>, string>
): Promise<Uint8Array> {
  const size = getPartitionByteSize('ncsd_hdr');
  const buf = new Uint8Array(size);

  writeAsciiFixed(buf, 0x100, 'NCSD', 4);
  writeUint32LE(buf, 0x104, 256);
  writeUint32LE(buf, 0x108, CHUNK_SIZE);
  writeAsciiFixed(buf, 0x10c, 'CTR-001-VIRTUAL', 20);

  const orderedIds: Array<Exclude<PartitionId, 'ncsd_hdr'>> = [
    'firm0_boot1',
    'firm1_stage2',
    'twl_sysdata',
    'ctrnand_sys',
    'nand_userdata',
  ];

  let entryOffset = 0x130;
  for (const id of orderedIds) {
    const spec = NAND_PARTITIONS.find((p) => p.id === id)!;
    const hashHex = hashes[id] || '0'.repeat(64);
    writeAsciiFixed(buf, entryOffset, id, 16);
    writeUint32LE(buf, entryOffset + 16, spec.startChunk);
    writeUint32LE(buf, entryOffset + 20, spec.endChunk);
    writeAsciiFixed(buf, entryOffset + 24, hashHex, 64);
    entryOffset += 96;
  }

  const tableCrc = computeCRC32(buf.slice(0x130, 0x500));
  writeUint32LE(buf, 0x120, tableCrc);

  buf[0x5fe] = 0x55;
  buf[0x5ff] = 0xaa;

  const sigBytes = await signRsa2048(buf.slice(0x100, 0x500));
  buf.set(sigBytes, 0x00);

  return buf;
}

export async function parseNcsdHeader(
  buf: Uint8Array
): Promise<{ ok: true; magic: string; records: Record<string, NcsdPartitionRecord> } | { ok: false; magic: string; reason: string }> {
  // Validate real RSA-2048 signature in first 256 bytes over partition table (0x100..0x500)
  const signature = buf.slice(0x00, 0x100);
  const signedData = buf.slice(0x100, 0x500);
  const rsaValid = await verifyRsa2048(signature, signedData);
  if (!rsaValid) {
    return {
      ok: false,
      magic: readAsciiFixed(buf, 0x100, 4),
      reason: 'Boot9 RSA-2048 signature verification failed (root trust chain broken)',
    };
  }

  const magic = readAsciiFixed(buf, 0x100, 4);
  if (magic !== 'NCSD') {
    return {
      ok: false,
      magic,
      reason: `NCSD magic missing at 0x100 (expected "NCSD", found "${magic || '0x0000'}")`,
    };
  }
  const chunkCount = readUint32LE(buf, 0x104);
  if (chunkCount !== 256) {
    return {
      ok: false,
      magic,
      reason: `Invalid NAND chunk geometry in NCSD header (${chunkCount} chunks)`,
    };
  }
  const storedCrc = readUint32LE(buf, 0x120);
  const actualCrc = computeCRC32(buf.slice(0x130, 0x500));
  if (storedCrc !== actualCrc) {
    return {
      ok: false,
      magic,
      reason: `NCSD partition table CRC32 mismatch (0x${actualCrc.toString(16).toUpperCase()} != 0x${storedCrc.toString(16).toUpperCase()})`,
    };
  }

  const records: Record<string, NcsdPartitionRecord> = {};
  let entryOffset = 0x130;
  for (let i = 0; i < 5; i++) {
    const id = readAsciiFixed(buf, entryOffset, 16) as PartitionId;
    const startChunk = readUint32LE(buf, entryOffset + 16);
    const endChunk = readUint32LE(buf, entryOffset + 20);
    const sha256 = readAsciiFixed(buf, entryOffset + 24, 64);
    records[id] = { id, startChunk, endChunk, sha256 };
    entryOffset += 96;
  }

  return { ok: true, magic, records };
}
