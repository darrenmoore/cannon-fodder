/**
 * The screen going out, and coming back.
 *
 * The original passes through black between everything, and this game already
 * did -- on the canvas, which meant the battlefield went dark and the sidebar
 * beside it stayed lit. A results panel over a live-looking squad list is not
 * an ending; it is a card that has appeared. The sidebar is DOM and outside the
 * canvas, so no amount of `fillRect` was ever going to reach it, and the fade
 * had to move up a layer to something that covers both.
 *
 * Opacity on one element, driven from the mission clock rather than from a CSS
 * transition, so the fade is the same length on any machine and a capture can
 * be taken at an exact point in it -- the same reason the simulation runs on a
 * fixed step.
 */
const el = (): HTMLElement | null => document.getElementById('blackout');

let level = 0;

/** 0 is clear, 1 is fully black. Idempotent, so it is safe to call every frame. */
export function setBlackout(v: number): void {
  const next = Math.max(0, Math.min(1, v));
  if (Math.abs(next - level) < 0.004) return;
  level = next;
  const node = el();
  if (node) node.style.opacity = String(next);
}

export const blackoutLevel = (): number => level;

/**
 * Fades back in over `seconds`, resolving when the screen is clear.
 *
 * Driven off `requestAnimationFrame` rather than a transition because the shell
 * needs to know when it has finished -- the next mission must not take its
 * first order through a black screen.
 */
export function fadeIn(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const from = level;
    if (from <= 0) { resolve(); return; }
    const started = performance.now();
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - started) / (seconds * 1000));
      setBlackout(from * (1 - t));
      if (t >= 1) { setBlackout(0); resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
