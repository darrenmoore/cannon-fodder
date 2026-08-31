/**
 * The canopy bake.
 *
 * The reference does not draw trees. It draws *forest*: one continuous blanket
 * of overlapping round lumps with a ragged perimeter, so dense that individual
 * plants are not separable. Drawing one tree sprite per tile can never get
 * there, because the thing that makes it read as forest is precisely that the
 * lumps do not line up with anything.
 *
 * So the whole treeline is baked as a single full-map layer:
 *
 * - **Where** is the warped signed distance field from `terrain.ts` — an
 *   organic silhouette that owes nothing to the tile grid it came from.
 * - **What** is cellular (Worley) noise: a jittered grid of feature points,
 *   each of which becomes one rounded lump of leaves. The offset from a pixel
 *   to its nearest feature point is also its surface normal, which is what
 *   lights each lump from the top-left and shades its underside.
 *
 * The layer is drawn after the actors. That is not a compromise: trees are
 * solid, so nothing can stand inside one, and the small overhang onto a soldier
 * standing at the hem is exactly what the reference shows.
 */

import { dither, foliageFor, mix, shade, stoneFor } from './palette.js';
import { sampleField } from './terrain.js';
import type { GameMap } from './map.js';
import type { FoliagePalette, Ramp } from './palette.js';
import type { TerrainInfo } from './terrain.js';

/**
 * Cell size for the lump grid, in world pixels. The reference's leaf clusters
 * are 8-12px across and there are well over a hundred in a screenful; at 11px
 * cells we drew nine 40px pebbles and it read as boiled broccoli. Small and
 * many is the whole effect.
 */
const LUMP = 6;

/** Hash of a cell coordinate to two jitter values and a brightness. */
const cellHash = (cx: number, cy: number): number => {
  let h = (cx * 374761393 + cy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
};

interface Cell {
  /** Distance from the sample to its nearest feature point, in pixels. */
  dist: number;
  /** Vector from the feature point to the sample: the lump's local normal. */
  nx: number;
  ny: number;
  /** Per-lump brightness jitter, -1..1. */
  tint: number;
}

/**
 * Cellular noise, F1. Only the 3x3 block of cells around the sample can hold
 * the nearest feature point once jitter is kept under a cell.
 *
 * One feature point per cell, however well jittered, still leaves a lattice:
 * cells cannot be empty and cannot hold two, so the points stay roughly evenly
 * spaced and the eye reads faint diagonal rows through the whole mass. Callers
 * fix that by warping the sample position before it arrives here, which lets
 * the grid stretch and bunch and destroys the regularity for one noise lookup.
 */
function cellular(px: number, py: number, size: number, out: Cell): void {
  const cx = Math.floor(px / size), cy = Math.floor(py / size);
  let best = Infinity, bx = 0, by = 0, tint = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const h = cellHash(cx + i, cy + j);
      const fx = (cx + i + ((h & 0xff) / 255) * 0.86 + 0.07) * size;
      const fy = (cy + j + (((h >> 8) & 0xff) / 255) * 0.86 + 0.07) * size;
      const dx = px - fx, dy = py - fy;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d; bx = dx; by = dy;
        tint = (((h >> 16) & 0xff) / 255) * 2 - 1;
      }
    }
  }
  const d = Math.sqrt(best);
  out.dist = d;
  out.nx = d > 0.001 ? bx / d : 0;
  out.ny = d > 0.001 ? by / d : 0;
  out.tint = tint;
}

/** A low-resolution noise plane, bilinearly upsampled. */
class Plane {
  private readonly w: number;
  private readonly h: number;
  private readonly data: Float32Array;
  private static readonly STEP = 4;

  constructor(noise: { fbm(x: number, y: number, o?: number): number },
              pw: number, ph: number, tile: number, scale: number, octaves = 2) {
    const s = Plane.STEP;
    this.w = Math.ceil(pw / s) + 2;
    this.h = Math.ceil(ph / s) + 2;
    this.data = new Float32Array(this.w * this.h);
    const k = scale / tile;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) this.data[y * this.w + x] = noise.fbm(x * s * k, y * s * k, octaves);
    }
  }

  at(px: number, py: number): number {
    const s = Plane.STEP;
    const fx = px / s, fy = py / s;
    const x0 = fx | 0, y0 = fy | 0;
    const tx = fx - x0, ty = fy - y0;
    const i = y0 * this.w + x0;
    const a = this.data[i], b = this.data[i + 1];
    const c = this.data[i + this.w], d = this.data[i + this.w + 1];
    const top = a + (b - a) * tx;
    return top + ((c + (d - c) * tx) - top) * ty;
  }
}

export interface CanopyBake {
  /** Full-map RGBA layer, drawn over the actors. Null when a map has no trees. */
  layer: HTMLCanvasElement | null;
  /**
   * The canopy's shadow, as a full-map alpha layer to be composited into the
   * ground before anything else stands on it.
   */
  shadow: HTMLCanvasElement | null;
}

/** How far the canopy's shadow falls, in world pixels. Sun is up and left. */
const SHADOW_DX = 5;
const SHADOW_DY = 6;

export function bakeCanopy(map: GameMap, terrain: TerrainInfo): CanopyBake {
  const { treeSdf, grassSdf, width, height, noise } = terrain;
  // Any of the three masses is reason enough to build the layer: a mission can
  // be all rock and no trees, and it still needs one.
  const { stoneSdf } = terrain;
  let any = false;
  for (let i = 0; i < treeSdf.length; i++) {
    if (treeSdf[i] < 0 || grassSdf[i] < 0 || stoneSdf[i] < 0) { any = true; break; }
  }
  if (!any) return { layer: null, shadow: null };

  const t = map.tile;
  const pw = map.pixelWidth, ph = map.pixelHeight;
  const pal = foliageFor(map.theme);

  const layer = document.createElement('canvas');
  layer.width = pw; layer.height = ph;
  const lg = layer.getContext('2d')!;
  const img = lg.createImageData(pw, ph);
  const buf = new Uint32Array(img.data.buffer);

  const shadowC = document.createElement('canvas');
  shadowC.width = pw; shadowC.height = ph;
  const sg = shadowC.getContext('2d')!;
  const simg = sg.createImageData(pw, ph);
  const sbuf = new Uint32Array(simg.data.buffer);
  const shadowWord = (pal.shadow & 0x00ffffff) | (0x88 << 24);

  // Two warps: a broad one that moves whole bays of the treeline, and a tight
  // one that makes the perimeter frayed at the scale of a single bush.
  const warpA = new Plane(noise, pw, ph, t, 0.3, 2);
  const warpB = new Plane(noise, pw, ph, t, 0.33, 2);
  const fray = new Plane(noise, pw, ph, t, 1.9, 2);
  // Slow variation in canopy tone, so a large forest is not one flat green.
  const tone = new Plane(noise, pw, ph, t, 0.085, 3);

  // Warps the cellular grid itself, not just the mass boundary. Without this
  // the lump lattice shows through as diagonal corduroy at the cell pitch,
  // which is the most machine-made thing in a frame otherwise full of noise.
  const lumpWarpA = new Plane(noise, pw, ph, t, 1.3, 2);
  const lumpWarpB = new Plane(noise, pw, ph, t, 1.4, 2);
  const lumpFine = new Plane(noise, pw, ph, t, 3.4, 2);

  const cell: Cell = { dist: 0, nx: 0, ny: 0, tint: 0 };
  const top = pal.canopy.length - 1;

  /** Cellular noise sampled through a warp, so its grid is unreadable. */
  const lumpAt = (px: number, py: number, size: number): void => {
    // Kept well under the cell size. Warp the grid by more than a cell and the
    // lumps stop being lumps: they shear into long worms and the canopy reads
    // as brain coral. Just enough to break the rows, no more.
    const wx = px + (lumpWarpA.at(px, py) - 0.5) * 4.5 + (lumpFine.at(px, py) - 0.5) * 3;
    const wy = py + (lumpWarpB.at(px, py) - 0.5) * 4.5 + (lumpFine.at(px + 29, py + 83) - 0.5) * 3;
    cellular(wx, wy, size, cell);
  };

  /** Warped signed distance into the tree mass. Negative is inside. */
  const depthAt = (px: number, py: number): number => {
    const wx = px + (warpA.at(px, py) - 0.5) * 11 + (fray.at(px, py) - 0.5) * 5;
    const wy = py + (warpB.at(px, py) - 0.5) * 11 + (fray.at(px + 53, py + 17) - 0.5) * 5;
    return sampleField(treeSdf, width, height, t, wx, wy);
  };

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const d = depthAt(px, py);
      if (d > 0.34) continue;

      lumpAt(px, py, LUMP);
      // A lump's own edge frays the mass edge: near the perimeter, a pixel only
      // survives if it is close to a feature point. That is what turns a smooth
      // silhouette into a rim of separate bushes.
      const inward = -d;                                   // 0 at the line, up inside
      const lump = 1 - cell.dist / (LUMP * 0.85);           // 1 at a lump's centre
      // Near the perimeter a pixel only survives if it belongs to a lump, so
      // the silhouette ends in separate bushes rather than a cut line.
      if (inward < 0.5 && lump < 0.3 - inward * 0.7) continue;

      const i = py * pw + px;

      // Light from up and left. The vector to the nearest feature point is a
      // good enough normal for a shape this soft.
      const light = -(cell.nx * 0.62 + cell.ny * 0.78);

      // Four values inside every 8px blob, as in the reference: a near-black
      // rim on the lower right, a mid body, a pale crown on the upper left, and
      // a single bright pixel where the crown peaks. Two flat facets and a
      // straight seam is what made these read as plastic.
      let level = top * (0.3 + (tone.at(px, py) - 0.5) * 0.72)
        + light * 2.6
        + lump * 2.4
        + cell.tint * 0.5;
      if (lump > 0.72 && light > 0.35) level += 1.4;

      // The hem of the mass sits in its own shade, which is what separates a
      // forest from the field it stands in.
      if (inward < 1.0) level -= (1.0 - inward) * 1.35;

      buf[i] = dither(pal.canopy, level, px, py);

      // A dark gap punched between adjacent lumps, so the mass reads as
      // texture rather than as a few big shapes fused together. It goes to a
      // deep olive, never to black: punching through to the shadow colour
      // leaves the canopy looking like a mass with holes in it.
      if (cell.dist > LUMP * 0.8) buf[i] = mix(buf[i], pal.canopy[1], 0.7);
    }
  }

  paintTallGrass(buf, pw, ph, t, terrain, pal, lumpAt, cell, warpA, warpB, fray, tone);
  paintCrag(buf, sbuf, pw, ph, t, terrain, stoneFor(map.theme), lumpAt, cell, warpA, warpB, fray, tone);

  // The shadow is the same silhouette, offset. Sampling the shape a second
  // time is cheaper and cleaner than blurring the layer we just drew.
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const sx = px - SHADOW_DX, sy = py - SHADOW_DY;
      if (sx < 0 || sy < 0) continue;
      if (depthAt(sx, sy) > -0.12) continue;
      sbuf[py * pw + px] = shadowWord;
    }
  }

  lg.putImageData(img, 0, 0);
  sg.putImageData(simg, 0, 0);
  return { layer, shadow: shadowC };
}

/**
 * Tall grass, into the same layer as the canopy.
 *
 * It was a sprite per tile, and the tile grid is 16 pixels, so a field of it
 * came out as the same glyph stamped in strict rows every 16 pixels — readable
 * as a repeating motif right across a mission, like wallpaper. Nothing else in
 * the frame gave the generator away so completely.
 *
 * Baked as a mass it inherits the canopy's warped silhouette and jittered lump
 * grid for free. It differs in being shorter, finer, brighter and much more
 * broken up, so that it still reads as something you can walk into rather than
 * as a second treeline.
 */
function paintTallGrass(
  buf: Uint32Array, pw: number, ph: number, t: number, terrain: TerrainInfo,
  pal: FoliagePalette,
  lumpAt: (px: number, py: number, size: number) => void, cell: Cell,
  warpA: Plane, warpB: Plane, fray: Plane, tone: Plane,
): void {
  const { grassSdf, width, height } = terrain;
  let any = false;
  for (let i = 0; i < grassSdf.length; i++) if (grassSdf[i] < 0) { any = true; break; }
  if (!any) return;

  const top = pal.canopy.length - 1;
  const TUFT = 4;

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const wx = px + (warpA.at(px, py) - 0.5) * 9 + (fray.at(px, py) - 0.5) * 6;
      const wy = py + (warpB.at(px, py) - 0.5) * 9 + (fray.at(px + 11, py + 67) - 0.5) * 6;
      const d = sampleField(grassSdf, width, height, t, wx, wy);
      if (d > 0.2) continue;

      lumpAt(px, py, TUFT);
      const inward = -d;
      const blade = 1 - cell.dist / (TUFT * 0.9);
      // Deliberately holey. Tall grass you cannot see any ground through is a
      // hedge, and the whole point of it is that you walk about inside it.
      if (blade < 0.34 + (inward < 0.4 ? 0.3 : 0)) continue;

      const light = -(cell.nx * 0.5 + cell.ny * 0.86);
      // Shares the canopy's slow tone drift. Without it a mission that is mostly
      // tall grass comes out as one flat field of static from edge to edge —
      // the lattice is gone but so is any sense of scale.
      let level = top * (0.4 + (tone.at(px, py) - 0.5) * 0.8)
        + light * 1.5 + blade * 1.6 + cell.tint * 0.45;
      if (inward < 0.8) level -= (0.8 - inward) * 0.9;

      buf[py * pw + px] = dither(pal.canopy, level, px, py);
    }
  }
}

/**
 * Crag, into the same layer as the canopy.
 *
 * The same argument as the treeline, and it applies harder: a rock sprite per
 * tile lays out an outcrop as a grid of near-identical boulders, and rows of
 * boulders read as masonry. Baked as a mass it gets the warped silhouette for
 * free, and the lumps become the individual stones of a crag.
 *
 * The differences from foliage are all about hardness: fewer, larger lumps;
 * facets rather than a smooth normal; a hard black underside on every stone;
 * and a bright cap on the upper surfaces, which is the whole reason an arctic
 * crag reads as three-dimensional rather than as a hole in the snow.
 */
function paintCrag(
  buf: Uint32Array, sbuf: Uint32Array, pw: number, ph: number, t: number,
  terrain: TerrainInfo, pal: { face: Ramp; cap: number; shadow: number },
  lumpAt: (px: number, py: number, size: number) => void, cell: Cell,
  warpA: Plane, warpB: Plane, fray: Plane, tone: Plane,
): void {
  const { stoneSdf, width, height } = terrain;
  let any = false;
  for (let i = 0; i < stoneSdf.length; i++) if (stoneSdf[i] < 0) { any = true; break; }
  if (!any) return;

  const top = pal.face.length - 1;
  const STONE_LUMP = 9;
  const shadowWord = (pal.shadow & 0x00ffffff) | (0x99 << 24);

  const depthAt = (px: number, py: number): number => {
    const wx = px + (warpA.at(px, py) - 0.5) * 10 + (fray.at(px, py) - 0.5) * 6;
    const wy = py + (warpB.at(px, py) - 0.5) * 10 + (fray.at(px + 97, py + 41) - 0.5) * 6;
    return sampleField(stoneSdf, width, height, t, wx, wy);
  };

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const d = depthAt(px, py);
      if (d > 0.3) continue;

      lumpAt(px, py, STONE_LUMP);
      const inward = -d;
      const lump = 1 - cell.dist / (STONE_LUMP * 0.86);
      if (inward < 0.45 && lump < 0.36 - inward * 0.7) continue;

      const i = py * pw + px;

      // Faceted, not smooth: the normal is quantised into three planes, which
      // is what makes stone read as stone rather than as a shaded ball.
      const raw = -(cell.nx * 0.55 + cell.ny * 0.78);
      const facet = raw > 0.42 ? 1.9 : raw > -0.1 ? 0.5 : -1.4;

      let level = top * (0.42 + (tone.at(px, py) - 0.5) * 0.5)
        + facet + lump * 1.1 + cell.tint * 0.7;
      if (inward < 0.9) level -= (0.9 - inward) * 1.6;
      buf[i] = dither(pal.face, level, px, py);

      // A hard dark line under each stone, and a bright cap on the top of it.
      if (cell.ny > 0.72 && cell.dist > STONE_LUMP * 0.5) buf[i] = pal.shadow;
      else if (cell.ny < -0.5 && cell.nx < 0.3 && lump > 0.35 && ((px + py) & 1) === 0) {
        buf[i] = pal.cap;
      }

      // Crags cast their own shadow into the ground layer, offset like the
      // canopy's, so the two sit in the same light.
      const sx = px + SHADOW_DX, sy = py + SHADOW_DY;
      if (inward > 0.1 && sx < pw && sy < ph) sbuf[sy * pw + sx] = shadowWord;
    }
  }
}

export { shade };
export type { FoliagePalette };
