import React, { useEffect, useRef, useState } from 'react';
import { SupportedLanguage, UserSaveData } from '../../nand/types';
import { soundEngine } from '../../audio/soundEngine';
import { getTranslations } from '../../i18n/translations';
import { CartridgeRuntimeState, fcram } from '../../ram/fcram';

interface CartridgeGameProps {
  screen: 'top' | 'bottom';
  userData: UserSaveData;
  language?: SupportedLanguage;
  onSaveHighScore: (score: number) => Promise<void>;
  onExit: () => void;
}

const DEFAULT_GAME_STATE: CartridgeRuntimeState = {
  running: false,
  gameOver: false,
  shipX: 50,
  score: 0,
  enemies: [],
  bullets: [],
  nextId: 1,
};

function readRamGameState(): CartridgeRuntimeState {
  return fcram.getCartridgeState() ?? DEFAULT_GAME_STATE;
}

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function resetStarburstGame() {
  fcram.setCartridgeState({
    running: true,
    gameOver: false,
    shipX: 50,
    score: 0,
    enemies: [],
    bullets: [],
    nextId: 1,
  });
  notify();
}

export function moveStarburstShip(deltaX: number) {
  const cur = readRamGameState();
  if (!cur.running) return;
  fcram.setCartridgeState({
    ...cur,
    shipX: Math.max(8, Math.min(92, cur.shipX + deltaX)),
  });
  notify();
}

export function fireStarburstLaser() {
  const cur = readRamGameState();
  if (!cur.running) return;
  soundEngine.playTone(880, 0.05, 'square', 0.14);
  fcram.setCartridgeState({
    ...cur,
    nextId: cur.nextId + 1,
    bullets: [...cur.bullets, { id: cur.nextId, x: cur.shipX, y: 80 }],
  });
  notify();
}

export const CartridgeGameApplet: React.FC<CartridgeGameProps> = ({
  screen,
  userData,
  language,
  onSaveHighScore,
  onExit,
}) => {
  const [, setTick] = useState(0);
  const highSavedRef = useRef(userData.cartridgeHighScore);
  const saveHighScoreRef = useRef(onSaveHighScore);
  const t = getTranslations(language);

  useEffect(() => {
    highSavedRef.current = userData.cartridgeHighScore;
  }, [userData.cartridgeHighScore]);

  useEffect(() => {
    saveHighScoreRef.current = onSaveHighScore;
  }, [onSaveHighScore]);

  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  // Only top screen runs the simulation tick loop so speed doesn't double
  useEffect(() => {
    if (screen !== 'top') return;
    if (!readRamGameState().running && !readRamGameState().gameOver) {
      resetStarburstGame();
    }

    const timer = window.setInterval(() => {
      const cur = readRamGameState();
      if (!cur.running) return;

      const enemies = cur.enemies.map((e) => ({ ...e, y: e.y + e.speed }));
      const bullets = cur.bullets.map((b) => ({ ...b, y: b.y - 6 })).filter((b) => b.y > -5);
      let score = cur.score;
      let nextId = cur.nextId;
      let gameOver = false;

      if (Math.random() < 0.09) {
        enemies.push({
          id: nextId++,
          x: 10 + Math.random() * 80,
          y: -6,
          speed: 1.5 + Math.random() * 1.4,
        });
      }

      // Collision detection
      const remainingEnemies: CartridgeRuntimeState['enemies'] = [];
      for (const e of enemies) {
        const hitIdx = bullets.findIndex((b) => Math.abs(b.x - e.x) < 8 && Math.abs(b.y - e.y) < 8);
        if (hitIdx !== -1) {
          bullets.splice(hitIdx, 1);
          score += 25;
          soundEngine.playTone(540, 0.07, 'triangle', 0.16);
        } else if (e.y > 84 && Math.abs(e.x - cur.shipX) < 10) {
          gameOver = true;
        } else if (e.y < 102) {
          remainingEnemies.push(e);
        }
      }

      if (gameOver) {
        soundEngine.playError();
        if (score > highSavedRef.current) {
          void saveHighScoreRef.current(score);
        }
      }

      fcram.setCartridgeState({
        ...cur,
        enemies: remainingEnemies,
        bullets,
        score,
        nextId,
        running: !gameOver,
        gameOver,
      });
      notify();
    }, 55);

    return () => window.clearInterval(timer);
  }, [screen]);

  const gState = readRamGameState();

  if (screen === 'top') {
    return (
      <div className="w-full h-full bg-slate-950 text-white relative overflow-hidden select-none">
        {/* HUD */}
        <div className="absolute top-1.5 left-2.5 right-2.5 flex justify-between text-[10px] font-mono z-20 text-sky-300">
          <span>STARBURST PILOT 3D</span>
          <span>
            {t.cartScore}: {gState.score} · {t.cartHighScore}: {Math.max(userData.cartridgeHighScore, gState.score)}
          </span>
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
            <div className="text-base font-bold text-rose-400 font-display">{t.cartGameOver}</div>
            <div className="text-xs font-mono text-slate-200 mt-1">
              {t.cartScore}: {gState.score}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 p-3 flex flex-col justify-between select-none">
      <div className="text-[10px] font-mono text-sky-400 flex justify-between">
        <span>STARBURST 3D</span>
        <span>NAND_USERDATA</span>
      </div>

      <div className="flex items-center justify-center gap-3 my-auto">
        <button
          onClick={() => moveStarburstShip(-12)}
          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold cursor-pointer active:scale-95"
        >
          ◀
        </button>
        <button
          onClick={fireStarburstLaser}
          className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold cursor-pointer active:scale-95"
        >
          {t.cartShoot}
        </button>
        <button
          onClick={() => moveStarburstShip(12)}
          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold cursor-pointer active:scale-95"
        >
          ▶
        </button>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-slate-800">
        {gState.gameOver ? (
          <button
            onClick={resetStarburstGame}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer"
          >
            {t.cartPressRestart}
          </button>
        ) : (
          <span className="text-[10px] text-slate-400">D-Pad + [A]</span>
        )}
        <button
          onClick={onExit}
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-semibold cursor-pointer"
        >
          {t.returnHome}
        </button>
      </div>
    </div>
  );
};
