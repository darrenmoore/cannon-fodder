import { CONFIG } from '../config.js';
import { onSettingsChange, settings } from '../ui/settings.js';

/**
 * All sound is synthesised with WebAudio -- no audio files to ship or load.
 * Gunshots are a filtered noise burst, explosions the same with a longer decay
 * and a low sine thump under them. Browsers require a gesture before audio can
 * start, so the context is created lazily on the first click.
 *
 * The Effects toggle and the Loudness setting land on `master`'s gain and on
 * the one-shot entry points -- never inside `ensure()` or `audioContext()`.
 * The music fetches its context through those and hangs its own bus straight
 * off `destination`, so a gate there would silence the menu music too.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** One shared noise buffer; every shot is a slice of it. */
let noise: AudioBuffer | null = null;

/**
 * When the field last got loud, in seconds on the `performance.now()` clock.
 * The ambience polls this to scatter the birds after gunfire -- a timestamp
 * here costs the sim nothing and keeps audio.ts free of ambience imports.
 */
let loudAt = -1e9;
export const lastLoudAt = (): number => loudAt;

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
  master.gain.value = settings().sound ? settings().volume : 0;
  master.connect(ctx.destination);

  const length = Math.floor(ctx.sampleRate * 0.5);
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

// Live volume: the pause sheet is reachable mid-mission, so a change has to
// land on the running graph, not on the next boot. A short ramp, not a set --
// a stepped gain under a sounding bed is an audible click.
onSettingsChange((s) => {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(s.sound ? s.volume : 0, ctx.currentTime, 0.03);
});

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

/**
 * The effects bus. Anything that should obey the Effects toggle and the
 * Loudness setting -- the ambience bed does -- hangs off this rather than off
 * `destination`, and inherits both for free.
 */
export function sfxBus(): GainNode | null {
  return ensure() ? master : null;
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
  // The master gain is already zero when effects are off; this just skips
  // building a node graph nobody will hear, on every shot of a firefight.
  if (!settings().sound) return;
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
  if (!settings().sound) return;
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

/**
 * Rate limit, shared by every sound the simulation can fire many times a step.
 *
 * Wading is the case that needs it: the splash particle is gated at an 8%
 * chance per soldier per step, which is about five a second each and thirty a
 * second for a squad crossing the sink together. Thirty overlapping plips is
 * not a splash, it is a hiss. Same for a scream mechanic that repeats on a
 * timer for every wounded man on the map.
 *
 * Keyed by sound rather than global, so a squelch never eats a klaxon.
 */
const lastAt = new Map<string, number>();
function gate(key: string, minGap: number): boolean {
  const now = performance.now() / 1000;
  if (now - (lastAt.get(key) ?? -1e9) < minGap) return false;
  lastAt.set(key, now);
  return true;
}

/** Slight pitch variation per shot, or a burst turns into a machine-gun drone. */
const vary = (base: number, spread = 0.18): number => base * (1 + (Math.random() * 2 - 1) * spread);

export const sfxShot = (): void => {
  loudAt = performance.now() / 1000;
  burst({ duration: 0.09, gain: 0.55, freq: vary(1500), q: 1.1, sweepTo: vary(420) });
};
export const sfxEnemyShot = (): void => {
  loudAt = performance.now() / 1000;
  burst({ duration: 0.1, gain: 0.4, freq: vary(950), q: 1.3, sweepTo: vary(320) });
};
export const sfxDeath = (): void => burst({ duration: 0.22, gain: 0.5, freq: vary(320), q: 0.7, sweepTo: 120, type: 'lowpass' });

export const sfxExplosion = (): void => {
  loudAt = performance.now() / 1000;
  burst({ duration: 0.55, gain: 0.9, freq: 800, q: 0.5, sweepTo: 90, type: 'lowpass' });
  thump(110, 0.45, 0.8);
};

/**
 * A building coming down, as distinct from the grenade that did it.
 *
 * `collapse()` fired `sfxExplosion()` and nothing else, so the biggest moment
 * in a demolish mission sounded exactly like a grenade landing in a field --
 * even though the *visual* side already separates them, with 1.6x the shake
 * and debris thrown wide (201-qa 016).
 *
 * This is fired **in addition to** the blast rather than instead of it, and
 * scheduled 120ms behind: the grenade that levelled the hut was a grenade and
 * should still sound like one, and the sequence -- bang, beat, fall -- is most
 * of what makes a collapse read as a collapse.
 *
 * Two noise layers rather than one, because rubble is many small impacts and a
 * single decay is a bomb. The low sweep is the mass going down; the mid band
 * with the slow attack is the rattle of it landing.
 *
 * `loudAt` is left alone: `sfxExplosion` has already set it this frame, and
 * the birds only need scattering once.
 */
export const sfxCollapse = (): void => {
  // Two at a time. A demolish mission can drop three huts inside a second and
  // three of these on top of each other is mush, not a bigger collapse.
  if (!gate('collapse', 0.18)) return;
  if (!settings().sound) return;
  if (!ensure() || !ctx || !master || !noise) return;
  const now = ctx.currentTime;
  const at = now + 0.12;

  const layer = (
    type: BiquadFilterType, from: number, to: number, q: number,
    gain: number, attack: number, dur: number,
  ): void => {
    const src = ctx!.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.loopStart = Math.random() * 0.3;
    src.loopEnd = src.loopStart + 0.2;

    const f = ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + dur);
    f.Q.value = q;

    const env = ctx!.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0005, at + dur);

    src.connect(f).connect(env).connect(master!);
    src.start(at);
    src.stop(at + dur + 0.05);
  };

  // The mass going down, and the rubble landing after it.
  layer('lowpass', 500, 60, 0.6, 0.7, 0.02, 1.4);
  layer('bandpass', 1400, 700, 1.4, 0.16, 0.18, 1.1);
  thump(60, 0.9, 0.65);
};

export const sfxPickup = (): void => {
  if (!settings().sound) return;
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

/**
 * A boot going into water, or into the bog.
 *
 * Two patches off one call, because the simulation already decides which it is
 * -- `fx.splash(pos, thick)` has branched on it since the mud got its own
 * material -- and there was simply never a sound on the other end (201-qa 013).
 *
 * Water is bright and over immediately: a high band, no body. Mud is the same
 * gesture slowed down and given a bottom, which is what a suck sounds like --
 * the filter sweep is the pull and the sine under it is the weight.
 *
 * Deliberately does not touch `loudAt`. Wading is not gunfire, and scattering
 * the birds every time somebody crosses a stream would make the ambience lie.
 */
export const sfxWade = (thick: boolean): void => {
  if (!gate('wade', 0.12)) return;
  if (thick) {
    burst({ duration: 0.26, gain: 0.2, freq: vary(420, 0.1), q: 1.2, sweepTo: 140, type: 'lowpass' });
    thump(vary(90, 0.12), 0.2, 0.22);
    return;
  }
  burst({ duration: 0.09, gain: 0.22, freq: vary(2200), q: 2, sweepTo: vary(900) });
};

export const sfxOrder = (): void => burst({ duration: 0.045, gain: 0.16, freq: 2400, q: 3 });

/**
 * A button, pressed.
 *
 * The order blip re-pitched: lower, shorter and quieter, so a menu does not
 * sound like giving orders to the squad. Every plotted control in the game was
 * silent until this existed -- every audio call site in the codebase was in
 * `sim/`, so the front end, the pause sheet, the settings screen and the
 * result panel made no sound at all (201-qa 018).
 *
 * Nothing on hover, by the owner's ask, and nothing on a disabled control:
 * a click that answers a press that did nothing is worse than silence.
 */
export const sfxClick = (): void => burst({ duration: 0.035, gain: 0.11, freq: 1500, q: 4 });

/**
 * A refusal: low, short and flat, deliberately nothing like `sfxOrder`.
 *
 * Pressing a control and getting silence is the worst thing a control can do,
 * and it was what happened to every grenade thrown with an empty pouch or
 * inside the cooldown.
 */
export const sfxDenied = (): void => burst({ duration: 0.07, gain: 0.2, freq: 320, q: 2, sweepTo: 190 });

/**
 * A wave leaving the huts: a horn, somewhere off across the map.
 *
 * Waves announced themselves with a world-space popup that lives 1.6 seconds
 * at the building it came from -- so if the camera was anywhere else, which it
 * is whenever a wave actually matters, the player was told nothing. The HUD
 * counter says how many; this says *now* (201-qa 015).
 *
 * "Distant" has to be built into the patch rather than into the mix, because
 * no one-shot in this game is attenuated by distance. Air absorbs the high
 * frequencies first, so a low fundamental under a lowpass is what far away
 * sounds like; the two saws a fifth apart are what stop it reading as a test
 * tone; and the soft attack is what stops it reading as a klaxon in the room
 * with you.
 *
 * Deliberately not `loudAt`: the birds scatter for gunfire, and a horn a long
 * way off is not gunfire.
 */
export const sfxKlaxon = (): void => {
  if (!settings().sound) return;
  if (!ensure() || !ctx || !master) return;
  const now = ctx.currentTime;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 0.7;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  // 60ms to open. A hard attack is a klaxon on the wall behind you.
  env.gain.exponentialRampToValueAtTime(0.13, now + 0.06);
  env.gain.setValueAtTime(0.13, now + 0.45);
  env.gain.exponentialRampToValueAtTime(0.0005, now + 0.95);
  filter.connect(env).connect(master);

  // A fifth, slightly out: two horns, not one synthesiser.
  for (const f of [116, 174.5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, now);
    // A shallow fall over the note, the way a real horn sags as it is blown out.
    osc.frequency.exponentialRampToValueAtTime(f * 0.97, now + 0.95);
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + 1);
  }
};

export const sfxWin = (): void => {
  if (!settings().sound) return;
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
  if (!settings().sound) return;
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
