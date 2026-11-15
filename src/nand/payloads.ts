import {
  CHUNK_SIZE,
  NAND_PARTITIONS,
  PartitionId,
  SystemConfig,
  SystemTitleEntry,
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
    autobootHome: true,
    showSplashBanner: true,
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
      titleId: '000400000F800100',
      appletId: 'nand-tool',
      shortName: 'CTR-NAND Tool',
      fullName: 'CTR-NAND System Inspector',
      publisher: 'Boot9Sys',
      version: 'v2.4.0',
      accentColor: '#6366f1',
      secondaryColor: '#e0e7ff',
      chimeFreqs: [349.23, 440, 523.25, 698.46],
      blocks: 42,
      description: 'Inspect mounted nand:/ and ctrnand:/ partitions, SHA-256 digests, and hex sectors.',
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
      { type: 'app', appletId: 'nand-tool' },
      { type: 'app', appletId: 'browser' },
      { type: 'folder', folderId: 'fld-sys' },
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
        items: ['nand-tool', 'system-settings', 'browser'],
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
      'nand-tool': { appletId: 'nand-tool', launchCount: 1, totalSeconds: 94, lastPlayed: '2026-11-15' },
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
  const buf = buildTaggedBinary(
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
  writeAsciiFixed(buf, 0x1800, 'FIRM_RSA2048_SIG\0ARM9_KERNEL9_08006000\0ARM11_KERNEL11_1FF80000', 80);
  return buf;
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
  const buf = buildTaggedBinary('STG2', size, header, 202);
  writeAsciiFixed(
    buf,
    0x2000,
    'KERNEL9_OTP_LOCK_PROCESS9\0KERNEL11_PM_SM_FS_PXI\0NS_ERRDISP_HOME_0004003000008F02',
    96
  );
  return buf;
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
  if (parsed.ok && !parsed.data.language) {
    parsed.data.language = 'en';
  }
  return parsed;
}

export function buildCtrNandPartition(titles = getDefaultSystemTitles()): Uint8Array {
  const size = getPartitionByteSize('ctrnand_sys');
  const buf = buildTaggedBinary(
    'CND0',
    size,
    {
      homeMenuTitleId: '0004003000008F02',
      sharedFontHash: '7a9e31c4f02b',
      titles,
    },
    404
  );
  writeAsciiFixed(buf, 0x4000, 'CTR_HOME_MENU_ROMFS\0SHARED_FONT_CBFNT\0APPLET_BANNER_ARCHIVE', 64);
  return buf;
}

export function parseCtrNandPartition(buf: Uint8Array) {
  return parseTaggedBinary<{
    homeMenuTitleId: string;
    sharedFontHash: string;
    titles: SystemTitleEntry[];
  }>(buf, 'CND0');
}

export function buildUserDataPartition(saveData = getDefaultUserSaveData()): Uint8Array {
  const size = getPartitionByteSize('nand_userdata');
  return buildTaggedBinary('USR0', size, saveData, 505);
}

export function parseUserDataPartition(buf: Uint8Array) {
  return parseTaggedBinary<UserSaveData>(buf, 'USR0');
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
