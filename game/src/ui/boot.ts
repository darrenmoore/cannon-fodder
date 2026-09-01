/**
 * The loading screen: the first thing anybody sees.
 *
 * It has one hard constraint that shapes everything else about it. **It has to
 * paint before the bundle exists**, because the whole point of it is covering
 * the gap the bundle takes to arrive -- which means its markup and its critical
 * styles are inline in `index.html`, not here, and it cannot use the generated
 * chrome face, the plates, or the logo. None of those exist yet. Anything this
 * module does is an *upgrade* applied once the bundle is running.
 *
 * So the screen is deliberately austere: a field, a rule, the game's name in
 * whatever monospace the machine has, and a stepped bar. Stepped, not smooth --
 * a bar with a fractional edge is the one thing on the screen that would give
 * away that this is a browser, and it is the screen setting every expectation
 * for what follows.
 *
 * **The steps are real.** Each one is a milestone that actually happened:
 * settings read, atlas baked, missions fetched, first frame drawn. A progress
 * bar animating on a timer is a lie told at the exact moment the player is
 * deciding whether this thing works, and it is a lie that gets found out the
 * first time a slow connection makes the bar finish before the game does.
 */

const STEPS = ['boot', 'sprites', 'missions', 'ready'] as const;
export type BootStep = (typeof STEPS)[number];

/**
 * The shortest a loading screen may be shown.
 *
 * On a warm cache the whole boot is faster than a blink, and a screen that
 * appears and vanishes inside 80ms reads as a flicker -- a fault, not a
 * loading screen. Held to 500ms it reads as deliberate. This is the one timing
 * here that is not driven by a real event, and it is a floor rather than a
 * duration: a slow boot takes as long as it takes.
 */
const MIN_MS = 500;

const el = (id: string): HTMLElement | null => document.getElementById(id);

let shownAt = 0;
let done = 0;

export function bootBegin(): void {
  shownAt = performance.now();
}

/** Marks a milestone reached and advances the bar to it. */
export function bootStep(step: BootStep): void {
  const i = STEPS.indexOf(step);
  if (i < 0 || i + 1 <= done) return;
  done = i + 1;
  const bar = el('boot-bar');
  if (bar) {
    // Whole steps only: the bar has four cells and fills them one at a time,
    // so there is never a partial cell with a soft edge in it.
    for (let c = 0; c < STEPS.length; c++) {
      bar.children[c]?.classList.toggle('on', c < done);
    }
  }
  const label = el('boot-word');
  if (label) label.textContent = step.toUpperCase();
}

/**
 * Takes the screen down, no sooner than `MIN_MS` after it went up.
 *
 * Resolves once it is gone, so the caller can treat "the loading screen has
 * finished" as a thing that happens rather than a thing to guess at.
 */
export function bootEnd(): Promise<void> {
  const wait = Math.max(0, MIN_MS - (performance.now() - shownAt));
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const root = el('boot');
      if (!root) { resolve(); return; }
      root.classList.add('gone');
      // Matches the CSS transition. Removed rather than hidden, because it sits
      // over everything and a stray pointer-events on it would eat the menu.
      window.setTimeout(() => { root.remove(); resolve(); }, 420);
    }, wait);
  });
}

/**
 * Says the boot failed, on the screen the player is already looking at.
 *
 * Without this a thrown error leaves the loading screen up forever, which is
 * indistinguishable from a slow connection and is the worst possible reading of
 * it -- the player waits, then blames their line.
 */
export function bootFailed(err: unknown): void {
  const root = el('boot');
  if (!root) return;
  root.classList.add('failed');
  const label = el('boot-word');
  if (label) label.textContent = 'FAILED TO LOAD';
  const hint = el('boot-hint');
  if (hint) hint.textContent = String((err as Error)?.message ?? err).slice(0, 120);
}
