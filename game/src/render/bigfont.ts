import type { Sprite } from './sprites/index.js';

/**
 * A 10x13 display serif, baked to sprites.
 *
 * `pixelfont.ts` is 3x5 and belongs on the battlefield: it is a label on a
 * crate, a number over a man's head, small enough to sit inside the world
 * without shouting. This is the other end of the range -- the face the original
 * puts across the whole screen at the end of a phase
 * (`docs/original-images/elements/phase-complete.jpg`), which is a heavy serif
 * with thick stems, bracketed feet and a hard dark edge, sitting *over the live
 * battlefield* rather than over a panel.
 *
 * It is plotted rather than fetched, like every other sprite here. A webfont
 * would be the first asset file in the project and the premise is that there
 * are none -- and a hinted, antialiased outline scaled up over pixel terrain
 * reads as a caption pasted onto the game, which is the exact failure the small
 * font exists to avoid.
 *
 * Serifs are what make the size work. At this scale a plain block letter reads
 * as a placeholder; the 4px feet on a 2px stem are most of the difference
 * between "big text" and "the game's own lettering".
 */

const GLYPH_W = 10;
const GLYPH_H = 13;
/** Blank columns between glyphs. Tight, as display type is. */
const TRACKING = 2;
/**
 * Emboldening, applied to the plotted ink rather than plotted into it.
 *
 * The face went up on screen at a 2px stem and read as a wide display type
 * rather than the original's chunky one: too much white inside each letter, and
 * slab serifs that looked spindly beside their own stems. Dilating the ink one
 * pixel to the right takes every vertical stem to 3px and closes the counters
 * by a pixel a side, while the horizontal serifs -- which are already the full
 * width of their letter -- barely change. So the *ratio* of serif to stem drops,
 * which is the thing that was wrong, without re-plotting twenty-six glyphs and
 * hoping.
 */
const WEIGHT = 1;

/** Room for the outline, the weight pass and the drop shadow it sits on. */
const PAD_X = 2;
const PAD_Y = 2;
/**
 * How far the shadow falls, when one is asked for. Down and right, matching the
 * figure shadows.
 *
 * One pixel, not two, and the casing stays -- which is a verdict overruling a
 * measurement, recorded because the measurement was not wrong.
 *
 * Sampled directly, `phase-complete.jpg` has no keyline: the pixels immediately
 * around its lettering have a median luminance of 106 against a field of 66, so
 * they are *brighter* than the grass, and what reads as an outline is JPEG
 * ringing. Removing ours to match was tried and judged worse by a fresh critic
 * -- without a contour the cream face "bleeds into the grass" and the strokes
 * read light, because the weight this face was tuned to needs the casing to
 * hold its edges at a five-times draw scale. The reference is a 1x screenshot
 * of a 1x screen; we are not, and copying its pixel facts rather than its
 * result is how a reproduction ends up further away than it started.
 */
const SHADOW = { x: 1, y: 1 };

/**
 * Rows top to bottom, `#` is ink, groups separated by `/`.
 *
 * Uppercase only, which is not a shortcut: the reference has no lowercase in it
 * anywhere. Digits are here for the between-missions screen rather than for the
 * banner, which never shows one.
 */
const GLYPHS: Record<string, string> = {
  A: '....##..../....##..../...####.../...#..#.../..##..##../..##..##../..######../.##....##./.##....##./##......##/##......##/##......##/###....###',
  B: '########../.##....##./.##.....##/.##.....##/.##....##./.#######../.##....##./.##.....##/.##.....##/.##.....##/.##....##./.##...##../########..',
  C: '..######../.##....##./##......##/##......../##......../##......../##......../##......../##......../##......##/##......##/.##....##./..######..',
  D: '########../.##....##./.##.....##/.##.....##/.##......#/.##......#/.##......#/.##......#/.##......#/.##.....##/.##.....##/.##....##./########..',
  E: '##########/.##.....#./.##......./.##......./.##......./.#######../.#######../.##......./.##......./.##......./.##.....#./.##.....#./##########',
  F: '##########/.##.....#./.##......./.##......./.##......./.#######../.#######../.##......./.##......./.##......./.##......./.##......./####......',
  G: '..######../.##....##./##......##/##......../##......../##...#####/##...#####/##......##/##......##/##......##/##......##/.##....##./..######..',
  H: '###....###/.##....##./.##....##./.##....##./.##....##./.##....##./.########./.########./.##....##./.##....##./.##....##./.##....##./###....###',
  I: '..######../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../..######..',
  J: '....######/......##../......##../......##../......##../......##../......##../......##../......##../##....##../##....##../.##..##.../..####....',
  K: '###...####/.##...##../.##..##.../.##.##..../.####...../.###....../.####...../.##.##..../.##..##.../.##...##../.##...##../.##....##./###...####',
  L: '####....../.##......./.##......./.##......./.##......./.##......./.##......./.##......./.##......./.##......./.##......./.##.....#./##########',
  M: '###....###/####..####/####..####/##.####.##/##.####.##/##..##..##/##..##..##/##......##/##......##/##......##/##......##/##......##/###....###',
  N: '###....###/###.....##/####....##/####....##/##.##...##/##.##...##/##..##..##/##..##..##/##...##.##/##...##.##/##....####/##....####/###....###',
  O: '..######../.##....##./##......##/##......##/##......##/##......##/##......##/##......##/##......##/##......##/##......##/.##....##./..######..',
  P: '########../.##....##./.##.....##/.##.....##/.##.....##/.##....##./########../.##......./.##......./.##......./.##......./.##......./####......',
  Q: '..######../.##....##./##......##/##......##/##......##/##......##/##......##/##......##/##......##/##......##/##...##.##/.##...###./..#####.##',
  R: '########../.##....##./.##.....##/.##.....##/.##....##./########../.##.##..../.##..##.../.##..##.../.##...##../.##...##../.##....##./###....###',
  S: '..######../.##....##./##......##/##......../.##......./..####..../.....###../.......##./........##/##......##/##......##/.##....##./..######..',
  T: '##########/#...##...#/....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../..######..',
  U: '###....###/.##....##./.##....##./.##....##./.##....##./.##....##./.##....##./.##....##./.##....##./.##....##./.##....##./..##..##../...####...',
  V: '###....###/.##....##./.##....##./.##....##./..##..##../..##..##../..##..##../...####.../...####.../...####.../....##..../....##..../....##....',
  W: '###....###/##......##/##......##/##......##/##..##..##/##..##..##/##..##..##/##.####.##/##.####.##/####..####/####..####/.##....##./.##....##.',
  X: '###....###/.##....##./..##..##../..##..##../...####.../....##..../....##..../...####.../..##..##../..##..##../.##....##./.##....##./###....###',
  Y: '###....###/.##....##./..##..##../...####.../....##..../....##..../....##..../....##..../....##..../....##..../....##..../....##..../..######..',
  Z: '##########/#.....##.#/.....##.../....##..../....##..../...##...../...##...../..##....../..##....../.##......./.##......./#.##.....#/##########',
  '0': '..######../.##....##./##.....###/##....####/##...##.##/##...##.##/##..##..##/##..##..##/##.##...##/####....##/###.....##/.##....##./..######..',
  '1': '...###..../..####..../.#.###..../...###..../...###..../...###..../...###..../...###..../...###..../...###..../...###..../...###..../..######..',
  '2': '..######../.##....##./##......##/.......##./......##../.....##.../....##..../...##...../..##....../.##......./##......../##......##/##########',
  '3': '..######../.##....##./........##/.......##./....####../.......##./........##/........##/........##/........##/##......##/.##....##./..######..',
  '4': '......##../.....###../....####../...##.##../..##..##../.##...##../##....##../##########/......##../......##../......##../......##../....######',
  '5': '##########/##......../##......../##......../########../..#....##./........##/........##/........##/........##/##......##/.##....##./..######..',
  '6': '...#####../..##....#./.##......./##......../##......../########../##.....##./##......##/##......##/##......##/##......##/.##....##./..######..',
  '7': '##########/##.....##./......##../.....##.../.....##.../....##..../....##..../...##...../...##...../..##....../..##....../..##....../.####.....',
  '8': '..######../.##....##./##......##/##......##/.##....##./..######../.##....##./##......##/##......##/##......##/##......##/.##....##./..######..',
  '9': '..######../.##....##./##......##/##......##/##......##/##.....###/..########/........##/.......##./......##../.....##.../.#....##../..#####...',
  '!': '...####.../...####.../...####.../...####.../...####.../....##..../....##..../....##..../....##..../........../...####.../...####.../...####...',
  '?': '..######../.##....##./##......##/........##/.......##./......##../.....##.../.....##.../.....##.../........../.....##.../.....##.../.....##...',
  '.': '........../........../........../........../........../........../........../........../........../........../..####..../..####..../..####....',
  ',': '........../........../........../........../........../........../........../........../........../..####..../..####..../...##...../..##......',
  '-': '........../........../........../........../........../........../.######.../.######.../........../........../........../........../..........',
  ':': '........../........../..####..../..####..../..####..../........../........../........../........../..####..../..####..../..####..../..........',
  "'": '...####.../...####.../...####.../....##..../........../........../........../........../........../........../........../........../..........',
  ' ': '........../........../........../........../........../........../........../........../........../........../........../........../..........',
};

/** Height of a baked line, outline and shadow included. */
export const BIG_TEXT_HEIGHT = GLYPH_H + PAD_Y * 2 + SHADOW.y;

/** Width of a baked line, outline and shadow included. */
export const bigTextWidth = (text: string): number =>
  Math.max(0, text.length * (GLYPH_W + TRACKING) - TRACKING) + PAD_X * 2 + SHADOW.x + WEIGHT;

/** How a line is cased. `null` for either means the terrain shows through. */
export interface BigTextStyle {
  fill?: string;
  outline?: string | null;
  shadow?: string | null;
}

const cache = new Map<string, Sprite>();

/**
 * Bakes a line to a sprite: shadow, then outline, then fill.
 *
 * All three passes run over the whole line's ink rather than per glyph. At two
 * pixels of tracking a neighbour's outline would otherwise punch a hole in the
 * letter beside it -- the same reason `pixelfont.ts` collects first and draws
 * second, and it shows up much faster at this size.
 *
 * No alpha anywhere: the shadow is a solid offset silhouette and the outline is
 * a solid halo, which is what the hardware being imitated could actually do.
 */
export function bigTextSprite(text: string, style: BigTextStyle = {}): Sprite {
  const { fill = '#f2ead6', outline = '#12180c', shadow = '#12180c' } = style;
  const key = `${text}|${fill}|${outline}|${shadow}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const chars = [...text.toUpperCase()];
  const c = document.createElement('canvas');
  c.width = bigTextWidth(text);
  c.height = BIG_TEXT_HEIGHT;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;

  const ink: Array<[number, number]> = [];
  const seen = new Set<number>();
  chars.forEach((ch, i) => {
    const rows = (GLYPHS[ch] ?? GLYPHS[' ']).split('/');
    const ox = PAD_X + i * (GLYPH_W + TRACKING);
    for (let y = 0; y < GLYPH_H; y++) {
      const row = rows[y] ?? '';
      for (let x = 0; x < GLYPH_W; x++) {
        if (row[x] !== '#') continue;
        // The weight pass, folded into collection so a letter is never drawn
        // over twice -- the outline halo and the fill both run off this list.
        for (let w = 0; w <= WEIGHT; w++) {
          const px = ox + x + w;
          const key = px * 4096 + PAD_Y + y;
          if (seen.has(key)) continue;
          seen.add(key);
          ink.push([px, PAD_Y + y]);
        }
      }
    }
  });

  if (shadow) {
    g.fillStyle = shadow;
    for (const [x, y] of ink) g.fillRect(x + SHADOW.x, y + SHADOW.y, 1, 1);
  }

  if (outline) {
    g.fillStyle = outline;
    for (const [x, y] of ink) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) g.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  g.fillStyle = fill;
  for (const [x, y] of ink) g.fillRect(x, y, 1, 1);

  cache.set(key, c);
  return c;
}
