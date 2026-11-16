import { PartitionId } from './types';

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

// Standard IEEE 802.3 CRC32 table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
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

export async function computeSHA256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', copy.buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ==================== 3DS AES-128-CTR HARDWARE KEYSLOTS ==================== */

export interface KeyslotInfo {
  slot: number;
  slotHex: string;
  name: string;
  keyBytes: Uint8Array;
  initialCounter: Uint8Array;
}

// Standard 3DS 128-bit keyslots & partition counter seeds
export const CTR_KEYSLOTS: Record<Exclude<PartitionId, 'ncsd_hdr'>, KeyslotInfo> = {
  firm0_boot1: {
    slot: 0x11,
    slotHex: '0x11',
    name: 'FIRM0/FIRM1 Boot9 Keyslot',
    keyBytes: new Uint8Array([
      0xd0, 0x7b, 0x33, 0x7f, 0x9d, 0x43, 0xec, 0x49,
      0x59, 0xfc, 0x92, 0xdc, 0x14, 0x86, 0x91, 0x16,
    ]),
    initialCounter: new Uint8Array([
      0x46, 0x49, 0x52, 0x4d, 0x30, 0x5f, 0x43, 0x54,
      0x52, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ]),
  },
  firm1_stage2: {
    slot: 0x11,
    slotHex: '0x11',
    name: 'FIRM0/FIRM1 Boot9 Keyslot',
    keyBytes: new Uint8Array([
      0xd0, 0x7b, 0x33, 0x7f, 0x9d, 0x43, 0xec, 0x49,
      0x59, 0xfc, 0x92, 0xdc, 0x14, 0x86, 0x91, 0x16,
    ]),
    initialCounter: new Uint8Array([
      0x46, 0x49, 0x52, 0x4d, 0x31, 0x5f, 0x43, 0x54,
      0x52, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
    ]),
  },
  twl_sysdata: {
    slot: 0x16,
    slotHex: '0x16',
    name: 'TWL System SaveData Keyslot',
    keyBytes: new Uint8Array([
      0x5a, 0x8a, 0x24, 0x6e, 0x13, 0x9b, 0x77, 0x50,
      0x38, 0xef, 0x48, 0x62, 0x8d, 0xa1, 0x99, 0xb4,
    ]),
    initialCounter: new Uint8Array([
      0x54, 0x57, 0x4c, 0x53, 0x59, 0x53, 0x5f, 0x43,
      0x54, 0x52, 0x00, 0x00, 0x00, 0x00, 0x00, 0x30,
    ]),
  },
  ctrnand_sys: {
    slot: 0x25,
    slotHex: '0x25',
    name: 'CTRNAND 7.x System Titles Keyslot',
    keyBytes: new Uint8Array([
      0xce, 0xe2, 0x8e, 0x00, 0x77, 0x6c, 0x4e, 0xa0,
      0x07, 0x7d, 0x9e, 0xc1, 0x41, 0x7d, 0x74, 0xe0,
    ]),
    initialCounter: new Uint8Array([
      0x43, 0x54, 0x52, 0x4e, 0x41, 0x4e, 0x44, 0x5f,
      0x53, 0x59, 0x53, 0x00, 0x00, 0x00, 0x00, 0x50,
    ]),
  },
  nand_userdata: {
    slot: 0x3d,
    slotHex: '0x3D',
    name: 'NAND User SaveData Keyslot',
    keyBytes: new Uint8Array([
      0x7a, 0x35, 0x88, 0xc0, 0x22, 0xb1, 0x49, 0xd4,
      0x96, 0x10, 0x5f, 0xa3, 0xd9, 0x1c, 0x63, 0x88,
    ]),
    initialCounter: new Uint8Array([
      0x55, 0x53, 0x45, 0x52, 0x44, 0x41, 0x54, 0x41,
      0x5f, 0x43, 0x54, 0x52, 0x00, 0x00, 0x00, 0xa0,
    ]),
  },
};

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

export interface KeyslotSecret {
  keyBytes: Uint8Array;
  initialCounter: Uint8Array;
}

export type PartitionKeyOverrideMap = Partial<
  Record<Exclude<PartitionId, 'ncsd_hdr'>, KeyslotSecret>
>;

export interface CtrKeyBundle {
  format: 'CTR-SIM-KEYBUNDLE-V1';
  exportedAt: string;
  aesKeyslots: Record<
    Exclude<PartitionId, 'ncsd_hdr'>,
    {
      slot: number;
      slotHex: string;
      name: string;
      keyHex: string;
      initialCounterHex: string;
    }
  >;
  rootCaRsaPublicJwk: JsonWebKey;
}

const DEFAULT_CTR_KEYSLOT_SECRETS: Record<Exclude<PartitionId, 'ncsd_hdr'>, KeyslotSecret> = {
  firm0_boot1: {
    keyBytes: new Uint8Array(CTR_KEYSLOTS.firm0_boot1.keyBytes),
    initialCounter: new Uint8Array(CTR_KEYSLOTS.firm0_boot1.initialCounter),
  },
  firm1_stage2: {
    keyBytes: new Uint8Array(CTR_KEYSLOTS.firm1_stage2.keyBytes),
    initialCounter: new Uint8Array(CTR_KEYSLOTS.firm1_stage2.initialCounter),
  },
  twl_sysdata: {
    keyBytes: new Uint8Array(CTR_KEYSLOTS.twl_sysdata.keyBytes),
    initialCounter: new Uint8Array(CTR_KEYSLOTS.twl_sysdata.initialCounter),
  },
  ctrnand_sys: {
    keyBytes: new Uint8Array(CTR_KEYSLOTS.ctrnand_sys.keyBytes),
    initialCounter: new Uint8Array(CTR_KEYSLOTS.ctrnand_sys.initialCounter),
  },
  nand_userdata: {
    keyBytes: new Uint8Array(CTR_KEYSLOTS.nand_userdata.keyBytes),
    initialCounter: new Uint8Array(CTR_KEYSLOTS.nand_userdata.initialCounter),
  },
};

export function areKeyslotsDefault(): boolean {
  const ids: Array<Exclude<PartitionId, 'ncsd_hdr'>> = [
    'firm0_boot1',
    'firm1_stage2',
    'twl_sysdata',
    'ctrnand_sys',
    'nand_userdata',
  ];
  return ids.every((id) => {
    const cur = CTR_KEYSLOTS[id];
    const def = DEFAULT_CTR_KEYSLOT_SECRETS[id];
    return (
      bytesToHex(cur.keyBytes) === bytesToHex(def.keyBytes) &&
      bytesToHex(cur.initialCounter) === bytesToHex(def.initialCounter)
    );
  });
}

export function applyKeyslotOverrides(overrides: PartitionKeyOverrideMap): void {
  const ids: Array<Exclude<PartitionId, 'ncsd_hdr'>> = [
    'firm0_boot1',
    'firm1_stage2',
    'twl_sysdata',
    'ctrnand_sys',
    'nand_userdata',
  ];
  for (const id of ids) {
    const next = overrides[id];
    if (next && next.keyBytes.byteLength === 16 && next.initialCounter.byteLength === 16) {
      CTR_KEYSLOTS[id].keyBytes = new Uint8Array(next.keyBytes);
      CTR_KEYSLOTS[id].initialCounter = new Uint8Array(next.initialCounter);
    }
  }
  aesKeyCache.clear();
}

export function resetDefaultKeyslots(): void {
  applyKeyslotOverrides(DEFAULT_CTR_KEYSLOT_SECRETS);
}

export function exportCtrKeyBundle(): CtrKeyBundle {
  return {
    format: 'CTR-SIM-KEYBUNDLE-V1',
    exportedAt: new Date().toISOString(),
    aesKeyslots: {
      firm0_boot1: {
        slot: CTR_KEYSLOTS.firm0_boot1.slot,
        slotHex: CTR_KEYSLOTS.firm0_boot1.slotHex,
        name: CTR_KEYSLOTS.firm0_boot1.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.firm0_boot1.keyBytes),
        initialCounterHex: bytesToHex(CTR_KEYSLOTS.firm0_boot1.initialCounter),
      },
      firm1_stage2: {
        slot: CTR_KEYSLOTS.firm1_stage2.slot,
        slotHex: CTR_KEYSLOTS.firm1_stage2.slotHex,
        name: CTR_KEYSLOTS.firm1_stage2.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.firm1_stage2.keyBytes),
        initialCounterHex: bytesToHex(CTR_KEYSLOTS.firm1_stage2.initialCounter),
      },
      twl_sysdata: {
        slot: CTR_KEYSLOTS.twl_sysdata.slot,
        slotHex: CTR_KEYSLOTS.twl_sysdata.slotHex,
        name: CTR_KEYSLOTS.twl_sysdata.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.twl_sysdata.keyBytes),
        initialCounterHex: bytesToHex(CTR_KEYSLOTS.twl_sysdata.initialCounter),
      },
      ctrnand_sys: {
        slot: CTR_KEYSLOTS.ctrnand_sys.slot,
        slotHex: CTR_KEYSLOTS.ctrnand_sys.slotHex,
        name: CTR_KEYSLOTS.ctrnand_sys.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.ctrnand_sys.keyBytes),
        initialCounterHex: bytesToHex(CTR_KEYSLOTS.ctrnand_sys.initialCounter),
      },
      nand_userdata: {
        slot: CTR_KEYSLOTS.nand_userdata.slot,
        slotHex: CTR_KEYSLOTS.nand_userdata.slotHex,
        name: CTR_KEYSLOTS.nand_userdata.name,
        keyHex: bytesToHex(CTR_KEYSLOTS.nand_userdata.keyBytes),
        initialCounterHex: bytesToHex(CTR_KEYSLOTS.nand_userdata.initialCounter),
      },
    },
    rootCaRsaPublicJwk: { ...NINTENDO_ROOT_PUB_JWK },
  };
}

/**
 * Exports a compact 248-byte binary keyslot database (aeskeydb.bin):
 * 8-byte header ("KEY0", version=1) + 5 × 48-byte records [partitionId(15), slot(1), key(16), ctr(16)]
 */
export function exportAesKeyDbBinary(): Uint8Array {
  const ids: Array<Exclude<PartitionId, 'ncsd_hdr'>> = [
    'firm0_boot1',
    'firm1_stage2',
    'twl_sysdata',
    'ctrnand_sys',
    'nand_userdata',
  ];
  const out = new Uint8Array(8 + ids.length * 48);
  writeAsciiFixed(out, 0, 'KEY0', 4);
  writeUint32LE(out, 4, ids.length);
  ids.forEach((id, idx) => {
    const off = 8 + idx * 48;
    const slotInfo = CTR_KEYSLOTS[id];
    writeAsciiFixed(out, off, id, 15);
    out[off + 15] = slotInfo.slot & 0xff;
    out.set(slotInfo.keyBytes.subarray(0, 16), off + 16);
    out.set(slotInfo.initialCounter.subarray(0, 16), off + 32);
  });
  return out;
}

export function parseKeyBundleFile(bytes: Uint8Array): PartitionKeyOverrideMap {
  const headerMagic = readAsciiFixed(bytes, 0, 4);
  if (headerMagic === 'KEY0' && bytes.byteLength >= 8 + 48) {
    const count = Math.min(readUint32LE(bytes, 4), 16);
    const out: PartitionKeyOverrideMap = {};
    const validIds = new Set<Exclude<PartitionId, 'ncsd_hdr'>>([
      'firm0_boot1',
      'firm1_stage2',
      'twl_sysdata',
      'ctrnand_sys',
      'nand_userdata',
    ]);
    for (let i = 0; i < count; i++) {
      const off = 8 + i * 48;
      if (off + 48 > bytes.byteLength) break;
      const partId = readAsciiFixed(bytes, off, 15) as Exclude<PartitionId, 'ncsd_hdr'>;
      if (validIds.has(partId)) {
        out[partId] = {
          keyBytes: bytes.slice(off + 16, off + 32),
          initialCounter: bytes.slice(off + 32, off + 48),
        };
      }
    }
    if (Object.keys(out).length === 0) {
      throw new Error('No recognized partition keyslots inside binary keyfile');
    }
    return out;
  }

  const text = textDecoder.decode(bytes);
  const parsed = JSON.parse(text) as Partial<CtrKeyBundle>;
  if (!parsed || parsed.format !== 'CTR-SIM-KEYBUNDLE-V1' || !parsed.aesKeyslots) {
    throw new Error('Unrecognized keyfile format (expected CTR-SIM-KEYBUNDLE-V1 JSON or aeskeydb.bin)');
  }
  const out: PartitionKeyOverrideMap = {};
  const ids: Array<Exclude<PartitionId, 'ncsd_hdr'>> = [
    'firm0_boot1',
    'firm1_stage2',
    'twl_sysdata',
    'ctrnand_sys',
    'nand_userdata',
  ];
  for (const id of ids) {
    const entry = parsed.aesKeyslots[id];
    if (entry?.keyHex && entry?.initialCounterHex) {
      const keyBytes = hexToBytes(entry.keyHex);
      const initialCounter = hexToBytes(entry.initialCounterHex);
      if (keyBytes.byteLength !== 16 || initialCounter.byteLength !== 16) {
        throw new Error(`Invalid 128-bit key/counter length for ${id}`);
      }
      out[id] = { keyBytes, initialCounter };
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('Keyfile did not contain any valid partition keyslots');
  }
  return out;
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

export async function encryptPartition(id: PartitionId, plaintext: Uint8Array): Promise<Uint8Array> {
  if (id === 'ncsd_hdr') return plaintext; // NCSD master header at sector 0 is unencrypted plaintext
  const info = CTR_KEYSLOTS[id];
  return cryptAesCtr(plaintext, info.keyBytes, info.initialCounter);
}

export async function decryptPartition(id: PartitionId, ciphertext: Uint8Array): Promise<Uint8Array> {
  if (id === 'ncsd_hdr') return ciphertext;
  const info = CTR_KEYSLOTS[id];
  return cryptAesCtr(ciphertext, info.keyBytes, info.initialCounter);
}

/* ==================== 3DS RSA-2048 BOOT9 SIGNATURE VERIFICATION ==================== */

// Nintendo Root CA RSA-2048 public & private keys (JWK) for authentic Boot9 signature validation
const NINTENDO_ROOT_PUB_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  alg: 'RS256',
  kty: 'RSA',
  n: '8x2zm2oHMbmgJH8dOiU5um0D53BMGCvj_OUPr6ky63Lc45PQg6rYv87YXgjJB1ntDkHQHc_Q5vDDUY1DiZVw_QgD7jV3CmMS--hQ70xO_6HLj58gBX7u_wVot0oLheU6sG-ydr0yjPIQb5sz6Y98Fdd--ni1k2IiHj2rXYP0ZRj9D6gjEwwm0UdFKbDzjuFBXJQ43rcatY1ez4197Z7ABTvrafQtU8K8qVsflh4R1djA3i63g1jNn2aatp8BF4C8JdsdRkvq4KLpiaB5GjG8S-XCIVZbMHi-iVQA5zQRGL2ht9YW0FemTHqh8v20eJLKcPNTePXuzeKHieVK5ss_AQ',
  e: 'AQAB',
};

const NINTENDO_ROOT_PRIV_JWK: JsonWebKey = {
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
      NINTENDO_ROOT_PUB_JWK,
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
      NINTENDO_ROOT_PRIV_JWK,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return cachedRsaPrivKey;
}

/**
 * Computes a real 256-byte (2048-bit) RSA signature over target binary data using RSASSA-PKCS1-v1_5 + SHA-256.
 */
export async function signRsa2048(data: Uint8Array): Promise<Uint8Array> {
  const privKey = await getRsaPrivKey();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privKey, copy.buffer);
  return new Uint8Array(sigBuffer);
}

/**
 * Verifies a 256-byte (2048-bit) RSA signature using the Boot9 embedded Root CA Public Key.
 */
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
