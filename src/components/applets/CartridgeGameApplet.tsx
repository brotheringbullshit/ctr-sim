import React, { useEffect, useRef, useState } from 'react';
import { UserSaveData } from '../../nand/types';
import { soundEngine } from '../../audio/soundEngine';

interface CartridgeGameProps {
  screen: 'top' | 'bottom';
  userData: UserSaveData;
  onSaveHighScore: (score: number) => Promise<void>;
  onExit: () => void;
}

// Shared lightweight game state channel per render via props/callbacks isn't needed if parent renders both screens,
// Wait: ConsoleShell renders top and bottom screens separately! Let's keep game state in module or parent hook?
// Better: Export a clean GameState hook or store state in a small shared ref/event bus or lift into App?
// Let's use a tiny shared reactive store right here so both top and bottom screens stay in lockstep at 60fps!
interface Enemy {
  id: number;
  x: number;
  y: number;
  speed: number;
}
interface Bullet {
  id: number;
  x: number;
  y: number;
}

const listeners = new Set<() => void>();
let gState = {
  running: false,
  gameOver: false,
  shipX: 50,
  score: 0,
  enemies: [] as Enemy[],
  bullets: [] as Bullet[],
  nextId: 1,
};

function notify() {
  listeners.forEach((fn) => fn());
}

export function resetStarburstGame() {
  gState = {
    running: true,
    gameOver: false,
    shipX: 50,
    score: 0,
    enemies: [],
    bullets: [],
    nextId: 1,
  };
  notify();
}

export function moveStarburstShip(deltaX: number) {
  if (!gState.running) return;
  gState = { ...gState, shipX: Math.max(8, Math.min(92, gState.shipX + deltaX)) };
  notify();
}

export function fireStarburstLaser() {
  if (!gState.running) return;
  soundEngine.playTone(880, 0.05, 'square', 0.14);
  gState = {
    ...gState,
    bullets: [...gState.bullets, { id: gState.nextId++, x: gState.shipX, y: 80 }],
  };
  notify();
}

export const CartridgeGameApplet: React.FC<CartridgeGameProps> = ({
  screen,
  userData,
  onSaveHighScore,
  onExit,
}) => {
  const [, setTick] = useState(0);
  const highSavedRef = useRef(userData.cartridgeHighScore);

  useEffect(() => {
    highSavedRef.current = userData.cartridgeHighScore;
  }, [userData.cartridgeHighScore]);

  useEffect(() => {
    const cb = () => setTick((t) => t + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  // Only top screen runs the simulation tick loop so speed doesn't double
  useEffect(() => {
    if (screen !== 'top') return;
    if (!gState.running) resetStarburstGame();

    const timer = setInterval(() => {
      if (!gState.running) return;
      let enemies = gState.enemies.map((e) => ({ ...e, y: e.y + e.speed }));
      let bullets = gState.bullets.map((b) => ({ ...b, y: b.y - 6 })).filter((b) => b.y > -5);
      let score = gState.score;
      let gameOver = false;

      if (Math.random() < 0.09) {
        enemies.push({
          id: gState.nextId++,
          x: 10 + Math.random() * 80,
          y: -6,
          speed: 1.5 + Math.random() * 1.4,
        });
      }

      // Collision detection
      const remainingEnemies: Enemy[] = [];
      for (const e of enemies) {
        const hitIdx = bullets.findIndex((b) => Math.abs(b.x - e.x) < 8 && Math.abs(b.y - e.y) < 8);
        if (hitIdx !== -1) {
          bullets.splice(hitIdx, 1);
          score += 25;
          soundEngine.playTone(540, 0.07, 'triangle', 0.16);
        } else if (e.y > 84 && Math.abs(e.x - gState.shipX) < 10) {
          gameOver = true;
        } else if (e.y < 102) {
          remainingEnemies.push(e);
        }
      }

      if (gameOver) {
        soundEngine.playError();
        if (score > highSavedRef.current) {
          void onSaveHighScore(score);
        }
      }

      gState = {
        ...gState,
        enemies: remainingEnemies,
        bullets,
        score,
        running: !gameOver,
        gameOver,
      };
      notify();
    }, 55);

    return () => clearInterval(timer);
  }, [screen, onSaveHighScore]);

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-slate-950 text-white relative overflow-hidden select-none">
        {/* HUD */}
        <div className="absolute top-1.5 left-2.5 right-2.5 flex justify-between text-[10px] font-mono z-20 text-sky-300">
          <span>STARBURST PILOT 3D</span>
          <span>SCORE: {gState.score} · HI: {Math.max(userData.cartridgeHighScore, gState.score)}</span>
        </div>

        {/* Bullets */}
        {gState.bullets.map((b) => (
          <div
            key={b.id}
            className="absolute w-1 h-3 bg-cyan-300 rounded-full -translate-x-1/2"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
          />
        ))}

        {/* Enemies */}
        {gState.enemies.map((e) => (
          <div
            key={e.id}
            className="absolute w-4 h-4 bg-rose-500 rotate-45 border border-rose-200 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${e.x}%`, top: `${e.y}%` }}
          />
        ))}

        {/* Player Ship */}
        <div
          className="absolute bottom-3 w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[16px] border-b-sky-400 -translate-x-1/2"
          style={{ left: `${gState.shipX}%` }}
        />

        {gState.gameOver && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-30">
            <div className="text-base font-bold text-rose-400 font-display">MISSION OVER</div>
            <div className="text-xs font-mono text-slate-200 mt-1">Final Score: {gState.score}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 p-3 flex flex-col justify-between select-none">
      <div className="text-[10px] font-mono text-sky-400 flex justify-between">
        <span>GAME CARD FLIGHT DECK</span>
        <span>Save: NAND_USERDATA</span>
      </div>

      <div className="flex items-center justify-center gap-3 my-auto">
        <button
          onClick={() => moveStarburstShip(-12)}
          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold cursor-pointer active:scale-95"
        >
          ◀ Left
        </button>
        <button
          onClick={fireStarburstLaser}
          className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold cursor-pointer active:scale-95"
        >
          FIRE
        </button>
        <button
          onClick={() => moveStarburstShip(12)}
          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold cursor-pointer active:scale-95"
        >
          Right ▶
        </button>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-slate-800">
        {gState.gameOver ? (
          <button
            onClick={resetStarburstGame}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer"
          >
            Play Again
          </button>
        ) : (
          <span className="text-[10px] text-slate-400">Also playable with D-Pad + A</span>
        )}
        <button
          onClick={onExit}
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-semibold cursor-pointer"
        >
          HOME Menu
        </button>
      </div>
    </div>
  );
};
