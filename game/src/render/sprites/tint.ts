import { makeCanvas } from './paint.js';
import type { Sprite } from './paint.js';

/**
 * Repainting a baked sprite, one exact colour for another.
 *
 * Every sprite in this game is plotted in code, so a variant could always be
 * made by parameterising the baker. For a two-hundred-line hand-tuned thing
 * like `bakeHut` that means threading a palette through every literal and
 * hoping none of them was load-bearing -- a lot of risk for a recolour.
 *
 * This does it from the other end, and it is safe here for a reason that is
 * specific to this codebase: **there is no anti-aliasing and no alpha**, so
 * every pixel of a baked sprite is exactly one of the handful of literals the
 * baker used. An exact-match substitution therefore catches all of them and
 * misses none. In a renderer with soft edges the same trick would leave halos
 * of the old colour around every shape; here there are no soft edges to leave
 * them in. See the visual laws in CLAUDE.md, and `/pixel-check`.
 *
 * The unit sprites do it the other way, through `PALETTES` in `paint.ts`,
 * because a soldier was designed from the start as one shape in several
 * uniforms. Both are fine. The rule is that a *new* sprite with variants takes
 * a palette, and an *existing* one gains variants through here.
 */

/** A tone ramp, lightest first. What one nameable part of a sprite is painted with. */
export type Ramp = readonly string[];

/**
 * The named ramps, so a caller asks for `{ roof: 'moss' }` rather than listing
 * six hex codes at the call site.
 *
 * `thatch` is not invented here -- it is exactly the ramp `bakeHut` paints
 * with, and `bakeHut` now references this table rather than repeating the
 * literals. That direction matters: if the hut is ever retoned, every variant
 * of it follows automatically instead of silently going stale.
 *
 * Ramps that stand in for one another must be the same length. `variant` says
 * so out loud rather than producing a half-recoloured sprite.
 */
export const RAMPS = {
  /** The enemy's hut: lit cream through rust to maroon, and a near-black fringe. */
  thatch: ['#ffbd5a', '#e79034', '#c4631f', '#a03d12', '#7b1c07', '#511003', '#3a0c02'],
  /**
   * The same roof in the green side's colours, for the arena's allied huts.
   *
   * Pitched off the squad's own palette rather than off the grass: the lit
   * crown is close to the lime a soldier's webbing is drawn in, so a hut and
   * the men who come out of it read as the same side. The shadowed half is well
   * below any ground tone, which is what stops the silhouette dissolving into a
   * field -- the failure a green building on green ground invites.
   */
  moss: ['#d8ea78', '#96c23a', '#5f9126', '#3f6a1a', '#294a10', '#17300a', '#0f2206'],
} as const;

export type RampName = keyof typeof RAMPS;

/** An exact-match colour substitution: every `#rrggbb` key becomes its value. */
export type Recolour = Record<string, string>;

const KEY = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

const parse = (hex: string): number => {
  const h = hex.replace('#', '');
  return KEY(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  );
};

/**
 * A copy of `src` with the listed colours swapped.
 *
 * Alpha is copied through untouched rather than remapped: a sprite's
 * transparent margin is the only place alpha appears at all, and it must stay
 * exactly where it was or the silhouette changes.
 */
export function recolour(src: Sprite, map: Recolour): Sprite {
  const { c, g } = makeCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);

  const table = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(map)) {
    const h = to.replace('#', '');
    table.set(parse(from), [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]);
  }

  const img = g.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const hit = table.get(KEY(d[i], d[i + 1], d[i + 2]));
    if (!hit) continue;
    d[i] = hit[0];
    d[i + 1] = hit[1];
    d[i + 2] = hit[2];
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * A variant of a sprite with named parts repainted: `variant(hut, { thatch:
 * 'moss' })` gives the same hut with a green roof.
 *
 * The keys are the ramp the sprite is *currently* painted with; the values are
 * what to paint it with instead.
 */
export function variant(src: Sprite, parts: Partial<Record<RampName, RampName>>): Sprite {
  const map: Recolour = {};
  for (const [fromName, toName] of Object.entries(parts) as Array<[RampName, RampName]>) {
    const from = RAMPS[fromName];
    const to = RAMPS[toName];
    // A ramp swapped for a shorter one would leave the tail of the original
    // showing through, which reads as damage rather than as a variant.
    if (from.length !== to.length) {
      throw new Error(`ramp "${fromName}" (${from.length}) and "${toName}" (${to.length}) differ in length`);
    }
    for (let i = 0; i < from.length; i++) map[from[i]] = to[i];
  }
  return recolour(src, map);
}
