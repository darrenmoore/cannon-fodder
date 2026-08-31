import { CONFIG } from '../config.js';

/**
 * All sound is synthesised with WebAudio -- no audio files to ship or load.
 * Gunshots are a filtered noise burst, explosions the same with a longer decay
 * and a low sine thump under them. Browsers require a gesture before audio can
 * start, so the context is created lazily on the first click.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** One shared noise buffer; every shot is a slice of it. */
let noise: AudioBuffer | null = null;

function ensure(): boolean {
  if (!CONFIG.audio.enabled) return false;
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;

  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = CONFIG.audio.volume;
  master.connect(ctx.destination);

  const length = Math.floor(ctx.sampleRate * 0.5);
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

/** Call from a user gesture so the context is allowed to start. */
export const unlockAudio = (): void => { ensure(); };

/**
 * The shared context, for anything that needs to build its own graph -- the
 * menu music hangs its bus straight off `destination` rather than off `master`,
 * so turning the music down never touches how loud a rifle is.
 *
 * Returns null when audio is disabled or the browser has no WebAudio at all.
 */
export function audioContext(): AudioContext | null {
  return ensure() ? ctx : null;
}

interface BurstOpts {
  duration: number;
  gain: number;
  /** Band-pass centre in Hz. */
  freq: number;
  q: number;
  /** Sweep the filter down over the burst for a fuller sound. */
  sweepTo?: number;
  type?: BiquadFilterType;
}

function burst(o: BurstOpts): void {
  if (!ensure() || !ctx || !master || !noise) return;
  const now = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = noise;
  // A random offset stops repeated shots sounding like a loop.
  src.loop = true;
  src.loopStart = Math.random() * 0.3;
  src.loopEnd = src.loopStart + 0.2;

  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? 'bandpass';
  filter.frequency.setValueAtTime(o.freq, now);
  if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, now + o.duration);
  filter.Q.value = o.q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(o.gain, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0005, now + o.duration);

  src.connect(filter).connect(env).connect(master);
  src.start(now);
  src.stop(now + o.duration + 0.02);
}

function thump(freq: number, duration: number, gain: number): void {
  if (!ensure() || !ctx || !master) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.35, now + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0005, now + duration);
  osc.connect(env).connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Slight pitch variation per shot, or a burst turns into a machine-gun drone. */
const vary = (base: number, spread = 0.18): number => base * (1 + (Math.random() * 2 - 1) * spread);

export const sfxShot = (): void => burst({ duration: 0.09, gain: 0.55, freq: vary(1500), q: 1.1, sweepTo: vary(420) });
export const sfxEnemyShot = (): void => burst({ duration: 0.1, gain: 0.4, freq: vary(950), q: 1.3, sweepTo: vary(320) });
export const sfxDeath = (): void => burst({ duration: 0.22, gain: 0.5, freq: vary(320), q: 0.7, sweepTo: 120, type: 'lowpass' });

export const sfxExplosion = (): void => {
  burst({ duration: 0.55, gain: 0.9, freq: 800, q: 0.5, sweepTo: 90, type: 'lowpass' });
  thump(110, 0.45, 0.8);
};

export const sfxPickup = (): void => {
  if (!ensure() || !ctx || !master) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.setValueAtTime(990, now + 0.06);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.18, now);
  env.gain.exponentialRampToValueAtTime(0.0005, now + 0.16);
  osc.connect(env).connect(master);
  osc.start(now);
  osc.stop(now + 0.18);
};

export const sfxOrder = (): void => burst({ duration: 0.045, gain: 0.16, freq: 2400, q: 3 });

/**
 * A refusal: low, short and flat, deliberately nothing like `sfxOrder`.
 *
 * Pressing a control and getting silence is the worst thing a control can do,
 * and it was what happened to every grenade thrown with an empty pouch or
 * inside the cooldown.
 */
export const sfxDenied = (): void => burst({ duration: 0.07, gain: 0.2, freq: 320, q: 2, sweepTo: 190 });

export const sfxWin = (): void => {
  if (!ensure() || !ctx || !master) return;
  const now = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;
    const env = ctx!.createGain();
    env.gain.setValueAtTime(0, now + i * 0.11);
    env.gain.linearRampToValueAtTime(0.16, now + i * 0.11 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0005, now + i * 0.11 + 0.24);
    osc.connect(env).connect(master!);
    osc.start(now + i * 0.11);
    osc.stop(now + i * 0.11 + 0.26);
  });
};

export const sfxLose = (): void => {
  if (!ensure() || !ctx || !master) return;
  const now = ctx.currentTime;
  [392, 330, 262, 196].forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    const env = ctx!.createGain();
    env.gain.setValueAtTime(0, now + i * 0.14);
    env.gain.linearRampToValueAtTime(0.13, now + i * 0.14 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0005, now + i * 0.14 + 0.3);
    osc.connect(env).connect(master!);
    osc.start(now + i * 0.14);
    osc.stop(now + i * 0.14 + 0.32);
  });
};
