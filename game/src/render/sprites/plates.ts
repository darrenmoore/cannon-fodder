/**
 * The chrome: plates, buttons, banners, stars, and the frame that holds a screen.
 *
 * `docs/original-images/intro/frame.png` delivers thirteen pictures -- four
 * finishes across three widths, plus one wide frame on the bottom row. They are
 * not thirteen things. Rows one to four are **one plate** wearing four
 * palettes, and the three widths are the same drawing stretched, which is what
 * a sheet has to do because a sheet is pixels. Here it is a function, so there
 * are no widths: there is `w`.
 *
 * **Why this is not a nine-slice.** A nine-slice exists because you cannot
 * stretch a bitmap corner without smearing it, so you cut the picture into nine
 * and tile the middles. That is a workaround for having a picture. Plotting has
 * no such problem -- the corners are drawn at a fixed size and the edges are
 * drawn to whatever length is asked for, which is the same result with no
 * seams, no minimum tile, and no atlas. The border widths below are therefore
 * absolute pixels and deliberately do not scale with the plate: a two-pixel rim
 * on a 24-tall button and on a 200-tall frame is the *same rim*, which is what
 * makes a screen of them look like one set of hardware.
 *
 * Everything is painted with `bevel.ts`, the same primitive the logo's letters
 * use. A plate is two masks: a frame lit from the top left, and a panel
 * recessed into it lit from the bottom right. That opposition is the whole
 * trick -- both lit the same way and it reads as two flat shapes stacked.
 */

import { Mask, paintBevel } from './bevel.js';
import { addOutline } from './paint.js';
import { chromeText, chromeTextWidth } from '../chromefont.js';
import { makeCanvas } from './paint.js';
import type { BevelStyle } from './bevel.js';
import type { Sprite } from './paint.js';

/* ------------------------------------------------------------------ palette */

export type ToneName = 'brass' | 'iron' | 'gold' | 'steel';

interface Tone {
  /** The border: brass, near-black iron, bright gold, or steel. */
  frame: BevelStyle;
  /** The panel inside it. Recessed, so it is painted `inset`. */
  field: BevelStyle;
  /** The four rivets: a dark seat and a lit crown. */
  rivet: [string, string];
}

/**
 * The four finishes, and what the brief means by them.
 *
 * The reference offers no names, only rows, and 101-ui.md reads them as normal,
 * disabled, active and grey. That mapping is the useful part -- they are not
 * four decorations, they are one control in four states, which is why they are
 * one function taking a tone rather than four sprites.
 *
 * Field tones are measured off the sheet (`#3c4217`, `#313815`, `#424518`,
 * `#444833`). The rims are matched by eye: sampling them returns the JPEG's
 * average of a two-pixel highlight against a black keyline, which is a colour
 * that appears nowhere in the artwork and reads as mud when you plot it.
 */
const TONES: Record<ToneName, Tone> = {
  /**
   * Normal. Deliberately dull.
   *
   * The first pass had this at a bright brass and it was nearly
   * indistinguishable from `gold` -- which destroys the one read a menu needs
   * most, since "which of these am I on" has to survive a glance. Normal is
   * bronze that has been outdoors: it is the resting state, and a resting state
   * competing with the active one is a bug however handsome it is on its own.
   */
  brass: {
    frame: {
      keyline: '#0b0c04', rim: '#9c8848', face: ['#6d5f2c', '#514619'],
      shade: '#2c2610', sheen: [0.85, 0.35],
    },
    field: {
      keyline: '#14170a', rim: '#5a6329', face: ['#3f4618', '#343a14'],
      shade: '#20240c', sheen: [0.75, 0.3], inset: true,
    },
    rivet: ['#100f06', '#bda45e'],
  },
  /** Disabled. Reads as the same object with the light switched off it. */
  iron: {
    frame: {
      keyline: '#000000', rim: '#42452a', face: ['#26290f', '#191c0a'],
      shade: '#080903', sheen: [0.85, 0.3],
    },
    field: {
      keyline: '#0a0c04', rim: '#3d431c', face: ['#2e3412', '#262b0f'],
      shade: '#141708', sheen: [0.7, 0.3], inset: true,
    },
    rivet: ['#000000', '#4e5230'],
  },
  /**
   * Active. The only bright thing on the screen, and the field lifts with the
   * frame -- a bright border round a resting panel reads as a selection
   * rectangle drawn on top, where the whole control catching the light reads as
   * the thing itself being live. 101-ui.md asks for joyful and immediate; this
   * is the immediate half.
   */
  gold: {
    frame: {
      keyline: '#100b00', rim: '#fff2b4', face: ['#e8bc44', '#c89a26'],
      shade: '#7d5a10', sheen: [0.95, 0.32],
    },
    field: {
      keyline: '#1c1d08', rim: '#8d8f34', face: ['#5c5f1e', '#4d5019'],
      shade: '#2b2d0d', sheen: [0.8, 0.32], inset: true,
    },
    rivet: ['#140e00', '#fff0a8'],
  },
  /**
   * Grey. Chrome that is furniture rather than a control.
   *
   * Neutral, not olive. Everything else here is some distance along one
   * yellow-green axis, and a grey that leans the same way is not a second
   * material -- it is the same material paler, and it stops doing the job grey
   * is here to do.
   */
  steel: {
    frame: {
      keyline: '#0a0b08', rim: '#d6d8d2', face: ['#8e9088', '#70726a'],
      shade: '#45463f', sheen: [0.88, 0.32],
    },
    field: {
      keyline: '#141510', rim: '#63655d', face: ['#4a4c46', '#3e403a'],
      shade: '#26271f', sheen: [0.75, 0.3], inset: true,
    },
    rivet: ['#0c0d08', '#e2e4de'],
  },
};

export const TONE_NAMES = Object.keys(TONES) as ToneName[];

/* ------------------------------------------------------------------ metrics */

/**
 * Border widths, in pixels, at every size.
 *
 * Read off the reference as fractions of its 117-pixel-tall plate and then
 * rounded to what survives: the brass rim is 8% of the height, which on a
 * 28-pixel button is two pixels, and two pixels is also what it is on a frame
 * seven times taller. It has to be -- a rim that grew with the box would make a
 * big panel look like a close-up of a small one.
 */
const RIM = 3;
const CUT = 4;
const RIVET = 3;
const RIVET_INSET = 2;

/** Smallest box the construction still resolves in. Below this it is a smear. */
export const PLATE_MIN = { w: RIM * 2 + CUT * 2 + 4, h: RIM * 2 + CUT * 2 + 4 };

export interface PlateOptions {
  /** Four corner rivets, as rows one to four of the sheet carry. */
  rivets?: boolean;
  /** Corner chamfer. Smaller on a short control, or it eats the whole edge. */
  cut?: number;
  /**
   * Collapse the vertical sheen to its midpoint, for a sprite that will tile.
   *
   * A drawn plate is lighter at its crown than at its foot, and that is right
   * when the plate is drawn at its final size. It is exactly wrong for a
   * border-image source: `round` stacks copies of the middle slice, and every
   * copy runs light-to-dark, so a control two tiles tall grows a hard
   * horizontal line halfway up where one tile's foot meets the next one's
   * crown. The owner spotted the line before the cause. A flat field tiles
   * invisibly, and the rim and shade still carry the depth.
   */
  flat?: boolean;
}

/** The sheen collapsed to its own midpoint: the same tones, no gradient. */
const flatten = (s: BevelStyle): BevelStyle => {
  const [a, b] = s.sheen ?? [0.5, 0.5];
  const m = (a + b) / 2;
  return { ...s, sheen: [m, m] };
};

/* ------------------------------------------------------------------- plates */

const box = (w: number, h: number, inset: number, cut: number): Mask =>
  new Mask(w, h).rect(inset, inset, w - inset * 2, h - inset * 2).chamfer(cut);

/**
 * A rivet: a dark seat with a lit crown, three pixels across.
 *
 * Not painted through `paintBevel` -- at three pixels a mask has no interior
 * for a face to sit in, and the bevel would come out as three pixels of rim.
 * Two hard pixels say "screw head" at this size and anything more says "blob".
 */
function rivet(g: CanvasRenderingContext2D, x: number, y: number, tone: Tone): void {
  g.fillStyle = tone.rivet[0];
  g.fillRect(x, y, RIVET, RIVET);
  g.fillStyle = tone.rivet[1];
  g.fillRect(x, y, RIVET - 1, 1);
  g.fillRect(x, y, 1, RIVET - 1);
}

/**
 * One plate, at any size: a button, a name plate, a mission row.
 *
 * Rows one to four of the sheet, and the thing most of the level select is
 * made of.
 */
export function bakePlate(
  w: number, h: number, tone: ToneName = 'brass', opts: PlateOptions = {},
): Sprite {
  const cut = opts.cut ?? Math.min(CUT, Math.floor(Math.min(w, h) / 5));
  const rivets = opts.rivets ?? true;
  const t = TONES[tone];
  const dress = opts.flat ? flatten : (s: BevelStyle): BevelStyle => s;
  const { c, g } = makeCanvas(Math.max(w, PLATE_MIN.w), Math.max(h, PLATE_MIN.h));

  paintBevel(g, box(c.width, c.height, 0, cut), 0, 0, dress(t.frame));
  paintBevel(g, box(c.width, c.height, RIM, Math.max(1, cut - RIM)), 0, 0, dress(t.field));

  if (rivets && c.width >= 20 && c.height >= 14) {
    const i = RIM + RIVET_INSET;
    for (const [x, y] of [
      [i, i], [c.width - i - RIVET, i],
      [i, c.height - i - RIVET], [c.width - i - RIVET, c.height - i - RIVET],
    ]) rivet(g, x, y, t);
  }
  return c;
}

/* ------------------------------------------------------------------ buttons */

export type ButtonState = 'normal' | 'active' | 'disabled' | 'pressed';

interface ButtonTone {
  /** The outer band. */
  edge: BevelStyle;
  /** The cap sitting proud of it. */
  cap: BevelStyle;
  ink: string;
  inkEdge: string;
}

/**
 * Buttons, and the one thing that separates them from the plates above.
 *
 * **A frame is recessed and a button is proud.** A plate paints its panel
 * `inset` -- lit from the bottom right, sunk into its border -- which is
 * correct for something you read and exactly wrong for something you press. It
 * is a hole, and the eye is very good at telling a hole from a knob however
 * handsome the border round it is. A button is the same two masks with the
 * inner one raised instead: a cap standing on a rim, which is what a keycap is
 * and what a finger expects.
 *
 * That is the whole difference. Same primitive, same construction, one flag.
 *
 * The four states are the sheet's four finishes doing the job 101-ui.md gives
 * them, plus `pressed`, which the sheet has no row for because a sheet cannot
 * show one: it is the entire control painted `inset` -- the cap sinks into its
 * own rim -- with the label pushed a pixel down and right after it.
 */
const BUTTONS: Record<ButtonState, ButtonTone> = {
  normal: {
    edge: {
      keyline: '#0b0c04', rim: '#9c8848', face: ['#6d5f2c', '#514619'],
      shade: '#2c2610', sheen: [0.85, 0.35],
    },
    cap: {
      keyline: '#1a1608', rim: '#c2ac66', face: ['#7c6b31', '#5f5320'],
      shade: '#332c11', sheen: [0.9, 0.32],
    },
    ink: '#f6efd8',
    inkEdge: '#191505',
  },
  active: {
    edge: {
      keyline: '#100b00', rim: '#fff2b4', face: ['#e8bc44', '#c89a26'],
      shade: '#7d5a10', sheen: [0.95, 0.32],
    },
    cap: {
      keyline: '#241802', rim: '#ffeaa0', face: ['#dcab30', '#bb8b1e'],
      shade: '#6d4e0d', sheen: [0.95, 0.3],
    },
    ink: '#fffbe8',
    inkEdge: '#2a1c02',
  },
  disabled: {
    edge: {
      keyline: '#000000', rim: '#42452a', face: ['#26290f', '#191c0a'],
      shade: '#080903', sheen: [0.85, 0.3],
    },
    cap: {
      keyline: '#080a03', rim: '#3a3d24', face: ['#23260d', '#191c09'],
      shade: '#070802', sheen: [0.8, 0.3],
    },
    ink: '#6d7254',
    inkEdge: '#0a0c04',
  },
  pressed: {
    edge: {
      keyline: '#0b0c04', rim: '#9c8848', face: ['#5b4f24', '#453b15'],
      shade: '#2c2610', sheen: [0.8, 0.35], inset: true,
    },
    cap: {
      keyline: '#141105', rim: '#8e7c40', face: ['#4c4219', '#3c3413'],
      shade: '#241f0b', sheen: [0.75, 0.3], inset: true,
    },
    ink: '#dcd4bc',
    inkEdge: '#141005',
  },
};

/** Room either side of the label. Enough that a one-word cap is not a box. */
const PAD_X = 9;

export interface ButtonOptions {
  state?: ButtonState;
  /** Fixed width. Omitted, the button sizes itself to its label. */
  w?: number;
  h?: number;
  /** See PlateOptions.flat: for sources that tile, not controls that show. */
  flat?: boolean;
}

/**
 * The label scale.
 *
 * `chromefont.ts` is the chrome face -- 5x7, and the same table the DOM
 * installs as a real font, so a canvas button and a DOM one are set in the same
 * letters. Whole-number scales only: a fractional one puts a glyph edge between
 * two pixels and the browser resolves it by inventing a grey.
 */
const inkScale = (h: number): number => (h >= 38 ? 3 : h >= 24 ? 2 : 1);

/** Width a button needs for a given label, if you are laying out a row. */
export const buttonWidth = (label: string, h = 26): number =>
  chromeTextWidth(label, inkScale(h)) + PAD_X * 2;

export function bakeButton(label: string, opts: ButtonOptions = {}): Sprite {
  const state = opts.state ?? 'normal';
  const h = Math.max(opts.h ?? 26, 14);
  const scale = inkScale(h);
  const w = Math.max(opts.w ?? buttonWidth(label, h), 24);
  const t = BUTTONS[state];
  const cut = Math.min(CUT, Math.floor(Math.min(w, h) / 5));

  const dress = opts.flat ? flatten : (s: BevelStyle): BevelStyle => s;
  const { c, g } = makeCanvas(w, h);
  paintBevel(g, box(w, h, 0, cut), 0, 0, dress(t.edge));
  paintBevel(g, box(w, h, RIM, Math.max(1, cut - RIM)), 0, 0, dress(t.cap));

  const text = chromeText(label, { scale, fill: t.ink, outline: t.inkEdge });
  // Pressed pushes the label into the bevel rather than moving the whole
  // control: a caption that stays put while its cap sinks is the thing that
  // makes a press read as a press rather than as a colour change.
  const sink = state === 'pressed' ? 1 : 0;
  g.drawImage(
    text,
    Math.round((w - text.width) / 2) + sink,
    Math.round((h - text.height) / 2) + sink,
  );
  return c;
}

/* -------------------------------------------------------------------- stars */

/**
 * Stars, hand-plotted at the two sizes that are needed.
 *
 * Not one drawing scaled: a five-pointed star is the shape that suffers most
 * from being resized, because its points are one pixel wide at the tip and
 * doubling turns each into a two-pixel stub. Two plots, each right at its own
 * size, is less code than the arithmetic to fake it.
 */
const STAR_9 = [
  '....#....',
  '...###...',
  '...###...',
  '#########',
  '.#######.',
  '..#####..',
  '.###.###.',
  '.##...##.',
  '.#.....#.',
];

const STAR_13 = [
  '......#......',
  '......#......',
  '.....###.....',
  '.....###.....',
  '....#####....',
  '#############',
  '.###########.',
  '..#########..',
  '...#######...',
  '...#######...',
  '..###...###..',
  '.###.....###.',
  '.##.......##.',
];

const STAR_GOLD: BevelStyle = {
  keyline: '#140c02', keylineWidth: 1, rim: '#ffe9a4',
  face: ['#f0b83c', '#d29a28'], shade: '#8a5a14', sheen: [0.95, 0.35],
};

/** An unearned star: the same outline with the light gone out of it. */
const STAR_DEAD: BevelStyle = {
  keyline: '#0f1106', keylineWidth: 1, rim: '#5b6039',
  face: ['#3a3e24', '#2e321c'], shade: '#1c1e11', sheen: [0.8, 0.35],
};

function artMask(art: string[]): Mask {
  const m = new Mask(art[0].length, art.length);
  for (let y = 0; y < art.length; y++) {
    for (let x = 0; x < art[y].length; x++) if (art[y][x] === '#') m.set(x, y, 1);
  }
  return m;
}

/**
 * One star.
 *
 * `filled` is a star you earned; hollow is one you have not. Hollow is the same
 * silhouette with its middle taken out rather than a different drawing, so the
 * row of three reads as three of one thing in two states -- which is the whole
 * point of a progress row, and something two separate drawings quietly lose.
 */
export function bakeStar(size: 9 | 13 = 13, filled = true): Sprite {
  const mask = artMask(size === 9 ? STAR_9 : STAR_13);
  const style = filled ? STAR_GOLD : STAR_DEAD;
  const { c, g } = makeCanvas(mask.w + 4, mask.h + 4);

  if (filled) {
    paintBevel(g, mask, 2, 2, style);
    return c;
  }
  // Hollow: keep only the pixels on the contour.
  const shell = new Mask(mask.w, mask.h);
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!mask.at(x, y)) continue;
      if (!mask.at(x - 1, y) || !mask.at(x + 1, y) || !mask.at(x, y - 1) || !mask.at(x, y + 1)) {
        shell.set(x, y, 1);
      }
    }
  }
  paintBevel(g, shell, 2, 2, style);
  return c;
}

/* --------------------------------------------------------------------- lock */

/**
 * The padlock on a mission you have not earned.
 *
 * Its keyhole is a hole in the mask rather than a dark shape drawn on top, so
 * the card behind shows through it -- which matters because a locked card is
 * the iron tone, and a keyhole painted in one flat colour would have to guess
 * which tone it is sitting on.
 */
const LOCK_ART = [
  '...#####...',
  '..#.....#..',
  '..#.....#..',
  '..#.....#..',
  '###########',
  '###########',
  '####...####',
  '####...####',
  '#####.#####',
  '#####.#####',
  '###########',
  '###########',
];

/**
 * Gold on a card you could open, and dead olive on one you cannot.
 *
 * Both exist because the lock is used twice: on a locked mission it is the dim
 * one, and on the dialog that explains *why* it is locked it is the bright one.
 */
export function bakeLock(bright = false): Sprite {
  const m = artMask(LOCK_ART);
  m.chamfer(1);
  const { c, g } = makeCanvas(m.w + 4, m.h + 4);
  paintBevel(g, m, 2, 2, bright ? STAR_GOLD : STAR_DEAD);
  return c;
}

/* ------------------------------------------------------------------- banner */

/**
 * The swallowtail banner: `docs/original-images/intro/banner.png`.
 *
 * A heading, not a control -- the thing a screen's name sits on. It is a
 * different object from a plate and built differently: no rivets, no recessed
 * panel, and instead of a wide brass band it carries a **single bright line
 * following its whole contour**, notched ends included. That line is the entire
 * ornament, which is why the rest of it can be flat.
 *
 * The measurements are the reference's, scaled: it is 1592x177, so the notch
 * cut into each end is a quarter of the height deep and the star sits about
 * half a height in from the vertex.
 *
 * The shade tone is brass rather than a dark, because the reference lights the
 * bottom edge as well as the top -- a ribbon is a strip of metal seen face on,
 * not a block, and shading its lower edge into shadow makes it read as a slab.
 */
const BANNER: BevelStyle = {
  keyline: '#000000',
  keylineWidth: 2,
  rim: '#d8c47a',
  face: ['#3f4718', '#333a13'],
  shade: '#8a7a38',
  sheen: [0.8, 0.35],
};

export interface BannerOptions {
  /** A gold star inset at each end, as the reference wears them. */
  stars?: boolean;
}

export function bakeBanner(w: number, h: number, opts: BannerOptions = {}): Sprite {
  const W = Math.max(w, 40), H = Math.max(h, 12);
  const notch = Math.max(3, Math.round(H * 0.25));
  const m = new Mask(W, H).rect(0, 0, W, H);

  /*
   * The V, cut from both ends and deepest at mid-height. Solved per row rather
   * than drawn as a polygon: at this size the diagonal is six or seven pixels
   * long and every one of them has to land somewhere deliberate.
   */
  const half = (H - 1) / 2;
  for (let y = 0; y < H; y++) {
    const away = Math.abs(y - half) / half;
    const cut = Math.round(notch * (1 - away));
    for (let x = 0; x < cut; x++) { m.set(x, y, 0); m.set(W - 1 - x, y, 0); }
  }

  const { c, g } = makeCanvas(W, H);
  paintBevel(g, m, 0, 0, BANNER);

  if (opts.stars !== false && H >= 14 && W >= 60) {
    // The reference star is 28% of the banner height -- nine pixels on a thirty
    // pixel ribbon, not thirteen. A star that fills the height reads as a medal
    // pinned to the banner rather than as a mark stamped into it.
    const star = bakeStar(H >= 40 ? 13 : 9, true);
    const y = Math.round((H - star.height) / 2);
    const x = notch + Math.round(H * 0.35);
    g.drawImage(star, x, y);
    g.drawImage(star, W - x - star.width, y);
  }
  return c;
}

/* -------------------------------------------------------------------- icons */

/**
 * The sidebar's tool glyphs: leave, restart, settings.
 *
 * Thirteen pixels, cream on a hard outline -- the same bargain as the 3x5
 * battlefield font, and for the same reason: these sit on a plate whose face is
 * dithered, and an unoutlined glyph on a two-tone ground vibrates. No bevel;
 * at this size a bevelled glyph is a smudge, and a glyph is ink, not hardware.
 *
 * Hand-plotted, so their shapes are decisions rather than accidents: the door
 * has the arrow *leaving* it, the restart loop is square because everything in
 * this chrome is, and the gear has eight square teeth for the same reason.
 */
const ICON_ART: Record<'door' | 'restart' | 'gear' | 'pause', string[]> = {
  // Two square bars, because everything in this chrome is square.
  pause: [
    '.............',
    '.............',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '..###...###..',
    '.............',
    '.............',
  ],
  door: [
    '.............',
    '.............',
    '#######......',
    '#.....#......',
    '#.....#..#...',
    '#.....#..##..',
    '#.....######.',
    '#.....######.',
    '#.....#..##..',
    '#.....#..#...',
    '#######......',
    '.............',
    '.............',
  ],
  restart: [
    '.............',
    '.########....',
    '.########....',
    '.##....##....',
    '.##....##....',
    '.##....##....',
    '.##..######..',
    '.##...####...',
    '.##....##....',
    '.##..........',
    '.########....',
    '.########....',
    '.............',
  ],
  gear: [
    '.....###.....',
    '.##..###..##.',
    '.###########.',
    '..#########..',
    '.####...####.',
    '#####...#####',
    '#####...#####',
    '#####...#####',
    '.####...####.',
    '..#########..',
    '.###########.',
    '.##..###..##.',
    '.....###.....',
  ],
};

export type IconName = keyof typeof ICON_ART;

export function bakeIcon(name: IconName): Sprite {
  const art = ICON_ART[name];
  const { c, g } = makeCanvas(art[0].length + 2, art.length + 2);
  g.fillStyle = '#f6efd8';
  for (let y = 0; y < art.length; y++) {
    for (let x = 0; x < art[y].length; x++) {
      if (art[y][x] === '#') g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  addOutline(c, '#141005');
  return c;
}

/* -------------------------------------------------------------------- frame */

/** How far the corner brackets step into the opening. */
const NOTCH = 5;
/** The sunken groove between the outer rim and the inner ledge. */
const CH = 2;

/**
 * The frame: the bottom row of the sheet, and the thing a screen sits inside.
 *
 * Four bands rather than the plate's two -- an outer rim, a dark channel sunk
 * into it, a raised inner ledge, and the field. And the detail that makes it
 * this object rather than a plate with a big hole: **the opening has notched
 * corners.** The ledge steps inward at each corner and back out along the
 * edges, which is what the sheet draws and what stops a large panel reading as
 * a rectangle someone forgot to finish.
 *
 * No rivets. A frame is structure; the rivets belong on the things bolted to it.
 */
export function bakeFrame(w: number, h: number, tone: ToneName = 'brass', flat = false): Sprite {
  const t = TONES[tone];
  const dress = flat ? flatten : (s: BevelStyle): BevelStyle => s;
  const W = Math.max(w, 40), H = Math.max(h, 30);
  const { c, g } = makeCanvas(W, H);

  paintBevel(g, box(W, H, 0, CUT), 0, 0, dress(t.frame));
  // The channel: a groove, so it is lit from the far side like any hollow.
  paintBevel(g, box(W, H, RIM, Math.max(1, CUT - RIM)), 0, 0, {
    ...t.field, face: [t.field.shade, t.field.keyline], sheen: [0.5, 0.5],
  });
  paintBevel(g, box(W, H, RIM + CH, Math.max(1, CUT - RIM - CH)), 0, 0, dress(t.frame));

  const in4 = RIM * 2 + CH;
  const field = new Mask(W, H).rect(in4, in4, W - in4 * 2, H - in4 * 2);
  for (const [x, y] of [
    [in4, in4], [W - in4 - NOTCH, in4],
    [in4, H - in4 - NOTCH], [W - in4 - NOTCH, H - in4 - NOTCH],
  ]) field.rect(x, y, NOTCH, NOTCH, 0);
  paintBevel(g, field, 0, 0, dress(t.field));

  return c;
}
