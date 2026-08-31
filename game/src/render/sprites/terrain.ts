/**
 * Things that grow out of the ground, baked per instance from a seed so a
 * treeline varies without any two runs disagreeing about it.
 *
 * The masses these belong to -- the continuous treeline and grass layers -- are
 * assembled in canopy.ts; this only bakes the pieces.
 */

import { addOutline, hashRnd, makeCanvas, px, rect } from './paint.js';
import type { Sprite } from './paint.js';

/** Foliage is split so the renderer can sway the canopy without the trunk. */
export interface Foliage {
  canopy: Sprite;
  trunk: Sprite;
  /** Where the canopy sits relative to the trunk sprite's top-left. */
  canopyOffsetY: number;
}

const TREE_W = 20;


export function bakeBroadleaf(seed: number, leafDark: string, leafMid: string, leafLight: string): Foliage {
  const rnd = hashRnd(seed * 2654435761);
  const trunkPart = makeCanvas(TREE_W, 10);
  rect(trunkPart.g, 9, 2, 2, 7, '#4a3320');
  px(trunkPart.g, 8, 6, '#3c2a1a');
  px(trunkPart.g, 11, 6, '#5a4029');
  px(trunkPart.g, 8, 8, '#4a3320');
  px(trunkPart.g, 11, 8, '#4a3320');
  addOutline(trunkPart.c, '#221709');

  const canopyPart = makeCanvas(TREE_W, 16);
  const blobs: Array<[number, number, number]> = [
    [10, 9, 6.6], [6, 10, 4.8], [14, 10, 4.8], [10, 5, 4.6], [7, 6, 3.6], [13, 6, 3.6],
  ];
  for (const [bx, by, r] of blobs) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const lit = x + y < -r * 0.35;
        const dark = x + y > r * 0.5;
        const jitter = rnd() < 0.13;
        px(canopyPart.g, bx + x, by + y, dark !== jitter ? leafDark : lit ? leafLight : leafMid);
      }
    }
  }
  addOutline(canopyPart.c, '#132a0e');
  return { canopy: canopyPart.c, trunk: trunkPart.c, canopyOffsetY: -12 };
}

export function bakePalm(seed: number): Foliage {
  const rnd = hashRnd(seed * 40503 + 7);
  const trunkPart = makeCanvas(TREE_W, 12);
  // A palm leans, which reads as heat even before you notice the fronds.
  const lean = seed % 2 === 0 ? 1 : -1;
  for (let y = 0; y < 11; y++) {
    const x = 10 + Math.round((y / 11) * -lean * 2);
    px(trunkPart.g, x, 11 - y, '#8a6a3c');
    px(trunkPart.g, x + 1, 11 - y, '#6d5029');
  }
  addOutline(trunkPart.c, '#3d2c15');

  const canopyPart = makeCanvas(TREE_W, 14);
  const top = { x: 10 - lean * 2, y: 9 };
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2 + rnd() * 0.4;
    const len = 5 + rnd() * 3;
    for (let t = 0; t < len; t++) {
      const droop = (t / len) ** 2 * 2.2;
      const x = top.x + Math.cos(a) * t;
      const y = top.y + Math.sin(a) * t * 0.55 + droop;
      px(canopyPart.g, x, y, t < len * 0.5 ? '#5e9b34' : '#3f7222');
      if (t > 1 && t < len - 1) px(canopyPart.g, x, y - 1, '#4d8a2b');
    }
  }
  rect(canopyPart.g, top.x - 1, top.y - 1, 2, 2, '#7a5a2c');
  addOutline(canopyPart.c, '#1c3a12');
  return { canopy: canopyPart.c, trunk: trunkPart.c, canopyOffsetY: -10 };
}

export function bakePine(seed: number): Foliage {
  const rnd = hashRnd(seed * 91711 + 3);
  const trunkPart = makeCanvas(TREE_W, 8);
  rect(trunkPart.g, 9, 3, 2, 4, '#3f2c1c');
  addOutline(trunkPart.c, '#221709');

  const canopyPart = makeCanvas(TREE_W, 20);
  // Three stacked skirts of needles, each narrower than the one below.
  for (let tier = 0; tier < 3; tier++) {
    const baseY = 17 - tier * 5;
    const halfMax = 7 - tier * 1.6;
    for (let row = 0; row < 6; row++) {
      const half = Math.round((row / 5) * halfMax);
      for (let x = -half; x <= half; x++) {
        const edge = Math.abs(x) >= half - 0.5;
        const snow = rnd() < 0.2;
        px(canopyPart.g, 10 + x, baseY - row, snow ? '#e6f1f6' : edge ? '#1f3d2e' : '#2e5240');
      }
    }
  }
  px(canopyPart.g, 10, 1, '#e6f1f6');
  addOutline(canopyPart.c, '#12261c');
  return { canopy: canopyPart.c, trunk: trunkPart.c, canopyOffsetY: -18 };
}

/** Walk-through cover: a clump of tall stems that hides you from sight. */
export function bakeTallGrass(seed: number, dark: string, mid: string, light: string): Sprite {
  const { c, g } = makeCanvas(16, 12);
  const rnd = hashRnd(seed * 22571 + 11);
  for (let blade = 0; blade < 11; blade++) {
    const x = 1 + Math.floor(rnd() * 14);
    const h = 4 + Math.floor(rnd() * 6);
    const bend = rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i < h; i++) {
      const bx = x + (i > h - 3 ? bend : 0);
      px(g, bx, 11 - i, i > h - 2 ? light : i < 2 ? dark : mid);
    }
  }
  return c;
}

/**
 * A boulder: faceted, not round.
 *
 * The previous one was a shaded sphere, and a field of shaded spheres reads as
 * cannonballs or blackberries however you colour it. Rock is angular, so this
 * builds a lopsided silhouette from a handful of jittered radii and then breaks
 * the surface into flat facets lit from up and left, with a bright cap on top
 * and a hard dark underside.
 */
export function bakeRock(seed: number, light: string, mid: string, dark: string, cap?: string): Sprite {
  const { c, g } = makeCanvas(18, 18);
  const rnd = hashRnd(seed * 40503);

  // Eight radii around the silhouette, interpolated between: enough asymmetry
  // that no two boulders share a profile.
  const radii = Array.from({ length: 8 }, () => 4.6 + rnd() * 2.6);
  const radiusAt = (a: number): number => {
    const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * 8;
    const i = f | 0;
    const t = f - i;
    return radii[i] * (1 - t) + radii[(i + 1) % 8] * t;
  };

  // Two facet planes, so the surface breaks rather than graduating.
  const facetA = rnd() * Math.PI * 2;
  const facetB = facetA + 1.4 + rnd();

  const cx = 9, cy = 10;
  for (let y = 1; y < 17; y++) {
    for (let x = 1; x < 17; x++) {
      const dx = x - cx, dy = (y - cy) * 1.25;
      const d = Math.hypot(dx, dy);
      if (d > radiusAt(Math.atan2(dy, dx) + Math.PI)) continue;

      const facet = Math.cos(Math.atan2(dy, dx) - facetA) > 0.25 ? 0
        : Math.cos(Math.atan2(dy, dx) - facetB) > 0.25 ? 1 : 2;
      const lit = -(dx * 0.5 + dy * 0.75) / (d + 0.001);
      const tone2 = lit > 0.35 ? light : facet === 0 ? mid : facet === 1 ? dark : mid;
      px(g, x, y, rnd() < 0.13 ? dark : tone2);
    }
  }
  // A hard dark underside, which is what sits a boulder on the ground.
  for (let x = 2; x < 16; x++) {
    const top = radiusAt(Math.PI / 2) * 0.8;
    px(g, x, cy + Math.round(top), dark);
  }
  // Snow, lichen or dust caught on the upper surface, per theme.
  if (cap) {
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * (1.05 + rnd() * 0.9);
      const r = rnd() * 4.5;
      px(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, cap);
    }
  }
  addOutline(c, '#161a14');
  return c;
}

/** Small ground detail scattered over open terrain to break up flat colour. */
export function bakeTuft(seed: number, dark: string, light: string): Sprite {
  const { c, g } = makeCanvas(7, 5);
  const rnd = hashRnd(seed * 7717 + 21);
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(rnd() * 5);
    const h = 1 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) px(g, x, 4 - y, y === h - 1 ? light : dark);
  }
  return c;
}
