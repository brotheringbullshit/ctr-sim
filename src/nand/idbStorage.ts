import {
  CHUNK_SIZE,
  ChunkIOEvent,
  CtrNandArchiveData,
  NAND_PARTITIONS,
  PartitionId,
  TOTAL_CHUNKS,
  SystemConfig,
  UserSaveData,
} from './types';
import {
  buildCtrNandPartition,
  buildFirm0Partition,
  buildFirm1Partition,
  buildNcsdHeader,
  buildNcsdHeaderFromHashes,
  buildSysDataPartition,
  buildUserDataPartition,
  parseNcsdHeader,
  getDefaultStage1Opcodes,
  getDefaultStage2Header,
  getDefaultSystemConfig,
  getDefaultCtrNandArchive,
  getDefaultUserSaveData,
} from './payloads';
import {
  computeSHA256Hex,
  decryptPartition,
  encryptPartition,
} from './crypto';

const DB_NAME = 'CTR_SIM_VIRTUAL_NAND_V1';
const DB_VERSION = 1;
const STORE_CHUNKS = 'nand_chunks';
const STORE_META = 'nand_meta';

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
  return 'nand_userdata';
}

class NandIDBDriver {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private listeners = new Set<IOListener>();
  // Serialized async write queue to prevent concurrent save races against NCSD digests
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
      tx.oncomplete = () => resolve(metaFlag && cryptoVersion === 2 && chunkCount === TOTAL_CHUNKS);
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

  /**
   * Recomputes NCSD_HDR SHA-256 digests. If modifiedPartitionId & modifiedCiphertext are provided,
   * reuses existing hashes from current NCSD header for unmodified partitions without reading all chunks.
   */
  async syncNcsdDigests(modifiedPartitionId?: PartitionId, modifiedCiphertext?: Uint8Array): Promise<void> {
    try {
      const ncsdChunk = await this.readChunk(0);
      const parsed = await parseNcsdHeader(ncsdChunk);
      if (parsed.ok) {
        const hashes: Record<Exclude<PartitionId, 'ncsd_hdr'>, string> = {
          firm0_boot1: parsed.records['firm0_boot1']?.sha256 || '',
          firm1_stage2: parsed.records['firm1_stage2']?.sha256 || '',
          twl_sysdata: parsed.records['twl_sysdata']?.sha256 || '',
          ctrnand_sys: parsed.records['ctrnand_sys']?.sha256 || '',
          nand_userdata: parsed.records['nand_userdata']?.sha256 || '',
        };

        if (modifiedPartitionId && modifiedPartitionId !== 'ncsd_hdr') {
          if (modifiedCiphertext) {
            hashes[modifiedPartitionId] = await computeSHA256Hex(modifiedCiphertext);
          } else {
            const partBuf = await this.readPartition(modifiedPartitionId);
            hashes[modifiedPartitionId] = await computeSHA256Hex(partBuf);
          }
        }

        if (Object.values(hashes).every((h) => h.length === 64)) {
          const ncsd = await buildNcsdHeaderFromHashes(hashes);
          await this.writePartitionRaw('ncsd_hdr', ncsd);
          return;
        }
      }
    } catch {
      // Fallback to full read if any error occurs
    }

    const [firm0, firm1, sysdata, ctrnand, userdata] = await Promise.all([
      this.readPartition('firm0_boot1'),
      this.readPartition('firm1_stage2'),
      this.readPartition('twl_sysdata'),
      this.readPartition('ctrnand_sys'),
      this.readPartition('nand_userdata'),
    ]);
    const ncsd = await buildNcsdHeader({
      firm0_boot1: firm0,
      firm1_stage2: firm1,
      twl_sysdata: sysdata,
      ctrnand_sys: ctrnand,
      nand_userdata: userdata,
    });
    await this.writePartitionRaw('ncsd_hdr', ncsd);
  }

  /**
   * Encrypts and saves SystemConfig to TWL_SYSDATA (Keyslot 0x16) in IndexedDB.
   */
  saveSystemConfig(config: SystemConfig): Promise<void> {
    return this.enqueueWrite(async () => {
      const plaintext = buildSysDataPartition(config);
      const ciphertext = await encryptPartition('twl_sysdata', plaintext);
      await this.writePartitionRaw('twl_sysdata', ciphertext);
      await this.syncNcsdDigests('twl_sysdata', ciphertext);
    });
  }

  /**
   * Encrypts and saves UserSaveData to NAND_USERDATA (Keyslot 0x3D) in IndexedDB.
   */
  saveUserData(userData: UserSaveData): Promise<void> {
    return this.enqueueWrite(async () => {
      const plaintext = buildUserDataPartition(userData);
      const ciphertext = await encryptPartition('nand_userdata', plaintext);
      await this.writePartitionRaw('nand_userdata', ciphertext);
      await this.syncNcsdDigests('nand_userdata', ciphertext);
    });
  }

  /**
   * Encrypts and saves CTRNAND title.db, import.db, ticket.db, and packages to CTRNAND_SYS (Keyslot 0x25).
   */
  saveCtrNandArchive(archive: CtrNandArchiveData): Promise<void> {
    return this.enqueueWrite(async () => {
      const plaintext = buildCtrNandPartition(archive);
      const ciphertext = await encryptPartition('ctrnand_sys', plaintext);
      await this.writePartitionRaw('ctrnand_sys', ciphertext);
      await this.syncNcsdDigests('ctrnand_sys', ciphertext);
    });
  }

  /**
   * Formats and provisions all 256 chunks into IndexedDB with real AES-128-CTR encrypted partitions and RSA-2048 signed NCSD header.
   */
  provisionFreshNand(): Promise<void> {
    return this.enqueueWrite(async () => {
      const rawFirm0 = buildFirm0Partition(getDefaultStage1Opcodes());
      const rawFirm1 = buildFirm1Partition(getDefaultStage2Header());
      const rawSysdata = buildSysDataPartition(getDefaultSystemConfig());
      const rawCtrnand = buildCtrNandPartition(getDefaultCtrNandArchive());
      const rawUserdata = buildUserDataPartition(getDefaultUserSaveData());

      const [encFirm0, encFirm1, encSysdata, encCtrnand, encUserdata] = await Promise.all([
        encryptPartition('firm0_boot1', rawFirm0),
        encryptPartition('firm1_stage2', rawFirm1),
        encryptPartition('twl_sysdata', rawSysdata),
        encryptPartition('ctrnand_sys', rawCtrnand),
        encryptPartition('nand_userdata', rawUserdata),
      ]);

      const ncsd = await buildNcsdHeader({
        firm0_boot1: encFirm0,
        firm1_stage2: encFirm1,
        twl_sysdata: encSysdata,
        ctrnand_sys: encCtrnand,
        nand_userdata: encUserdata,
      });

      const partitionMap: Record<PartitionId, Uint8Array> = {
        ncsd_hdr: ncsd,
        firm0_boot1: encFirm0,
        firm1_stage2: encFirm1,
        twl_sysdata: encSysdata,
        ctrnand_sys: encCtrnand,
        nand_userdata: encUserdata,
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
        tx.objectStore(STORE_META).put({
          key: 'provisioned',
          value: true,
          cryptoVersion: 2,
          cipher: 'AES-128-CTR',
          signature: 'RSASSA-PKCS1-v1_5',
          formattedAt: Date.now(),
        });
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
        await this.syncNcsdDigests();
        return;
      }
      let rawPlaintext: Uint8Array;
      switch (id) {
        case 'firm0_boot1':
          rawPlaintext = buildFirm0Partition(getDefaultStage1Opcodes());
          break;
        case 'firm1_stage2':
          rawPlaintext = buildFirm1Partition(getDefaultStage2Header());
          break;
        case 'twl_sysdata':
          rawPlaintext = buildSysDataPartition(getDefaultSystemConfig());
          break;
        case 'ctrnand_sys':
          rawPlaintext = buildCtrNandPartition(getDefaultCtrNandArchive());
          break;
        case 'nand_userdata':
          rawPlaintext = buildUserDataPartition(getDefaultUserSaveData());
          break;
      }
      const ciphertext = await encryptPartition(id, rawPlaintext);
      await this.writePartitionRaw(id, ciphertext);
      await this.syncNcsdDigests(id, ciphertext);
    });
  }

  async readDecryptedPartition(id: PartitionId): Promise<Uint8Array> {
    const ciphertext = await this.readPartition(id);
    if (id === 'ncsd_hdr') return ciphertext;
    return decryptPartition(id, ciphertext);
  }
}

export const nandDriver = new NandIDBDriver();
