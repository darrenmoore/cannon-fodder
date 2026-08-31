import type { Sprite } from './sprites.js';

/**
 * A 3x5 bitmap font, baked to sprites.
 *
 * The world is drawn at 3x integer zoom with smoothing off, so canvas text --
 * hinted, antialiased, sized in real points -- lands in it like a sticker. A
 * hand-set 3x5 grid is the only kind of lettering that belongs on top of pixel
 * art this small: it scales with everything else and stays on the grid.
 *
 * Every glyph carries a hard 1px outline, because these are read against
 * whatever the battlefield happens to be under them -- pale sand, dark canopy,
 * a scorch mark -- and an unoutlined 3px letter disappears into all three.
 */

const GLYPH_W = 3;
const GLYPH_H = 5;
/** Blank column between glyphs. */
const TRACKING = 1;
/** Room for the outline, which grows the sprite by a pixel on every side. */
const PAD = 1;

/** Rows top to bottom; `#` is ink. Uppercase only, as the HUD is. */
const GLYPHS: Record<string, string> = {
  A: '.#./#.#/###/#.#/#.#',
  B: '##./#.#/##./#.#/##.',
  C: '.##/#../#../#../.##',
  D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##',
  H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.#.',
  K: '#.#/#.#/##./#.#/#.#',
  L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#',
  N: '#.#/##./###/.##/#.#',
  O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##',
  R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.',
  T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###',
  V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#',
  X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###',
  '0': '###/#.#/#.#/#.#/###',
  '1': '.#./##./.#./.#./###',
  '2': '##./..#/.#./#../###',
  '3': '##./..#/.#./..#/##.',
  '4': '#.#/#.#/###/..#/..#',
  '5': '###/#../##./..#/##.',
  '6': '.##/#../###/#.#/###',
  '7': '###/..#/.#./#../#..',
  '8': '###/#.#/###/#.#/###',
  '9': '###/#.#/###/..#/##.',
  '+': '.../.#./###/.#./...',
  '-': '.../.../###/.../...',
  '!': '.#./.#./.#./.../.#.',
  '.': '.../.../.../.../.#.',
  ':': '.../.#./.../.#./...',
  ' ': '.../.../.../.../...',
};

/** Text height including the outline, for callers doing their own layout. */
export const TEXT_HEIGHT = GLYPH_H + PAD * 2;

const cache = new Map<string, Sprite>();

/** Width of a baked string in world pixels, outline included. */
export const textWidth = (text: string): number =>
  text.length * (GLYPH_W + TRACKING) - TRACKING + PAD * 2;

/**
 * Bakes a string to a sprite. Results are cached on the exact request, so a
 * label that reappears every time a crate is opened is drawn once per session.
 */
export function textSprite(text: string, color: string, outline = '#12180c'): Sprite {
  const key = `${text}|${color}|${outline}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const chars = [...text.toUpperCase()];
  const c = document.createElement('canvas');
  c.width = textWidth(text);
  c.height = TEXT_HEIGHT;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;

  // Collect the ink first, then lay the outline under it in one pass. Drawing
  // the halo per glyph would let a neighbour's outline punch a hole in the
  // letter beside it once the tracking is this tight.
  const ink: Array<[number, number]> = [];
  chars.forEach((ch, i) => {
    const rows = (GLYPHS[ch] ?? GLYPHS[' ']).split('/');
    const ox = PAD + i * (GLYPH_W + TRACKING);
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (rows[y][x] === '#') ink.push([ox + x, PAD + y]);
      }
    }
  });

  g.fillStyle = outline;
  for (const [x, y] of ink) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) g.fillRect(x + dx, y + dy, 1, 1);
    }
  }
  g.fillStyle = color;
  for (const [x, y] of ink) g.fillRect(x, y, 1, 1);

  cache.set(key, c);
  return c;
}
