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
import { reducedMotion, settings } from './settings.js';
import { sfxVoice } from '../shell/audio.js';
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
let blinkTimer = 0;

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
  window.clearInterval(blinkTimer);
  inTimer = 0;
  outTimer = 0;
  typeTimer = 0;
  blinkTimer = 0;
};

/**
 * Types `text` into `into`, blipping as it goes.
 *
 * Skipped entirely under reduced motion -- the text appears whole -- and the
 * blip is skipped when effects are off, which are two different settings and
 * deliberately two different checks: somebody who has turned motion down has
 * not necessarily turned the sound off.
 */
function type(into: HTMLElement, text: string, voice: SpeakerVoice | undefined): void {
  if (reducedMotion() || !voice) { into.textContent = text; return; }
  into.textContent = '';
  let i = 0;
  let spoken = 0;
  typeTimer = window.setInterval(() => {
    if (i >= text.length) { window.clearInterval(typeTimer); typeTimer = 0; return; }
    const ch = text[i++];
    into.textContent += ch;
    if (SILENT.test(ch)) return;
    // Every Nth speakable character, not every one: at a readable typing speed
    // that is about thirty a second and becomes a buzz rather than a voice.
    if (spoken++ % voice.everyNth === 0 && settings().sound) sfxVoice(voice);
  }, TYPE_STEP * 1000);
}

/**
 * Blinks the portrait, and shifts it a pixel now and then.
 *
 * Frames on a timer rather than a tween, per the house rule that sprite work
 * has no interpolation -- a fading eyelid is alpha by another name. Stopped
 * under reduced motion, where a face twitching in the corner is exactly the
 * thing the setting exists to turn off.
 */
function animate(face: HTMLElement, portrait: string): void {
  const set = (f: number): void => {
    face.style.backgroundImage = `var(--sk-face-${portrait}-${f})`;
  };
  set(0);
  if (reducedMotion()) return;
  blinkTimer = window.setInterval(() => {
    // Roughly one blink every few seconds, at an uneven beat: a metronome
    // blink reads as a fault.
    if (Math.random() > 0.25) return;
    set(1);
    window.setTimeout(() => set(2), 70);
    window.setTimeout(() => set(1), 150);
    window.setTimeout(() => set(0), 220);
  }, 900);
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

  if (speaker.portrait) {
    const face = Object.assign(document.createElement('i'), { className: 'comms-face' });
    el.appendChild(face);
    animate(face, speaker.portrait);
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
      window.setTimeout(() => type(line, text, speaker.voice), reducedMotion() ? 0 : 260);
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
 * What each mission has to say, keyed by map id.
 *
 * A function rather than a string because the control names are decided at
 * runtime, and `controlLines()` is the only place that knows them -- one
 * source for "how do you fire", never two.
 *
 * Only the first three have entries. The owner asked for the tutorial on the
 * first two, sticky, and on the third with a retract; everything else is
 * silent until somebody has something to say.
 */
export function transmissionFor(
  mapId: string,
): { text: string; opts: TransmissionOpts } | null {
  const keys = new Map(controlLines().map((l) => [l.action, l.keys]));
  const fire = keys.get('fire') ?? '';
  const grenade = keys.get('grenade') ?? '';

  switch (mapId) {
    /*
     * In Major Trumper's register, per the answer to Q1: the officer supplies
     * the situation, Lock supplies the delivery. Flat, unhurried, an absurdly
     * specific detail stated as ordinary fact and then committed to. If a line
     * would work with a drum sting after it, it is the wrong line -- and it
     * still has to say what to press, because a tutorial that is only funny
     * has failed at the one job it was given.
     */
    case 'training-fire':
      return {
        text: `CLICK WHERE YOU WANT THEM AND THEY'LL GO THERE. ${fire} TO SHOOT. THAT IS THE WHOLE OF IT.`,
        opts: { sticky: true },
      };
    case 'training-bridge':
      return {
        text: `THE GRENADES ARE ON THE BRIDGE. WALK OVER THEM. ${grenade} TO AIM, CLICK TO THROW. AT THE HUTS, IDEALLY.`,
        opts: { sticky: true },
      };
    case 'chicken-run':
      return {
        text: 'MOVE AS A HERD AND USE THE TREES. I HID IN SOME TREES IN 1961. NOBODY HAS FOUND ME SINCE, IN A SENSE.',
        opts: { seconds: 14 },
      };
    default:
      return null;
  }
}
