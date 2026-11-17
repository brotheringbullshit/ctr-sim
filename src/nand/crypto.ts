import { CHUNK_SIZE, DataPartitionId, NAND_PARTITIONS, PartitionId } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeUtf8(str: string): Uint8Array {
  return textEncoder.encode(str);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes).replace(/\0+$/, '');
}

export function writeAsciiFixed(buf: Uint8Array, offset: number, text: string, length: number): void {
  const encoded = textEncoder.encode(text);
  for (let i = 0; i < length; i++) {
    buf[offset + i] = i < encoded.length ? encoded[i] : 0;
  }
}

export function readAsciiFixed(buf: Uint8Array, offset: number, length: number): string {
  const slice = buf.slice(offset, offset + length);
  let end = slice.length;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) {
      end = i;
      break;
    }
  }
  return textDecoder.decode(slice.slice(0, end));
}

export function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint32(offset, value >>> 0, true);
}

export function readUint32LE(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getUint32(offset, true);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Standard IEEE 802.3 CRC32 (used ONLY internally inside custom sim partition records, never in NCSD_HDR)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCRC32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function computeSHA256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', copy.buffer);
  return new Uint8Array(hashBuffer);
}

export async function computeSHA256Hex(data: Uint8Array): Promise<string> {
  return bytesToHex(await computeSHA256Bytes(data));
}

/* ==================== CONSOLE-UNIQUE NAND CID & AES-128-CTR NONCE DERIVATION ==================== */

// Fallback CID until provisioned / hydrated from IndexedDB
const DEFAULT_FALLBACK_CID = new Uint8Array([
  0x15, 0x01, 0x00, 0x34, 0x46, 0x34, 0x41, 0x45,
  0x42, 0x03, 0x9a, 0x71, 0xc4, 0x20, 0x0f, 0x8d,
]);

let activeNandCid = new Uint8Array(DEFAULT_FALLBACK_CID);

export function getNandCidBytes(): Uint8Array {
  return new Uint8Array(activeNandCid);
}

export function getNandCidHex(): string {
  return bytesToHex(activeNandCid);
}

export function setNandCid(cidBytes: Uint8Array): void {
  if (cidBytes.byteLength !== 16) {
    throw new Error('NAND CID must be exactly 16 bytes (128-bit)');
  }
  activeNandCid = new Uint8Array(cidBytes);
}

export function generateFreshNandCid(): Uint8Array {
  const cid = new Uint8Array(16);
  crypto.getRandomValues(cid);
  // Keep Samsung/Toshiba eMMC manufacturer prefix style
  cid[0] = 0x15;
  cid[1] = 0x01;
  activeNandCid = cid;
  return new Uint8Array(cid);
}

/**
 * Adds a 16-byte AES block delta (byteOffset >>> 4) to a big-endian 128-bit CTR counter.
 */
function addBlocksToCtr128BE(ctr16: Uint8Array, blockDelta: number): Uint8Array {
  const out = new Uint8Array(ctr16);
  let carry = blockDelta >>> 0;
  for (let i = 15; i >= 0 && carry > 0; i--) {
    const sum = out[i] + (carry & 0xff);
    out[i] = sum & 0xff;
    carry = (carry >>> 8) + (sum >>> 8);
  }
  return out;
}

/**
 * Real 3DS NAND CTR nonce derivation:
 * Normal 3DS CTR nonce = SHA-256(NAND_CID)[0..15] + (byteOffset >>> 4)
 * TWL MBR / TWL partition CTR nonce = byte-reversed SHA-256(NAND_CID)[0..15] + (byteOffset >>> 4)
 */
async function derivePartitionCounter(byteOffset: number, twlMode: boolean): Promise<Uint8Array> {
  const cidDigest = await computeSHA256Bytes(activeNandCid);
  const base16 = cidDigest.subarray(0, 16);
  const counterBase = new Uint8Array(16);
  if (twlMode) {
    for (let i = 0; i < 16; i++) {
      counterBase[i] = base16[15 - i];
    }
  } else {
    counterBase.set(base16);
  }
  return addBlocksToCtr128BE(counterBase, byteOffset >>> 4);
}

/* ==================== 3DS HARDWARE AES-128 KEYSLOTS (KEY ONLY — NONCE COMES FROM CID) ==================== */

export interface KeyslotInfo {
  slot: number;
  slotHex: string;
  name: string;
  keyBytes: Uint8Array;
}

export const CTR_KEYSLOTS: Record<DataPartitionId, KeyslotInfo> = {
  twl_nand: {
    slot: 0x03,
    slotHex: '0x03',
    name: 'TWL eMMC / MBR Keyslot',
    keyBytes: new Uint8Array([
      0x5a, 0x8a, 0x24, 0x6e, 0x13, 0x9b, 0x77, 0x50,
      0x38, 0xef, 0x48, 0x62, 0x8d, 0xa1, 0x99, 0xb4,
    ]),
  },
  agbsave: {
    slot: 0x07,
    slotHex: '0x07',
    name: 'AGBSAVE VC Keyslot',
    keyBytes: new Uint8Array([
      0x7a, 0x35, 0x88, 0xc0, 0x22, 0xb1, 0x49, 0xd4,
      0x96, 0x10, 0x5f, 0xa3, 0xd9, 0x1c, 0x63, 0x88,
    ]),
  },
  firm0: {
    slot: 0x06,
    slotHex: '0x06',
    name: 'NATIVE_FIRM Keyslot',
    keyBytes: new Uint8Array([
      0xd0, 0x7b, 0x33, 0x7f, 0x9d, 0x43, 0xec, 0x49,
      0x59, 0xfc, 0x92, 0xdc, 0x14, 0x86, 0x91, 0x16,
    ]),
  },
  firm1: {
    slot: 0x06,
    slotHex: '0x06',
    name: 'NATIVE_FIRM Keyslot',
    keyBytes: new Uint8Array([
      0xd0, 0x7b, 0x33, 0x7f, 0x9d, 0x43, 0xec, 0x49,
      0x59, 0xfc, 0x92, 0xdc, 0x14, 0x86, 0x91, 0x16,
    ]),
  },
  ctrnand: {
    slot: 0x04,
    slotHex: '0x04',
    name: 'Old3DS CTRNAND FAT16 Keyslot',
    keyBytes: new Uint8Array([
      0xce, 0xe2, 0x8e, 0x00, 0x77, 0x6c, 0x4e, 0xa0,
      0x07, 0x7d, 0x9e, 0xc1, 0x41, 0x7d, 0x74, 0xe0,
    ]),
  },
};

export type PartitionKeyOverrideMap = Partial<Record<DataPartitionId, Uint8Array>>;

const DEFAULT_CTR_KEYS: Record<DataPartitionId, Uint8Array> = {
  twl_nand: new Uint8Array(CTR_KEYSLOTS.twl_nand.keyBytes),
  agbsave: new Uint8Array(CTR_KEYSLOTS.agbsave.keyBytes),
  firm0: new Uint8Array(CTR_KEYSLOTS.firm0.keyBytes),
  firm1: new Uint8Array(CTR_KEYSLOTS.firm1.keyBytes),
  ctrnand: new Uint8Array(CTR_KEYSLOTS.ctrnand.keyBytes),
};

const DATA_PARTITION_IDS: DataPartitionId[] = ['twl_nand', 'agbsave', 'firm0', 'firm1', 'ctrnand'];

export interface CtrKeyBundle {
  format: 'CTR-SIM-KEYBUNDLE-V2';
  exportedAt: string;
  nandCidHex: string;
  nonceDerivation: 'SHA-256(NAND_CID)[0..15] + (byteOffset >>> 4)';
  aesKeyslots: Record<
    DataPartitionId,
    {
      slot: number;
      slotHex: string;
      name: string;
      keyHex: string;
      mode: 'TWL-CID-CTR' | '3DS-CID-CTR';
    }
  >;
  simBoot9NandPublicJwk: JsonWebKey;
  rsaKeyNote: string;
}

export function areKeyslotsDefault(): boolean {
  return DATA_PARTITION_IDS.every(
    (id) => bytesToHex(CTR_KEYSLOTS[id].keyBytes) === bytesToHex(DEFAULT_CTR_KEYS[id])
  );
}

export function applyKeyslotOverrides(overrides: PartitionKeyOverrideMap, cidBytes?: Uint8Array): void {
  for (const id of DATA_PARTITION_IDS) {
    const nextKey = overrides[id];
    if (nextKey && nextKey.byteLength === 16) {
      CTR_KEYSLOTS[id].keyBytes = new Uint8Array(nextKey);
    }
  }
  if (cidBytes && cidBytes.byteLength === 16) {
    setNandCid(cidBytes);
  }
  aesKeyCache.clear();
}

export function resetDefaultKeyslots(): void {
  applyKeyslotOverrides(DEFAULT_CTR_KEYS);
}

export function exportCtrKeyBundle(): CtrKeyBundle {
  return {
    format: 'CTR-SIM-KEYBUNDLE-V2',
    exportedAt: new Date().toISOString(),
    nandCidHex: getNandCidHex(),
    nonceDerivation: 'SHA-256(NAND_CID)[0..15] + (byteOffset >>> 4)',
    aesKeyslots: {
      twl_nand: {
        slot: CTR_KEYSLOTS.twl_nand.slot,
        slotHex: CTR_KEYSLOTS.twl_nand.slotHex,
        name: CTR_KEYSLOTS.twl_nand.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.twl_nand.keyBytes),
        mode: 'TWL-CID-CTR',
      },
      agbsave: {
        slot: CTR_KEYSLOTS.agbsave.slot,
        slotHex: CTR_KEYSLOTS.agbsave.slotHex,
        name: CTR_KEYSLOTS.agbsave.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.agbsave.keyBytes),
        mode: '3DS-CID-CTR',
      },
      firm0: {
        slot: CTR_KEYSLOTS.firm0.slot,
        slotHex: CTR_KEYSLOTS.firm0.slotHex,
        name: CTR_KEYSLOTS.firm0.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.firm0.keyBytes),
        mode: '3DS-CID-CTR',
      },
      firm1: {
        slot: CTR_KEYSLOTS.firm1.slot,
        slotHex: CTR_KEYSLOTS.firm1.slotHex,
        name: CTR_KEYSLOTS.firm1.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.firm1.keyBytes),
        mode: '3DS-CID-CTR',
      },
      ctrnand: {
        slot: CTR_KEYSLOTS.ctrnand.slot,
        slotHex: CTR_KEYSLOTS.ctrnand.slotHex,
        name: CTR_KEYSLOTS.ctrnand.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.ctrnand.keyBytes),
        mode: '3DS-CID-CTR',
      },
    },
    simBoot9NandPublicJwk: { ...SIM_BOOT9_NAND_PUB_JWK },
    rsaKeyNote:
      'Simulator Boot9 NAND-specific RSA-2048 keypair (distinct from Gamecard ITCM key; Nintendo production private key is unavailable).',
  };
}

/**
 * Exports a compact 184-byte binary keyslot + CID bundle (aeskeydb.bin):
 * 8-byte header ("KEY1", count=5) + 16-byte NAND CID + 5 × 32-byte records [partitionId(15), slot(1), key(16)]
 */
export function exportAesKeyDbBinary(): Uint8Array {
  const out = new Uint8Array(24 + DATA_PARTITION_IDS.length * 32);
  writeAsciiFixed(out, 0, 'KEY1', 4);
  writeUint32LE(out, 4, DATA_PARTITION_IDS.length);
  out.set(activeNandCid.subarray(0, 16), 8);
  DATA_PARTITION_IDS.forEach((id, idx) => {
    const off = 24 + idx * 32;
    const slotInfo = CTR_KEYSLOTS[id];
    writeAsciiFixed(out, off, id, 15);
    out[off + 15] = slotInfo.slot & 0xff;
    out.set(slotInfo.keyBytes.subarray(0, 16), off + 16);
  });
  return out;
}

export function parseKeyBundleFile(bytes: Uint8Array): {
  nandCid?: Uint8Array;
  keyOverrides: PartitionKeyOverrideMap;
} {
  const headerMagic = readAsciiFixed(bytes, 0, 4);
  if (headerMagic === 'KEY1' && bytes.byteLength >= 24 + 32) {
    const count = Math.min(readUint32LE(bytes, 4), 16);
    const nandCid = bytes.slice(8, 24);
    const validIds = new Set<DataPartitionId>(DATA_PARTITION_IDS);
    const keyOverrides: PartitionKeyOverrideMap = {};
    for (let i = 0; i < count; i++) {
      const off = 24 + i * 32;
      if (off + 32 > bytes.byteLength) break;
      const partId = readAsciiFixed(bytes, off, 15) as DataPartitionId;
      if (validIds.has(partId)) {
        keyOverrides[partId] = bytes.slice(off + 16, off + 32);
      }
    }
    if (Object.keys(keyOverrides).length === 0) {
      throw new Error('No recognized partition keyslots inside KEY1 aeskeydb.bin');
    }
    return { nandCid, keyOverrides };
  }

  const text = textDecoder.decode(bytes);
  const parsed = JSON.parse(text) as Partial<CtrKeyBundle>;
  if (!parsed || parsed.format !== 'CTR-SIM-KEYBUNDLE-V2' || !parsed.aesKeyslots) {
    throw new Error('Unrecognized keyfile format (expected CTR-SIM-KEYBUNDLE-V2 JSON or KEY1 aeskeydb.bin)');
  }
  const keyOverrides: PartitionKeyOverrideMap = {};
  for (const id of DATA_PARTITION_IDS) {
    const entry = parsed.aesKeyslots[id];
    if (entry?.keyHex) {
      const keyBytes = hexToBytes(entry.keyHex);
      if (keyBytes.byteLength !== 16) {
        throw new Error(`Invalid 128-bit key length for ${id}`);
      }
      keyOverrides[id] = keyBytes;
    }
  }
  const nandCid = parsed.nandCidHex ? hexToBytes(parsed.nandCidHex) : undefined;
  if (nandCid && nandCid.byteLength !== 16) {
    throw new Error('Invalid NAND CID length in keyfile (expected 16 bytes)');
  }
  if (Object.keys(keyOverrides).length === 0) {
    throw new Error('Keyfile did not contain any valid partition keyslots');
  }
  return { nandCid, keyOverrides };
}

// Cached CryptoKey objects for high-throughput block operations
const aesKeyCache = new Map<string, CryptoKey>();

async function getAesCtrKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const cacheKey = Array.from(rawKey).join(',');
  let existing = aesKeyCache.get(cacheKey);
  if (!existing) {
    const copy = new Uint8Array(rawKey.byteLength);
    copy.set(rawKey);
    existing = await crypto.subtle.importKey(
      'raw',
      copy.buffer,
      { name: 'AES-CTR' },
      false,
      ['encrypt', 'decrypt']
    );
    aesKeyCache.set(cacheKey, existing);
  }
  return existing;
}

/**
 * Real Web Crypto AES-128-CTR execution.
 * Because CTR is symmetric (XOR with cipher keystream), encrypt and decrypt are mathematically identical.
 */
export async function cryptAesCtr(
  data: Uint8Array,
  keyBytes: Uint8Array,
  counter: Uint8Array
): Promise<Uint8Array> {
  const key = await getAesCtrKey(keyBytes);
  const counterCopy = new Uint8Array(counter.byteLength);
  counterCopy.set(counter);
  const dataCopy = new Uint8Array(data.byteLength);
  dataCopy.set(data);

  const res = await crypto.subtle.encrypt(
    {
      name: 'AES-CTR',
      counter: counterCopy.buffer,
      length: 64,
    },
    key,
    dataCopy.buffer
  );

  return new Uint8Array(res);
}

/**
 * Encrypts/decrypts the 66-byte TWL MBR at Sector 0 offset 0x1BE..0x1FF using Keyslot 0x03 + TWL CID CTR.
 * Preserves exact 14-byte offset alignment inside AES block 0x1B (0x1B0..0x1BF).
 */
export async function cryptTwlMbrBytes(mbr66: Uint8Array): Promise<Uint8Array> {
  if (mbr66.byteLength !== 66) {
    throw new Error(`TWL MBR must be 66 bytes (0x1BE..0x1FF), got ${mbr66.byteLength}`);
  }
  const counter = await derivePartitionCounter(0x1b0, true);
  const padded = new Uint8Array(14 + 66);
  padded.set(mbr66, 14);
  const outPadded = await cryptAesCtr(padded, CTR_KEYSLOTS.twl_nand.keyBytes, counter);
  return outPadded.slice(14);
}

export async function encryptPartition(id: PartitionId, plaintext: Uint8Array): Promise<Uint8Array> {
  if (id === 'ncsd_hdr') return plaintext;
  const spec = NAND_PARTITIONS.find((p) => p.id === id)!;
  const startByte = spec.startChunk * CHUNK_SIZE;
  const counter = await derivePartitionCounter(startByte, id === 'twl_nand');
  return cryptAesCtr(plaintext, CTR_KEYSLOTS[id].keyBytes, counter);
}

export async function decryptPartition(id: PartitionId, ciphertext: Uint8Array): Promise<Uint8Array> {
  return encryptPartition(id, ciphertext);
}

/* ==================== SIMULATED BOOT9 NAND-SPECIFIC RSA-2048 SIGNING ==================== */
/**
 * NOTE: On retail 3DS hardware, Boot9/Process9 verifies NAND NCSD signatures (0x100..0x1FF)
 * using Nintendo's dedicated NAND public key (separate from the Gamecard RSA key in ITCM).
 * Since Nintendo's private key is confidential, this simulator uses a local Boot9 NAND
 * RSA-2048 keypair (`SIM_BOOT9_NAND_KEY`) over the authentic 256-byte range `0x100..0x1FF`.
 */
const SIM_BOOT9_NAND_PUB_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  alg: 'RS256',
  kty: 'RSA',
  n: '8x2zm2oHMbmgJH8dOiU5um0D53BMGCvj_OUPr6ky63Lc45PQg6rYv87YXgjJB1ntDkHQHc_Q5vDDUY1DiZVw_QgD7jV3CmMS--hQ70xO_6HLj58gBX7u_wVot0oLheU6sG-ydr0yjPIQb5sz6Y98Fdd--ni1k2IiHj2rXYP0ZRj9D6gjEwwm0UdFKbDzjuFBXJQ43rcatY1ez4197Z7ABTvrafQtU8K8qVsflh4R1djA3i63g1jNn2aatp8BF4C8JdsdRkvq4KLpiaB5GjG8S-XCIVZbMHi-iVQA5zQRGL2ht9YW0FemTHqh8v20eJLKcPNTePXuzeKHieVK5ss_AQ',
  e: 'AQAB',
};

const SIM_BOOT9_NAND_PRIV_JWK: JsonWebKey = {
  key_ops: ['sign'],
  ext: true,
  alg: 'RS256',
  kty: 'RSA',
  n: '8x2zm2oHMbmgJH8dOiU5um0D53BMGCvj_OUPr6ky63Lc45PQg6rYv87YXgjJB1ntDkHQHc_Q5vDDUY1DiZVw_QgD7jV3CmMS--hQ70xO_6HLj58gBX7u_wVot0oLheU6sG-ydr0yjPIQb5sz6Y98Fdd--ni1k2IiHj2rXYP0ZRj9D6gjEwwm0UdFKbDzjuFBXJQ43rcatY1ez4197Z7ABTvrafQtU8K8qVsflh4R1djA3i63g1jNn2aatp8BF4C8JdsdRkvq4KLpiaB5GjG8S-XCIVZbMHi-iVQA5zQRGL2ht9YW0FemTHqh8v20eJLKcPNTePXuzeKHieVK5ss_AQ',
  e: 'AQAB',
  d: 'D9oLbczrhtVSI58QLPbkEouXehM15aDoVC3WqH778s3XU5Vok_U4qG-tvEU5X7Eq25z0m2-t8NOZAKvD0BLo6O60BuerM90C4173TABp6ZFx9ZLhYnUE01GrIsGsClZzIwbywtA88ri5KUscMZST-X6cE8EkIbsqe1X3uE4UH4qcMi_S-kBfiGL1tEoxCGy4pAVsxTFnnghUYglVTeguaBxFdRbYRiQ5Nr4SqwcwO4RGcE-1E35k7Ds-8GZA0TLBahmyZID0G5CIWJosIyuhS7YBryW8-NN06gZ7keyGc78RTG9z0PlISjO4OgEPbOBfwDitqi0Zo8o0v8sH13IY4w',
  p: '_jqmaGA4QEaeHaDsEfolliCaO-fAgZFd-4iM_HG0KszIlrH8bAsZvEB6LHS9vThut3zJKoecNFMw4bPQm0i_BATbDnGSbEboeefWq71Io_awQj9U6nfdp0hNrJB_N_dS1lWOWlvl7ASzu5mzH4CiYlpx5i_XREoyqJPgXWvdkZM',
  q: '9M87_Zywvz7036YXNNZRYworIDQ1n6KdnW1CvpOZ4xML-_tv1xyEfvLuYnb26l1NKc5NUHvDcYLBswBbwmO3JgpEp2LyeJasrCG451AVgmkpEyOmeMPXzc6V0zsh-raMfY1jtVwvbs5pSWT8fr8EkXgZ5DaSeH9Ib6kentTYWZs',
  dp: 'gWm3pfA9EjMgb_Kn2SreEUL9YDtD2nD2R4GmSydSUGs4PMXTuegYrKShzJmMsJLWgV7rRFQN5vDmNC6FpVZtrg0OuZaEs8uQseWbeIb9QEHmTYLRph1oXqxGpe5UZFfo-iRJN6QKMY_fMkM2VHX1s11ZF5UI3sFqcjf8gXHUMzM',
  dq: '3CEkPm4Q-EbyBdDheR9l23qfQLvxo_OjapV-uMMcUvUjh5eV_4WjFkv3Uw7KA_-VjQv2tXI0UfNTnVOrLuZfH5OIHEN66DgEWFuSWlzGmpdY2d7qqBjiCivCyUeYzEotlg_3InMcK7TrM5Xc_VNiFjQ6g90WY8eAKPeXkxas3BU',
  qi: 'lQ-so_KjDLW_VO8G8PRfYz3F5a6jXaQQFuPlM-SoPhU5TzylzT62UpnjEjYKpTqHPBw0WJeI1qARqR-jzjhq28HQaU9MC9sB_fNc1gEDVjBZdddF6-E12aWvqzZ7Hao3BWbRZJmqVTOV9iamiC_giTdncCmBq2liYMR6CD_1ozI',
};

let cachedRsaPubKey: CryptoKey | null = null;
let cachedRsaPrivKey: CryptoKey | null = null;

async function getRsaPubKey(): Promise<CryptoKey> {
  if (!cachedRsaPubKey) {
    cachedRsaPubKey = await crypto.subtle.importKey(
      'jwk',
      SIM_BOOT9_NAND_PUB_JWK,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  }
  return cachedRsaPubKey;
}

async function getRsaPrivKey(): Promise<CryptoKey> {
  if (!cachedRsaPrivKey) {
    cachedRsaPrivKey = await crypto.subtle.importKey(
      'jwk',
      SIM_BOOT9_NAND_PRIV_JWK,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return cachedRsaPrivKey;
}

export async function signRsa2048(data: Uint8Array): Promise<Uint8Array> {
  const privKey = await getRsaPrivKey();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privKey, copy.buffer);
  return new Uint8Array(sigBuffer);
}

export async function verifyRsa2048(signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  if (signature.byteLength !== 256) return false;
  try {
    const pubKey = await getRsaPubKey();
    const sigCopy = new Uint8Array(signature.byteLength);
    sigCopy.set(signature);
    const dataCopy = new Uint8Array(data.byteLength);
    dataCopy.set(data);
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      pubKey,
      sigCopy.buffer,
      dataCopy.buffer
    );
  } catch {
    return false;
  }
}
