/**
 * The comms panel: someone on the wire, telling you what to do.
 *
 * ## Why it is called that
 *
 * Because the strip is the *channel*, and who is on it is a separate thing.
 * The owner asked for a name that is not "advisor" precisely so that a second
 * character later is a table entry rather than a rewrite, and that distinction
 * only survives if it is in the names:
 *
 *   the comms panel  the strip itself -- one on screen, owns the entrance,
 *                    the retract and the typing
 *   a speaker        who is talking: a name, and later a portrait and a voice
 *   a transmission   one thing said
 *
 * **Nothing in this file may name a particular speaker.** The moment it does,
 * the second one costs a refactor.
 *
 * ## Why it is not the briefing
 *
 * The briefing already says what the mission is, and it is dismissed by the
 * first click. The owner's friend read one and still did not know how to fire.
 * A card you click away is exactly the thing that failed him; a strip that
 * stays on the screen during the mission is not.
 *
 * ## Why the copy lives here rather than in the map file
 *
 * `data/*.map` is generated from the campaign table and hand edits are lost on
 * the next `npm run levels` -- but the deciding reason is that these lines are
 * platform-branched at runtime ("HOLD F" or "HOLD RIGHT"), so they cannot be
 * a static string in a data file at all. A `advice:` header can follow later
 * for the lines that are not about controls.
 */

import { controlLines } from './controltext.js';
import { DEFAULT_SPEAKER } from '../sim/map.js';
import type { GameMap } from '../sim/map.js';
import { reducedMotion, settings } from './settings.js';
import { sfxVoice } from '../shell/audio.js';
import { speakerFace } from '../render/sprites/speaker.js';
import type { SpeakerVoice } from '../shell/audio.js';

/** Who is talking. */
export interface Speaker {
  id: string;
  /** Shown above the line. Empty for the plain narrator. */
  name: string;
  /** The portrait id, matching `render/sprites/speaker.ts`. */
  portrait?: string;
  /** How they sound while typing. Absent means the text simply appears. */
  voice?: SpeakerVoice;
}

/** The voice with no face: plain instructions, nobody speaking them. */
export const NARRATOR: Speaker = { id: 'narrator', name: '' };

/**
 * The speaker table.
 *
 * Adding a character is adding an entry here plus a mask in
 * `render/sprites/speaker.ts`. Nothing else in this file knows any of their
 * names, which is the property the owner asked for and the one worth
 * protecting.
 */
export const SPEAKERS: Record<string, Speaker> = {
  trumper: {
    id: 'trumper',
    name: 'Major Trumper',
    portrait: 'trumper',
    // Low, square and unhurried: a big man who is in no rush and has never
    // once wondered whether he should be talking.
    voice: { wave: 'square', hz: 320, jitter: 0.06, everyNth: 2 },
  },
};

export interface TransmissionOpts {
  /** Stay until the mission ends. Overrides `seconds`. */
  sticky?: boolean;
  /** Retract after this long, once it has arrived. */
  seconds?: number;
  /** Wait this long before coming in. A beat to look at the map first. */
  delay?: number;
}

/**
 * Seconds before the panel bounces in.
 *
 * Not zero: arriving in the same frame as the map makes it part of the
 * furniture, and the owner asked for it to *get their attention*. Three
 * seconds is long enough that it is a new thing appearing.
 */
const DEFAULT_DELAY = 3;

/**
 * How long a non-sticky transmission stays.
 *
 * Twelve: long enough to read twice, short enough not to nag. A number rather
 * than a question -- change it if a playtest disagrees.
 */
const DEFAULT_SECONDS = 12;

let root: HTMLElement | null = null;
let inTimer = 0;
let outTimer = 0;
let typeTimer = 0;
let faceTimer = 0;

/** Seconds per character while typing. */
const TYPE_STEP = 0.035;
/** Characters that get no blip: silence on the gaps is what makes it speech. */
const SILENT = /[\s.,;:!?'"()\-·]/;

function ensure(): HTMLElement | null {
  if (root) return root;
  const host = document.getElementById('viewport');
  if (!host) return null;
  root = document.createElement('div');
  root.id = 'comms';
  root.hidden = true;
  host.appendChild(root);
  return root;
}

const clearTimers = (): void => {
  window.clearTimeout(inTimer);
  window.clearTimeout(outTimer);
  window.clearInterval(typeTimer);
  window.clearInterval(faceTimer);
  inTimer = 0;
  outTimer = 0;
  typeTimer = 0;
  faceTimer = 0;
};

/**
 * Types `text` into `into`, blipping as it goes.
 *
 * Skipped entirely under reduced motion -- the text appears whole -- and the
 * blip is skipped when effects are off, which are two different settings and
 * deliberately two different checks: somebody who has turned motion down has
 * not necessarily turned the sound off.
 */
function type(
  into: HTMLElement, text: string, voice: SpeakerVoice | undefined, mouth: Mouth,
): void {
  if (reducedMotion() || !voice) { into.textContent = text; return; }
  into.textContent = '';
  let i = 0;
  let spoken = 0;
  // The mouth starts with the first character and stops with the last, so the
  // two are driven by one thing and cannot drift apart.
  mouth.talk();
  typeTimer = window.setInterval(() => {
    if (i >= text.length) {
      window.clearInterval(typeTimer);
      typeTimer = 0;
      mouth.rest();
      return;
    }
    const ch = text[i++];
    into.textContent += ch;
    if (SILENT.test(ch)) return;
    // Every Nth speakable character, not every one: at a readable typing speed
    // that is about thirty a second and becomes a buzz rather than a voice.
    if (spoken++ % voice.everyNth === 0 && settings().sound) sfxVoice(voice);
  }, TYPE_STEP * 1000);
}

/** A portrait that can be told to start and stop talking. */
interface Mouth {
  talk(): void;
  rest(): void;
}

/**
 * Drives a portrait: one interval, one state, one handle to cancel.
 *
 * **Why one timer.** The version before this ran a blink interval that
 * scheduled three bare `setTimeout`s per blink, and only the interval was
 * cancellable -- retract the panel mid-blink and three callbacks still fired,
 * writing onto an element that had already been thrown away. Harmless while it
 * was a blink; with a loop running for the whole of a line it becomes the thing
 * that fights the retract. So: one interval, and `clearTimers` has exactly one
 * thing to clear.
 *
 * **Why it does not stop mid-word.** `rest()` lets the current cycle finish
 * rather than cutting to the idle frame where it stands. A mouth that snaps
 * shut on the last character reads as the animation being switched off; one
 * that closes and then rests reads as someone finishing a sentence.
 *
 * **Why the frame goes in `dataset` too.** It is what `tools/moment.mjs` reads
 * to prove the mouth is moving during a line and stopped after it -- which is
 * the one thing about this that a screenshot cannot show.
 *
 * This file still names no speaker: it asks `speakerFace` what the loops are
 * and sets a frame *number*, so a second portrait needs nothing here.
 */
function animate(face: HTMLElement, portrait: string): Mouth {
  const set = (f: number): void => {
    face.style.setProperty('--comms-face-f', String(f));
    face.dataset.frame = String(f);
  };
  const { idle, talk } = speakerFace(portrait);

  set(idle.frames[0]);
  // Under reduced motion the face is a still. `type()` puts the whole line up
  // at once anyway, so there is nothing for a mouth to be in step with, and a
  // no-op Mouth means the call site needs no branch.
  if (reducedMotion()) return { talk: () => {}, rest: () => {} };

  let loop = idle;
  let stopping = false;
  let i = 0;
  let held = 0;
  const TICK = 30;

  faceTimer = window.setInterval(() => {
    held += TICK / 1000;
    if (held < loop.hold) return;
    held = 0;
    i++;
    if (i >= loop.frames.length) {
      i = 0;
      if (stopping) { stopping = false; loop = idle; }
    }
    set(loop.frames[i]);
  }, TICK);

  return {
    talk: () => {
      if (loop === talk) { stopping = false; return; }
      loop = talk; stopping = false; i = 0; held = 0;
      set(talk.frames[0]);
    },
    rest: () => { if (loop === talk) stopping = true; },
  };
}

/** Puts one transmission on the wire. Replaces whatever was up. */
export function showTransmission(
  speaker: Speaker, text: string, opts: TransmissionOpts = {},
): void {
  const el = ensure();
  if (!el) return;
  clearTimers();

  el.textContent = '';
  el.dataset.speaker = speaker.id;
  el.classList.toggle('with-face', !!speaker.portrait);

  let mouth: Mouth = { talk: () => {}, rest: () => {} };
  if (speaker.portrait) {
    const face = Object.assign(document.createElement('i'), { className: 'comms-face' });
    // The strip and its frame count are the speaker's; the frame *number* is
    // this file's. See skin.ts for why that split matters.
    // Bezel first: the first layer in the list paints on top, and the ring has
    // to sit over the portrait or he is pasted onto it rather than set into it.
    face.style.backgroundImage = `var(--sk-bezel), var(--sk-face-${speaker.portrait})`;
    face.style.setProperty('--comms-face-n', `var(--sk-face-${speaker.portrait}-n)`);
    el.appendChild(face);
    mouth = animate(face, speaker.portrait);
  }

  const said = document.createElement('div');
  said.className = 'comms-said';
  if (speaker.name) {
    said.appendChild(Object.assign(document.createElement('span'), {
      className: 'comms-who', textContent: speaker.name.toUpperCase(),
    }));
  }
  const line = Object.assign(document.createElement('span'), { className: 'comms-line' });
  said.appendChild(line);
  el.appendChild(said);

  const delay = (opts.delay ?? DEFAULT_DELAY) * 1000;
  inTimer = window.setTimeout(() => {
    el.hidden = false;
    // A frame's grace so the browser has it laid out before the class that
    // animates it lands -- without it the entrance plays from nothing, the
    // same trick showFront uses.
    requestAnimationFrame(() => {
      el.classList.add('in');
      // Under reduced motion the class still lands; the stylesheet is what
      // drops the bounce, so there is one place that decides and it is not
      // this one.
      if (reducedMotion()) el.classList.add('still');
      // The typing starts once it has arrived, not on the way in: a line being
      // spelled out while the panel is still sliding reads as two effects
      // fighting rather than as someone talking.
      window.setTimeout(() => type(line, text, speaker.voice, mouth), reducedMotion() ? 0 : 260);
    });
    if (!opts.sticky) {
      outTimer = window.setTimeout(hideComms, (opts.seconds ?? DEFAULT_SECONDS) * 1000);
    }
  }, delay);
}

/** Retracts the panel, if it is up. */
export function hideComms(): void {
  clearTimers();
  if (!root) return;
  root.classList.remove('in');
  // Let the exit play before it is taken out of the layout.
  outTimer = window.setTimeout(() => { if (root) root.hidden = true; }, 320);
}

/** Removes it outright. For the end of a mission, where nothing should linger. */
export function teardownComms(): void {
  clearTimers();
  root?.remove();
  root = null;
}

/**
 * What this mission has to say, ready to put on the wire.
 *
 * The line itself is mission data (`advice:` in the map header); this resolves
 * the two things a map file cannot state for itself.
 *
 * **The controls.** `{FIRE}` and `{GRENADE}` are substituted here from
 * `controlLines()`, which is platform-branched -- so one line of map data
 * reads "HOLD RIGHT or F" on a PC and "HOLD F or CTRL+CLICK" on a Mac. A map
 * file that spelled the key out would be a lie on half the machines that read
 * it, and that exact lie is why the comms panel exists at all.
 *
 * **The speaker.** An id in the map, an entry in `SPEAKERS` here. An unknown
 * id falls back rather than throwing: a mission whose speaker was renamed
 * should still say its line in somebody's voice.
 */
export function transmissionFor(
  map: GameMap,
): { speaker: Speaker; text: string; opts: TransmissionOpts } | null {
  const advice = map.advice;
  if (!advice || !advice.text.trim()) return null;

  const keys = new Map(controlLines().map((l) => [l.action, l.keys]));
  const text = advice.text
    .replace(/\{FIRE\}/g, keys.get('fire') ?? '')
    .replace(/\{GRENADE\}/g, keys.get('grenade') ?? '')
    .replace(/\{MOVE\}/g, keys.get('move') ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  const speaker = SPEAKERS[advice.speaker] ?? SPEAKERS[DEFAULT_SPEAKER] ?? NARRATOR;
  // -1 means it stays for the whole mission, which is what the two training
  // missions want: the player may look away and come back still not knowing
  // which button fires.
  const opts: TransmissionOpts = advice.seconds < 0
    ? { sticky: true }
    : { seconds: advice.seconds };

  return { speaker, text, opts };
}
