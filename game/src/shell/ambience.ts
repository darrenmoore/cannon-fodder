import { CONFIG } from '../config.js';
import { audioContext, lastLoudAt, sfxBus } from './audio.js';
import { settings } from '../ui/settings.js';
import { analyseTerrain, sampleField } from '../render/terrain.js';
import type { TerrainInfo } from '../render/terrain.js';
import type { GameMap } from '../sim/map.js';
import type { Theme } from '../sim/tiles.js';
import type { Camera } from '../render/camera.js';

/**
 * The mission's ambience bed: river noise near water, wind and leaf rustle in
 * the gusts, insects and bird calls under the canopy -- all synthesised, like
 * every other sound in the game, because there are no audio files to loop.
 *
 * The bed is *driven by the terrain the camera can see*. The renderer already
 * derives signed distance fields to water and foliage for its shorelines and
 * canopy hems (`render/terrain.ts`); sampling those at the view gives "how far
 * to the river" as one smooth number, and the river's gain is a curve on it.
 * That is why this module imports from `render/` -- `analyseTerrain` is pure
 * derived-data maths over a `GameMap`, not renderer internals, and re-running
 * it here (milliseconds, once per mission) beats either duplicating the BFS or
 * widening the renderer's surface.
 *
 * Like the music, playback is want/have-reconciled: `startAmbience` only
 * records what is wanted, and the graph is built on the first update tick that
 * finds an unlocked context. Every audible gain moves through
 * `setTargetAtTime` -- a stepped gain under a continuous bed is a click, and a
 * bed that snaps on when a river scrolls into view reads as a fault where a
 * one-second swell reads as a place.
 */

const A = CONFIG.audio.ambience;

/** How each theme voices the shared layers. */
interface Voice {
  /** Lowpass cutoff of the wind bed, Hz. Colder is darker. */
  windCutoff: number;
  windTrim: number;
  /** Arctic only: a narrow drifting band on top of the bed. */
  whistle: boolean;
  insects: 'crickets' | 'cicadas' | 'none';
  /** Cicadas do not need trees; crickets do. Floor on the insect drive. */
  insectsFloor: number;
  birds: 'jungle' | 'desert' | 'arctic';
  /** Multiplier on how often anything calls. */
  birdRate: number;
  /** Desert birds call from open ground; the others need foliage nearby. */
  birdFloor: number;
}

const VOICES: Record<Theme, Voice> = {
  jungle: {
    windCutoff: 400, windTrim: 1, whistle: false,
    insects: 'crickets', insectsFloor: 0, birds: 'jungle', birdRate: 1, birdFloor: 0,
  },
  desert: {
    windCutoff: 700, windTrim: 0.9, whistle: false,
    insects: 'cicadas', insectsFloor: 0.35, birds: 'desert', birdRate: 0.4, birdFloor: 0.3,
  },
  arctic: {
    windCutoff: 300, windTrim: 1.3, whistle: true,
    insects: 'none', insectsFloor: 0, birds: 'arctic', birdRate: 0.25, birdFloor: 0.2,
  },
};

interface Graph {
  ctx: AudioContext;
  /** Everything below hangs off this; the stop fade and the tab-hide duck land here. */
  bus: GainNode;
  water: GainNode;
  wind: GainNode;
  rustle: GainNode;
  insects: GainNode;
  birds: GainNode;
  sources: AudioBufferSourceNode[];
  oscillators: OscillatorNode[];
}

/** The computed target levels, kept for the probe as much as for the graph. */
interface Targets {
  water: number; wind: number; rustle: number; insects: number; birds: number;
  gust: number; scared: boolean;
}

let map: GameMap | null = null;
let info: TerrainInfo | null = null;
let voice: Voice = VOICES.jungle;
let graph: Graph | null = null;
let targets: Targets = { water: 0, wind: 0, rustle: 0, insects: 0, birds: 0, gust: 0, scared: false };
/** Accumulates frame time up to the control cadence. */
let acc = 0;
/** Pending teardown after a stop fade; a restart must cancel it. */
let stopTimer = 0;
let watchingVisibility = false;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * rAF stops in a hidden tab, so no update tick would ever duck the bed --
 * the pause sheet opens, but nothing runs to read it. This lands on the bus
 * directly instead.
 */
const onVisibility = (): void => {
  if (!graph) return;
  const t = graph.ctx.currentTime;
  graph.bus.gain.setTargetAtTime(document.hidden ? 0 : A.level, t, document.hidden ? 0.05 : 0.3);
};

/** A mission is starting: remember its terrain; the graph waits for a tick. */
export function startAmbience(m: GameMap): void {
  // A previous mission may still be fading out -- mission-to-mission hand-off
  // never passes through the menu. Take its graph down now; ours is fresh.
  if (stopTimer) {
    window.clearTimeout(stopTimer);
    stopTimer = 0;
  }
  teardown();
  map = m;
  info = analyseTerrain(m);
  voice = VOICES[m.theme];
  targets = { water: 0, wind: 0, rustle: 0, insects: 0, birds: 0, gust: 0, scared: false };
  acc = 0;
  if (!watchingVisibility) {
    document.addEventListener('visibilitychange', onVisibility);
    watchingVisibility = true;
  }
}

/** The mission is over: fade, then dismantle once the fade has landed. */
export function stopAmbience(): void {
  map = null;
  info = null;
  if (watchingVisibility) {
    document.removeEventListener('visibilitychange', onVisibility);
    watchingVisibility = false;
  }
  if (!graph) return;
  // Fade rather than cut, like the music: the bed vanishing in one sample is
  // more audible than anything in it.
  const t = graph.ctx.currentTime;
  graph.bus.gain.cancelScheduledValues(t);
  graph.bus.gain.setValueAtTime(graph.bus.gain.value, t);
  graph.bus.gain.linearRampToValueAtTime(0, t + 0.5);
  stopTimer = window.setTimeout(() => {
    stopTimer = 0;
    teardown();
  }, 700);
}

function teardown(): void {
  if (!graph) return;
  for (const s of graph.sources) {
    try { s.stop(); } catch { /* already stopped */ }
  }
  for (const o of graph.oscillators) {
    try { o.stop(); } catch { /* already stopped */ }
  }
  graph.bus.disconnect();
  graph = null;
}

/** Read-only probe for the console and the headless driver. Targets are the
 *  *computed* levels, so assertions hold even where audio is suspended. */
export function ambienceState(): (Targets & { running: boolean; theme: Theme; ctxState: string | null }) | null {
  if (!map) return null;
  return { ...targets, running: graph !== null, theme: map.theme, ctxState: graph?.ctx.state ?? null };
}

/* --------------------------------------------------------------------------
 * The graph. One bus, one 4-second noise buffer fanned out through a filter
 * per layer. The sfx module's shared buffer is half a second -- fine under an
 * envelope, but looped as a bed it repeats at 2Hz and the ear finds it.
 * ------------------------------------------------------------------------ */

function build(ctx: AudioContext, master: GainNode): Graph {
  const bus = ctx.createGain();
  bus.gain.value = document.hidden ? 0 : A.level;
  bus.connect(master);

  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];

  const length = Math.floor(ctx.sampleRate * 4);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  /** A looping noise source, started at a random phase so layers do not align. */
  const bed = (): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start(ctx.currentTime, Math.random() * 4);
    sources.push(src);
    return src;
  };

  /** A running LFO wired into an AudioParam: `param += sin(rate) * depth`. */
  const lfo = (rate: number, depth: number, param: AudioParam): void => {
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    osc.connect(g).connect(param);
    osc.start();
    oscillators.push(osc);
  };

  const layer = (): GainNode => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bus);
    return g;
  };

  // -- River: a trickle, not a sea. Broadband low noise is what reads as surf,
  // so the low body is nearly gone -- a hint of gurgle under a high babble
  // band whose level jitters on two fast, incommensurate rates. The jitter is
  // the water; the same filters held still are a hiss.
  const water = layer();
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 400;
  body.Q.value = 0.7;
  const bodyMix = ctx.createGain();
  bodyMix.gain.value = 0.12;
  bed().connect(body).connect(bodyMix).connect(water);
  const sparkle = ctx.createBiquadFilter();
  sparkle.type = 'bandpass';
  sparkle.frequency.value = 2600;
  sparkle.Q.value = 2;
  const sparkleMix = ctx.createGain();
  sparkleMix.gain.value = 0.5;
  bed().connect(sparkle).connect(sparkleMix).connect(water);
  lfo(0.5, 400, sparkle.frequency);
  // The burble: two rates that never line up, fast enough to read as drops
  // over stones rather than as a swell rolling in.
  lfo(1.9, 0.28, sparkleMix.gain);
  lfo(3.1, 0.18, sparkleMix.gain);

  // -- Wind bed, coloured by theme; the gust curve drives the layer gain from
  // the control tick so it stays on the renderer's clock.
  const wind = layer();
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = voice.windCutoff;
  windFilter.Q.value = 0.6;
  bed().connect(windFilter).connect(wind);
  if (voice.whistle) {
    // Arctic: a narrow band drifting slowly through the hiss.
    const whistle = ctx.createBiquadFilter();
    whistle.type = 'bandpass';
    whistle.frequency.value = 900;
    whistle.Q.value = 9;
    const mix = ctx.createGain();
    mix.gain.value = 0.35;
    bed().connect(whistle).connect(mix).connect(wind);
    lfo(0.07, 200, whistle.frequency);
  }

  // -- Leaf rustle: the top of the noise, audible only in the gust peaks.
  const rustle = layer();
  const rustleFilter = ctx.createBiquadFilter();
  rustleFilter.type = 'highpass';
  rustleFilter.frequency.value = 3000;
  bed().connect(rustleFilter).connect(rustle);

  // -- Insects.
  const insects = layer();
  if (voice.insects === 'crickets') {
    // Two thin tones, each pulsing at its own rate, split across the field.
    // Distinct AM rates are what keeps it from sounding like a machine.
    for (const [freq, rate, pan] of [[4300, 27, -0.4], [4900, 31, 0.4]] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      lfo(rate, 0.5, am.gain);
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(am).connect(panner).connect(insects);
      osc.start();
      oscillators.push(osc);
    }
  } else if (voice.insects === 'cicadas') {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 5500;
    band.Q.value = 5;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    lfo(90, 0.5, am.gain); // the buzz
    bed().connect(band).connect(am).connect(insects);
  }

  // -- Birds: a gain the chirps are built into per call, so a scare can cut a
  // call mid-phrase without tracking its oscillators.
  const birds = layer();

  return { ctx, bus, water, wind, rustle, insects, birds, sources, oscillators };
}

/* --------------------------------------------------------------------------
 * Bird calls. One-shots booked from the control tick; each species is a
 * handful of swept oscillator syllables, panned somewhere in the trees.
 * ------------------------------------------------------------------------ */

function chirp(g: Graph): void {
  const ctx = g.ctx;
  const t0 = ctx.currentTime + 0.02;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(g.birds);

  const syllable = (
    t: number, from: number, to: number, dur: number, gain: number,
    type: OscillatorType = 'triangle',
  ): void => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(env).connect(pan);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  if (voice.birds === 'arctic') {
    // A gull, far off: one long fall.
    syllable(t0, 1200, 650, 0.5, 0.05, 'sawtooth');
    return;
  }
  if (voice.birds === 'desert' || Math.random() < 0.2) {
    // A single low whoop; in the desert it is all anything says.
    syllable(t0, 900, 1400, 0.2, 0.07);
    return;
  }
  // Jungle: two to five quick syllables around a base pitch, rising or
  // falling on a coin flip, spaced unevenly so no two calls are the same bird.
  const base = 1800 + Math.random() * 1800;
  const up = Math.random() < 0.5;
  const count = 2 + Math.floor(Math.random() * 4);
  let t = t0;
  for (let i = 0; i < count; i++) {
    const f = base * (1 + (Math.random() - 0.5) * 0.1);
    const sweep = 1.25 + Math.random() * 0.15;
    syllable(t, f, up ? f * sweep : f / sweep, 0.04 + Math.random() * 0.04, 0.08);
    t += 0.07 + Math.random() * 0.07;
  }
}

/* --------------------------------------------------------------------------
 * The control tick.
 * ------------------------------------------------------------------------ */

/**
 * Called from the draw loop. `windTime` is the renderer's foliage clock;
 * `active` is false whenever the world is held (sheet, briefing, won, lost),
 * in which case the whole bed eases to silence but stays built.
 */
export function updateAmbience(camera: Camera, windTime: number, dt: number, active: boolean): void {
  if (!map || !info) return;
  acc += dt;
  if (acc < A.tick) return;
  const tickDt = acc;
  acc = 0;

  // The graph waits for an unlocked context. By the time a mission is running
  // the player has clicked the menu, so this resolves on the first tick; if
  // the browser still refuses, trying again next tick costs nothing.
  if (!graph) {
    const ctx = audioContext();
    const master = sfxBus();
    if (!ctx || !master) return;
    graph = build(ctx, master);
  }

  const w = CONFIG.wind;
  const cx = camera.x + camera.viewW / 2;
  const cy = camera.y + camera.viewH / 2;
  const now = performance.now() / 1000;

  // Nearest water, over the middle of the view and its four quarter points --
  // so a river entering at the edge of the screen is heard a beat before it
  // is centred.
  const wet = (px: number, py: number): number =>
    sampleField(info!.wetSdf, info!.width, info!.height, map!.tile, px, py);
  const sdf = Math.min(
    wet(cx, cy),
    wet(camera.x + camera.viewW * 0.25, cy),
    wet(camera.x + camera.viewW * 0.75, cy),
    wet(cx, camera.y + camera.viewH * 0.25),
    wet(cx, camera.y + camera.viewH * 0.75),
  );
  const water01 = clamp01(1 - sdf / A.waterRange);

  const fsdf = sampleField(info.foliageSdf, info.width, info.height, map.tile, cx, cy);
  const foliage01 = clamp01(1 - fsdf / A.foliageRange);

  // The exact curve the trees sway on (render.ts windOffset), sampled at the
  // view centre, mapped to 0.3..1 so the bed breathes rather than vanishes.
  const gust = 0.65 + 0.35 * Math.sin((cx + cy) * w.gustScale + windTime * w.gustSpeed);

  const scared = now - lastLoudAt() < A.scareTime;
  const insectDrive = voice.insects === 'none' ? 0 : Math.max(foliage01, voice.insectsFloor);
  // Gunfire quiets the insects too, but only for a couple of seconds --
  // crickets are braver than birds.
  const duck = now - lastLoudAt() < 2 ? 0.4 : 1;

  targets = {
    water: active ? A.water * water01 * water01 : 0,
    wind: active ? A.wind * voice.windTrim * gust * gust : 0,
    // The cube keeps the rustle inside the gust peaks: leaves you can hear
    // only when you can see the trees bending.
    rustle: active ? A.rustle * foliage01 * Math.pow(Math.max(0, gust - 0.5), 3) * 8 : 0,
    insects: active ? A.insects * insectDrive * duck : 0,
    birds: active && !scared ? A.birds : 0,
    gust,
    scared,
  };

  const t = graph.ctx.currentTime;
  const slow = active ? A.ramp : 0.4;
  graph.water.gain.setTargetAtTime(targets.water, t, slow);
  graph.insects.gain.setTargetAtTime(targets.insects, t, slow);
  // Wind and rustle track the gust, which moves faster than terrain does.
  graph.wind.gain.setTargetAtTime(targets.wind, t, active ? 0.2 : 0.4);
  graph.rustle.gain.setTargetAtTime(targets.rustle, t, active ? 0.2 : 0.4);
  // Birds cut fast when startled and drift back slowly -- the asymmetry is
  // the whole effect.
  graph.birds.gain.setTargetAtTime(targets.birds, t, scared || !active ? 0.15 : A.birdRecover);

  // Book a call. The probability integrates to roughly one call per gap.
  const drive = Math.max(foliage01, voice.birdFloor);
  if (active && !scared && settings().sound && drive >= 0.1) {
    const gap = lerp(A.birdMaxGap, A.birdMinGap, drive);
    if (Math.random() < (tickDt / gap) * voice.birdRate) chirp(graph);
  }
}
