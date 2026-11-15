import {
  CHUNK_SIZE,
  ChunkIOEvent,
  NAND_PARTITIONS,
  PartitionId,
  TOTAL_CHUNKS,
  SystemConfig,
  UserSaveData,
  BootStage2Header,
} from './types';
import {
  buildCtrNandPartition,
  buildFirm0Partition,
  buildFirm1Partition,
  buildNcsdHeader,
  buildSysDataPartition,
  buildUserDataPartition,
  getDefaultStage1Opcodes,
  getDefaultStage2Header,
  getDefaultSystemConfig,
  getDefaultSystemTitles,
  getDefaultUserSaveData,
} from './payloads';
import {
  CTR_KEYSLOTS,
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
  private verbose = true;
  private recentIOEvents: ChunkIOEvent[] = [];

  setVerboseLogging(enabled: boolean): void {
    this.verbose = enabled;
  }

  isVerbose(): boolean {
    return this.verbose;
  }

  getRecentIOEvents(): ChunkIOEvent[] {
    return [...this.recentIOEvents];
  }

  clearRecentIO(): void {
    this.recentIOEvents = [];
  }

  subscribeIO(listener: IOListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitIO(chunkIndex: number, op: 'read' | 'write' | 'corrupt', details?: string): void {
    const partitionId = getPartitionForChunk(chunkIndex);
    const spec = NAND_PARTITIONS.find((p) => p.id === partitionId);
    const keyslot = partitionId === 'ncsd_hdr' ? 'RSA-2048' : CTR_KEYSLOTS[partitionId]?.slotHex;
    const startHex = '0x' + (chunkIndex * CHUNK_SIZE).toString(16).padStart(6, '0').toUpperCase();
    const endHex = '0x' + ((chunkIndex + 1) * CHUNK_SIZE - 1).toString(16).padStart(6, '0').toUpperCase();

    const event: ChunkIOEvent = {
      chunkIndex,
      op,
      partitionId,
      timestamp: performance.now(),
      byteOffset: chunkIndex * CHUNK_SIZE,
      byteLength: CHUNK_SIZE,
      keyslot,
      details,
    };

    this.recentIOEvents.push(event);
    if (this.recentIOEvents.length > 150) {
      this.recentIOEvents.shift();
    }

    this.listeners.forEach((fn) => fn(event));

    if (this.verbose) {
      const opStyles: Record<'read' | 'write' | 'corrupt', string> = {
        read: 'color: #38bdf8; font-weight: bold;',
        write: 'color: #34d399; font-weight: bold;',
        corrupt: 'color: #f87171; font-weight: bold;',
      };
      console.log(
        `%c[CTR-NAND] %c${event.op.toUpperCase().padEnd(7)} %cChunk #${String(chunkIndex).padStart(3, '0')} (${startHex}..${endHex}) %c${(spec?.name ?? partitionId).padEnd(14)} %c[${keyslot ? 'Keyslot ' + keyslot : 'Sector 0'}]${details ? ' · ' + details : ''}`,
        'color: #94a3b8; font-weight: bold; font-family: monospace;',
        opStyles[event.op] + ' font-family: monospace;',
        'color: #cbd5e1; font-family: monospace;',
        'color: #a78bfa; font-weight: 600; font-family: monospace;',
        'color: #fbbf24; font-family: monospace;'
      );
    }
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

  async writeChunk(chunkIndex: number, data: Uint8Array, op: 'write' | 'corrupt' = 'write'): Promise<void> {
    if (data.byteLength !== CHUNK_SIZE) {
      throw new Error(`Chunk ${chunkIndex} must be exactly ${CHUNK_SIZE} bytes`);
    }
    const db = await this.openDB();
    const record: StoredChunkRecord = {
      chunkIndex,
      partitionId: getPartitionForChunk(chunkIndex),
      data: new Uint8Array(data),
      updatedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readwrite');
      tx.objectStore(STORE_CHUNKS).put(record);
      tx.oncomplete = () => {
        this.emitIO(chunkIndex, op);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async readPartition(id: PartitionId, stepDelayMs = 0): Promise<Uint8Array> {
    const spec = NAND_PARTITIONS.find((p) => p.id === id);
    if (!spec) throw new Error(`Unknown partition: ${id}`);
    const chunkCount = spec.endChunk - spec.startChunk + 1;
    const out = new Uint8Array(chunkCount * CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
      const chunkIdx = spec.startChunk + i;
      const chunkBytes = await this.readChunk(chunkIdx);
      out.set(chunkBytes, i * CHUNK_SIZE);
      if (stepDelayMs > 0 && i % 4 === 0) {
        await new Promise((r) => setTimeout(r, stepDelayMs));
      }
    }
    return out;
  }

  /**
   * Reads a partition from raw IDB chunks and decrypts it with the partition's hardware AES-128-CTR keyslot.
   */
  async readDecryptedPartition(id: PartitionId, stepDelayMs = 0): Promise<Uint8Array> {
    const ciphertext = await this.readPartition(id, stepDelayMs);
    if (id === 'ncsd_hdr') return ciphertext;
    return decryptPartition(id, ciphertext);
  }

  /**
   * Reads a single 16KB chunk and decrypts it into memory using the partition's AES-CTR key and counter.
   */
  async readDecryptedChunk(chunkIndex: number): Promise<Uint8Array> {
    const partId = getPartitionForChunk(chunkIndex);
    if (partId === 'ncsd_hdr') {
      return this.readChunk(chunkIndex);
    }
    const spec = NAND_PARTITIONS.find((p) => p.id === partId)!;
    const fullDecrypted = await this.readDecryptedPartition(partId);
    const offsetInPart = (chunkIndex - spec.startChunk) * CHUNK_SIZE;
    return fullDecrypted.slice(offsetInPart, offsetInPart + CHUNK_SIZE);
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
   * Recomputes NCSD_HDR SHA-256 digests over current encrypted IDB partition contents and signs with RSA-2048.
   */
  async syncNcsdDigests(): Promise<void> {
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
  async saveSystemConfig(config: SystemConfig): Promise<void> {
    const plaintext = buildSysDataPartition(config);
    const ciphertext = await encryptPartition('twl_sysdata', plaintext);
    await this.writePartitionRaw('twl_sysdata', ciphertext);
    await this.syncNcsdDigests();
  }

  /**
   * Encrypts and saves UserSaveData to NAND_USERDATA (Keyslot 0x3D) in IndexedDB.
   */
  async saveUserData(userData: UserSaveData): Promise<void> {
    const plaintext = buildUserDataPartition(userData);
    const ciphertext = await encryptPartition('nand_userdata', plaintext);
    await this.writePartitionRaw('nand_userdata', ciphertext);
    await this.syncNcsdDigests();
  }

  /**
   * Encrypts and saves Stage2 header to FIRM1_STAGE2 (Keyslot 0x11) in IndexedDB.
   */
  async saveStage2Header(header: BootStage2Header): Promise<void> {
    const plaintext = buildFirm1Partition(header);
    const ciphertext = await encryptPartition('firm1_stage2', plaintext);
    await this.writePartitionRaw('firm1_stage2', ciphertext);
    await this.syncNcsdDigests();
  }

  /**
   * Formats and provisions all 256 chunks into IndexedDB with real AES-128-CTR encrypted partitions and RSA-2048 signed NCSD header.
   */
  async provisionFreshNand(
    onProgress?: (writtenChunks: number, totalChunks: number, label: string) => void
  ): Promise<void> {
    // 1. Build plaintext partition binaries
    const rawFirm0 = buildFirm0Partition(getDefaultStage1Opcodes());
    const rawFirm1 = buildFirm1Partition(getDefaultStage2Header());
    const rawSysdata = buildSysDataPartition(getDefaultSystemConfig());
    const rawCtrnand = buildCtrNandPartition(getDefaultSystemTitles());
    const rawUserdata = buildUserDataPartition(getDefaultUserSaveData());

    // 2. Encrypt each partition with its respective 3DS hardware AES-128-CTR keyslot
    const [encFirm0, encFirm1, encSysdata, encCtrnand, encUserdata] = await Promise.all([
      encryptPartition('firm0_boot1', rawFirm0),
      encryptPartition('firm1_stage2', rawFirm1),
      encryptPartition('twl_sysdata', rawSysdata),
      encryptPartition('ctrnand_sys', rawCtrnand),
      encryptPartition('nand_userdata', rawUserdata),
    ]);

    // 3. Build NCSD Master Header in Sector 0 (stores SHA-256 of encrypted partitions and RSA-2048 signs table)
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
    let written = 0;

    for (const spec of NAND_PARTITIONS) {
      const buf = partitionMap[spec.id];
      const count = spec.endChunk - spec.startChunk + 1;

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CHUNKS, 'readwrite');
        const store = tx.objectStore(STORE_CHUNKS);
        for (let i = 0; i < count; i++) {
          const chunkIdx = spec.startChunk + i;
          store.put({
            chunkIndex: chunkIdx,
            partitionId: spec.id,
            data: buf.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            updatedAt: Date.now(),
          } satisfies StoredChunkRecord);
        }
        tx.oncomplete = () => {
          for (let i = 0; i < count; i++) {
            this.emitIO(spec.startChunk + i, 'write');
          }
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });

      written += count;
      onProgress?.(written, TOTAL_CHUNKS, `${spec.name} (${spec.mountPoint}) [AES-128-CTR Encrypted]`);
      await new Promise((r) => setTimeout(r, 45));
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({
        key: 'provisioned',
        value: true,
        cryptoVersion: 2,
        cipher: 'AES-128-CTR',
        signature: 'RSASSA-PKCS1-v1_5',
        formattedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async corruptPartition(id: PartitionId): Promise<{ chunkIndex: number; offset: number }> {
    const spec = NAND_PARTITIONS.find((p) => p.id === id)!;
    const chunk = await this.readChunk(spec.startChunk);
    const corrupted = new Uint8Array(chunk);

    if (id === 'ncsd_hdr') {
      // Corrupt RSA signature or magic at 0x100
      corrupted[0x20] ^= 0xff; // Invalidate RSA signature block
      corrupted[0x100] = 0xde;
      corrupted[0x101] = 0xad;
      await this.writeChunk(spec.startChunk, corrupted, 'corrupt');
      return { chunkIndex: spec.startChunk, offset: 0x100 };
    }

    // Corrupt ciphertext in flash memory
    corrupted[0x04] ^= 0x5a;
    corrupted[0x20] ^= 0xff;
    corrupted[0x21] ^= 0xaa;
    await this.writeChunk(spec.startChunk, corrupted, 'corrupt');
    return { chunkIndex: spec.startChunk, offset: 0x00 };
  }

  async corruptChunk(chunkIndex: number, offset = 0x20): Promise<void> {
    const chunk = await this.readChunk(chunkIndex);
    const corrupted = new Uint8Array(chunk);
    corrupted[offset % corrupted.length] ^= 0xff;
    await this.writeChunk(chunkIndex, corrupted, 'corrupt');
  }

  async repairPartition(id: PartitionId): Promise<void> {
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
        rawPlaintext = buildCtrNandPartition(getDefaultSystemTitles());
        break;
      case 'nand_userdata':
        rawPlaintext = buildUserDataPartition(getDefaultUserSaveData());
        break;
    }
    const ciphertext = await encryptPartition(id, rawPlaintext);
    await this.writePartitionRaw(id, ciphertext);
    await this.syncNcsdDigests();
  }

  async exportFullNandBin(): Promise<Uint8Array> {
    const out = new Uint8Array(TOTAL_CHUNKS * CHUNK_SIZE);
    for (let i = 0; i < TOTAL_CHUNKS; i++) {
      const chunk = await this.readChunk(i);
      out.set(chunk, i * CHUNK_SIZE);
    }
    return out;
  }

  async importFullNandBin(data: Uint8Array): Promise<void> {
    const expectedBytes = TOTAL_CHUNKS * CHUNK_SIZE;
    if (data.byteLength !== expectedBytes) {
      throw new Error(
        `Invalid NAND .bin size: expected ${expectedBytes.toLocaleString()} bytes (4.00 MB), got ${data.byteLength.toLocaleString()} bytes.`
      );
    }
    const db = await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_CHUNKS, STORE_META], 'readwrite');
      const chunkStore = tx.objectStore(STORE_CHUNKS);
      for (let i = 0; i < TOTAL_CHUNKS; i++) {
        const slice = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunkStore.put({
          chunkIndex: i,
          partitionId: getPartitionForChunk(i),
          data: slice,
          updatedAt: Date.now(),
        } satisfies StoredChunkRecord);
      }
      tx.objectStore(STORE_META).put({
        key: 'provisioned',
        value: true,
        cryptoVersion: 2,
        cipher: 'AES-128-CTR',
        restoredAt: Date.now(),
      });
      tx.oncomplete = () => {
        for (let i = 0; i < TOTAL_CHUNKS; i++) {
          this.emitIO(i, 'write');
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const nandDriver = new NandIDBDriver();

declare global {
  interface Window {
    ctrNand?: {
      driver: NandIDBDriver;
      getRecentIO: () => ChunkIOEvent[];
      clearRecentIO: () => void;
      setVerbose: (enabled: boolean) => void;
      isVerbose: () => boolean;
      readChunk: (chunkIndex: number) => Promise<Uint8Array>;
      writeChunk: (chunkIndex: number, data: Uint8Array) => Promise<void>;
      corruptChunk: (chunkIndex: number) => Promise<void>;
    };
  }
}

if (typeof window !== 'undefined') {
  window.ctrNand = {
    driver: nandDriver,
    getRecentIO: () => nandDriver.getRecentIOEvents(),
    clearRecentIO: () => nandDriver.clearRecentIO(),
    setVerbose: (enabled: boolean) => nandDriver.setVerboseLogging(enabled),
    isVerbose: () => nandDriver.isVerbose(),
    readChunk: (chunkIndex: number) => nandDriver.readChunk(chunkIndex),
    writeChunk: (chunkIndex: number, data: Uint8Array) => nandDriver.writeChunk(chunkIndex, data),
    corruptChunk: (chunkIndex: number) => nandDriver.corruptChunk(chunkIndex),
  };
}
