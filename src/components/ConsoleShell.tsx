import React from 'react';
import { Home, Power } from 'lucide-react';

interface ConsoleShellProps {
  topScreen: React.ReactNode;
  bottomScreen: React.ReactNode;
  poweredOn: boolean;
  nandBusy: boolean;
  wirelessOn: boolean;
  brightness: number; // 1..5
  depth3D: number; // 0..1
  heldBootKey?: 'NONE' | 'SELECT' | 'START';
  onChangeDepth3D: (val: number) => void;
  onPressDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onPressButton: (btn: 'A' | 'B' | 'X' | 'Y' | 'SELECT' | 'START' | 'HOME' | 'POWER') => void;
}

export const ConsoleShell: React.FC<ConsoleShellProps> = ({
  topScreen,
  bottomScreen,
  poweredOn,
  nandBusy,
  wirelessOn,
  brightness,
  depth3D,
  heldBootKey = 'NONE',
  onChangeDepth3D,
  onPressDirection,
  onPressButton,
}) => {
  // Brightness filter: 1 -> 0.58, 5 -> 1.0
  const lcdBrightness = poweredOn ? 0.52 + brightness * 0.096 : 0.1;

  return (
    <div className="flex flex-col items-center select-none w-full max-w-[680px] mx-auto">
      {/* ==================== UPPER LID (TOP 3D SCREEN) ==================== */}
      <div className="w-[92%] bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-[28px] rounded-b-xl p-4 sm:p-5 shadow-xl border border-slate-700/80 relative">
        {/* Camera lens & sensor dots on upper bezel */}
        <div className="flex items-center justify-center gap-3 mb-2.5">
          <span className="w-2 h-2 rounded-full bg-slate-950 border border-slate-700" />
          <span className="w-3 h-3 rounded-full bg-slate-950 border border-slate-600 flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-sky-900" />
          </span>
          <span className="w-2 h-2 rounded-full bg-slate-950 border border-slate-700" />
        </div>

        <div className="flex items-center gap-3">
          {/* Left Speaker Grille */}
          <div className="hidden sm:grid grid-cols-2 gap-1.5 px-1 opacity-60">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="w-1 h-1 rounded-full bg-slate-950" />
            ))}
          </div>

          {/* Top 5:3 Screen Frame (400x240 proportion) */}
          <div className="flex-1 min-w-0 bg-slate-950 p-2 rounded-xl border border-slate-700 shadow-inner">
            <div
              className="w-full aspect-[5/3] rounded-md overflow-hidden relative bg-black transition-[filter] duration-150"
              style={{ filter: `brightness(${lcdBrightness})` }}
            >
              {topScreen}
              <div className="absolute inset-0 pointer-events-none lcd-scanlines" />
            </div>
          </div>

          {/* Right Speaker + Physical 3D Depth Slider */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="text-[9px] font-mono font-bold text-slate-300 tracking-wider">3D</div>
            <div className="h-28 w-6 bg-slate-950 rounded-full border border-slate-700 flex items-center justify-center relative py-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={depth3D}
                onChange={(e) => onChangeDepth3D(parseFloat(e.target.value))}
                aria-label="3D Depth Slider"
                className="w-24 -rotate-90 accent-sky-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ==================== HINGE & HARDWARE LEDS ==================== */}
      <div className="w-[95%] h-6 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 rounded-full -my-1.5 z-10 border border-slate-600/70 shadow-md flex items-center justify-between px-6">
        <div className="flex items-center gap-3 text-[9px] font-mono text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                poweredOn ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]' : 'bg-slate-600'
              }`}
            />
            <span>PWR</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                poweredOn && wirelessOn ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-slate-600'
              }`}
            />
            <span>NET</span>
          </span>
        </div>

        <div className="text-[10px] font-display font-semibold tracking-wider text-slate-400">
          CTR-SIM XL
        </div>

        <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300">
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              nandBusy ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
            }`}
          />
          <span>NAND I/O</span>
        </div>
      </div>

      {/* ==================== LOWER DECK (TOUCH SCREEN + CONTROLS) ==================== */}
      <div className="w-full bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-xl rounded-b-[32px] p-4 sm:p-5 shadow-2xl border border-slate-700/80">
        <div className="grid grid-cols-[70px_minmax(0,1fr)_70px] sm:grid-cols-[104px_minmax(0,1fr)_104px] gap-2 sm:gap-4 items-center">
          {/* LEFT CONTROLS: Circle Pad + D-Pad */}
          <div className="flex flex-col items-center justify-between h-full py-2 gap-4">
            {/* Circle Pad */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-950 border border-slate-700 shadow-inner flex items-center justify-center">
              <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-gradient-to-b from-slate-600 to-slate-700 border border-slate-500 shadow-md relative flex items-center justify-center">
                <button
                  onClick={() => onPressDirection('up')}
                  aria-label="Circle Pad Up"
                  className="absolute top-0.5 inset-x-3 h-3.5 cursor-pointer opacity-0"
                />
                <button
                  onClick={() => onPressDirection('down')}
                  aria-label="Circle Pad Down"
                  className="absolute bottom-0.5 inset-x-3 h-3.5 cursor-pointer opacity-0"
                />
                <button
                  onClick={() => onPressDirection('left')}
                  aria-label="Circle Pad Left"
                  className="absolute left-0.5 inset-y-3 w-3.5 cursor-pointer opacity-0"
                />
                <button
                  onClick={() => onPressDirection('right')}
                  aria-label="Circle Pad Right"
                  className="absolute right-0.5 inset-y-3 w-3.5 cursor-pointer opacity-0"
                />
                <span className="w-6 h-6 rounded-full border border-slate-500/50 pointer-events-none" />
              </div>
            </div>

            {/* Classic Cross D-Pad */}
            <div className="relative w-16 h-16 grid grid-cols-3 grid-rows-3 gap-0.5">
              <div />
              <button
                onClick={() => onPressDirection('up')}
                aria-label="D-Pad Up"
                className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-t border border-slate-600 text-[9px] text-slate-300 flex items-center justify-center cursor-pointer"
              >
                ▲
              </button>
              <div />
              <button
                onClick={() => onPressDirection('left')}
                aria-label="D-Pad Left"
                className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-l border border-slate-600 text-[9px] text-slate-300 flex items-center justify-center cursor-pointer"
              >
                ◀
              </button>
              <div className="bg-slate-700 border border-slate-600/50" />
              <button
                onClick={() => onPressDirection('right')}
                aria-label="D-Pad Right"
                className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-r border border-slate-600 text-[9px] text-slate-300 flex items-center justify-center cursor-pointer"
              >
                ▶
              </button>
              <div />
              <button
                onClick={() => onPressDirection('down')}
                aria-label="D-Pad Down"
                className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-b border border-slate-600 text-[9px] text-slate-300 flex items-center justify-center cursor-pointer"
              >
                ▼
              </button>
              <div />
            </div>
          </div>

          {/* CENTER: Bottom 4:3 Touch Screen (320x240 proportion) */}
          <div className="min-w-0 bg-slate-950 p-2 rounded-xl border border-slate-700 shadow-inner">
            <div
              className="w-full aspect-[4/3] rounded-md overflow-hidden relative bg-black transition-[filter] duration-150"
              style={{ filter: `brightness(${lcdBrightness})` }}
            >
              {bottomScreen}
              <div className="absolute inset-0 pointer-events-none lcd-scanlines" />
            </div>
          </div>

          {/* RIGHT CONTROLS: A/B/X/Y + Power */}
          <div className="flex flex-col items-center justify-between h-full py-2 gap-4">
            {/* ABXY Diamond */}
            <div className="relative w-18 h-18 sm:w-20 sm:h-20 grid grid-cols-3 grid-rows-3 place-items-center">
              <div />
              <button
                onClick={() => onPressButton('X')}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700 hover:bg-slate-600 active:scale-95 border border-slate-500 text-[10px] font-bold text-sky-300 shadow cursor-pointer"
              >
                X
              </button>
              <div />
              <button
                onClick={() => onPressButton('Y')}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700 hover:bg-slate-600 active:scale-95 border border-slate-500 text-[10px] font-bold text-emerald-300 shadow cursor-pointer"
              >
                Y
              </button>
              <div />
              <button
                onClick={() => onPressButton('A')}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700 hover:bg-slate-600 active:scale-95 border border-slate-500 text-[10px] font-bold text-rose-300 shadow cursor-pointer"
              >
                A
              </button>
              <div />
              <button
                onClick={() => onPressButton('B')}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700 hover:bg-slate-600 active:scale-95 border border-slate-500 text-[10px] font-bold text-amber-300 shadow cursor-pointer"
              >
                B
              </button>
              <div />
            </div>

            {/* Power Button */}
            <button
              onClick={() => onPressButton('POWER')}
              title="Power Toggle / Reboot"
              className="w-9 h-9 rounded-full bg-slate-950 hover:bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* BOTTOM STRIP: SELECT · HOME · START */}
        <div className="flex items-center justify-center gap-4 mt-3.5">
          <button
            onClick={() => onPressButton('SELECT')}
            className={`px-4 py-1 rounded-full border text-[10px] font-mono font-semibold cursor-pointer transition-all ${
              heldBootKey === 'SELECT'
                ? 'bg-slate-900 border-sky-400 text-sky-300 translate-y-[1px]'
                : 'bg-slate-700 hover:bg-slate-600 active:scale-95 border-slate-600 text-slate-200'
            }`}
          >
            SELECT
          </button>

          <button
            onClick={() => onPressButton('HOME')}
            title="HOME Menu Button"
            className="px-6 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-95 border border-slate-500 text-slate-100 flex items-center gap-1.5 text-[11px] font-semibold shadow cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>HOME</span>
          </button>

          <button
            onClick={() => onPressButton('START')}
            className={`px-4 py-1 rounded-full border text-[10px] font-mono font-semibold cursor-pointer transition-all ${
              heldBootKey === 'START'
                ? 'bg-slate-900 border-sky-400 text-sky-300 translate-y-[1px]'
                : 'bg-slate-700 hover:bg-slate-600 active:scale-95 border-slate-600 text-slate-200'
            }`}
          >
            START
          </button>
        </div>
      </div>
    </div>
  );
};
