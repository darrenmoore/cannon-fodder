/**
 * Portraits for whoever is on the comms panel.
 *
 * ## Why a stepped disc rather than a circle
 *
 * The brief asked for "a character in a circle". There is no `ctx.arc` in this
 * game and no alpha: the extraction ring and the mine's shock front were both
 * caught being arcs and both became discrete pixels, and a soft-edged round
 * avatar would be the most out-of-period thing on the screen sitting in the
 * exact spot the player is reading. So the disc is plotted a row at a time --
 * for each row, an integer half-width from the circle equation, filled as one
 * `fillRect`. Hard edges, whole coordinates, no anti-aliasing anywhere.
 *
 * ## Why the face is a mask
 *
 * The same reason `bakeIcon` uses one: a face argued about in code is a face
 * nobody can see. As a grid of characters it can be read, adjusted a pixel at
 * a time, and diffed. `/sprites.html` shows the result at size.
 *
 * ## Frames
 *
 * Three: eyes open, half, shut. Blinking is frames swapped on a timer, not a
 * tween -- there is no interpolation in sprite work here and a fading eyelid
 * would be alpha by another name.
 *
 * Nothing in this file knows who the speaker is; `SPEAKER_ART` is keyed by id
 * and a second portrait is another entry.
 */

import { addOutline, makeCanvas, rect } from './paint.js';
import type { Sprite } from './paint.js';

/** The colour each character in a portrait mask stands for. */
const INK: Record<string, string> = {
  h: '#3d4623',   // cap
  H: '#5f6a2a',   // cap, catching the light on the crown
  b: '#141005',   // cap band
  o: '#141005',   // brim, and the outline of the eye
  f: '#e89848',   // face
  F: '#f6b870',   // the lit side of the face
  e: '#141005',   // eye, open
  E: '#a05020',   // eye, half shut
  '-': '#a05020', // the lid, closed
  n: '#a05020',   // under the nose
  m: '#d8d0b0',   // the moustache, which is most of the man
  M: '#f2ecd6',   // and the light on it
  c: '#5f6a2a',   // collar
};

/**
 * One officer, twenty rows by twenty-two columns, dropped into a 32x32 disc.
 *
 * Read it as a picture. The cap is a third of him, the moustache is a third of
 * him, and there is a face in between: that proportion *is* the character, and
 * it is why he reads at portrait size where a correctly-proportioned head
 * would read as a blob.
 */
const OFFICER: string[] = [
  '.......hhhhhhhh.......',
  '.....hhhhhhhhhhhh.....',
  '....hHHHHHHHHHHHHh....',
  '....hhhhhhhhhhhhhh....',
  '...bbbbbbbbbbbbbbbb...',
  '..oooooooooooooooooo..',
  '....ffffffffffffff....',
  '....ffffffffffffff....',
  '....ffeeffffffeeff....',
  '....ffffffffffffff....',
  '.....ffffffffffff.....',
  '.....fffffnnfffff.....',
  '...mmmmmmmmmmmmmmmm...',
  '..mmmmMMmmmmmmMMmmmm..',
  '...mmmm.mmmmmm.mmmm...',
  '.....ffffffffffff.....',
  '......ffffffffff......',
  '.......ffffffff.......',
  '....cccccccccccccc....',
  '...cccccccccccccccc...',
];

/** Which rows change per frame, and to what. Everything else is shared. */
const BLINK: Array<Record<number, string>> = [
  // 0: open
  {},
  // 1: half shut -- the eye browned down rather than shrunk, because one pixel
  // of eye is a squint and no pixels is a different expression entirely.
  { 8: '....ffEEffffffEEff....' },
  // 2: shut -- a lid line where the eye was, one row up
  { 7: '....ff--ffffff--ff....', 8: '....ffffffffffffff....' },
];

const ART: Record<string, string[]> = { trumper: OFFICER };

/** Every portrait id there is. `/sprites.html` enumerates from this. */
export const SPEAKER_IDS = Object.keys(ART);

/** How many frames each portrait has. */
export const SPEAKER_FRAMES = BLINK.length;

const SIZE = 32;
/**
 * Left/top of the face mask inside the disc.
 *
 * Centred horizontally; a row high of centre vertically, because a portrait
 * with the head high in the frame and the shoulders running off the bottom
 * reads as a person, and one floating in the middle reads as a sticker.
 */
const OX = 5;
const OY = 7;

/**
 * One portrait, one frame.
 *
 * Unknown ids fall back to the first portrait rather than throwing: a missing
 * face should be somebody else's face, not a blank panel in front of a player.
 */
export function bakeSpeaker(id: string, frame = 0): Sprite {
  const art = ART[id] ?? OFFICER;
  const swap = BLINK[Math.max(0, Math.min(BLINK.length - 1, frame))] ?? {};
  const { c, g } = makeCanvas(SIZE, SIZE);

  /*
   * The disc, as a mask and then an edge.
   *
   * Membership per pixel, then "inside with a neighbour outside" is the rim.
   * That is the same edge detection `addOutline` uses, and it is the version
   * that works: an earlier attempt drew the rim per row, filling any row wider
   * than the one above it, which turned the whole top half of the circle into
   * one solid brass dome with the face crushed into a dark band across the
   * middle. Worth the sentence -- the picture is the only thing that showed it.
   */
  const r = SIZE / 2 - 0.5;
  const c0 = SIZE / 2 - 0.5;
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    const dx = x - c0;
    const dy = y - c0;
    return dx * dx + dy * dy <= r * r;
  };

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (inside(x, y)) rect(g, x, y, 1, 1, '#1a2010');
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      // Lit from above, like everything else in this game: brass on the upper
      // half of the rim, and the shadowed tone below the midline.
      if (edge) rect(g, x, y, 1, 1, y < SIZE / 2 ? '#8a7434' : '#5c4a1e');
    }
  }

  // The face, clipped to the disc so a wide moustache cannot escape the ring.
  for (let ay = 0; ay < art.length; ay++) {
    const row = swap[ay] ?? art[ay];
    for (let ax = 0; ax < row.length; ax++) {
      const ch = row[ax];
      const ink = INK[ch];
      if (!ink) continue;
      const x = OX + ax;
      const y = OY + ay;
      // Inside the disc, and not on top of the rim: a moustache that reaches
      // the edge should stop at it rather than punch through the ring.
      if (!inside(x, y)) continue;
      const onRim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (onRim) continue;
      rect(g, x, y, 1, 1, ink);
    }
  }

  addOutline(c, '#0a0d05');
  return c;
}
