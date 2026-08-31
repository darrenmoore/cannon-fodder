import { audioContext } from './audio.js';
import { settings } from './settings.js';

/**
 * Menu music.
 *
 * Two ways to make a noise, in this order:
 *
 *  1. A track dropped into `public/music/` by whoever is running the game. See
 *     the README in there. Nothing is shipped in the repo -- the tune this game
 *     is a homage to is somebody else's copyright, and rehosting it is not ours
 *     to do, so the file is a slot you fill locally rather than an asset.
 *  2. Failing that, an original synth march written for this menu. Not a
 *     transcription of anything: it exists so the front screen is never silent.
 *
 * Playback is gated twice over -- by the player's saved `music` setting, and by
 * the shell only asking for it while the menu is up. Browsers also refuse to
 * start audio before a gesture, so a blocked start arms a one-shot listener and
 * comes back the moment the player touches anything.
 */

export type MusicSource = 'track' | 'synth' | 'none';

/** Tried in order; the first that exists wins. */
const CANDIDATES = [
  '/music/theme.mp3',
  '/music/theme.ogg',
  '/music/theme.m4a',
  '/music/theme.opus',
  '/music/theme.wav',
];

/** Music sits below the sound effects, which are short and want the headroom. */
const MUSIC_LEVEL = 0.55;

/** Does the shell currently want music -- i.e. is the menu up? */
let wanted = false;
let source: MusicSource = 'none';
let el: HTMLAudioElement | null = null;
let synth: Synth | null = null;
let armed = false;
/** Resolves once, to the first candidate that exists, or null for none. */
let probe: Promise<string | null> | null = null;

const listeners = new Set<() => void>();

/** Fires whenever what the player would see about the music changes. */
export function onMusicChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const announce = (): void => { for (const fn of listeners) fn(); };

/** What is actually playing right now, for the menu button's hint. */
export const musicSource = (): MusicSource => (playing() ? source : 'none');

const playing = (): boolean => (el !== null && !el.paused) || (synth?.running ?? false);

async function findTrack(): Promise<string | null> {
  for (const url of CANDIDATES) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // Offline or blocked; the synth is a fine answer.
    }
  }
  return null;
}

/**
 * Waits for the next gesture and tries again.
 *
 * Only one listener is ever outstanding: a player who clicks four things before
 * the audio unlocks should not queue four starts.
 */
function armGesture(): void {
  if (armed) return;
  armed = true;
  const go = (): void => {
    armed = false;
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    void apply();
  };
  window.addEventListener('pointerdown', go, { once: true });
  window.addEventListener('keydown', go, { once: true });
}

/** Brings playback in line with what the settings and the shell are asking for. */
async function apply(): Promise<void> {
  const on = wanted && settings().music;

  if (!on) {
    el?.pause();
    synth?.stop();
    announce();
    return;
  }

  probe ??= findTrack();
  const url = await probe;
  // The player can leave the menu, or hit the toggle, while the probe is in
  // flight. Re-check rather than starting something nobody asked for any more.
  if (!(wanted && settings().music)) return;

  if (url) {
    if (!el) {
      el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      // Playback does not need it in the document, but being able to find the
      // element in devtools -- and in the headless driver -- is worth the line.
      el.hidden = true;
      document.body.appendChild(el);
    }
    el.volume = Math.max(0, Math.min(1, settings().volume * MUSIC_LEVEL));
    source = 'track';
    try {
      await el.play();
    } catch {
      // Autoplay refused, or the file turned out to be undecodable. A gesture
      // retry costs nothing; a broken file simply never starts, and the player
      // still has the toggle.
      armGesture();
    }
    announce();
    return;
  }

  const ctx = audioContext();
  if (!ctx) {
    source = 'none';
    announce();
    return;
  }
  synth ??= new Synth(ctx);
  source = 'synth';
  synth.start();
  if (ctx.state === 'suspended') armGesture();
  announce();
}

/** The menu is up. */
export function startMusic(): void {
  wanted = true;
  void apply();
}

/** A mission is starting; the front screen music has no business over it. */
export function stopMusic(): void {
  wanted = false;
  void apply();
}

export const musicOn = (): boolean => settings().music;

/**
 * Flips the toggle. The caller persists the setting; this only reacts to it,
 * which keeps `settings.ts` the single owner of what is remembered.
 */
export function syncMusic(): void {
  void apply();
}

/* --------------------------------------------------------------------------
 * The fallback march.
 *
 * An original four-bar loop written for this screen: a pulsing root under a
 * lead line, with kick, snare and hats on top. Notes are MIDI numbers, an
 * eighth note per step, eight steps to the bar. It is deliberately plain --
 * the point is to sit under a menu, not to be listened to.
 * ------------------------------------------------------------------------ */

const BPM = 128;
const STEP = 30 / BPM; // one eighth note, in seconds
const STEPS_PER_BAR = 8;

/** D minor, four bars. `null` is a rest; a held note is just a longer gap. */
const LEAD: Array<number | null> = [
  69, null, 74, 72, 69, null, 67, null,
  65, null, 67, 69, 70, null, 69, null,
  74, null, 72, 70, 69, null, 65, null,
  67, 69, 67, 65, 62, null, null, null,
];

/** Root note per bar: Dm, B flat, F, A. */
const ROOTS = [38, 34, 41, 33];

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

class Synth {
  running = false;

  private readonly bus: GainNode;
  private readonly noise: AudioBuffer;
  /** Next step index to schedule, counted from the start of the loop. */
  private step = 0;
  /** When that step falls due, on the context clock. */
  private at = 0;
  private timer = 0;

  constructor(private readonly ctx: AudioContext) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * 0.4);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  start(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.at = this.ctx.currentTime + 0.08;

    const level = Math.max(0, Math.min(1, settings().volume * MUSIC_LEVEL)) * 0.5;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setValueAtTime(0, this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(level, this.ctx.currentTime + 0.6);

    // A lookahead scheduler: setInterval is far too jittery to place notes on,
    // so it only decides *what* to book, and the audio clock decides when.
    this.timer = window.setInterval(() => this.pump(), 90);
    this.pump();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    // Fade rather than cut: notes already booked keep sounding for a moment.
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + 0.35);
  }

  /** Books every step that falls due in the next third of a second. */
  private pump(): void {
    while (this.at < this.ctx.currentTime + 0.33) {
      this.playStep(this.step % LEAD.length, this.at);
      this.step++;
      this.at += STEP;
    }
  }

  private playStep(i: number, t: number): void {
    const bar = Math.floor(i / STEPS_PER_BAR);
    const beat = i % STEPS_PER_BAR;

    const note = LEAD[i];
    if (note !== null) this.tone(hz(note), t, STEP * 1.6, 0.16, 'square');

    // Bass: root on the beat, an octave up on the off-beat, so it walks.
    const root = ROOTS[bar];
    this.tone(hz(beat % 2 === 0 ? root : root + 12), t, STEP * 0.85, 0.3, 'triangle');

    if (beat === 0 || beat === 4) this.kick(t);
    if (beat === 2 || beat === 6) this.snare(t);
    this.hat(t, beat % 2 === 0 ? 0.05 : 0.03);
  }

  private tone(freq: number, t: number, dur: number, gain: number, type: OscillatorType): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.15);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  private snare(t: number): void {
    this.rattle(t, 0.13, 0.22, 'highpass', 1400);
  }

  private hat(t: number, gain: number): void {
    this.rattle(t, 0.04, gain, 'highpass', 7000);
  }

  private rattle(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random() * 0.2;
    src.loopEnd = src.loopStart + 0.15;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(filter).connect(env).connect(this.bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
