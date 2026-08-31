import { CONFIG } from '../config.js';
import { settings } from './settings.js';

/**
 * One place decides how big everything is.
 *
 * Layout mode, zoom and input profile are all derived from the viewport, never
 * from a user-agent string: a narrow desktop window has exactly the problem a
 * phone has, and should get the same answer. The mode is published as
 * `data-layout` on the root element, which is the only thing the stylesheet
 * branches on, and as a change event, which is what the HUD, the action bar and
 * the camera subscribe to.
 *
 * Zoom is the interesting part. It used to be the constant 3 applied to *device*
 * pixels, which meant a retina laptop showed twice as much world as a
 * non-retina one -- the field of view was already inconsistent between two
 * desktops before any phone turned up. It is now derived from the CSS size of
 * the canvas against a target field of view, and only then multiplied by the
 * pixel ratio, so every device sees a comparable amount of ground.
 */

export type LayoutMode = 'wide' | 'compact' | 'stacked';

export interface LayoutState {
  mode: LayoutMode;
  /** True when the primary input is a finger. Drives copy, slack and controls. */
  touch: boolean;
  /** Viewport, in CSS pixels. */
  cssW: number;
  cssH: number;
  /** The canvas, in CSS pixels, after the layout has taken its share. */
  canvasCssW: number;
  canvasCssH: number;
  /** World pixels to CSS pixels. Always an integer. */
  cssZoom: number;
  /** Device pixel ratio actually used for the backing store. */
  dpr: number;
  /** World pixels to device pixels: what `Camera.zoom` is set to. */
  deviceZoom: number;
}

/** Below this width in landscape, the sidebar costs more than it is worth. */
const WIDE_MIN_WIDTH = 900;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function pickMode(cssW: number, cssH: number): LayoutMode {
  if (cssH > cssW) return 'stacked';
  return cssW >= WIDE_MIN_WIDTH ? 'wide' : 'compact';
}

/**
 * The zoom rule.
 *
 * This took three attempts and the two failures are worth recording, because
 * both were reasonable and both were wrong.
 *
 * The first targeted an exact field of view. Defensible on paper -- every
 * device sees the same ground, so nobody is disadvantaged -- and it put a
 * 1920x1080 desktop on scale 5 against the 3 it had always run at, cropping the
 * battlefield for a player who had asked for nothing.
 *
 * The second pinned the scale at 3 and only ever stepped down. That restored
 * the old desktop framing exactly, which turned out to be the problem: at 3 a
 * 1920 screen shows 577x360 world pixels, a soldier is thirty CSS pixels tall
 * and a firefight happens somewhere in the middle distance. It also had a
 * cliff, testing against the *ideal* field of view rather than the minimum, so
 * a window a few pixels short fell the whole way to 2.
 *
 * So: aim at a field of view between the two (`idealWorldW/H`), round to a
 * whole scale, and cap the automatic answer at `autoMax`. That lands a big
 * desktop on 4, a laptop on 3 and a phone on 2. Two guards sit either side --
 * the auto-pick never crops below `minWorldW/H`, and it never goes closer than
 * `autoMax` on its own, because a scale nobody asked for that hides the
 * battlefield is a worse failure than one that is merely further out than they
 * would have picked.
 *
 * Anything beyond that is the player's, through the bias: pinch, the wheel, or
 * the settings sheet, over the full `min`..`max` range.
 */
export function pickZoom(canvasCssW: number, canvasCssH: number, bias: number): number {
  const z = CONFIG.camera.zoom;

  // The scale that best fits the framing being aimed for.
  const ideal = Math.min(canvasCssW / z.idealWorldW, canvasCssH / z.idealWorldH);
  let auto = clamp(Math.round(ideal), z.min, z.autoMax);

  // ...backed off until the view is not a letterbox. On a phone in landscape
  // this is what does the work: 390 CSS pixels of height cannot carry scale 3.
  while (auto > z.min && (canvasCssW / auto < z.minWorldW || canvasCssH / auto < z.minWorldH)) {
    auto--;
  }

  return clamp(auto + bias, z.min, z.max);
}

/** True if the device wants to be poked rather than pointed at. */
function detectTouch(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return 'ontouchstart' in window;
  }
}

export class Layout {
  state: LayoutState;

  private readonly listeners = new Set<(s: LayoutState) => void>();
  /** Set once a real pointer event tells us what the player is actually using. */
  private touchOverride: boolean | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {
    this.state = {
      mode: 'wide', touch: detectTouch(),
      cssW: 0, cssH: 0, canvasCssW: 0, canvasCssH: 0,
      cssZoom: 3, dpr: 1, deviceZoom: 3,
    };
  }

  onChange(fn: (s: LayoutState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * The player just used a mouse, or a finger. Believe the event over the
   * media query -- a laptop with a touchscreen matches neither cleanly, and
   * what matters is which one is in their hand right now.
   */
  observePointer(kind: 'mouse' | 'touch' | 'pen'): void {
    const touch = kind !== 'mouse';
    if (this.touchOverride === touch) return;
    this.touchOverride = touch;
    if (touch !== this.state.touch) this.apply();
  }

  /**
   * Recomputes everything and resizes the canvas backing store.
   *
   * Order matters: the mode has to be published before the canvas is measured,
   * because the mode is what decides whether a sidebar or a bottom bar is
   * taking a bite out of it.
   */
  apply(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const mode = pickMode(cssW, cssH);
    const touch = this.touchOverride ?? detectTouch();

    const root = document.documentElement;
    root.dataset.layout = mode;
    root.dataset.input = touch ? 'touch' : 'pointer';
    root.dataset.hand = settings().handedness;

    // Force the reflow before measuring, so the canvas is the size the new mode
    // gives it rather than the size the old one did.
    void root.offsetWidth;

    const canvasCssW = Math.max(1, this.canvas.clientWidth);
    const canvasCssH = Math.max(1, this.canvas.clientHeight);

    const cssZoom = pickZoom(canvasCssW, canvasCssH, settings().zoomBias);
    const dpr = this.pixelRatio();
    const deviceZoom = Math.max(1, Math.round(cssZoom * dpr));

    this.canvas.width = Math.round(canvasCssW * dpr);
    this.canvas.height = Math.round(canvasCssH * dpr);
    this.ctx.imageSmoothingEnabled = false;

    this.state = { mode, touch, cssW, cssH, canvasCssW, canvasCssH, cssZoom, dpr, deviceZoom };
    for (const fn of this.listeners) fn(this.state);
  }

  /**
   * How many device pixels to render per CSS pixel.
   *
   * Capped at 2 because the third pixel of a 3x phone costs 2.25x the fill rate
   * of the second and buys nothing on a hard-edged pixel game. "Crisp" snaps to
   * an integer so `cssZoom * dpr` stays whole and every sprite edge lands on a
   * device pixel -- at the cost of one browser upscale on a fractional-ratio
   * display, where the browser is resampling the whole page anyway.
   */
  private pixelRatio(): number {
    const raw = window.devicePixelRatio || 1;
    const capped = Math.min(2, raw);
    const dpr = settings().crisp ? Math.max(1, Math.round(capped)) : capped;
    return settings().resolution === 'half' ? Math.max(1, dpr / 2) : dpr;
  }

  /**
   * Extra world-pixel slack around a tap target.
   *
   * A finger is about 44 CSS pixels wide and an enemy is under 7 world pixels
   * across, so without this a touch player is trying to hit a 14px dot.
   */
  get clickSlack(): number {
    return this.state.touch ? Math.max(9, 22 / this.state.cssZoom) : 9;
  }

  /** Converts a CSS-pixel design measurement into world pixels at this zoom. */
  toWorld(cssPx: number): number {
    return cssPx / this.state.cssZoom;
  }
}
