/**
 * The wordmark: BOOTS & BULLETS, plotted.
 *
 * `docs/original-images/intro/logo.png` is a modern 2172px render -- soft
 * bevels, photographic grime, anti-aliased chamfers, a drop shadow with a blur
 * radius. None of that can exist here, and downsampling it would produce an
 * alpha-fringed mush that breaks the one law this renderer keeps absolutely.
 * So this is the same *object*, rebuilt: matched by eye, at the size the game
 * actually draws at, out of the same bevel primitive the chrome plates use.
 *
 * **Why 300 pixels.** The world is drawn at zoom 3-5 over roughly 430x270 to
 * 577x360 world pixels, so a crest spanning most of an intro screen is about
 * 300 across. That was not assumed: the reference was resampled to 300 and to
 * 200 and both were looked at. At 300 the letterforms, their bevels, the wings
 * and the star all survive. At 200 the wordmark still reads and the crest
 * collapses. 300 it is, and every measurement below is in that space.
 *
 * **Why the letters are geometry and not a bitmap font.** Two lines of a
 * display slab face are seven distinct letters, and each is five or six
 * rectangles -- a stem, some bars, sometimes a second stem. Written as
 * rectangles they can be set at two different widths (the reference sets
 * BULLETS narrower than BOOTS so the lines optically match), and the stem
 * weight is one number rather than a property of two hundred hand-placed
 * pixels. `render/bigfont.ts` took the bitmap road for a 10x13 serif, which was
 * right at that size and would not be at this one.
 *
 * The seam 101-ui-spec.md asks for is `bakeLogo()`: one module, one function,
 * one canvas. If the owner ever swaps this for an image, that is the only
 * thing anything else in the game knows about.
 */

import { Mask, paintBevel, paintShadow } from './bevel.js';
import { makeCanvas } from './paint.js';
import type { BevelStyle } from './bevel.js';
import type { Sprite } from './paint.js';

/* ------------------------------------------------------------------ palette */

/**
 * Tones sampled off the reference rather than invented -- the gold face reads
 * `#f4ba3e`, the red `#e63d0f`, the wing olive `#7f9c1d`, the helmet `#66811a`
 * -- then pulled apart into a light and a dark for the dither to resolve
 * between. The rims are brighter than anything sampled on purpose: at 1x a
 * one-pixel highlight has to carry the whole read of a raised edge.
 */
const GOLD: BevelStyle = {
  keyline: '#140c02',
  keylineWidth: 1,
  rim: '#fbe6a0',
  face: ['#f4ba3e', '#e0a32e'],
  shade: '#8a5312',
  sheen: [1, 0.38],
};

const RED: BevelStyle = {
  keyline: '#120400',
  keylineWidth: 1,
  rim: '#f9b070',
  face: ['#e6431a', '#cb320e'],
  shade: '#6e1605',
  sheen: [1, 0.36],
};

const OLIVE: BevelStyle = {
  keyline: '#0a0d02',
  keylineWidth: 1,
  rim: '#dce55f',
  face: ['#85a11f', '#6f8a1a'],
  shade: '#3f4d0e',
  sheen: [0.95, 0.4],
};

const HELMET: BevelStyle = {
  keyline: '#0a0d02',
  keylineWidth: 1,
  rim: '#d1da58',
  face: ['#87a220', '#66811a'],
  shade: '#32400d',
  sheen: [1, 0.3],
};

const STEEL: BevelStyle = {
  keyline: '#000000',
  keylineWidth: 1,
  rim: '#9aa2a4',
  face: ['#4c5154', '#2f3335'],
  shade: '#141618',
  sheen: [0.7, 0.3],
};

const STOCK: BevelStyle = {
  keyline: '#0d0700',
  keylineWidth: 1,
  rim: '#c9a05a',
  face: ['#8a6428', '#63461a'],
  shade: '#33220b',
  sheen: [0.7, 0.3],
};

/** The star, and the shadow the whole crest throws. */
const STAR = '#f6e9d2';
const SHADOW = '#080a04';

/* ------------------------------------------------------------------- glyphs */

/**
 * Each letter as rectangles in its own box.
 *
 * Two weights, not one: `s` for the vertical stems, `b` for the horizontal
 * bars. The first pass used a single number and the B came out with counters
 * seven pixels tall -- three bars of eleven inside a cap of forty-six leaves
 * thirteen pixels for two holes, and what reads at that point is a stack of
 * slots, not a letter. Bars run lighter than stems in every display slab face
 * for exactly this reason, and it is not a refinement: it is what makes a B a B.
 */
type GlyphFn = (m: Mask, w: number, h: number, s: number, b: number) => void;

const GLYPHS: Record<string, GlyphFn> = {
  /*
   * B, and why it kept coming out as an 8.
   *
   * Two things, and the second is the one that matters. The bowls carry a
   * slightly heavier wall than the spine, because the right of a bowl is the
   * part doing the bulging -- but thickening it alone does not fix anything,
   * and thickening it far enough to try turns the counters into slots and the
   * letter into a rounded rectangle with two holes in it.
   *
   * **What separates a B from an 8 is the flat left edge.** An 8 is symmetric:
   * four cut corners around two equal bowls. A B has a spine -- a straight
   * vertical running the full height with square corners top and bottom -- and
   * the bowls hang off it. Chamfering all four corners equally, which is right
   * for every other letter here, is exactly what makes this one a numeral. So
   * the left corners are squared back up after the cut, and nothing else about
   * the glyph needed to change.
   *
   * The proportions are the reference's, read off with `tools/pixelate.mjs`
   * rather than guessed at: a 12-wide stem, an 8-wide counter and a 12-wide
   * wall across 19 columns. Three attempts went into thickening walls when the
   * fault was that the counters were nearly twice the size they should be.
   */
  B: (m, w, h, s, b) => {
    const mid = Math.round((h - b) / 2);
    const wall = Math.round(s * 1.15);
    m.rect(0, 0, s, h);
    m.rect(0, 0, w, b);
    m.rect(0, mid, w, b);
    m.rect(0, h - b, w, b);
    m.rect(w - wall, 0, wall, mid + b);
    m.rect(w - wall, mid, wall, h - mid);
  },
  O: (m, w, h, s, b) => {
    m.rect(0, 0, w, h);
    m.rect(s, b, w - s * 2, h - b * 2, 0);
  },
  T: (m, w, h, s, b) => {
    m.rect(0, 0, w, b);
    m.rect(Math.round((w - s) / 2), 0, s, h);
  },
  S: (m, w, h, s, b) => {
    const mid = Math.round((h - b) / 2);
    m.rect(0, 0, w, b);
    m.rect(0, 0, s, mid + b);
    m.rect(0, mid, w, b);
    m.rect(w - s, mid, s, h - mid);
    m.rect(0, h - b, w, b);
  },
  U: (m, w, h, s, b) => {
    m.rect(0, 0, s, h);
    m.rect(w - s, 0, s, h);
    m.rect(0, h - b, w, b);
  },
  L: (m, w, h, s, b) => {
    m.rect(0, 0, s, h);
    m.rect(0, h - b, w, b);
  },
  E: (m, w, h, s, b) => {
    const mid = Math.round((h - b) / 2);
    m.rect(0, 0, s, h);
    m.rect(0, 0, w, b);
    m.rect(0, mid, w, b);
    m.rect(0, h - b, w, b);
  },
};

/**
 * The ampersand.
 *
 * The only glyph here that is not rectangles, because an ampersand is not made
 * of them -- it is two bowls and a diagonal, and expressing that as rects
 * produces a shape that is recognisably not an ampersand.
 *
 * Read off the reference with `tools/pixelate.mjs` rather than drawn freehand,
 * then hand-cleaned to strip the neighbouring letter the threshold caught along
 * its right edge. Two freehand attempts failed before that, and both failed the
 * same way and for a reason worth writing down: **it was the wrong size.** The
 * reference ampersand measures 117x118 source pixels, which at 300 wide is
 * 20x20 -- nearly square. Both attempts drew it at 27x36, and no amount of
 * moving strokes around fixes a glyph whose proportions are wrong. Measure
 * first.
 */
const AMP = [
  '..##########.......',
  '..###########......',
  '.#############.....',
  '.##############....',
  '.######..######....',
  '.#####....#####....',
  '.#####....#####....',
  '.######..######....',
  '..############.....',
  '...##########......',
  '..##########.####..',
  '.############.#####',
  '###################',
  '#####..############',
  '#####...##########.',
  '#####....########..',
  '##################.',
  '###################',
  '.##################',
  '..##########..#####',
];

function ampMask(): Mask {
  const cols = AMP[0].length, rows = AMP.length;
  const m = new Mask(cols, rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (AMP[y][x] === '#') m.set(x, y, 1);
  }
  m.chamfer(1);
  m.chamferHoles(1);
  return m;
}

/**
 * One letter, chamfered inside and out, ready to be blitted into a word.
 *
 * The holes are cut one pixel and the outside two. Cutting a ten-pixel counter
 * by two takes a fifth of it off each corner and the hole stops being square
 * enough to read as a hole -- the outside has forty-six pixels to spend on the
 * same gesture and can afford it.
 */
export function glyphMask(ch: string, w: number, h: number, s: number, b: number, cut = 2): Mask {
  const m = new Mask(w, h);
  const fn = GLYPHS[ch];
  if (fn) fn(m, w, h, s, b);
  m.chamfer(cut);
  // The spine of a B is square at both ends. See the note on the glyph.
  if (ch === 'B') {
    m.rect(0, 0, cut + 1, cut + 1);
    m.rect(0, h - cut - 1, cut + 1, cut + 1);
  }
  m.chamferHoles(1);
  return m;
}

/* -------------------------------------------------------------------- words */

interface Line {
  text: string;
  /** Per-letter box width, in order. */
  widths: number[];
  capH: number;
  /** Vertical stroke weight. */
  stem: number;
  /** Horizontal stroke weight. Lighter than the stem; see `GLYPHS`. */
  bar: number;
  track: number;
}

/**
 * The two lines, measured off the reference at 300 wide.
 *
 * BULLETS is set narrower than BOOTS -- seven letters and five have to come out
 * the same length, and the reference solves it by condensing rather than by
 * letting the lower line run wider. Two letters of the same name are therefore
 * not the same width between the lines, which is a thing to notice before
 * assuming it is a bug.
 */
const BOOTS: Line = {
  text: 'BOOTS',
  widths: [38, 39, 39, 35, 36],
  capH: 46,
  stem: 13,
  bar: 10,
  track: 1,
};

const BULLETS: Line = {
  text: 'BULLETS',
  widths: [34, 34, 30, 30, 32, 32, 33],
  capH: 44,
  stem: 11,
  bar: 10,
  track: 1,
};

const lineWidth = (l: Line): number =>
  l.widths.reduce((a, b) => a + b, 0) + l.track * (l.text.length - 1);

function lineMask(l: Line): Mask {
  const m = new Mask(lineWidth(l), l.capH);
  let x = 0;
  for (let i = 0; i < l.text.length; i++) {
    m.blit(glyphMask(l.text[i], l.widths[i], l.capH, l.stem, l.bar), x, 0);
    x += l.widths[i] + l.track;
  }
  return m;
}

/* -------------------------------------------------------------------- wings */

/**
 * One wing: three bars, each shorter than the one above it, with the lower-left
 * corner sheared away so the stack reads as a swept feather rather than as a
 * bar chart. Built pointing left; the right wing is the same mask mirrored.
 */
function wingMask(): Mask {
  const W = 56, H = 40;
  const m = new Mask(W, H);
  const BAR = 10, GAP = 3, STEP = 11, SHEAR = 11;
  for (let i = 0; i < 3; i++) {
    const y = i * (BAR + GAP);
    const left = i * STEP;
    m.taper(y, y + BAR, left, W, left + SHEAR, W);
  }
  m.chamfer(1);
  return m;
}

function mirror(src: Mask): Mask {
  const m = new Mask(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) if (src.at(x, y)) m.set(src.w - 1 - x, y, 1);
  }
  return m;
}

/* -------------------------------------------------------------------- crest */

/** A thick diagonal, stamped square by square. The rifles are two of these. */
function bar(m: Mask, x0: number, y0: number, x1: number, y1: number, t: number): Mask {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    m.rect(x - (t >> 1), y - (t >> 1), t, t);
  }
  return m;
}

/**
 * The helmet: a stepped dome over a brim.
 *
 * `ctx.arc` is banned and would be wrong anyway -- an anti-aliased curve in a
 * frame of hard pixels reads as a different game pasted in. The dome is an
 * ellipse solved a row at a time and filled with whole pixels, which is how
 * every other round thing in this renderer is drawn.
 */
function helmetMask(): Mask {
  const RX = 24, RY = 23, BRIM_W = 56, BRIM_H = 6;
  const W = BRIM_W, H = RY + BRIM_H + 2;
  const m = new Mask(W, H);
  const cx = W >> 1, base = RY + 1;
  for (let y = 0; y <= RY; y++) {
    const t = (RY - y) / RY;
    const half = Math.round(RX * Math.sqrt(Math.max(0, 1 - t * t)));
    m.rect(cx - half, base - (RY - y), half * 2, 1);
  }
  m.rect(cx - (BRIM_W >> 1), base, BRIM_W, BRIM_H);
  m.chamfer(1);
  return m;
}

/** Five points, plotted rather than computed: at eleven pixels it is a shape. */
const STAR_ART = [
  '.....#.....',
  '.....#.....',
  '....###....',
  '....###....',
  '###########',
  '.#########.',
  '..#######..',
  '..#######..',
  '.###...###.',
  '.##.....##.',
  '.#.......#.',
];

/* ----------------------------------------------------------------- assembly */

/**
 * The whole crest, at 300x120 plus room for the shadow it throws.
 *
 * Drawn back to front, which is the reverse of how it reads: shadow, wings,
 * rifles, helmet, then BULLETS, then BOOTS over it, then the ampersand over
 * both. The order is not arbitrary -- BOOTS overlaps the top of BULLETS in the
 * reference, and the ampersand sits in front of both, which is what stops the
 * two lines reading as two separate signs.
 */
export function bakeLogo(): Sprite {
  const ART_W = 300, ART_H = 120;
  const OX = 2, OY = 2;
  const SH_X = 3, SH_Y = 4;
  const { c, g } = makeCanvas(ART_W + OX + SH_X + 2, ART_H + OY + SH_Y + 2);

  const wingL = wingMask();
  const wingR = mirror(wingL);
  const helmet = helmetMask();
  const boots = lineMask(BOOTS);
  const bullets = lineMask(BULLETS);
  const amp = ampMask();

  // Where each piece sits, in the 300x120 space, read off the reference.
  const at = {
    wingL: [OX + 1, OY + 27],
    wingR: [OX + ART_W - 57, OY + 27],
    helmet: [OX + 122, OY + 1],
    boots: [OX + Math.round((ART_W - lineWidth(BOOTS)) / 2), OY + 24],
    bullets: [OX + Math.round((ART_W - lineWidth(BULLETS)) / 2), OY + 72],
    amp: [OX + 141, OY + 60],
  } as const;

  const rifles = new Mask(ART_W, 42);
  const stocks = new Mask(ART_W, 42);
  /*
   * Two weapons crossing *behind* the helmet, each running the full width of
   * the crest so the muzzles come out past its far side.
   *
   * The first pass ran them at 17 degrees over a short span and they read as
   * antennae: a pair of thin diagonals rising out of a helmet is an insect, not
   * an armoury. The reference lays them almost flat and wide, so what shows
   * either side of the dome is a length of barrel rather than a spike.
   */
  bar(rifles, 72, 27, 228, 7, 5);
  bar(rifles, 228, 27, 72, 7, 5);
  bar(stocks, 72, 27, 106, 22, 8);
  bar(stocks, 228, 27, 194, 22, 8);
  rifles.chamfer(1);
  stocks.chamfer(1);

  /* 1. The shadow: everything at once, so it reads as one object lying on the
        screen rather than as each piece carrying its own. */
  const cast: Array<[Mask, readonly number[]]> = [
    [wingL, at.wingL], [wingR, at.wingR],
    [rifles, [OX, OY + 1]], [stocks, [OX, OY + 1]],
    [helmet, at.helmet],
    [bullets, at.bullets], [boots, at.boots], [amp, at.amp],
  ];
  for (const [m, [x, y]] of cast) paintShadow(g, m, x + SH_X, y + SH_Y, SHADOW, 1);

  /* 2. Back to front. */
  paintBevel(g, wingL, at.wingL[0], at.wingL[1], OLIVE);
  paintBevel(g, wingR, at.wingR[0], at.wingR[1], OLIVE);
  paintBevel(g, stocks, OX, OY + 1, STOCK);
  paintBevel(g, rifles, OX, OY + 1, STEEL);
  paintBevel(g, helmet, at.helmet[0], at.helmet[1], HELMET);

  // The star, on the dome, right of centre as the reference wears it.
  g.fillStyle = STAR;
  for (let y = 0; y < STAR_ART.length; y++) {
    for (let x = 0; x < STAR_ART[y].length; x++) {
      if (STAR_ART[y][x] === '#') g.fillRect(at.helmet[0] + 31 + x, at.helmet[1] + 7 + y, 1, 1);
    }
  }

  paintBevel(g, bullets, at.bullets[0], at.bullets[1], RED);
  paintBevel(g, boots, at.boots[0], at.boots[1], GOLD);
  paintBevel(g, amp, at.amp[0], at.amp[1], GOLD);

  return c;
}

/* --------------------------------------------------------------- for looking */

/**
 * The pieces on their own, for the gallery's branding tab.
 *
 * Judging a letterform inside a 300px crest is judging nothing -- it is nine
 * pixels of stem inside a picture. These are the same masks, alone, at the size
 * they are actually drawn.
 */
export function bakeLogoParts(): Record<string, Sprite> {
  const one = (m: Mask, style: BevelStyle): Sprite => {
    const { c, g } = makeCanvas(m.w + 6, m.h + 6);
    paintBevel(g, m, 3, 3, style);
    return c;
  };
  const parts: Record<string, Sprite> = {
    wordBoots: one(lineMask(BOOTS), GOLD),
    wordBullets: one(lineMask(BULLETS), RED),
    amp: one(ampMask(), GOLD),
    wing: one(wingMask(), OLIVE),
    helmet: one(helmetMask(), HELMET),
  };
  // One of each distinct letter, at the size BOOTS sets it.
  for (const ch of 'BOTSULE') {
    parts[`glyph${ch}`] = one(glyphMask(ch, 38, BOOTS.capH, BOOTS.stem, BOOTS.bar), GOLD);
  }
  return parts;
}
