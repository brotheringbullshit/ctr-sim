import {
  CHUNK_SIZE,
  ChunkIOEvent,
  CtrNandArchiveData,
  CtrNandVolumeData,
  DataPartitionId,
  NAND_PARTITIONS,
  PartitionId,
  SystemConfig,
  TOTAL_CHUNKS,
  UserSaveData,
} from './types';
import {
  buildAgbSavePartition,
  buildCtrNandVolumePartition,
  buildFirmPartition,
  buildNcsdHeader,
  buildTwlPartition,
  getDefaultAgbSaveData,
  getDefaultCtrNandArchive,
  getDefaultCtrNandVolume,
  getDefaultFirmPayload,
  getDefaultSystemConfig,
  getDefaultTwlPartitionData,
  getDefaultUserSaveData,
  parseAgbSavePartition,
  parseCtrNandVolumePartition,
  parseFirmPartition,
  parseNcsdHeader,
  parseTwlPartition,
} from './payloads';
import {
  applyKeyslotOverrides,
  bytesToHex,
  cryptTwlMbrBytes,
  CTR_KEYSLOTS,
  decryptPartition,
  encryptPartition,
  generateFreshNandCid,
  getNandCidBytes,
  getNandCidHex,
  hexToBytes,
  PartitionKeyOverrideMap,
  readAsciiFixed,
  resetDefaultKeyslots,
  setNandCid,
} from './crypto';

const DB_NAME = 'CTR_SIM_VIRTUAL_NAND_V1';
const DB_VERSION = 1;
const STORE_CHUNKS = 'nand_chunks';
const STORE_META = 'nand_meta';
const CURRENT_CRYPTO_VERSION = 5;

export interface StoredChunkRecord {
  chunkIndex: number;
  partitionId: PartitionId;
  data: Uint8Array;
  updatedAt: number;
}

type IOListener = (event: ChunkIOEvent) => void;

export function getPartitionForChunk(chunkIndex: number): PartitionId {
  for (const spec of NAND_PARTITIONS) {
    if (chunkIndex >= spec.startChunk && chunkIndex <= spec.endChunk) {
      return spec.id;
    }
  }
  return 'ctrnand';
}

class NandIDBDriver {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private listeners = new Set<IOListener>();
  // Serialized async write queue to prevent concurrent save races
  private writeQueue: Promise<void> = Promise.resolve();

  subscribeIO(listener: IOListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitIO(chunkIndex: number, op: 'read' | 'write' | 'corrupt'): void {
    const partitionId = getPartitionForChunk(chunkIndex);
    const event: ChunkIOEvent = {
      chunkIndex,
      op,
      partitionId,
      timestamp: performance.now(),
    };
    this.listeners.forEach((fn) => fn(event));
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          db.createObjectStore(STORE_CHUNKS, { keyPath: 'chunkIndex' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open Virtual NAND IndexedDB'));
    });
    return this.dbPromise;
  }

  async isProvisioned(): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CHUNKS, STORE_META], 'readonly');
      const countReq = tx.objectStore(STORE_CHUNKS).count();
      const metaReq = tx.objectStore(STORE_META).get('provisioned');
      let chunkCount = 0;
      let metaFlag = false;
      let cryptoVersion = 0;
      countReq.onsuccess = () => {
        chunkCount = countReq.result;
      };
      metaReq.onsuccess = () => {
        metaFlag = Boolean(metaReq.result?.value);
        cryptoVersion = metaReq.result?.cryptoVersion ?? 0;
      };
      tx.oncomplete = () =>
        resolve(metaFlag && cryptoVersion === CURRENT_CRYPTO_VERSION && chunkCount === TOTAL_CHUNKS);
      tx.onerror = () => reject(tx.error);
    });
  }

  async readChunk(chunkIndex: number): Promise<Uint8Array> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const req = tx.objectStore(STORE_CHUNKS).get(chunkIndex);
      req.onsuccess = () => {
        const rec = req.result as StoredChunkRecord | undefined;
        if (!rec || !rec.data) {
          reject(new Error(`Missing NAND chunk #${chunkIndex} in IndexedDB`));
          return;
        }
        this.emitIO(chunkIndex, 'read');
        const out = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
        resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async readPartition(id: PartitionId): Promise<Uint8Array> {
    const spec = NAND_PARTITIONS.find((p) => p.id === id);
    if (!spec) throw new Error(`Unknown partition: ${id}`);
    const chunkCount = spec.endChunk - spec.startChunk + 1;
    const out = new Uint8Array(chunkCount * CHUNK_SIZE);

    const db = await this.openDB();
    const records = await new Promise<StoredChunkRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const store = tx.objectStore(STORE_CHUNKS);
      const req = store.getAll(IDBKeyRange.bound(spec.startChunk, spec.endChunk));
      req.onsuccess = () => resolve((req.result as StoredChunkRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    if (records.length !== chunkCount) {
      throw new Error(`Missing NAND chunks for ${id} (expected ${chunkCount}, got ${records.length})`);
    }

    for (const rec of records) {
      const relIdx = rec.chunkIndex - spec.startChunk;
      const bytes = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
      out.set(bytes, relIdx * CHUNK_SIZE);
      this.emitIO(rec.chunkIndex, 'read');
    }

    return out;
  }

  async writePartitionRaw(id: PartitionId, buffer: Uint8Array): Promise<void> {
    const spec = NAND_PARTITIONS.find((p) => p.id === id);
    if (!spec) throw new Error(`Unknown partition: ${id}`);
    const chunkCount = spec.endChunk - spec.startChunk + 1;
    if (buffer.byteLength !== chunkCount * CHUNK_SIZE) {
      throw new Error(`Buffer size mismatch for ${id}`);
    }
    const db = await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readwrite');
      const store = tx.objectStore(STORE_CHUNKS);
      for (let i = 0; i < chunkCount; i++) {
        const chunkIdx = spec.startChunk + i;
        const slice = buffer.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        store.put({
          chunkIndex: chunkIdx,
          partitionId: id,
          data: slice,
          updatedAt: Date.now(),
        } satisfies StoredChunkRecord);
      }
      tx.oncomplete = () => {
        for (let i = 0; i < chunkCount; i++) {
          this.emitIO(spec.startChunk + i, 'write');
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  private async readCurrentCtrNandVolume(): Promise<CtrNandVolumeData> {
    try {
      const dec = await this.readDecryptedPartition('ctrnand');
      const parsed = parseCtrNandVolumePartition(dec);
      if (parsed.ok) return parsed.data;
    } catch {
      // Fallback to defaults if unreadable
    }
    return getDefaultCtrNandVolume();
  }

  private async writeCtrNandVolume(volume: CtrNandVolumeData): Promise<void> {
    const plaintext = buildCtrNandVolumePartition(volume);
    const ciphertext = await encryptPartition('ctrnand', plaintext);
    await this.writePartitionRaw('ctrnand', ciphertext);
  }

  /**
   * Saves SystemConfig inside CTRNAND /rw/sys/ (Keyslot 0x04 + CID CTR).
   */
  saveSystemConfig(config: SystemConfig): Promise<void> {
    return this.enqueueWrite(async () => {
      const vol = await this.readCurrentCtrNandVolume();
      await this.writeCtrNandVolume({ ...vol, config });
    });
  }

  /**
   * Saves UserSaveData inside CTRNAND /data/<ID0>/ (Keyslot 0x04 + CID CTR).
   */
  saveUserData(userData: UserSaveData): Promise<void> {
    return this.enqueueWrite(async () => {
      const vol = await this.readCurrentCtrNandVolume();
      await this.writeCtrNandVolume({ ...vol, userData });
    });
  }

  /**
   * Saves CTRNAND /title/ & /dbs/ (title.db, import.db, ticket.db, certs.db) (Keyslot 0x04 + CID CTR).
   */
  saveCtrNandArchive(archive: CtrNandArchiveData): Promise<void> {
    return this.enqueueWrite(async () => {
      const vol = await this.readCurrentCtrNandVolume();
      await this.writeCtrNandVolume({ ...vol, archive });
    });
  }

  /**
   * Provisions a fresh 4.00 MB (256 × 16 KB) NAND in IndexedDB with a unique 16-byte eMMC NAND CID,
   * CID-derived AES-128-CTR encryption per partition, and Sector 0 NCSD + encrypted TWL MBR.
   */
  provisionFreshNand(): Promise<void> {
    return this.enqueueWrite(async () => {
      resetDefaultKeyslots();
      generateFreshNandCid();

      const rawTwl = buildTwlPartition(getDefaultTwlPartitionData());
      const rawAgb = buildAgbSavePartition(getDefaultAgbSaveData());
      const rawFirm0 = buildFirmPartition('FIRM0', getDefaultFirmPayload('FIRM0'));
      const rawFirm1 = buildFirmPartition('FIRM1', getDefaultFirmPayload('FIRM1'));
      const rawCtr = buildCtrNandVolumePartition({
        config: getDefaultSystemConfig(),
        archive: getDefaultCtrNandArchive(),
        userData: getDefaultUserSaveData(),
      });

      const [ncsd, encTwl, encAgb, encFirm0, encFirm1, encCtr] = await Promise.all([
        buildNcsdHeader(),
        encryptPartition('twl_nand', rawTwl),
        encryptPartition('agbsave', rawAgb),
        encryptPartition('firm0', rawFirm0),
        encryptPartition('firm1', rawFirm1),
        encryptPartition('ctrnand', rawCtr),
      ]);

      const partitionMap: Record<PartitionId, Uint8Array> = {
        ncsd_hdr: ncsd,
        twl_nand: encTwl,
        agbsave: encAgb,
        firm0: encFirm0,
        firm1: encFirm1,
        ctrnand: encCtr,
      };

      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_CHUNKS, STORE_META], 'readwrite');
        const store = tx.objectStore(STORE_CHUNKS);
        for (const spec of NAND_PARTITIONS) {
          const buf = partitionMap[spec.id];
          const count = spec.endChunk - spec.startChunk + 1;
          for (let i = 0; i < count; i++) {
            const chunkIdx = spec.startChunk + i;
            store.put({
              chunkIndex: chunkIdx,
              partitionId: spec.id,
              data: buf.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
              updatedAt: Date.now(),
            } satisfies StoredChunkRecord);
          }
        }
        const metaStore = tx.objectStore(STORE_META);
        metaStore.put({
          key: 'provisioned',
          value: true,
          cryptoVersion: CURRENT_CRYPTO_VERSION,
          cipher: 'AES-128-CTR-CID',
          signature: 'RSA-2048-NCSD',
          formattedAt: Date.now(),
        });
        metaStore.put({
          key: 'nand_cid',
          value: getNandCidHex(),
        });
        metaStore.delete('custom_keyslots');

        tx.oncomplete = () => {
          for (let i = 0; i < TOTAL_CHUNKS; i++) {
            this.emitIO(i, 'write');
          }
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  repairPartition(id: PartitionId): Promise<void> {
    return this.enqueueWrite(async () => {
      if (id === 'ncsd_hdr') {
        const ncsd = await buildNcsdHeader();
        await this.writePartitionRaw('ncsd_hdr', ncsd);
        return;
      }
      let rawPlaintext: Uint8Array;
      switch (id) {
        case 'twl_nand':
          rawPlaintext = buildTwlPartition(getDefaultTwlPartitionData());
          break;
        case 'agbsave':
          rawPlaintext = buildAgbSavePartition(getDefaultAgbSaveData());
          break;
        case 'firm0':
          rawPlaintext = buildFirmPartition('FIRM0', getDefaultFirmPayload('FIRM0'));
          break;
        case 'firm1':
          rawPlaintext = buildFirmPartition('FIRM1', getDefaultFirmPayload('FIRM1'));
          break;
        case 'ctrnand':
          rawPlaintext = buildCtrNandVolumePartition(getDefaultCtrNandVolume());
          break;
      }
      const ciphertext = await encryptPartition(id, rawPlaintext);
      await this.writePartitionRaw(id, ciphertext);
    });
  }

  async readDecryptedPartition(id: PartitionId): Promise<Uint8Array> {
    const ciphertext = await this.readPartition(id);
    if (id === 'ncsd_hdr') return ciphertext;
    return decryptPartition(id, ciphertext);
  }

  async loadPersistedKeyslots(): Promise<void> {
    const db = await this.openDB();
    const { cidHex, storedKeys } = await new Promise<{
      cidHex: string | null;
      storedKeys: Record<string, string> | null;
    }>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const cidReq = tx.objectStore(STORE_META).get('nand_cid');
      const keysReq = tx.objectStore(STORE_META).get('custom_keyslots');
      let cHex: string | null = null;
      let sKeys: Record<string, string> | null = null;
      cidReq.onsuccess = () => {
        cHex = cidReq.result?.value ?? null;
      };
      keysReq.onsuccess = () => {
        sKeys = keysReq.result?.value ?? null;
      };
      tx.oncomplete = () => resolve({ cidHex: cHex, storedKeys: sKeys });
      tx.onerror = () => reject(tx.error);
    });

    if (cidHex && cidHex.length === 32) {
      setNandCid(hexToBytes(cidHex));
    }

    if (storedKeys) {
      const map: PartitionKeyOverrideMap = {};
      const ids: DataPartitionId[] = ['twl_nand', 'agbsave', 'firm0', 'firm1', 'ctrnand'];
      for (const id of ids) {
        const keyHex = storedKeys[id];
        if (keyHex && keyHex.length === 32) {
          map[id] = hexToBytes(keyHex);
        }
      }
      if (Object.keys(map).length > 0) {
        applyKeyslotOverrides(map);
      }
    }
  }

  async resetKeyslotsToDefault(): Promise<void> {
    return this.enqueueWrite(async () => {
      resetDefaultKeyslots();
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).delete('custom_keyslots');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  /**
   * Reads the 4.00 MB (256 × 16 KB) NAND image from IndexedDB.
   * When mode === 'decrypted', decrypts all partitions AND decrypts the TWL MBR (0x1BE..0x1FF).
   */
  async dumpNandImage(mode: 'encrypted' | 'decrypted'): Promise<Uint8Array> {
    const db = await this.openDB();
    const records = await new Promise<StoredChunkRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const req = tx.objectStore(STORE_CHUNKS).getAll();
      req.onsuccess = () => resolve((req.result as StoredChunkRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    const totalBytes = TOTAL_CHUNKS * CHUNK_SIZE;
    const rawNand = new Uint8Array(totalBytes);
    for (const rec of records) {
      if (rec.chunkIndex >= 0 && rec.chunkIndex < TOTAL_CHUNKS) {
        const bytes = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
        rawNand.set(bytes.subarray(0, CHUNK_SIZE), rec.chunkIndex * CHUNK_SIZE);
      }
    }
    this.emitIO(0, 'read');

    if (mode === 'encrypted') {
      return rawNand;
    }

    const decNand = new Uint8Array(totalBytes);
    decNand.set(rawNand.subarray(0, CHUNK_SIZE), 0);
    // Decrypt Sector 0 TWL MBR (0x1BE..0x1FF) so TWLN/TWLP entries & 0x55AA signature are readable in plaintext dumps
    const decMbr = await cryptTwlMbrBytes(rawNand.subarray(0x1be, 0x200));
    decNand.set(decMbr, 0x1be);

    for (const spec of NAND_PARTITIONS) {
      if (spec.id === 'ncsd_hdr') continue;
      const startByte = spec.startChunk * CHUNK_SIZE;
      const endByte = (spec.endChunk + 1) * CHUNK_SIZE;
      const decSlice = await decryptPartition(spec.id, rawNand.subarray(startByte, endByte));
      decNand.set(decSlice, startByte);
    }
    return decNand;
  }

  /**
   * Restores a 4.00 MB (256 × 16 KB) NAND .bin backup (auto-detecting Encrypted vs Decrypted .bin).
   * Applies optional keyslot overrides + NAND CID when restoring an encrypted dump.
   */
  restoreNandImage(
    imageBytes: Uint8Array,
    keyOverrides?: PartitionKeyOverrideMap,
    cidOverride?: Uint8Array
  ): Promise<{
    mode: 'encrypted' | 'decrypted';
    usedCustomKeys: boolean;
    validPartitions: number;
  }> {
    return this.enqueueWrite(async () => {
      const expectedSize = TOTAL_CHUNKS * CHUNK_SIZE;
      if (imageBytes.byteLength !== expectedSize) {
        throw new Error(
          `Invalid NAND .bin size: expected ${expectedSize.toLocaleString()} bytes (4.00 MB), got ${imageBytes.byteLength.toLocaleString()} bytes`
        );
      }

      if (keyOverrides && Object.keys(keyOverrides).length > 0) {
        applyKeyslotOverrides(keyOverrides, cidOverride);
      } else if (cidOverride && cidOverride.byteLength === 16) {
        setNandCid(cidOverride);
      }

      let plaintextMagicHits = 0;
      for (const spec of NAND_PARTITIONS) {
        if (spec.id === 'ncsd_hdr') continue;
        const off = spec.startChunk * CHUNK_SIZE;
        if (spec.id === 'ctrnand') {
          if (
            imageBytes[off + 0x1fe] === 0x55 &&
            imageBytes[off + 0x1ff] === 0xaa &&
            readAsciiFixed(imageBytes, off + 0x236, 8) === 'FAT16   '
          ) {
            plaintextMagicHits++;
          }
        } else {
          const magic = readAsciiFixed(imageBytes, off, 4);
          if (magic === spec.magic) {
            plaintextMagicHits++;
          }
        }
      }

      const mode: 'encrypted' | 'decrypted' = plaintextMagicHits >= 1 ? 'decrypted' : 'encrypted';
      const finalNand = new Uint8Array(expectedSize);

      if (mode === 'decrypted') {
        if (getNandCidBytes().byteLength !== 16) {
          generateFreshNandCid();
        }
        for (const spec of NAND_PARTITIONS) {
          if (spec.id === 'ncsd_hdr') continue;
          const startByte = spec.startChunk * CHUNK_SIZE;
          const endByte = (spec.endChunk + 1) * CHUNK_SIZE;
          const encSlice = await encryptPartition(spec.id, imageBytes.subarray(startByte, endByte));
          finalNand.set(encSlice, startByte);
        }
        const rebuiltNcsd = await buildNcsdHeader();
        finalNand.set(rebuiltNcsd, 0);
      } else {
        finalNand.set(imageBytes, 0);
      }

      // Count valid partitions under active CID + keyslots
      let validPartitions = 0;
      const ncsdParsed = await parseNcsdHeader(finalNand.subarray(0, CHUNK_SIZE));
      if (ncsdParsed.ok) validPartitions++;

      for (const spec of NAND_PARTITIONS) {
        if (spec.id === 'ncsd_hdr') continue;
        const startByte = spec.startChunk * CHUNK_SIZE;
        const endByte = (spec.endChunk + 1) * CHUNK_SIZE;
        try {
          const dec = await decryptPartition(spec.id, finalNand.subarray(startByte, endByte));
          let ok = false;
          if (spec.id === 'twl_nand') ok = parseTwlPartition(dec).ok;
          else if (spec.id === 'agbsave') ok = parseAgbSavePartition(dec).ok;
          else if (spec.id === 'firm0' || spec.id === 'firm1') ok = parseFirmPartition(dec).ok;
          else if (spec.id === 'ctrnand') ok = parseCtrNandVolumePartition(dec).ok;
          if (ok) validPartitions++;
        } catch {
          // Leave invalid
        }
      }

      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_CHUNKS, STORE_META], 'readwrite');
        const store = tx.objectStore(STORE_CHUNKS);
        for (let i = 0; i < TOTAL_CHUNKS; i++) {
          const pid = getPartitionForChunk(i);
          store.put({
            chunkIndex: i,
            partitionId: pid,
            data: finalNand.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            updatedAt: Date.now(),
          } satisfies StoredChunkRecord);
        }

        const metaStore = tx.objectStore(STORE_META);
        metaStore.put({
          key: 'provisioned',
          value: true,
          cryptoVersion: CURRENT_CRYPTO_VERSION,
          cipher: 'AES-128-CTR-CID',
          signature: 'RSA-2048-NCSD',
          formattedAt: Date.now(),
        });
        metaStore.put({
          key: 'nand_cid',
          value: getNandCidHex(),
        });

        if (keyOverrides && Object.keys(keyOverrides).length > 0) {
          const serialized: Record<string, string> = {};
          const ids: DataPartitionId[] = ['twl_nand', 'agbsave', 'firm0', 'firm1', 'ctrnand'];
          for (const id of ids) {
            serialized[id] = bytesToHex(CTR_KEYSLOTS[id].keyBytes);
          }
          metaStore.put({
            key: 'custom_keyslots',
            value: serialized,
          });
        }

        tx.oncomplete = () => {
          this.emitIO(0, 'write');
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });

      return {
        mode,
        usedCustomKeys: Boolean((keyOverrides && Object.keys(keyOverrides).length > 0) || cidOverride),
        validPartitions,
      };
    });
  }
}

export const nandDriver = new NandIDBDriver();
