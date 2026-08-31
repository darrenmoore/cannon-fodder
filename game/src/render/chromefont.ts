/**
 * The chrome typeface, on canvas.
 *
 * The other half of `src/glyphs.ts`: `ui/pixelface.ts` turns that table into a
 * TrueType file for the DOM, and this plots the same rows straight onto a
 * canvas. Same letterforms in both places, which is the point -- a level select
 * drawn on canvas sitting beside a sidebar drawn in DOM must not look like two
 * programs.
 *
 * **Three faces, and why that is still one type system.** The game has
 * `pixelfont.ts` at 3x5, this at 5x7, and `bigfont.ts` at 10x13. They are not
 * competing: 3x5 is the only size that fits *inside* the battlefield without
 * covering it, 10x13 is a display serif that appears on exactly one screen, and
 * everything that is chrome -- every button, label, heading and number in the
 * front end -- is this one, set at a whole-number scale. A system is a set of
 * roles with one face each, not a single face doing every job badly.
 *
 * **Scales are integers, always.** At 1x a glyph pixel is a screen pixel; at 3x
 * it is a 3x3 block. Anything fractional puts a glyph edge between two pixels,
 * and the browser resolves that by inventing a grey -- which is the exact fault
 * `pixelface.ts` was written to remove from the DOM, and there is no reason to
 * reintroduce it on the canvas.
 */

import { GLYPH_ADVANCE, GLYPH_H, GLYPH_W, rowsFor } from '../glyphs.js';
import type { Sprite } from './sprites/paint.js';

export interface ChromeTextStyle {
  /** Whole number. 1 for a caption, 2 for a heading, 3 for a mission number. */
  scale?: number;
  fill?: string;
  /**
   * A hard halo, one glyph pixel thick.
   *
   * On by default because chrome text lands on a dithered plate, and a 5px
   * letter against a two-tone field with no contour vibrates. `null` turns it
   * off for text on a flat ground, where it only fattens the letters.
   */
  outline?: string | null;
  /** A hard offset shadow, one glyph pixel down and right. */
  shadow?: string | null;
}

/** Width of a run at scale 1, outline included. */
export const chromeTextWidth = (text: string, scale = 1): number =>
  (Math.max(0, text.length * GLYPH_ADVANCE - 1) + 2) * scale;

/** Height of a line at scale 1, outline included. */
export const chromeTextHeight = (scale = 1): number => (GLYPH_H + 2) * scale;

const cache = new Map<string, Sprite>();

/**
 * Bakes a line to a sprite.
 *
 * Ink is collected before anything is drawn, then the shadow, the outline and
 * the fill each run over the whole line. Drawing per glyph instead lets a
 * neighbour's halo punch a hole in the letter beside it -- the same fault
 * `pixelfont.ts` and `bigfont.ts` both record, and at one column of side
 * bearing it shows up immediately.
 */
export function chromeText(text: string, style: ChromeTextStyle = {}): Sprite {
  const {
    scale = 1, fill = '#f6efd8', outline = '#141005', shadow = null,
  } = style;
  const key = `${text}|${scale}|${fill}|${outline}|${shadow}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const s = Math.max(1, Math.round(scale));
  const c = document.createElement('canvas');
  c.width = chromeTextWidth(text, s);
  c.height = chromeTextHeight(s);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;

  const ink: Array<[number, number]> = [];
  [...text].forEach((ch, i) => {
    const rows = rowsFor(ch);
    const ox = 1 + i * GLYPH_ADVANCE;
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (rows[y]?.[x] === '#') ink.push([ox + x, 1 + y]);
      }
    }
  });

  const put = (x: number, y: number): void => g.fillRect(x * s, y * s, s, s);

  if (shadow) {
    g.fillStyle = shadow;
    for (const [x, y] of ink) put(x + 1, y + 1);
  }
  if (outline) {
    g.fillStyle = outline;
    for (const [x, y] of ink) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(x + dx, y + dy);
    }
  }
  g.fillStyle = fill;
  for (const [x, y] of ink) put(x, y);

  cache.set(key, c);
  return c;
}
