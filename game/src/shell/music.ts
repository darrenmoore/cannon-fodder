import { audioContext } from './audio.js';
import { onSettingsChange, settings } from '../ui/settings.js';

/**
 * Menu music.
 *
 * Two ways to make a noise, in this order:
 *
 *  1. The track in `public/music/` -- shipped in the repo since 1 September
 *     2026, on the owner's explicit instruction, as the project's one asset
 *     file. The README in that folder and CLAUDE.md both record the decision;
 *     replacing the file is still all it takes to change the tune.
 *  2. Failing that, an original synth march written for this menu. Not a
 *     transcription of anything: it exists so the front screen is never silent.
 *
 * The deployed site spent a day playing the march because the track was
 * gitignored by design and never reached Render -- the owner heard "the midi"
 * and said so. If the fallback is playing anywhere the track should be, the
 * first question is whether `/music/theme.mp3` actually answers 200 there.
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

/**
 * Music sits below the sound effects, which are short and want the headroom.
 * 0.65 rather than the original 0.55: raising only the settings default would
 * have left every returning player -- the owner included -- on the volume their
 * saved settings already held, and "louder by default" has to reach them too.
 */
const MUSIC_LEVEL = 0.65;

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

/**
 * Buffers the track while the loading screen is up.
 *
 * The element this builds is the one `apply()` will play -- that matters,
 * because the server sends `Cache-Control: no-store`, so a throwaway preload
 * element would buffer three and a half megabytes the real one then fetched
 * again. Resolves when the browser says it can play the whole thing through,
 * when the cap expires, or immediately when there is no track to buffer; the
 * boot awaits it, and a missing file must not hold the game hostage.
 *
 * What it cannot do is defeat autoplay policy: where the browser demands a
 * gesture, the buffered track starts on the first click instead of the moment
 * the bar completes -- instantly, because the bytes are already here.
 */
export function preloadMusic(capMs = 20000): Promise<void> {
  const found = (probe ??= findTrack());
  return new Promise((resolve) => {
    void found.then((url) => {
      if (!url) { resolve(); return; }
      if (!el) {
        el = new Audio(url);
        el.loop = true;
        el.preload = 'auto';
        el.hidden = true;
        document.body.appendChild(el);
      }
      if (el.readyState >= 4) { resolve(); return; }
      const timer = window.setTimeout(() => resolve(), capMs);
      el.addEventListener('canplaythrough', () => { window.clearTimeout(timer); resolve(); }, { once: true });
      el.load();
    });
  });
}

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
    el.volume = Math.max(0, Math.min(1, settings().musicVolume * MUSIC_LEVEL));
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

// The music bar can move -- and cross zero, which flips the `music` toggle --
// while the track is running, so both the level and the on/off answer are
// re-applied live rather than on the next start.
onSettingsChange((s) => {
  const level = Math.max(0, Math.min(1, s.musicVolume * MUSIC_LEVEL));
  if (el) el.volume = level;
  synth?.setLevel(level * 0.5);
  void apply();
});

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
 * An original four-bar theme written for this screen: a walking root under a
 * lead line, with kick, snare and hats on top. Notes are MIDI numbers, an
 * eighth note per step, eight steps to the bar.
 *
 * The first version of this was deliberately plain, on the reasoning that it
 * only had to sit under a menu. It came out sounding like a MIDI file, which is
 * a specific and avoidable failure rather than a modest one -- a single square
 * wave is perfectly periodic, so the ear hears an oscillator rather than an
 * instrument, and a dry signal has no room around it. Everything below is aimed
 * at those two things: detuned stacked voices behind moving filters, a
 * generated hall, a delay on the lead, a compressor to glue it, and an eight-bar
 * arrangement over the four-bar theme so the loop goes somewhere.
 * ------------------------------------------------------------------------ */

const BPM = 132;
const STEP = 30 / BPM; // one eighth note, in seconds
const STEPS_PER_BAR = 8;
/** The theme is four bars; the arrangement alternates two passes over it. */
const LOOP = STEPS_PER_BAR * 4;

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

  /** Master, after the glue compressor. Everything fades on this. */
  private readonly bus: GainNode;
  /** Pre-master mix point the dry voices and the effect returns share. */
  private readonly mix: GainNode;
  private readonly reverb: GainNode;
  private readonly echo: GainNode;
  private readonly noise: AudioBuffer;
  /** Next step index to schedule, counted from the start of the loop. */
  private step = 0;
  /** When that step falls due, on the context clock. */
  private at = 0;
  private timer = 0;

  constructor(private readonly ctx: AudioContext) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;

    // Glue, not loudness: a slow, gentle compressor so the kick does not have
    // to fight the lead for the same instant. Without it the mix reads as
    // several separate beeps rather than as one piece of music.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 24;
    glue.ratio.value = 3;
    glue.attack.value = 0.004;
    glue.release.value = 0.18;

    this.mix = ctx.createGain();
    this.mix.gain.value = 1;
    this.mix.connect(glue).connect(this.bus).connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * 0.4);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    // A room. This is the single biggest difference between "synthesised" and
    // "cheap MIDI" -- dry oscillators sound like a test tone however well they
    // are voiced, because nothing in the world arrives without a space around
    // it. The impulse is generated rather than loaded: a decaying burst of
    // stereo noise is a crude hall, and a crude hall beats none.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.hall(1.8);
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.34;
    this.reverb.connect(convolver).connect(this.mix);

    // A dotted-eighth feedback delay, fed by the lead alone. It is what stops a
    // sparse melody sounding like it is being typed in one note at a time.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 1.5;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.26;
    this.echo.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    delay.connect(this.mix);
  }

  /** A decaying burst of stereo noise, which is a serviceable small hall. */
  private hall(seconds: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      // The exponent is the difference between a hall and a gunshot.
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
      }
    }
    return buf;
  }

  start(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.at = this.ctx.currentTime + 0.08;

    const level = Math.max(0, Math.min(1, settings().musicVolume * MUSIC_LEVEL)) * 0.5;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setValueAtTime(0, this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(level, this.ctx.currentTime + 0.6);

    // A lookahead scheduler: setInterval is far too jittery to place notes on,
    // so it only decides *what* to book, and the audio clock decides when.
    this.timer = window.setInterval(() => this.pump(), 90);
    this.pump();
  }

  /** Retargets the running level; a stopped synth picks its level up on start. */
  setLevel(level: number): void {
    if (!this.running) return;
    this.bus.gain.setTargetAtTime(level, this.ctx.currentTime, 0.03);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    // Fade rather than cut: notes already booked keep sounding for a moment,
    // and the reverb tail needs somewhere to go.
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + 0.5);
  }

  /** Books every step that falls due in the next third of a second. */
  private pump(): void {
    while (this.at < this.ctx.currentTime + 0.33) {
      this.playStep(this.step, this.at);
      this.step++;
      this.at += STEP;
    }
  }

  /**
   * One eighth note.
   *
   * The theme is four bars but the arrangement is eight, so the loop has
   * somewhere to go: the first pass is the tune, the second doubles the lead an
   * octave up and lets the drums open out. A four-bar loop that never changes
   * is the fastest way to make somebody turn the music off.
   */
  private playStep(n: number, when: number): void {
    const i = n % LOOP;
    const bar = Math.floor(i / STEPS_PER_BAR);
    const beat = i % STEPS_PER_BAR;
    const second = Math.floor(n / LOOP) % 2 === 1;

    // Nothing lands exactly on the grid. Four milliseconds is inaudible as
    // timing and audible as the difference between a band and a sequencer.
    const t = when + (Math.random() - 0.5) * 0.008;

    const note = LEAD[i];
    if (note !== null) {
      this.lead(hz(note), t, STEP * 1.7, 0.13 * (beat === 0 ? 1.15 : 1));
      if (second) this.lead(hz(note + 12), t, STEP * 1.2, 0.05);
    }

    // Bass: root on the beat, an octave up on the off-beat, so it walks.
    const root = ROOTS[bar];
    this.bass(hz(beat % 2 === 0 ? root : root + 12), t, STEP * 0.9);

    // The opening bar is drumless, so the loop has a downbeat to arrive on
    // rather than running seamlessly into itself forever.
    if (second || bar > 0) {
      if (beat === 0 || beat === 4) this.kick(t);
      if (beat === 2 || beat === 6) this.snare(t, 0.2);
      if (second && beat === 7) this.snare(t + STEP * 0.5, 0.09);
      this.hat(t, beat % 2 === 0 ? 0.05 : 0.028);
      if (second) this.hat(t + STEP * 0.5, 0.02);
    }
  }

  /**
   * The lead: three oscillators, detuned, behind a filter that closes.
   *
   * A single square wave is the sound people mean by "MIDI" -- perfectly
   * periodic, so the ear hears an oscillator rather than an instrument. Two
   * saws a few cents apart beat against each other, a square an octave down
   * gives it a floor, and a filter envelope supplies the movement a real
   * instrument gets from whoever is playing it.
   */
  private lead(freq: number, t: number, dur: number, gain: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 7;
    filter.frequency.setValueAtTime(Math.min(9000, freq * 7), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.6), t + dur * 0.85);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.014);
    env.gain.exponentialRampToValueAtTime(gain * 0.55, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = -0.12;

    const voices: Array<[OscillatorType, number, number]> = [
      ['sawtooth', -7, 1],
      ['sawtooth', 7, 1],
      ['square', 0, 0.5],
    ];
    for (const [type, detune, mul] of voices) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * mul;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    }

    filter.connect(env).connect(pan).connect(this.mix);
    env.connect(this.reverb);
    env.connect(this.echo);
  }

  /** Saw through a closing filter, with a sine under it for the weight. */
  private bass(freq: number, t: number, dur: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(freq * 6, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 2, t + dur * 0.6);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.22, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0005, t + dur);

    const saw = this.ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = freq;
    saw.connect(filter);
    saw.start(t);
    saw.stop(t + dur + 0.02);
    filter.connect(env).connect(this.mix);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;
    const subEnv = this.ctx.createGain();
    subEnv.gain.setValueAtTime(0, t);
    subEnv.gain.linearRampToValueAtTime(0.16, t + 0.012);
    subEnv.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    sub.connect(subEnv).connect(this.mix);
    sub.start(t);
    sub.stop(t + dur + 0.02);
  }

  /** Pitch drop for the body, plus the click that is what you actually hear. */
  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.15);
    osc.connect(env).connect(this.mix);
    osc.start(t);
    osc.stop(t + 0.17);

    this.rattle(t, 0.015, 0.12, 'bandpass', 1800, 0);
  }

  /**
   * Noise for the rattle, and a tuned tone for the shell.
   *
   * Filtered noise on its own is a hiss. Every real snare has a pitch, and
   * without one the backbeat sits behind the music instead of driving it.
   */
  private snare(t: number, gain: number): void {
    this.rattle(t, 0.14, gain, 'highpass', 1500, 0.08);
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    body.frequency.exponentialRampToValueAtTime(140, t + 0.09);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain * 0.55, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    body.connect(env).connect(this.mix);
    body.start(t);
    body.stop(t + 0.1);
  }

  private hat(t: number, gain: number): void {
    this.rattle(t, 0.035, gain, 'highpass', 7500, -0.25);
  }

  private rattle(
    t: number, dur: number, gain: number,
    type: BiquadFilterType, freq: number, pan: number,
  ): void {
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
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(filter).connect(env).connect(panner).connect(this.mix);
    env.connect(this.reverb);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
