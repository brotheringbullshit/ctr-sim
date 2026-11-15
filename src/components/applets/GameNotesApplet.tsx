import React, { useRef, useState } from 'react';
import { GameNoteRecord, UserSaveData } from '../../nand/types';

interface GameNotesProps {
  screen: 'top' | 'bottom';
  userData: UserSaveData;
  onUpdateUserData: (next: UserSaveData) => Promise<void>;
  onExit: () => void;
}

const INK_COLORS = ['#0f172a', '#0284c7', '#e11d48', '#059669'];

export const GameNotesApplet: React.FC<GameNotesProps> = ({
  screen,
  userData,
  onUpdateUserData,
  onExit,
}) => {
  const [selectedNoteIdx, setSelectedNoteIdx] = useState(0);
  const [inkColor, setInkColor] = useState('#0f172a');
  const [draftStrokes, setDraftStrokes] = useState<GameNoteRecord['strokes']>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (screen === 'top') {
    const activeNote = userData.notes[selectedNoteIdx] ?? userData.notes[0];
    return (
      <div className="w-full h-full bg-amber-50 text-slate-900 p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between border-b border-amber-200 pb-1">
          <div className="text-xs font-bold font-display text-amber-900">Game Notes · Saved in NAND_USERDATA</div>
          <div className="text-[10px] font-mono text-amber-700">{userData.notes.length} notes</div>
        </div>

        <div className="flex-1 my-2 bg-white rounded-lg border border-amber-200 relative overflow-hidden flex items-center justify-center">
          {/* Notebook grid lines */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px)',
              backgroundSize: '100% 18px',
            }}
          />
          {activeNote ? (
            <svg viewBox="0 0 280 140" className="w-full h-full relative z-10">
              {activeNote.strokes.map((s, i) => (
                <polyline
                  key={i}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={s.points.map(([x, y]) => `${x},${y}`).join(' ')}
                />
              ))}
            </svg>
          ) : (
            <span className="text-xs text-slate-400">No notes saved yet</span>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-amber-800">
          <span>{activeNote ? `${activeNote.title} (${activeNote.createdAt})` : 'Draw below and save'}</span>
          <div className="flex gap-1">
            {userData.notes.map((n, idx) => (
              <button
                key={n.id}
                onClick={() => setSelectedNoteIdx(idx)}
                className={`px-1.5 py-0.5 rounded font-mono text-[9px] cursor-pointer ${
                  idx === selectedNoteIdx ? 'bg-amber-600 text-white' : 'bg-amber-200/70 text-amber-900'
                }`}
              >
                #{idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getRelPoint = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 280;
    const y = ((e.clientY - rect.top) / rect.height) * 140;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getRelPoint(e);
    setIsDrawing(true);
    setDraftStrokes((prev) => [...prev, { color: inkColor, width: 3, points: [pt] }]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const pt = getRelPoint(e);
    setDraftStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, points: [...last.points, pt] };
      return next;
    });
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleSaveNote = async () => {
    if (draftStrokes.length === 0) return;
    const newNote: GameNoteRecord = {
      id: `note-${Date.now()}`,
      title: `Sketch #${userData.notes.length + 1}`,
      createdAt: new Date().toISOString().slice(0, 10),
      strokes: draftStrokes,
    };
    await onUpdateUserData({
      ...userData,
      notes: [newNote, ...userData.notes].slice(0, 12),
    });
    setDraftStrokes([]);
  };

  return (
    <div className="w-full h-full bg-amber-50 p-2 flex flex-col justify-between select-none">
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1">
          {INK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setInkColor(c)}
              className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                inkColor === c ? 'border-slate-900 scale-110' : 'border-white'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDraftStrokes([])}
            className="px-2 py-0.5 rounded bg-white border border-amber-300 text-[10px] font-medium text-slate-700 cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={handleSaveNote}
            disabled={draftStrokes.length === 0}
            className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-[10px] font-semibold cursor-pointer"
          >
            Save to NAND
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 280 140"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex-1 w-full bg-white rounded-lg border border-amber-300 touch-none cursor-crosshair"
      >
        {draftStrokes.map((s, i) => (
          <polyline
            key={i}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={s.points.map(([x, y]) => `${x},${y}`).join(' ')}
          />
        ))}
      </svg>

      <div className="flex justify-between items-center mt-1">
        <span className="text-[10px] text-amber-800">Draw on touch canvas</span>
        <button
          onClick={onExit}
          className="px-3 py-1 rounded bg-slate-800 text-white text-[10px] font-semibold cursor-pointer"
        >
          Back to HOME
        </button>
      </div>
    </div>
  );
};
