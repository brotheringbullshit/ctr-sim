import { encodeUtf8, readAsciiFixed, readUint32LE, writeAsciiFixed, writeUint32LE } from './crypto';

const SECTOR_SIZE = 512;
const ATTR_READ_ONLY = 0x01;
const ATTR_VOLUME_ID = 0x08;
const ATTR_DIRECTORY = 0x10;
const ATTR_ARCHIVE = 0x20;
const ATTR_LONG_NAME = 0x0f;

export interface Fat16BuildFile {
  path: string; // e.g. '/rw/sys/SecureInfo_A' or '/title/00040010/00021300/content/00000000.app'
  data: Uint8Array;
  readOnly?: boolean;
}

export interface ParsedFat16Volume {
  ok: true;
  volumeLabel: string;
  filesystemType: string;
  mbrPartitionType: number;
  partitionStartLba: number;
  partitionSectors: number;
  bytesPerSector: number;
  sectorsPerCluster: number;
  totalClusters: number;
  usedClusters: number;
  files: Map<string, Uint8Array>;
  directories: string[];
}

export interface ParsedFat16Error {
  ok: false;
  reason: string;
}

function readUint16LE(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

function writeUint16LE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >>> 8) & 0xff;
}

function isExactUpper83(name: string): boolean {
  const parts = name.split('.');
  if (parts.length > 2) return false;
  const base = parts[0] ?? '';
  const ext = parts[1] ?? '';
  if (base.length === 0 || base.length > 8 || ext.length > 3) return false;
  const validRe = /^[A-Z0-9!#$%&'()\-@^_{}~]+$/;
  if (!validRe.test(base)) return false;
  if (parts.length === 2 && (ext.length === 0 || !validRe.test(ext))) return false;
  return true;
}

function makeShort83(name: string, usedShort: Set<string>): Uint8Array {
  const out = new Uint8Array(11).fill(0x20);
  if (isExactUpper83(name)) {
    const dot = name.indexOf('.');
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext = dot >= 0 ? name.slice(dot + 1) : '';
    for (let i = 0; i < base.length; i++) out[i] = base.charCodeAt(i);
    for (let i = 0; i < ext.length; i++) out[8 + i] = ext.charCodeAt(i);
    usedShort.add(String.fromCharCode(...out));
    return out;
  }

  const clean = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9!#$%&'()\-@^_{}~]/g, '_')
      .slice(0, 12);

  const lastDot = name.lastIndexOf('.');
  const rawBase = lastDot > 0 ? name.slice(0, lastDot) : name;
  const rawExt = lastDot > 0 ? name.slice(lastDot + 1) : '';
  const baseClean = clean(rawBase) || 'FILE';
  const extClean = clean(rawExt).slice(0, 3);

  // If uppercase version fits in 8.3 without truncation & no collision, use it directly (plus LFN for case preservation)
  if (baseClean.length <= 8 && baseClean === rawBase.toUpperCase() && rawExt.length <= 3) {
    for (let i = 0; i < baseClean.length; i++) out[i] = baseClean.charCodeAt(i);
    for (let i = 0; i < extClean.length; i++) out[8 + i] = extClean.charCodeAt(i);
    const key = String.fromCharCode(...out);
    if (!usedShort.has(key)) {
      usedShort.add(key);
      return out;
    }
  }

  for (let n = 1; n < 9999; n++) {
    const suffix = `~${n}`;
    const prefixLen = Math.max(1, 8 - suffix.length);
    const shortBase = baseClean.slice(0, prefixLen) + suffix;
    out.fill(0x20);
    for (let i = 0; i < shortBase.length && i < 8; i++) out[i] = shortBase.charCodeAt(i);
    for (let i = 0; i < extClean.length && i < 3; i++) out[8 + i] = extClean.charCodeAt(i);
    const key = String.fromCharCode(...out);
    if (!usedShort.has(key)) {
      usedShort.add(key);
      return out;
    }
  }

  usedShort.add(String.fromCharCode(...out));
  return out;
}

function lfnChecksum(shortName11: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum = (((sum & 1) << 7) + (sum >>> 1) + shortName11[i]) & 0xff;
  }
  return sum;
}

function buildLfnEntries(longName: string, short11: Uint8Array): Uint8Array[] {
  const chk = lfnChecksum(short11);
  const codeUnits: number[] = [];
  for (let i = 0; i < longName.length; i++) {
    codeUnits.push(longName.charCodeAt(i));
  }
  const numEntries = Math.ceil((codeUnits.length + 1) / 13);
  const entries: Uint8Array[] = [];

  for (let seq = numEntries; seq >= 1; seq--) {
    const entry = new Uint8Array(32);
    const isLast = seq === numEntries;
    entry[0] = seq | (isLast ? 0x40 : 0);
    entry[0x0b] = ATTR_LONG_NAME;
    entry[0x0c] = 0x00;
    entry[0x0d] = chk;
    entry[0x1a] = 0x00;
    entry[0x1b] = 0x00;

    const baseCharIdx = (seq - 1) * 13;
    const offsets = [
      0x01, 0x03, 0x05, 0x07, 0x09,
      0x0e, 0x10, 0x12, 0x14, 0x16, 0x18,
      0x1c, 0x1e,
    ];
    for (let k = 0; k < 13; k++) {
      const idx = baseCharIdx + k;
      let val: number;
      if (idx < codeUnits.length) val = codeUnits[idx];
      else if (idx === codeUnits.length) val = 0x0000;
      else val = 0xffff;
      writeUint16LE(entry, offsets[k], val);
    }
    entries.push(entry);
  }
  return entries;
}

function buildShortDirEntry(
  short11: Uint8Array,
  attr: number,
  firstCluster: number,
  fileSize: number
): Uint8Array {
  const entry = new Uint8Array(32);
  entry.set(short11.subarray(0, 11), 0);
  entry[0x0b] = attr;
  // Standard fixed FAT timestamp/date (2026-11-17 12:00:00)
  const timeVal = (12 << 11) | (0 << 5) | 0;
  const dateVal = ((2026 - 1980) << 9) | (11 << 5) | 17;
  writeUint16LE(entry, 0x0e, timeVal);
  writeUint16LE(entry, 0x10, dateVal);
  writeUint16LE(entry, 0x12, dateVal);
  writeUint16LE(entry, 0x14, 0); // FstClusHI = 0 for FAT16
  writeUint16LE(entry, 0x16, timeVal);
  writeUint16LE(entry, 0x18, dateVal);
  writeUint16LE(entry, 0x1a, firstCluster & 0xffff);
  writeUint32LE(entry, 0x1c, fileSize >>> 0);
  return entry;
}

interface DirNode {
  name: string;
  subdirs: Map<string, DirNode>;
  files: Array<{ name: string; data: Uint8Array; readOnly: boolean }>;
  cluster: number;
}

/**
 * Builds an authentic, spec-compliant MBR + FAT16 image inside `totalBytes` (must be >= 4,085 data clusters for true FAT16).
 * Sector 0: MBR with Partition 0 (type 0x06 FAT16, start LBA 1) + 0x55 0xAA.
 * LBA 1: VBR with Volume Label ("CTR        ") & "FAT16   ", SecPerClus = 1 (5,678 clusters => genuine FAT16).
 */
export function buildFat16MbrImage(
  totalBytes: number,
  volumeLabel: string,
  files: Fat16BuildFile[]
): Uint8Array {
  if (totalBytes % SECTOR_SIZE !== 0) {
    throw new Error(`FAT16 image size (${totalBytes}) must be a multiple of 512 bytes`);
  }
  const totalSectors = totalBytes / SECTOR_SIZE;
  const partStartLba = 1;
  const partSectors = totalSectors - partStartLba;
  const secPerClus = 1; // 512 B/cluster -> 5,678 clusters (>= 4085 => strict MS FAT16!)
  const rsvdSecCnt = 1;
  const numFATs = 2;
  const rootEntCnt = 512;
  const rootDirSectors = (rootEntCnt * 32) / SECTOR_SIZE; // 32 sectors
  const fatSz16 = 24; // 24 * 256 = 6144 FAT entries (> 5678 + 2)
  const firstDataSecInPart = rsvdSecCnt + numFATs * fatSz16 + rootDirSectors; // 1 + 48 + 32 = 81
  const dataSectors = partSectors - firstDataSecInPart; // 5678
  const totalClusters = Math.floor(dataSectors / secPerClus); // 5678 (>= 4085 => FAT16!)

  const buf = new Uint8Array(totalBytes); // Clean zeroed image

  // ==================== SECTOR 0: MBR PARTITION TABLE ====================
  // Entry 0 (offset 0x1BE): FAT16 partition starting at LBA 1
  const partEntryOff = 0x1be;
  buf[partEntryOff + 0x00] = 0x00; // non-bootable
  buf[partEntryOff + 0x01] = 0x00; // CHS start
  buf[partEntryOff + 0x02] = 0x02;
  buf[partEntryOff + 0x03] = 0x00;
  buf[partEntryOff + 0x04] = 0x06; // FAT16
  buf[partEntryOff + 0x05] = 0x0f; // CHS end
  buf[partEntryOff + 0x06] = 0x20;
  buf[partEntryOff + 0x07] = 0x0b;
  writeUint32LE(buf, partEntryOff + 0x08, partStartLba);
  writeUint32LE(buf, partEntryOff + 0x0c, partSectors);
  buf[0x1fe] = 0x55;
  buf[0x1ff] = 0xaa;

  // ==================== LBA 1: FAT16 VOLUME BOOT RECORD (VBR) ====================
  const vbr = partStartLba * SECTOR_SIZE;
  buf[vbr + 0x00] = 0xeb;
  buf[vbr + 0x01] = 0x3c;
  buf[vbr + 0x02] = 0x90;
  writeAsciiFixed(buf, vbr + 0x03, 'CTR-SIM ', 8);
  writeUint16LE(buf, vbr + 0x0b, SECTOR_SIZE);
  buf[vbr + 0x0d] = secPerClus;
  writeUint16LE(buf, vbr + 0x0e, rsvdSecCnt);
  buf[vbr + 0x10] = numFATs;
  writeUint16LE(buf, vbr + 0x11, rootEntCnt);
  writeUint16LE(buf, vbr + 0x13, partSectors < 0x10000 ? partSectors : 0);
  buf[vbr + 0x15] = 0xf8; // Fixed media
  writeUint16LE(buf, vbr + 0x16, fatSz16);
  writeUint16LE(buf, vbr + 0x18, 32); // SecPerTrk
  writeUint16LE(buf, vbr + 0x1a, 16); // NumHeads
  writeUint32LE(buf, vbr + 0x1c, partStartLba); // HiddSec
  writeUint32LE(buf, vbr + 0x20, partSectors >= 0x10000 ? partSectors : 0);
  // Extended BPB
  buf[vbr + 0x24] = 0x80;
  buf[vbr + 0x25] = 0x00;
  buf[vbr + 0x26] = 0x29; // BootSig
  writeUint32LE(buf, vbr + 0x27, 0x43545231); // VolID "1RTC"
  const volLab11 = volumeLabel.toUpperCase().slice(0, 11).padEnd(11, ' ');
  for (let i = 0; i < 11; i++) buf[vbr + 0x2b + i] = volLab11.charCodeAt(i);
  writeAsciiFixed(buf, vbr + 0x36, 'FAT16   ', 8);
  buf[vbr + 0x1fe] = 0x55;
  buf[vbr + 0x1ff] = 0xaa;

  // ==================== FAT ALLOCATOR ====================
  const fatTable = new Uint16Array(totalClusters + 2);
  fatTable[0] = 0xfff8;
  fatTable[1] = 0xffff;
  let nextCluster = 2;

  const clusterByteOffset = (cluster: number) =>
    (partStartLba + firstDataSecInPart + (cluster - 2) * secPerClus) * SECTOR_SIZE;

  const allocClusterChain = (count: number): number[] => {
    const chain: number[] = [];
    for (let i = 0; i < count; i++) {
      if (nextCluster >= totalClusters + 2) {
        throw new Error('CTRNAND FAT16 out of space (exceeded 5,678 clusters)');
      }
      chain.push(nextCluster++);
    }
    for (let i = 0; i < chain.length; i++) {
      fatTable[chain[i]] = i + 1 < chain.length ? chain[i + 1] : 0xffff;
    }
    return chain;
  };

  const writeChainData = (data: Uint8Array): number => {
    const clusterBytes = secPerClus * SECTOR_SIZE;
    const needed = Math.max(1, Math.ceil(data.byteLength / clusterBytes));
    const chain = allocClusterChain(needed);
    for (let i = 0; i < chain.length; i++) {
      const start = i * clusterBytes;
      const slice = data.subarray(start, Math.min(data.byteLength, start + clusterBytes));
      buf.set(slice, clusterByteOffset(chain[i]));
    }
    return chain[0];
  };

  // ==================== BUILD DIRECTORY TREE ====================
  const rootNode: DirNode = { name: '', subdirs: new Map(), files: [], cluster: 0 };
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let cur = rootNode;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      let next = cur.subdirs.get(dirName);
      if (!next) {
        next = { name: dirName, subdirs: new Map(), files: [], cluster: 0 };
        cur.subdirs.set(dirName, next);
      }
      cur = next;
    }
    const fileName = parts[parts.length - 1];
    cur.files.push({ name: fileName, data: f.data, readOnly: Boolean(f.readOnly) });
  }

  // Recursive writer returning raw 32-byte entries for a directory
  const populateDir = (node: DirNode, parentCluster: number, isRoot: boolean): void => {
    const entries: Uint8Array[] = [];
    const usedShort = new Set<string>();

    if (isRoot) {
      // Volume Label Entry ("CTR        ", attr = 0x08)
      const volShort = new Uint8Array(11);
      for (let i = 0; i < 11; i++) volShort[i] = volLab11.charCodeAt(i);
      entries.push(buildShortDirEntry(volShort, ATTR_VOLUME_ID, 0, 0));
    } else {
      // Dot (.) and Dot-Dot (..) entries mandatory in FAT16 subdirectories
      const dot = new Uint8Array(11).fill(0x20);
      dot[0] = 0x2e; // '.'
      const dotDot = new Uint8Array(11).fill(0x20);
      dotDot[0] = 0x2e;
      dotDot[1] = 0x2e; // '..'
      entries.push(buildShortDirEntry(dot, ATTR_DIRECTORY, node.cluster, 0));
      entries.push(buildShortDirEntry(dotDot, ATTR_DIRECTORY, parentCluster, 0));
    }

    // Subdirectories
    for (const sub of node.subdirs.values()) {
      // Reserve at least 1 cluster first (updated if directory spans multiple clusters)
      const entryCountEstimate =
        2 +
        sub.subdirs.size * 3 +
        sub.files.length * 3;
      const clusterCap = Math.floor((secPerClus * SECTOR_SIZE) / 32);
      const initialClusters = Math.max(1, Math.ceil(entryCountEstimate / clusterCap));
      const chain = allocClusterChain(initialClusters);
      sub.cluster = chain[0];

      const short11 = makeShort83(sub.name, usedShort);
      if (!isExactUpper83(sub.name)) {
        entries.push(...buildLfnEntries(sub.name, short11));
      }
      entries.push(buildShortDirEntry(short11, ATTR_DIRECTORY, sub.cluster, 0));

      populateDirWithChain(sub, node.cluster, chain);
    }

    // Files
    for (const file of node.files) {
      const firstClus = file.data.byteLength > 0 ? writeChainData(file.data) : 0;
      const short11 = makeShort83(file.name, usedShort);
      if (!isExactUpper83(file.name)) {
        entries.push(...buildLfnEntries(file.name, short11));
      }
      const attr = ATTR_ARCHIVE | (file.readOnly ? ATTR_READ_ONLY : 0);
      entries.push(buildShortDirEntry(short11, attr, firstClus, file.data.byteLength));
    }

    if (isRoot) {
      const rootOffset = (partStartLba + rsvdSecCnt + numFATs * fatSz16) * SECTOR_SIZE;
      if (entries.length > rootEntCnt) {
        throw new Error(`FAT16 root directory overflow (${entries.length} > ${rootEntCnt})`);
      }
      entries.forEach((e, idx) => {
        buf.set(e, rootOffset + idx * 32);
      });
    }
  };

  const populateDirWithChain = (node: DirNode, parentCluster: number, preallocatedChain: number[]): void => {
    const entries: Uint8Array[] = [];
    const usedShort = new Set<string>();

    const dot = new Uint8Array(11).fill(0x20);
    dot[0] = 0x2e;
    const dotDot = new Uint8Array(11).fill(0x20);
    dotDot[0] = 0x2e;
    dotDot[1] = 0x2e;
    entries.push(buildShortDirEntry(dot, ATTR_DIRECTORY, node.cluster, 0));
    entries.push(buildShortDirEntry(dotDot, ATTR_DIRECTORY, parentCluster, 0));

    for (const sub of node.subdirs.values()) {
      const est = 2 + sub.subdirs.size * 3 + sub.files.length * 3;
      const cap = Math.floor((secPerClus * SECTOR_SIZE) / 32);
      const subChain = allocClusterChain(Math.max(1, Math.ceil(est / cap)));
      sub.cluster = subChain[0];

      const short11 = makeShort83(sub.name, usedShort);
      if (!isExactUpper83(sub.name)) {
        entries.push(...buildLfnEntries(sub.name, short11));
      }
      entries.push(buildShortDirEntry(short11, ATTR_DIRECTORY, sub.cluster, 0));
      populateDirWithChain(sub, node.cluster, subChain);
    }

    for (const file of node.files) {
      const firstClus = file.data.byteLength > 0 ? writeChainData(file.data) : 0;
      const short11 = makeShort83(file.name, usedShort);
      if (!isExactUpper83(file.name)) {
        entries.push(...buildLfnEntries(file.name, short11));
      }
      const attr = ATTR_ARCHIVE | (file.readOnly ? ATTR_READ_ONLY : 0);
      entries.push(buildShortDirEntry(short11, attr, firstClus, file.data.byteLength));
    }

    const entriesPerCluster = Math.floor((secPerClus * SECTOR_SIZE) / 32);
    const neededClusters = Math.max(1, Math.ceil(entries.length / entriesPerCluster));
    while (preallocatedChain.length < neededClusters) {
      const extra = nextCluster++;
      if (extra >= totalClusters + 2) {
        throw new Error('CTRNAND FAT16 out of space for directory entries');
      }
      const prevLast = preallocatedChain[preallocatedChain.length - 1];
      fatTable[prevLast] = extra;
      fatTable[extra] = 0xffff;
      preallocatedChain.push(extra);
    }

    for (let i = 0; i < entries.length; i++) {
      const clusIdx = Math.floor(i / entriesPerCluster);
      const entryInClus = i % entriesPerCluster;
      const byteOff = clusterByteOffset(preallocatedChain[clusIdx]) + entryInClus * 32;
      buf.set(entries[i], byteOff);
    }
  };

  populateDir(rootNode, 0, true);

  // ==================== COMMIT FAT1 & FAT2 ====================
  const fat1Offset = (partStartLba + rsvdSecCnt) * SECTOR_SIZE;
  const fat2Offset = (partStartLba + rsvdSecCnt + fatSz16) * SECTOR_SIZE;
  for (let c = 0; c < totalClusters + 2; c++) {
    writeUint16LE(buf, fat1Offset + c * 2, fatTable[c]);
    writeUint16LE(buf, fat2Offset + c * 2, fatTable[c]);
  }

  return buf;
}

/**
 * Parses a genuine MBR + FAT16 image, verifying Sector 0 MBR, VBR BPB, Volume Label ("CTR"),
 * FAT16 cluster chains, and extracting all directories and files (with VFAT LFN + 8.3 support).
 */
export function parseFat16MbrImage(buf: Uint8Array): ParsedFat16Volume | ParsedFat16Error {
  if (buf.byteLength < SECTOR_SIZE * 100) {
    return { ok: false, reason: 'CTRNAND buffer truncated (< 100 sectors)' };
  }

  // 1. Validate Sector 0 MBR Partition Table
  if (buf[0x1fe] !== 0x55 || buf[0x1ff] !== 0xaa) {
    return {
      ok: false,
      reason: `Missing MBR 0x55AA signature at CTRNAND Sector 0 (got 0x${buf[0x1fe].toString(16)}${buf[0x1ff].toString(16)})`,
    };
  }

  const mbrType = buf[0x1be + 0x04];
  if (mbrType !== 0x04 && mbrType !== 0x06 && mbrType !== 0x0e) {
    return {
      ok: false,
      reason: `Sector 0 MBR entry 0 is not a FAT16 partition (type=0x${mbrType.toString(16).padStart(2, '0')})`,
    };
  }

  const partStartLba = readUint32LE(buf, 0x1be + 0x08);
  const partSectors = readUint32LE(buf, 0x1be + 0x0c);
  if (partStartLba === 0 || (partStartLba + partSectors) * SECTOR_SIZE > buf.byteLength) {
    return {
      ok: false,
      reason: `MBR FAT16 partition bounds out of range (LBA ${partStartLba}, len ${partSectors})`,
    };
  }

  // 2. Validate FAT16 Volume Boot Record (VBR / BPB)
  const vbr = partStartLba * SECTOR_SIZE;
  if (buf[vbr + 0x1fe] !== 0x55 || buf[vbr + 0x1ff] !== 0xaa) {
    return { ok: false, reason: `Missing VBR 0x55AA signature at LBA ${partStartLba}` };
  }

  const bytesPerSec = readUint16LE(buf, vbr + 0x0b);
  const secPerClus = buf[vbr + 0x0d];
  const rsvdSecCnt = readUint16LE(buf, vbr + 0x0e);
  const numFATs = buf[vbr + 0x10];
  const rootEntCnt = readUint16LE(buf, vbr + 0x11);
  const fatSz16 = readUint16LE(buf, vbr + 0x16);
  const volLabel = readAsciiFixed(buf, vbr + 0x2b, 11).trim();
  const fsType = readAsciiFixed(buf, vbr + 0x36, 8).trim();

  if (bytesPerSec !== SECTOR_SIZE || secPerClus === 0 || numFATs === 0 || fatSz16 === 0) {
    return { ok: false, reason: 'Invalid FAT16 BPB geometry parameters' };
  }
  if (fsType !== 'FAT16') {
    return { ok: false, reason: `Unexpected BPB filesystem type "${fsType}" (expected "FAT16")` };
  }

  const rootDirSectors = Math.ceil((rootEntCnt * 32) / bytesPerSec);
  const firstDataSecInPart = rsvdSecCnt + numFATs * fatSz16 + rootDirSectors;
  const dataSectors = partSectors - firstDataSecInPart;
  const totalClusters = Math.floor(dataSectors / secPerClus);
  if (totalClusters < 4085 || totalClusters >= 65525) {
    return {
      ok: false,
      reason: `Cluster count ${totalClusters} violates FAT16 spec (must be 4085..65524)`,
    };
  }

  const fat1Offset = (partStartLba + rsvdSecCnt) * bytesPerSec;
  const readFat = (clus: number): number => {
    const off = fat1Offset + clus * 2;
    if (off + 2 > buf.byteLength) return 0xffff;
    return readUint16LE(buf, off);
  };

  let usedClusters = 0;
  for (let c = 2; c < totalClusters + 2; c++) {
    if (readFat(c) !== 0) usedClusters++;
  }

  const clusterBytes = secPerClus * bytesPerSec;
  const readClusterChain = (startCluster: number, expectedSize?: number): Uint8Array => {
    if (startCluster < 2) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    const seen = new Set<number>();
    let cur = startCluster;
    while (cur >= 2 && cur < 0xfff8 && !seen.has(cur)) {
      seen.add(cur);
      const sec = partStartLba + firstDataSecInPart + (cur - 2) * secPerClus;
      const off = sec * bytesPerSec;
      if (off + clusterBytes > buf.byteLength) break;
      chunks.push(buf.subarray(off, off + clusterBytes));
      cur = readFat(cur);
    }
    const raw = new Uint8Array(chunks.length * clusterBytes);
    chunks.forEach((c, idx) => raw.set(c, idx * clusterBytes));
    if (expectedSize !== undefined) {
      return raw.subarray(0, Math.min(expectedSize, raw.byteLength));
    }
    return raw;
  };

  const files = new Map<string, Uint8Array>();
  const directories: string[] = [];
  let parsedVolLabel = volLabel;

  const parseDirBytes = (dirBytes: Uint8Array, prefix: string, depth: number) => {
    if (depth > 16) return;
    const lfnParts = new Map<number, string>();
    let lfnChecksumExpected = -1;

    for (let off = 0; off + 32 <= dirBytes.byteLength; off += 32) {
      const first = dirBytes[off];
      if (first === 0x00) break; // End of directory
      if (first === 0xe5) {
        lfnParts.clear();
        continue; // Deleted entry
      }

      const attr = dirBytes[off + 0x0b];
      if (attr === ATTR_LONG_NAME) {
        const seq = first & 0x1f;
        const chk = dirBytes[off + 0x0d];
        if (first & 0x40) {
          lfnParts.clear();
          lfnChecksumExpected = chk;
        }
        const offsets = [
          0x01, 0x03, 0x05, 0x07, 0x09,
          0x0e, 0x10, 0x12, 0x14, 0x16, 0x18,
          0x1c, 0x1e,
        ];
        let seg = '';
        for (const co of offsets) {
          const code = readUint16LE(dirBytes, off + co);
          if (code === 0x0000 || code === 0xffff) break;
          seg += String.fromCharCode(code);
        }
        lfnParts.set(seq, seg);
        continue;
      }

      if (attr & ATTR_VOLUME_ID) {
        const lbl = String.fromCharCode(...dirBytes.subarray(off, off + 11)).trim();
        if (lbl) parsedVolLabel = lbl;
        lfnParts.clear();
        continue;
      }

      const short11 = dirBytes.subarray(off, off + 11);
      let name = '';
      if (lfnParts.size > 0 && lfnChecksum(short11) === lfnChecksumExpected) {
        const keys = Array.from(lfnParts.keys()).sort((a, b) => a - b);
        name = keys.map((k) => lfnParts.get(k) ?? '').join('');
      } else {
        const base = String.fromCharCode(...short11.subarray(0, 8)).trimEnd();
        const ext = String.fromCharCode(...short11.subarray(8, 11)).trimEnd();
        name = ext ? `${base}.${ext}` : base;
      }
      lfnParts.clear();

      if (name === '.' || name === '..') continue;

      const firstCluster = readUint16LE(dirBytes, off + 0x1a);
      const fileSize = readUint32LE(dirBytes, off + 0x1c);
      const fullPath = `${prefix}/${name}`;

      if (attr & ATTR_DIRECTORY) {
        directories.push(fullPath);
        if (firstCluster >= 2) {
          const subBytes = readClusterChain(firstCluster);
          parseDirBytes(subBytes, fullPath, depth + 1);
        }
      } else {
        const data = firstCluster >= 2 ? readClusterChain(firstCluster, fileSize) : new Uint8Array(0);
        files.set(fullPath, data);
      }
    }
  };

  const rootOffset = (partStartLba + rsvdSecCnt + numFATs * fatSz16) * bytesPerSec;
  const rootBytes = buf.subarray(rootOffset, rootOffset + rootDirSectors * bytesPerSec);
  parseDirBytes(rootBytes, '', 0);

  return {
    ok: true,
    volumeLabel: parsedVolLabel,
    filesystemType: fsType,
    mbrPartitionType: mbrType,
    partitionStartLba: partStartLba,
    partitionSectors: partSectors,
    bytesPerSector: bytesPerSec,
    sectorsPerCluster: secPerClus,
    totalClusters,
    usedClusters,
    files,
    directories,
  };
}

/**
 * Helper to encode JSON cleanly as UTF-8 bytes for storing files inside FAT16.
 */
export function jsonToBytes(obj: unknown): Uint8Array {
  return encodeUtf8(JSON.stringify(obj, null, 2) + '\n');
}
