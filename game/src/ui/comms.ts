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
import { reducedMotion } from './settings.js';

/** Who is talking. A portrait and a voice hang off this later. */
export interface Speaker {
  id: string;
  /** Shown above the line. Empty for the plain narrator. */
  name: string;
}

/** The voice with no face: plain instructions, nobody speaking them. */
export const NARRATOR: Speaker = { id: 'narrator', name: '' };

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
  inTimer = 0;
  outTimer = 0;
};

/** Puts one transmission on the wire. Replaces whatever was up. */
export function showTransmission(
  speaker: Speaker, text: string, opts: TransmissionOpts = {},
): void {
  const el = ensure();
  if (!el) return;
  clearTimers();

  el.textContent = '';
  if (speaker.name) {
    el.appendChild(Object.assign(document.createElement('span'), {
      className: 'comms-who', textContent: speaker.name.toUpperCase(),
    }));
  }
  el.appendChild(Object.assign(document.createElement('span'), {
    className: 'comms-line', textContent: text,
  }));
  el.dataset.speaker = speaker.id;

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
    case 'training-fire':
      return { text: `CLICK TO MARCH.   ${fire} TO SHOOT.`, opts: { sticky: true } };
    case 'training-bridge':
      return {
        text: `WALK OVER THE GRENADES.   ${grenade} TO AIM, CLICK TO THROW AT THE HUTS.`,
        opts: { sticky: true },
      };
    case 'chicken-run':
      return {
        text: 'MOVE AS A HERD.   USE THE TREELINE, AND LET THEM COME TO YOU.',
        opts: { seconds: DEFAULT_SECONDS },
      };
    default:
      return null;
  }
}
