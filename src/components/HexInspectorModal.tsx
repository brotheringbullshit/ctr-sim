import React, { useEffect, useRef, useState } from 'react';
import { nandDriver, getPartitionForChunk } from '../nand/idbStorage';
import { CHUNK_SIZE, NAND_PARTITIONS, TOTAL_CHUNKS } from '../nand/types';
import { CTR_KEYSLOTS, toHexByte } from '../nand/crypto';
import { X, RefreshCw, Download, Upload, Check, Lock, Unlock } from 'lucide-react';

interface HexInspectorModalProps {
  initialChunk: number;
  onClose: () => void;
  onMutated: () => void;
  onExportNandBin: () => Promise<void>;
  onImportNandBin: (file: File) => Promise<void>;
}

function parseHexBytes(input: string): number[] | null {
  const cleaned = input.replace(/0x/gi, '').replace(/[,:;\s-]+/g, '').trim();
  if (!cleaned || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return null;
  }
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    out.push(parseInt(cleaned.slice(i, i + 2), 16));
  }
  return out;
}

export const HexInspectorModal: React.FC<HexInspectorModalProps> = ({
  initialChunk,
  onClose,
  onMutated,
  onExportNandBin,
  onImportNandBin,
}) => {
  const [chunkIndex, setChunkIndex] = useState(initialChunk);
  const [viewMode, setViewMode] = useState<'raw' | 'decrypted'>('raw');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pageOffset, setPageOffset] = useState(0); // 512-byte viewport inside 16KB chunk
  const [selectedOffset, setSelectedOffset] = useState(initialChunk === 0 ? 0x100 : 0);
  const [hexInput, setHexInput] = useState('');
  const [jumpInput, setJumpInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [binBusy, setBinBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingJumpOffsetRef = useRef<number | null>(null);

  const partitionId = getPartitionForChunk(chunkIndex);
  const partitionSpec = NAND_PARTITIONS.find((p) => p.id === partitionId)!;

  const showStatus = (msg: string) => {
    setError(null);
    setStatusMsg(msg);
  };

  const loadChunk = async (idx: number, resetOffset = false, mode = viewMode) => {
    setLoading(true);
    setError(null);
    try {
      const data =
        mode === 'decrypted' && partitionId !== 'ncsd_hdr'
          ? await nandDriver.readDecryptedChunk(idx)
          : await nandDriver.readChunk(idx);
      setBytes(data);
      const pending = pendingJumpOffsetRef.current;
      pendingJumpOffsetRef.current = null;
      const nextSel =
        pending !== null
          ? Math.min(pending, CHUNK_SIZE - 1)
          : resetOffset
          ? idx === 0
            ? 0x100
            : 0
          : Math.min(selectedOffset, CHUNK_SIZE - 1);
      if (pending !== null || resetOffset) {
        setSelectedOffset(nextSel);
        setPageOffset(Math.floor(nextSel / 512) * 512);
      }
      setHexInput(toHexByte(data[nextSel]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed reading chunk from IndexedDB');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChunk(chunkIndex, true, viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkIndex, viewMode]);

  const selectOffset = (offset: number) => {
    if (!bytes || offset < 0 || offset >= CHUNK_SIZE) return;
    setSelectedOffset(offset);
    setHexInput(toHexByte(bytes[offset]));
    setError(null);
    setStatusMsg(null);
    const targetPage = Math.floor(offset / 512) * 512;
    if (targetPage !== pageOffset) {
      setPageOffset(targetPage);
    }
  };

  const writeBytesAt = async (startOffset: number, values: number[]) => {
    if (!bytes) return;
    if (startOffset + values.length > CHUNK_SIZE) {
      setError(`Write exceeds 16 KB chunk boundary (max ${CHUNK_SIZE - startOffset} bytes from 0x${startOffset.toString(16).toUpperCase()}).`);
      return;
    }
    const copy = new Uint8Array(bytes);
    values.forEach((v, i) => {
      copy[startOffset + i] = v & 0xff;
    });
    await nandDriver.writeChunk(chunkIndex, copy, 'corrupt');
    setBytes(copy);
    setHexInput(toHexByte(copy[selectedOffset]));
    onMutated();
    const absAddr = (chunkIndex * CHUNK_SIZE + startOffset).toString(16).padStart(6, '0').toUpperCase();
    showStatus(`Wrote ${values.length} byte${values.length === 1 ? '' : 's'} at 0x${absAddr} in IndexedDB.`);
  };

  const handleApplyHexInput = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseHexBytes(hexInput);
    if (!parsed) {
      setError('Enter valid hex byte pairs (e.g. 4E or DE AD BE EF).');
      return;
    }
    await writeBytesAt(selectedOffset, parsed);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = jumpInput.trim().replace(/^0x/i, '');
    const val = parseInt(cleaned, 16);
    if (Number.isNaN(val) || val < 0 || val >= TOTAL_CHUNKS * CHUNK_SIZE) {
      setError('Offset out of 4 MB NAND range (0x000000..0x3FFFFF).');
      return;
    }
    if (val < CHUNK_SIZE && cleaned.length <= 4) {
      // Treat <= 0x3FFF as chunk-relative offset if user typed a short chunk offset
      selectOffset(val);
      setJumpInput('');
      return;
    }
    const targetChunk = Math.floor(val / CHUNK_SIZE);
    const innerOffset = val % CHUNK_SIZE;
    setJumpInput('');
    if (targetChunk !== chunkIndex) {
      pendingJumpOffsetRef.current = innerOffset;
      setChunkIndex(targetChunk);
    } else {
      selectOffset(innerOffset);
    }
  };

  const handleExportClick = async () => {
    setBinBusy(true);
    setError(null);
    try {
      await onExportNandBin();
      showStatus('Exported full 4.00 MB NAND image (ctr-sim-nand.bin).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export NAND .bin');
    } finally {
      setBinBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBinBusy(true);
    setError(null);
    try {
      await onImportNandBin(file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore NAND .bin');
      setBinBusy(false);
    }
  };

  const rows: number[] = [];
  const startRow = pageOffset;
  const endRow = Math.min(CHUNK_SIZE, pageOffset + 512);
  for (let off = startRow; off < endRow; off += 16) {
    rows.push(off);
  }

  const selectedByte = bytes ? bytes[selectedOffset] : 0;
  const selectedAbsAddr = (chunkIndex * CHUNK_SIZE + selectedOffset)
    .toString(16)
    .padStart(6, '0')
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
          <div>
            <h3 className="text-base font-semibold text-slate-900 font-display">
              IndexedDB Chunk Hex Editor
            </h3>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
              <span className="font-mono font-semibold text-slate-700">
                Chunk #{chunkIndex} / {TOTAL_CHUNKS - 1}
              </span>
              <span aria-hidden="true">·</span>
              <span>Partition: {partitionSpec.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                Base 0x{(chunkIndex * CHUNK_SIZE).toString(16).padStart(6, '0').toUpperCase()}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-800 font-semibold">
                {partitionId === 'ncsd_hdr' ? (
                  <span>RSA-2048 Signed (Plaintext)</span>
                ) : (
                  <>
                    <Lock className="w-2.5 h-2.5 text-indigo-600" />
                    <span>AES-128-CTR ({CTR_KEYSLOTS[partitionId].slotHex})</span>
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportClick()}
              disabled={binBusy}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save .bin</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={binBusy}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Restore .bin</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin,application/octet-stream"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 cursor-pointer"
              aria-label="Close Hex Editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Strip */}
        <div className="px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-white text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={partitionId}
              onChange={(e) => {
                const spec = NAND_PARTITIONS.find((p) => p.id === e.target.value);
                if (spec) {
                  setChunkIndex(spec.startChunk);
                }
              }}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white font-mono text-xs"
            >
              {NAND_PARTITIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (ch {p.startChunk}..{p.endChunk})
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setChunkIndex((c) => Math.max(0, c - 1))}
                disabled={chunkIndex === 0}
                className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                Prev Chunk
              </button>
              <button
                type="button"
                onClick={() => setChunkIndex((c) => Math.min(TOTAL_CHUNKS - 1, c + 1))}
                disabled={chunkIndex === TOTAL_CHUNKS - 1}
                className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                Next Chunk
              </button>
            </div>

            {partitionId !== 'ncsd_hdr' && (
              <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 ml-1">
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                    viewMode === 'raw'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Raw Ciphertext
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('decrypted')}
                  className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                    viewMode === 'decrypted'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Decrypted
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPageOffset((o) => Math.max(0, o - 512))}
              disabled={pageOffset === 0}
              className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              -512 B
            </button>
            <span className="font-mono text-slate-600 tabular-nums px-1">
              0x{pageOffset.toString(16).padStart(4, '0').toUpperCase()}..0x
              {Math.min(CHUNK_SIZE - 1, pageOffset + 511).toString(16).padStart(4, '0').toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => setPageOffset((o) => Math.min(CHUNK_SIZE - 512, o + 512))}
              disabled={pageOffset >= CHUNK_SIZE - 512}
              className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              +512 B
            </button>
            <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 ml-1">
              <input
                type="text"
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                placeholder="0xOffset"
                className="w-24 px-2 py-1 rounded border border-slate-300 font-mono text-xs"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 font-medium cursor-pointer whitespace-nowrap shrink-0"
              >
                Go
              </button>
            </form>
          </div>
        </div>

        {/* Hex Grid */}
        <div className="flex-1 overflow-y-auto thin-scroll p-4 bg-slate-950 text-slate-200 font-mono text-xs select-none">
          {loading ? (
            <div className="text-slate-400 py-8 text-center">Reading 16,384 bytes from IndexedDB...</div>
          ) : (
            bytes && (
              <div className="space-y-0.5">
                {rows.map((rowOffset) => {
                  const slice = bytes.slice(rowOffset, rowOffset + 16);
                  const absOffset = chunkIndex * CHUNK_SIZE + rowOffset;

                  return (
                    <div key={rowOffset} className="flex items-center gap-3 hover:bg-slate-900/70 px-2 py-0.5 rounded">
                      <span className="text-slate-500 w-20 shrink-0 tabular-nums">
                        0x{absOffset.toString(16).padStart(6, '0').toUpperCase()}
                      </span>

                      <div className="flex items-center gap-1 flex-1">
                        {Array.from(slice).map((b, col) => {
                          const byteOffset = rowOffset + col;
                          const isSelected = byteOffset === selectedOffset;
                          return (
                            <button
                              key={col}
                              type="button"
                              onClick={() => selectOffset(byteOffset)}
                              className={`px-1 py-0.5 rounded text-[11px] leading-none cursor-pointer transition-colors ${
                                col === 8 ? 'ml-1.5' : ''
                              } ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-950 font-bold'
                                  : 'text-sky-300 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              {toHexByte(b)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="w-40 shrink-0 border-l border-slate-800 pl-3 flex items-center">
                        {Array.from(slice).map((b, col) => {
                          const byteOffset = rowOffset + col;
                          const isSelected = byteOffset === selectedOffset;
                          const ch = b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
                          return (
                            <button
                              key={col}
                              type="button"
                              onClick={() => selectOffset(byteOffset)}
                              className={`w-[9px] text-center leading-none py-0.5 rounded cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-950 font-bold'
                                  : 'text-emerald-300/90 hover:bg-slate-800'
                              }`}
                            >
                              {ch}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Byte Editor & Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 space-y-2">
          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-1.5">
              {error}
            </div>
          )}
          {statusMsg && !error && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={(e) => void handleApplyHexInput(e)} className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-mono text-slate-700 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 tabular-nums">
                @ 0x{selectedAbsAddr} = <span className="font-bold text-slate-900">0x{toHexByte(selectedByte)}</span>
                <span className="text-slate-400 ml-1.5">
                  ({selectedByte >= 32 && selectedByte <= 126 ? `'${String.fromCharCode(selectedByte)}'` : '·'})
                </span>
              </div>

              <input
                type="text"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                placeholder="e.g. 4E or DE AD BE EF"
                className="w-44 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              <button
                type="submit"
                disabled={!bytes}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                Write Hex
              </button>

              <button
                type="button"
                disabled={!bytes}
                onClick={() => void writeBytesAt(selectedOffset, [selectedByte ^ 0xff])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-mono text-slate-700 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                XOR FF
              </button>
              <button
                type="button"
                disabled={!bytes}
                onClick={() => void writeBytesAt(selectedOffset, [0x00])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-mono text-slate-700 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                0x00
              </button>
              <button
                type="button"
                disabled={!bytes}
                onClick={() => void writeBytesAt(selectedOffset, [0xff])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-mono text-slate-700 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                0xFF
              </button>
            </form>

            <button
              type="button"
              onClick={() => void loadChunk(chunkIndex)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload IDB</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
