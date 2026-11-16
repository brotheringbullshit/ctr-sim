import { AppletId } from '../nand/types';
import { fcram } from '../ram/fcram';

const HEALTH_SAFETY_BANNER_SRC =
  '/assets/aistudio/103.__Prototype__Health___Safety_Information_Banner_64571c77.mp3';

interface JingleNote {
  freq: number;
  delayMs: number;
  durationSec: number;
  type: OscillatorType;
  gain: number;
}

const APP_BANNER_JINGLES: Record<Exclude<AppletId, 'health-safety'>, JingleNote[]> = {
  'system-settings': [
    { freq: 392.0, delayMs: 0, durationSec: 0.16, type: 'sine', gain: 0.24 },
    { freq: 493.88, delayMs: 90, durationSec: 0.16, type: 'sine', gain: 0.24 },
    { freq: 587.33, delayMs: 180, durationSec: 0.18, type: 'sine', gain: 0.24 },
    { freq: 783.99, delayMs: 280, durationSec: 0.36, type: 'triangle', gain: 0.22 },
  ],
  'camera-ar': [
    { freq: 1200, delayMs: 0, durationSec: 0.04, type: 'square', gain: 0.1 },
    { freq: 523.25, delayMs: 80, durationSec: 0.14, type: 'triangle', gain: 0.22 },
    { freq: 659.25, delayMs: 160, durationSec: 0.14, type: 'triangle', gain: 0.22 },
    { freq: 783.99, delayMs: 240, durationSec: 0.16, type: 'triangle', gain: 0.22 },
    { freq: 1046.5, delayMs: 330, durationSec: 0.34, type: 'sine', gain: 0.24 },
  ],
  'mii-maker': [
    { freq: 739.99, delayMs: 0, durationSec: 0.12, type: 'sine', gain: 0.24 },
    { freq: 880.0, delayMs: 110, durationSec: 0.12, type: 'sine', gain: 0.24 },
    { freq: 1108.73, delayMs: 210, durationSec: 0.14, type: 'sine', gain: 0.25 },
    { freq: 880.0, delayMs: 340, durationSec: 0.12, type: 'sine', gain: 0.22 },
    { freq: 739.99, delayMs: 450, durationSec: 0.14, type: 'sine', gain: 0.22 },
    { freq: 587.33, delayMs: 580, durationSec: 0.35, type: 'triangle', gain: 0.2 },
  ],
  'sound-studio': [
    { freq: 329.63, delayMs: 0, durationSec: 0.18, type: 'triangle', gain: 0.2 },
    { freq: 440.0, delayMs: 75, durationSec: 0.18, type: 'triangle', gain: 0.22 },
    { freq: 554.37, delayMs: 150, durationSec: 0.18, type: 'triangle', gain: 0.22 },
    { freq: 659.25, delayMs: 225, durationSec: 0.22, type: 'sine', gain: 0.24 },
    { freq: 880.0, delayMs: 310, durationSec: 0.42, type: 'sine', gain: 0.24 },
  ],
  'activity-log': [
    { freq: 523.25, delayMs: 0, durationSec: 0.12, type: 'sine', gain: 0.22 },
    { freq: 587.33, delayMs: 90, durationSec: 0.12, type: 'sine', gain: 0.22 },
    { freq: 659.25, delayMs: 180, durationSec: 0.14, type: 'sine', gain: 0.22 },
    { freq: 783.99, delayMs: 270, durationSec: 0.16, type: 'sine', gain: 0.24 },
    { freq: 880.0, delayMs: 370, durationSec: 0.32, type: 'sine', gain: 0.24 },
  ],
  'game-notes': [
    { freq: 587.33, delayMs: 0, durationSec: 0.1, type: 'triangle', gain: 0.24 },
    { freq: 739.99, delayMs: 85, durationSec: 0.1, type: 'triangle', gain: 0.24 },
    { freq: 880.0, delayMs: 170, durationSec: 0.12, type: 'triangle', gain: 0.24 },
    { freq: 1174.66, delayMs: 265, durationSec: 0.3, type: 'sine', gain: 0.22 },
  ],
  browser: [
    { freq: 493.88, delayMs: 0, durationSec: 0.16, type: 'sine', gain: 0.22 },
    { freq: 622.25, delayMs: 100, durationSec: 0.16, type: 'sine', gain: 0.22 },
    { freq: 739.99, delayMs: 200, durationSec: 0.18, type: 'sine', gain: 0.22 },
    { freq: 987.77, delayMs: 310, durationSec: 0.38, type: 'sine', gain: 0.24 },
  ],
  cartridge: [
    { freq: 440.0, delayMs: 0, durationSec: 0.12, type: 'sawtooth', gain: 0.12 },
    { freq: 554.37, delayMs: 95, durationSec: 0.12, type: 'sawtooth', gain: 0.12 },
    { freq: 659.25, delayMs: 190, durationSec: 0.14, type: 'triangle', gain: 0.22 },
    { freq: 880.0, delayMs: 295, durationSec: 0.42, type: 'triangle', gain: 0.25 },
  ],
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private startupBuffer: AudioBuffer | null = null;
  private preloadPromise: Promise<AudioBuffer | null> | null = null;
  private currentStartupSource: AudioBufferSourceNode | null = null;
  private healthSafetyAudio: HTMLAudioElement | null = null;
  private pendingStartup = false;
  private jingleTimers: number[] = [];
  private activeNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = [];
  private audioBlockedListeners = new Set<(blocked: boolean) => void>();

  public enabled = true;
  public volume = 0.5;
  public isAutoplayBlocked = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // 1. Kick off preloading and decoding into Web Audio memory immediately
      void this.preloadStartupSound();

      // 2. Prepare HTMLAudioElement as a standby fallback
      try {
        const audio = new Audio(HEALTH_SAFETY_BANNER_SRC);
        audio.preload = 'auto';
        this.healthSafetyAudio = audio;
      } catch {
        // ignore in non-standard environments
      }

      // 3. User interaction listener to resume AudioContext and unlock any blocked audio
      const handleUnlockGesture = () => {
        this.unlockAudio();
      };

      window.addEventListener('pointerdown', handleUnlockGesture, { passive: true });
      window.addEventListener('keydown', handleUnlockGesture, { passive: true });
      window.addEventListener('touchstart', handleUnlockGesture, { passive: true });
    }
  }

  /**
   * Pre-fetches and decodes the startup audio into an in-memory AudioBuffer.
   * This is called both on constructor and at bootloader start so that by the time
   * the boot sequence finishes, audio samples are already decoded in RAM for 0ms latency!
   */
  public async preloadStartupSound(): Promise<AudioBuffer | null> {
    if (this.startupBuffer) {
      return this.startupBuffer;
    }
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    if (typeof window === 'undefined') return null;

    this.preloadPromise = (async () => {
      try {
        const res = await fetch(HEALTH_SAFETY_BANNER_SRC);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching startup sound`);
        }
        const arrayBuf = await res.arrayBuffer();

        // Create or get context for decoding (decoding works even while suspended)
        const ctx = this.getOrCreateContext();
        if (!ctx) return null;

        const decoded = await ctx.decodeAudioData(arrayBuf);
        this.startupBuffer = decoded;
        // Account for actual Float32 PCM buffer stored in DSP RAM
        fcram.setDspAudioBuffer('startup_pcm', decoded.length * decoded.numberOfChannels * 4);
        return decoded;
      } catch (err) {
        console.warn('Startup audio pre-decode failed, will use fallback:', err);
        return null;
      }
    })();

    return this.preloadPromise;
  }

  public unlockAudio(): void {
    if (this.ctx && this.ctx.state === 'running' && !this.pendingStartup) {
      return;
    }
    if (!this.ctx) {
      this.getOrCreateContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => {
        this.setBlocked(false);
        if (this.pendingStartup) {
          this.pendingStartup = false;
          this.playStartupSound();
        }
      }).catch(() => {});
    } else if (this.pendingStartup) {
      this.pendingStartup = false;
      this.setBlocked(false);
      this.playStartupSound();
    }
  }

  subscribeBlocked(fn: (blocked: boolean) => void): () => void {
    this.audioBlockedListeners.add(fn);
    return () => this.audioBlockedListeners.delete(fn);
  }

  private setBlocked(blocked: boolean) {
    if (this.isAutoplayBlocked !== blocked) {
      this.isAutoplayBlocked = blocked;
      this.audioBlockedListeners.forEach((fn) => fn(blocked));
    }
  }

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || this.volume <= 0.01) return null;
    const ctx = this.getOrCreateContext();
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => this.setBlocked(false)).catch(() => this.setBlocked(true));
    }
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    }
    return ctx;
  }

  playTone(freq: number, durationSec = 0.08, type: OscillatorType = 'triangle', gainScale = 0.3): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const peak = Math.max(0.001, gainScale);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);

    const ref = { osc, gain };
    this.activeNodes.push(ref);
    osc.onended = () => {
      this.activeNodes = this.activeNodes.filter((n) => n !== ref);
    };
  }

  stopBannerJingle(): void {
    this.jingleTimers.forEach((t) => window.clearTimeout(t));
    this.jingleTimers = [];

    // Stop decoded buffer source immediately if playing
    if (this.currentStartupSource) {
      try {
        this.currentStartupSource.stop();
        this.currentStartupSource.disconnect();
      } catch {
        // already stopped
      }
      this.currentStartupSource = null;
    }

    // Stop fallback HTML audio element if playing
    if (this.healthSafetyAudio && !this.healthSafetyAudio.paused) {
      this.healthSafetyAudio.pause();
      this.healthSafetyAudio.currentTime = 0;
    }

    // Stop any active synth oscillator notes
    for (const node of this.activeNodes) {
      try {
        node.osc.stop();
      } catch {
        // already stopped
      }
    }
    this.activeNodes = [];
  }

  /**
   * Startup sound triggers the pre-decoded Health & Safety Information banner audio
   * with zero buffering delay from in-memory AudioBuffer.
   */
  playStartupSound(): void {
    this.playHealthSafetyBanner(true);
  }

  private playHealthSafetyBanner(isStartup = false): void {
    this.stopBannerJingle();
    if (!this.enabled || this.volume <= 0.01) return;

    const ctx = this.ensureContext();

    // If AudioContext is blocked by browser autoplay policy
    if (ctx && ctx.state === 'suspended') {
      if (isStartup) {
        this.pendingStartup = true;
        this.setBlocked(true);
      }
      return;
    }

    // If pre-decoded AudioBuffer is already ready in RAM: INSTANT 0ms PLAYBACK!
    if (ctx && this.startupBuffer && this.masterGain) {
      this.setBlocked(false);
      this.pendingStartup = false;

      try {
        const source = ctx.createBufferSource();
        source.buffer = this.startupBuffer;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.2, ctx.currentTime);
        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        source.start(0);
        this.currentStartupSource = source;

        source.onended = () => {
          if (this.currentStartupSource === source) {
            this.currentStartupSource = null;
          }
        };
        return;
      } catch (err) {
        console.warn('Error playing decoded audio buffer:', err);
      }
    }

    // If buffer is still preloading in background, wait for it then play immediately
    if (this.preloadPromise) {
      this.preloadPromise.then((buffer) => {
        if (!buffer || !this.enabled) return;
        const currentCtx = this.ensureContext();
        if (currentCtx && currentCtx.state === 'running' && this.masterGain) {
          this.setBlocked(false);
          this.pendingStartup = false;
          try {
            const source = currentCtx.createBufferSource();
            source.buffer = buffer;
            const gainNode = currentCtx.createGain();
            gainNode.gain.setValueAtTime(1.2, currentCtx.currentTime);
            source.connect(gainNode);
            gainNode.connect(this.masterGain);
            source.start(0);
            this.currentStartupSource = source;
          } catch {
            // ignore
          }
        }
      }).catch(() => {});
      return;
    }

    // Secondary fallback: HTMLAudioElement
    if (!this.healthSafetyAudio) {
      this.healthSafetyAudio = new Audio(HEALTH_SAFETY_BANNER_SRC);
    }
    this.healthSafetyAudio.volume = Math.min(1, Math.max(0, this.volume * 1.5));
    this.healthSafetyAudio.currentTime = 0;

    const p = this.healthSafetyAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        this.pendingStartup = false;
        this.setBlocked(false);
      }).catch(() => {
        if (isStartup) {
          this.pendingStartup = true;
          this.setBlocked(true);
        }
      });
    }
  }

  // Every application on the HOME Menu has its own distinct banner jingle
  playBannerJingle(appletId: AppletId): void {
    this.pendingStartup = false;
    this.setBlocked(false);
    this.stopBannerJingle();
    if (!this.enabled || this.volume <= 0.01) return;

    if (appletId === 'health-safety') {
      this.playHealthSafetyBanner(false);
      return;
    }

    const notes = APP_BANNER_JINGLES[appletId];
    if (!notes) return;

    notes.forEach((n) => {
      const id = window.setTimeout(() => {
        this.playTone(n.freq, n.durationSec, n.type, n.gain);
      }, n.delayMs);
      this.jingleTimers.push(id);
    });
  }

  playCursorTick(): void {
    this.playTone(980, 0.032, 'triangle', 0.12);
  }

  playConfirm(): void {
    this.playTone(660, 0.06, 'triangle', 0.2);
    setTimeout(() => this.playTone(880, 0.09, 'triangle', 0.2), 45);
  }

  playBack(): void {
    this.playTone(520, 0.06, 'sine', 0.18);
    setTimeout(() => this.playTone(390, 0.08, 'sine', 0.16), 45);
  }

  playError(): void {
    this.playTone(220, 0.14, 'sawtooth', 0.16);
    setTimeout(() => this.playTone(170, 0.2, 'sawtooth', 0.16), 110);
  }
}

export const soundEngine = new SoundEngine();
