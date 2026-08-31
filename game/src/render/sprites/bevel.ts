/**
 * Chamfered slab bevels, driven by a mask.
 *
 * Two things in this game are the same object wearing different palettes: the
 * riveted plates of `docs/original-images/intro/frame.png` and the slab letters
 * of `intro/logo.png`. Zoom into either and the construction is identical --
 * a hard black keyline, corners cut at 45 degrees, a bright rim along the top
 * and left, a face that turns darker as it falls away to the bottom and right,
 * and any hole through the shape lit from exactly the opposite side, because a
 * hole is a bevel seen from inside.
 *
 * So the bevel is written once, here, against a **mask** rather than against
 * any particular shape. A letter is a mask. A plate is a mask. A wing is a
 * mask. Whatever produced the silhouette, the lighting is the same, which is
 * the only reason the logo will sit correctly next to chrome it was not drawn
 * with.
 *
 * The laws in CLAUDE.md hold: no alpha, no anti-aliasing, no gradients. The
 * sheen down a letter is dithered coverage of two tones taken from the
 * project's own threshold field, not a fill with a ramp in it.
 */

import { threshAt } from '../palette.js';
import { makeCanvas } from './paint.js';
import type { Sprite } from './paint.js';

/* --------------------------------------------------------------------- mask */

/**
 * A one-bit silhouette.
 *
 * Deliberately not a canvas. Every operation below -- chamfering a corner,
 * finding which side of an edge a pixel is on, telling a hole from the outside
 * world -- is a question about set membership, and asking it of pixel data
 * means reading four bytes and hoping nobody has drawn on it yet.
 */
export class Mask {
  readonly bits: Uint8Array;

  constructor(readonly w: number, readonly h: number) {
    this.bits = new Uint8Array(w * h);
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.bits[y * this.w + x];
  }

  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.bits[y * this.w + x] = v;
  }

  rect(x: number, y: number, w: number, h: number, v = 1): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
    return this;
  }

  /**
   * A trapezoid given by its top and bottom spans, which is every shape the
   * wings need: a bar with its lower-left corner sheared away is a top span and
   * a shorter bottom span, and the diagonal falls out of the interpolation.
   */
  taper(yTop: number, yBot: number, topL: number, topR: number, botL: number, botR: number, v = 1): this {
    const span = Math.max(1, yBot - yTop);
    for (let y = yTop; y < yBot; y++) {
      const t = (y - yTop) / span;
      const l = Math.round(topL + (botL - topL) * t);
      const r = Math.round(topR + (botR - topR) * t);
      for (let x = l; x < r; x++) this.set(x, y, v);
    }
    return this;
  }

  /** Stamps another mask in, offset. Used to assemble words out of letters. */
  blit(src: Mask, ox: number, oy: number): this {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) if (src.bits[y * src.w + x]) this.set(x + ox, y + oy, 1);
    }
    return this;
  }

  /**
   * Cuts convex corners at 45 degrees, `n` pixels deep.
   *
   * This is what makes a rectangle read as a machined slab rather than a box.
   * A pixel goes if both of its neighbours in some diagonal pair are outside
   * the mask -- which is true only at an outward corner, so an inward corner
   * where two strokes of a letter meet is left alone, exactly as the reference
   * leaves it.
   */
  chamfer(n: number): this {
    for (let pass = 0; pass < n; pass++) {
      const doomed: number[] = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (!this.bits[y * this.w + x]) continue;
          const u = this.at(x, y - 1), d = this.at(x, y + 1);
          const l = this.at(x - 1, y), r = this.at(x + 1, y);
          if ((!u && !l) || (!u && !r) || (!d && !l) || (!d && !r)) doomed.push(y * this.w + x);
        }
      }
      for (const i of doomed) this.bits[i] = 0;
    }
    return this;
  }

  /**
   * The same cut applied to the holes: fills their convex corners so a counter
   * is octagonal too. The reference does this -- the hole in a B has cut
   * corners, and leaving them square is the fastest way to make a hand-drawn
   * letter look like a rectangle with a rectangle taken out of it.
   */
  chamferHoles(n: number): this {
    const ext = this.exterior();
    for (let pass = 0; pass < n; pass++) {
      const born: number[] = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const i = y * this.w + x;
          if (this.bits[i] || ext[i]) continue;             // only inside a hole
          const hole = (px: number, py: number): boolean =>
            px >= 0 && py >= 0 && px < this.w && py < this.h
            && !this.bits[py * this.w + px] && !ext[py * this.w + px];
          const u = hole(x, y - 1), d = hole(x, y + 1);
          const l = hole(x - 1, y), r = hole(x + 1, y);
          if ((!u && !l) || (!u && !r) || (!d && !l) || (!d && !r)) born.push(i);
        }
      }
      for (const i of born) this.bits[i] = 1;
    }
    return this;
  }

  /**
   * Which empty pixels are the outside world, as opposed to a hole.
   *
   * The whole lighting model turns on this distinction: the outside of a letter
   * is lit from the top left, and the inside of its counter from the bottom
   * right. Without it, the hole in a B gets a bright edge along its top and the
   * letter stops reading as raised at all -- it reads as a sticker.
   */
  exterior(): Uint8Array {
    const seen = new Uint8Array(this.w * this.h);
    const stack: number[] = [];
    const push = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x;
      if (seen[i] || this.bits[i]) return;
      seen[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < this.w; x++) { push(x, 0); push(x, this.h - 1); }
    for (let y = 0; y < this.h; y++) { push(0, y); push(this.w - 1, y); }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % this.w, y = (i / this.w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    return seen;
  }
}

/* -------------------------------------------------------------------- paint */

export interface BevelStyle {
  /** The hard contour, and the fill of every counter. Near-black. */
  keyline: string;
  /** How many pixels of it sit outside the shape. */
  keylineWidth?: number;
  /** The lit edge: top and left outside, bottom and right inside a hole. */
  rim: string;
  /** Face tones, light first. Dithered between, never blended. */
  face: [string, string];
  /** The edge turning away: bottom and right outside, top and left in a hole. */
  shade: string;
  /**
   * How much of the light tone the face carries at its top and at its bottom.
   *
   * A slab letter in the reference is not one colour -- it is brightest just
   * under its top edge and settles to the darker tone by its foot. Two numbers
   * rather than a gradient: the dither resolves the fraction between them, so
   * what lands on screen is still only ever two colours.
   */
  sheen?: [number, number];
  /**
   * Sunk rather than raised: the lit edge moves to the bottom and right and the
   * shaded one to the top and left.
   *
   * A plate is a brass frame with an olive panel *recessed into it*, and the
   * panel is lit from the opposite side to the frame around it. That opposition
   * is the entire reason the thing reads as having depth -- drawn with the same
   * lighting it reads as two flat shapes stacked, which is what a sticker is.
   * Same relationship as a counter inside a letter, which is why it is one flag
   * here rather than a second function.
   */
  inset?: boolean;
}

/**
 * Paints a mask onto a canvas at an offset.
 *
 * Order matters and is the reverse of how it reads: keyline first so everything
 * else covers it, then the face, then the two edges over the face. Rim goes on
 * after shade so that a stroke one pixel wide -- which is both the top of the
 * shape and its bottom -- comes out lit rather than dark, which is what the eye
 * expects of something raised.
 */
export function paintBevel(
  g: CanvasRenderingContext2D, mask: Mask, ox: number, oy: number, style: BevelStyle,
): void {
  const { w, h } = mask;
  const ext = mask.exterior();
  const kw = style.keylineWidth ?? 1;
  const [sTop, sBot] = style.sheen ?? [0.5, 0.5];

  const solid = (x: number, y: number): boolean => mask.at(x, y) === 1;
  const outside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    return !mask.bits[y * w + x] && ext[y * w + x] === 1;
  };
  const hole = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return !mask.bits[y * w + x] && ext[y * w + x] === 0;
  };

  /*
   * 1. The keyline: a band of it hugging the shape, outside *and* inside.
   *
   * Inside matters and is easy to get wrong. Filling a counter solid was the
   * first attempt, on the reasoning that the reference's counters are black --
   * but they are black because the reference is one flat picture with dark
   * artwork behind the letters. A sprite is not a picture. A filled counter is
   * an opaque blob that cannot have a battlefield showing through it, and the
   * middle of an O is exactly where you would want to see one. So the counter
   * gets its contour and nothing else, and the hole stays a hole.
   */
  g.fillStyle = style.keyline;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!outside(x, y) && !hole(x, y)) continue;
      let near = false;
      for (let dy = -kw; dy <= kw && !near; dy++) {
        for (let dx = -kw; dx <= kw; dx++) if (solid(x + dx, y + dy)) { near = true; break; }
      }
      if (near) g.fillRect(ox + x, oy + y, 1, 1);
    }
  }

  // 2. The face, dithered along the sheen.
  for (let y = 0; y < h; y++) {
    const level = sTop + (sBot - sTop) * (h <= 1 ? 0 : y / (h - 1));
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      g.fillStyle = threshAt(x, y) < level ? style.face[0] : style.face[1];
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }

  // 3. The edge falling away, then 4. the lit edge over it.
  const lo = style.inset ? style.rim : style.shade;
  const hi = style.inset ? style.shade : style.rim;
  g.fillStyle = lo;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      if (outside(x, y + 1) || outside(x + 1, y) || hole(x, y - 1) || hole(x - 1, y)) {
        g.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  g.fillStyle = hi;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      if (outside(x, y - 1) || outside(x - 1, y) || hole(x, y + 1) || hole(x + 1, y)) {
        g.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

/**
 * The hard silhouette a shape throws.
 *
 * Offset and flat -- no blur, because the hardware being imitated could not
 * blur, and a soft shadow is the single fastest way to make a pixel logo read
 * as a modern render of one. It is drawn from the keyline outward so the shadow
 * is fractionally larger than the shape, which is what stops it reading as a
 * misprint of the logo rather than as a shadow.
 */
export function paintShadow(
  g: CanvasRenderingContext2D, mask: Mask, ox: number, oy: number, color: string, grow = 1,
): void {
  g.fillStyle = color;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!mask.at(x, y)) continue;
      g.fillRect(ox + x - grow, oy + y - grow, 1 + grow * 2, 1 + grow * 2);
    }
  }
}

/** A canvas sized to a mask, for looking at one piece on its own. */
export function maskSprite(mask: Mask, style: BevelStyle, pad = 3): Sprite {
  const { c, g } = makeCanvas(mask.w + pad * 2, mask.h + pad * 2);
  paintBevel(g, mask, pad, pad, style);
  return c;
}
