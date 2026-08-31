/**
 * The ground bake.
 *
 * Everything here runs exactly once per map, into a full-map offscreen canvas
 * that the renderer then blits by visible rect. That budget is what makes
 * per-pixel work affordable: a 220x44 mission is 2.5 million pixels, which is
 * far too many to touch every frame and completely fine to touch once.
 *
 * Three ideas do most of the work:
 *
 * 1. **Ramps, not colours.** Every surface is four to six tones and a noise
 *    field picks a position along it, so tone drifts across a field the way it
 *    does in the reference instead of sitting flat.
 * 2. **Ordered dither.** The fractional position between two ramp entries is
 *    resolved against a Bayer threshold, so tones interleave at pixel scale.
 *    This is the single most Amiga-looking thing available.
 * 3. **Domain warping.** The tile a pixel reads its material from is offset by
 *    a noise field before the lookup. That one substitution dissolves every
 *    straight tile boundary on the map into a wandering organic edge, without
 *    the map format or the collision grid knowing anything about it.
 */

import { tileAt } from './map.js';
import {
  dither, foliageFor, mix, packColor, PLANKS, shade, shoreFor, surfaceFor, threshAt,
} from './palette.js';
import { Material, sampleField } from './terrain.js';
import { Tile } from './tiles.js';
import type { GameMap } from './map.js';
import type { Ramp } from './palette.js';
import type { TerrainInfo } from './terrain.js';

/** Cheap per-pixel hash in 0..1, for grain. */
const grainHash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * A low-resolution noise plane, bilinearly upsampled. The tonal drift we want
 * has a wavelength of ten tiles or more, so evaluating fbm at every pixel is
 * pure waste — one sample per 4x4 block carries it perfectly.
 */
class NoisePlane {
  private readonly w: number;
  private readonly h: number;
  private readonly data: Float32Array;
  private static readonly STEP = 4;

  constructor(noise: { fbm(x: number, y: number, o?: number): number },
              pixelW: number, pixelH: number, tile: number, scale: number, octaves = 3) {
    const s = NoisePlane.STEP;
    this.w = Math.ceil(pixelW / s) + 2;
    this.h = Math.ceil(pixelH / s) + 2;
    this.data = new Float32Array(this.w * this.h);
    const k = scale / tile;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        this.data[y * this.w + x] = noise.fbm(x * s * k, y * s * k, octaves);
      }
    }
  }

  at(px: number, py: number): number {
    const s = NoisePlane.STEP;
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

/**
 * How far, in pixels, a material boundary may wander off the grid.
 *
 * This has to exceed the tile size to do its job. At five pixels on a sixteen
 * pixel tile, a lone tile of grass in a field of sand still reads as a square
 * with slightly fuzzy corners — the eye finds an isolated rectangle instantly,
 * and half a tile of wobble does not hide one.
 */
const WARP = 11;
/** A second, tighter warp, so an edge frays at bush scale as well as bay scale. */
const FRAY = 5;

/**
 * Materials whose shape is deliberate rather than natural: a bridge that wobbles
 * stops meeting its banks, so these read their own tile and never a warped
 * neighbour's.
 *
 * A road is not one of them. A dirt track with a ruler-straight edge running the
 * full width of the screen reads as a boardwalk; real ones are eroded at the
 * verge, which is exactly what the warp gives for free.
 */
const RIGID = new Set<Material>([Material.Built]);

export interface GroundBake {
  /** Water tiles, for the renderer's animated shimmer pass. */
  waterTiles: Array<[number, number]>;
}

export function paintGround(
  g: CanvasRenderingContext2D, map: GameMap, terrain: TerrainInfo,
): GroundBake {
  const t = map.tile;
  const pw = map.pixelWidth, ph = map.pixelHeight;
  const theme = map.theme;
  const noise = terrain.noise;

  const img = g.createImageData(pw, ph);
  const buf = new Uint32Array(img.data.buffer);

  // One tone plane per distinct surface scale, plus the two warp planes and a
  // mid-frequency plane the detail passes share.
  const scales = new Map<number, NoisePlane>();
  const planeFor = (scale: number): NoisePlane => {
    let p = scales.get(scale);
    if (!p) { p = new NoisePlane(noise, pw, ph, t, scale); scales.set(scale, p); }
    return p;
  };
  for (const m of new Set(terrain.material)) planeFor(surfaceFor(theme, m as Material).scale);

  const warpX = new NoisePlane(noise, pw, ph, t, 0.38, 2);
  const warpY = new NoisePlane(noise, pw, ph, t, 0.41, 2);
  const detail = new NoisePlane(noise, pw, ph, t, 0.9, 2);
  // High frequency, for edges that should fray at the scale of a bush.
  const fine = new NoisePlane(noise, pw, ph, t, 2.6, 2);

  const shore = shoreFor(theme);
  const foliage = foliageFor(theme);
  const waterTiles: Array<[number, number]> = [];

  const tw = terrain.width, th = terrain.height;
  const materialFor = (tx: number, ty: number): Material =>
    tx < 0 || ty < 0 || tx >= tw || ty >= th
      ? Material.Ground
      : (terrain.material[ty * tw + tx] as Material);

  for (let py = 0; py < ph; py++) {
    const trueTy = (py / t) | 0;
    for (let px = 0; px < pw; px++) {
      const trueTx = (px / t) | 0;
      const trueMat = materialFor(trueTx, trueTy);

      // Warped lookup: the pixel asks a slightly different tile what it is.
      let mat = trueMat;
      if (!RIGID.has(trueMat)) {
        const wx = px + (warpX.at(px, py) - 0.5) * 2 * WARP + (fine.at(px, py) - 0.5) * 2 * FRAY;
        const wy = py + (warpY.at(px, py) - 0.5) * 2 * WARP + (fine.at(px + 71, py + 37) - 0.5) * 2 * FRAY;
        const cand = materialFor((wx / t) | 0, (wy / t) | 0);
        if (!RIGID.has(cand)) mat = cand;
      }

      const surf = surfaceFor(theme, mat);
      const top = surf.ramp.length - 1;

      // Tone: slow drift, plus a two-pixel-cluster grain that keeps even a flat
      // patch from reading as paint.
      const drift = planeFor(surf.scale).at(px, py);
      const g2 = grainHash(px >> 1, py >> 1);
      const g1 = grainHash(px, py);
      let level = (surf.bias + (drift - 0.5) * surf.contrast) * top
        + (g2 - 0.5) * surf.grain * 1.6
        + (g1 - 0.5) * surf.grain * 0.7;

      buf[py * pw + px] = dither(surf.ramp, level, px, py);
    }
  }

  // Water shimmer bookkeeping, from the true grid: the animated pass overlays
  // whole tiles, so it wants the honest ones.
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = tileAt(map, tx, ty);
      if (tile === Tile.Water || tile === Tile.DeepWater) waterTiles.push([tx, ty]);
    }
  }

  paintStrokes(buf, pw, ph, t, terrain, theme);
  paintSand(buf, pw, ph, t, terrain, theme, planeFor(surfaceFor(theme, Material.Sand).scale), detail);
  paintShores(buf, pw, ph, t, terrain, warpX, warpY, fine, shore);
  paintUndergrowth(buf, pw, ph, t, terrain, warpX, warpY, detail, fine, foliage);
  paintScrub(buf, pw, ph, t, terrain, warpX, warpY, fine, foliage);
  g.putImageData(img, 0, 0);

  // Passes that are cheaper as shapes than as pixels, drawn over the bake.
  paintDetails(g, map, terrain, detail);
  return { waterTiles };
}

/**
 * Grass strokes.
 *
 * Dither alone gives you tone; it does not give you *stuff*. The reference lays
 * a felted mat of individual grass blades over its ground — one pixel wide, two
 * to four tall, irregularly placed, roughly one every four pixels — and it is
 * the single largest reason its open ground never reads as empty. There is no
 * 40x40 patch anywhere in the original with nothing in it.
 *
 * One candidate stroke per 4x4 cell, jittered inside the cell. That is dense:
 * around 90,000 strokes on a mid-sized map, and cheap enough because each one
 * is three or four direct writes into the buffer.
 */
function paintStrokes(
  buf: Uint32Array, pw: number, ph: number, t: number, terrain: TerrainInfo, theme: string,
): void {
  const tw = terrain.width, th = terrain.height;
  // One step either side of the middle of the ramp, not its extremes: a blade
  // is a change in tone, not a black line drawn on the field.
  const gramp = surfaceFor(theme as never, Material.Ground).ramp;
  const dark = gramp[1];
  const light = gramp[Math.min(gramp.length - 1, 3)];
  // Snow does not grow blades; it drifts. Arctic gets streaks instead, laid
  // flat and pale, which is what wind does to a snowfield.
  const arctic = theme === 'arctic';

  const CELL = 5;
  for (let cy = 0; cy * CELL < ph; cy++) {
    for (let cx = 0; cx * CELL < pw; cx++) {
      const h = ((cx * 374761393 + cy * 668265263) ^ 0x5bf03635) >>> 0;
      // Half the cells carry a blade. The empty half is what keeps the mat from
      // hardening into a lattice — at three in four it reads as corduroy.
      if ((h & 1) === 0) continue;

      const px = cx * CELL + ((h >> 2) & 3);
      const py = cy * CELL + ((h >> 4) & 3);
      if (px >= pw || py >= ph) continue;

      const tx = (px / t) | 0, ty = (py / t) | 0;
      if (tx >= tw || ty >= th) continue;
      const cellIdx = ty * tw + tx;
      // Only on open ground, and never under the canopy where nothing grows.
      if (terrain.material[cellIdx] !== Material.Ground) continue;
      if (terrain.foliage[cellIdx]) continue;

      const up = ((h >> 6) & 1) === 0;
      const color = up ? light : dark;

      if (arctic) {
        // A flat 2-3px streak, horizontal-ish.
        const len = 2 + ((h >> 7) & 1);
        for (let s = 0; s < len; s++) {
          const x = px + s;
          if (x < pw) buf[py * pw + x] = color;
        }
        continue;
      }

      // A blade: 2-3 pixels tall, leaning one way or the other.
      const len = 2 + ((h >> 7) & 1);
      const lean = ((h >> 9) & 3) === 0 ? (((h >> 11) & 1) ? 1 : -1) : 0;
      for (let s = 0; s < len; s++) {
        const y = py - s;
        const x = px + ((lean * s) >> 1);
        if (y < 0 || x < 0 || x >= pw) break;
        buf[y * pw + x] = color;
      }
    }
  }
}

/**
 * Sand.
 *
 * Two tones of 1px static is not sand, it is burlap. Real sand has structure at
 * three scales and the base dither pass only supplies one of them: the slow
 * tonal drift is there, the pixel grain is there, and the metre-scale thing in
 * between — wind ripples — is missing entirely, which is why a desert reads as
 * a flat buzzing sheet however good its palette is.
 *
 * So: long shallow ripple crests, all running the same way as a prevailing wind
 * would leave them, curving with the ground's own noise; plus a scatter of
 * darker gravel where the sand has blown thin.
 */
function paintSand(
  buf: Uint32Array, pw: number, ph: number, t: number, terrain: TerrainInfo,
  theme: string, drift: NoisePlane, detail: NoisePlane,
): void {
  const surf = surfaceFor(theme as never, Material.Sand);
  let any = false;
  for (let i = 0; i < terrain.material.length; i++) {
    if (terrain.material[i] === Material.Sand) { any = true; break; }
  }
  if (!any) return;

  const tw = terrain.width, th = terrain.height;
  const top = surf.ramp.length - 1;

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const tx = (px / t) | 0, ty = (py / t) | 0;
      if (tx >= tw || ty >= th) continue;
      if (terrain.material[ty * tw + tx] !== Material.Sand) continue;

      // Ripple phase: a wave whose crests are bent by the drift field, so they
      // wander the way wind-blown sand does. One frequency in one direction
      // across a whole map is a sine wave, not a desert — so the wavelength
      // stretches and compresses with the drift, the direction leans with it,
      // and whole stretches are left smooth where the wind has scoured them.
      const d1 = drift.at(px, py);
      const d2 = detail.at(px, py);
      // Enough bend that the crests wander, not so much that the phase folds
      // back on itself -- past about twenty pixels of it the ripples close into
      // loops and the desert comes out looking like a fingerprint.
      const lean = 0.36 + (d1 - 0.5) * 0.16;
      const stretch = 0.26 + d2 * 0.1;
      const bend = (d1 - 0.5) * 17 + (d2 - 0.5) * 7;
      const phase = (px * lean + py * (0.62 - lean * 0.4) + bend) * stretch;
      const crest = Math.sin(phase);
      // Scoured flats between the drifts. Ripples everywhere is a sine wave;
      // ripples nowhere is burlap. The point is that some sand is combed and
      // some is not, and the boundary between wanders.
      if (d1 < 0.36 || crest < 0.5) continue;

      const i = py * pw + px;
      // The lit face of a ripple, and the shadow immediately behind it.
      const lift = (crest - 0.5) / 0.5;
      const level = (surf.bias + (d1 - 0.5) * surf.contrast) * top
        + (Math.sin(phase - 1.3) > 0.7 ? -1.7 : lift * 1.7);
      if (threshAt(px, py) > 0.3 + lift * 0.5) continue;
      buf[i] = dither(surf.ramp, level, px, py);
    }
  }
}

/**
 * Undergrowth, as plants rather than as an outline.
 *
 * The red in the reference is not a halo around a forest — it is a crimson
 * spike plant, two or three pixels wide and eight to fourteen tall, standing
 * upright. They cluster along the southern hem of a canopy mass where it meets
 * open ground, and a few stand alone out in the field. Sprayed as a dithered
 * ring instead, the same colour reads as blood or as an editor's error
 * highlight, which is exactly what it looked like before this pass existed.
 */
function paintScrub(
  buf: Uint32Array, pw: number, ph: number, t: number, terrain: TerrainInfo,
  warpX: NoisePlane, warpY: NoisePlane, fine: NoisePlane,
  foliage: { scrub: Ramp },
): void {
  const { foliageSdf, width, height } = terrain;
  const top = foliage.scrub.length - 1;

  /**
   * One plant: a rosette of tapering blades springing from a single base.
   *
   * A vertical bar is not a plant. The reference's undergrowth is four to six
   * curved leaf-blades radiating from one point, each a couple of pixels wide
   * at the base and one at the tip, dark at the core and bright at the edge —
   * and drawn as bars instead the same colour reads as blood spatter.
   */
  const rosette = (bx: number, by: number, seed: number): void => {
    const blades = 3 + (seed & 3);
    for (let b = 0; b < blades; b++) {
      // Fanned around the upright, so the plant opens rather than splaying flat.
      const spread = ((b + 0.5) / blades - 0.5) * 1.9 + ((seed >> (b + 4)) & 1) * 0.16;
      const len = 7 + ((seed >> (b * 3 + 2)) & 7);
      for (let s2 = 0; s2 < len; s2++) {
        const up = s2 / len;
        // Blades curve outward as they rise, and stand nearly upright at the base.
        const x = Math.round(bx + Math.sin(spread) * s2 * (0.35 + up * 0.75));
        const y = by - Math.round(s2 * (0.94 - Math.abs(Math.sin(spread)) * 0.3));
        if (y < 0 || y >= ph || x < 0 || x >= pw) break;
        // Dark core, bright edge: the tip is the brightest part of the plant.
        buf[y * pw + x] = dither(foliage.scrub, up * top * 1.3, x, y);
        // Only the lower half is two pixels wide, which is what makes it taper.
        if (up < 0.45 && x + 1 < pw) buf[y * pw + x + 1] = dither(foliage.scrub, up * top, x + 1, y);
      }
    }
  };

  const CELL = 11;
  for (let cy = 0; cy * CELL < ph; cy++) {
    for (let cx = 0; cx * CELL < pw; cx++) {
      const h = ((cx * 2246822519 + cy * 3266489917) ^ 0x27d4eb2f) >>> 0;
      const px = cx * CELL + (h % CELL);
      const py = cy * CELL + ((h >> 3) % CELL);
      if (px >= pw || py >= ph) continue;

      const tx = (px / t) | 0, ty = (py / t) | 0;
      if (tx >= width || ty >= height) continue;
      if (terrain.material[ty * width + tx] !== Material.Ground) continue;

      const wx = px + (warpX.at(px, py) - 0.5) * 2 * WARP + (fine.at(px, py) - 0.5) * 8;
      const wy = py + (warpY.at(px, py) - 0.5) * 2 * WARP;
      const d = sampleField(foliageSdf, width, height, t, wx, wy);

      // Densest in the first tile or two outside the treeline, and denser on
      // the south face where the reference always puts it. Out in the open a
      // plant is a rarity, which is what makes one worth noticing.
      const southFace = sampleField(foliageSdf, width, height, t, wx, wy - t * 0.9) < d - 0.15;
      let chance: number;
      if (d < -0.5) chance = 0;                          // under the canopy
      else if (d < 1.6) chance = southFace ? 0.42 : 0.16;
      else if (d < 3.2) chance = 0.09;
      else chance = 0.006;

      // Plants come in stands. Keying the probability to distance alone spaces
      // them evenly along the treeline, and an evenly spaced line of anything
      // is a contour, not vegetation — so a slow noise field decides where a
      // stand is at all, and the distance rule only decides how thick it gets.
      chance *= 0.35 + 1.9 * Math.max(0, fine.at(px * 0.35, py * 0.35) - 0.34);
      if (((h >> 8) & 0xff) / 255 > chance) continue;
      rosette(px, py, h >> 12);
    }
  }
}

/**
 * The waterline: one narrow dark fringe, and nothing else.
 *
 * The temptation with a shoreline is to draw the transition — a band of bank,
 * a line of foam, a shelf of shallows — and every one of those is a mistake.
 * Three concentric bands do not read as a coast; they read as contour lines on
 * a map key, and they announce the machine that drew them.
 *
 * The reference puts one to three pixels of near-black wet ground on the land
 * side and then goes straight into saturated water. That is the whole effect.
 * The shore's *shape* does the work, so the fringe gets an extra high-frequency
 * warp and a per-pixel bite to keep it ragged at the pixel scale rather than
 * stepping along the interpolated field's facets.
 */
function paintShores(
  buf: Uint32Array, pw: number, ph: number, t: number, terrain: TerrainInfo,
  warpX: NoisePlane, warpY: NoisePlane, fine: NoisePlane,
  shore: { fringe: Ramp; shallow: Ramp },
): void {
  const { wetSdf, width, height } = terrain;
  let anyWater = false;
  for (let i = 0; i < wetSdf.length; i++) if (wetSdf[i] < 0) { anyWater = true; break; }
  if (!anyWater) return;

  const top = shore.fringe.length - 1;

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      // The base pass's warp, plus a tight one so the line frays pixel by pixel
      // instead of tracking the smooth facets of the interpolated field.
      const wx = px + (warpX.at(px, py) - 0.5) * 2 * WARP + (fine.at(px, py) - 0.5) * 7;
      const wy = py + (warpY.at(px, py) - 0.5) * 2 * WARP + (fine.at(px + 43, py + 91) - 0.5) * 7;
      const d = sampleField(wetSdf, width, height, t, wx, wy);
      if (d > 0.3 || d < -0.5) continue;

      const i = py * pw + px;
      const jag = grainHash(px, py);

      if (d > -0.02) {
        // Land side. A pixel or two wide at the line, frayed by a coin toss so
        // its outer edge is spiky rather than parallel to the water.
        if (d > 0.14 && jag > 0.45) continue;
        buf[i] = dither(shore.fringe, (1 - d / 0.3) * top, px, py);
      } else if (d > -0.34 && jag < 0.5) {
        // A hint of shelf just inside the water — darker than the water, never
        // brighter, so it can never read as an outline drawn around the shape.
        buf[i] = dither(shore.shallow, jag * (shore.shallow.length - 1), px, py);
      }
    }
  }
}

/**
 * The forest floor, and the litter just outside it.
 *
 * Only the ground here — the plants at the hem are `paintScrub`'s job, and the
 * canopy above is `canopy.ts`'s. What is left is the darkness under the trees,
 * which is what stops the gaps between lumps showing bright field through them,
 * and a thin scatter of fallen leaves on the ground immediately outside.
 */
function paintUndergrowth(
  buf: Uint32Array, pw: number, ph: number, t: number, terrain: TerrainInfo,
  warpX: NoisePlane, warpY: NoisePlane, detail: NoisePlane, fine: NoisePlane,
  foliage: { canopy: Ramp; shadow: number; scrub: Ramp; litter: Ramp },
): void {
  const { foliageSdf, width, height } = terrain;
  let any = false;
  for (let i = 0; i < foliageSdf.length; i++) if (foliageSdf[i] < 0) { any = true; break; }
  if (!any) return;

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      // A treeline is the raggedest edge on the map, so it gets its own,
      // larger warp on top of the shared one.
      const wx = px + (warpX.at(px, py) - 0.5) * 2 * WARP + (fine.at(px, py) - 0.5) * 9;
      const wy = py + (warpY.at(px, py) - 0.5) * 2 * WARP + (fine.at(px + 61, py + 29) - 0.5) * 9;
      const d = sampleField(foliageSdf, width, height, t, wx, wy);
      if (d > 1.6) continue;

      // Leaves do not fall on water, and a treeline's shadow across a lake is
      // the lake's business, not the ground pass's.
      const tx = (px / t) | 0, ty = (py / t) | 0;
      if (tx >= width || ty >= height) continue;
      const mat = terrain.material[ty * width + tx];
      if (mat === Material.Wet) continue;

      const i = py * pw + px;

      if (d < -0.15) {
        // Under the canopy: dark, and almost featureless. The canopy layer
        // covers most of it; this is what shows through its gaps.
        buf[i] = mix(buf[i], foliage.shadow, 0.7);
      } else if (d < 0.5) {
        // The treeline's shadow on open ground. Dithered, not blended: an alpha
        // wash reads as a semi-transparent overlay laid over the map, which is
        // an effect the hardware being imitated could not produce and the eye
        // picks out immediately.
        if (threshAt(px, py) < 0.55 * (1 - d / 0.5)) buf[i] = mix(buf[i], foliage.shadow, 0.55);
      } else if (threshAt(px, py) < 0.2 * (1 - (d - 0.5) / 1.1)) {
        // Leaf litter, thinning outward.
        buf[i] = foliage.litter[(detail.at(px, py) * foliage.litter.length) | 0];
      }
    }
  }
}

/**
 * Per-tile decoration that is genuinely tile-shaped: planks, ruts, fence rails,
 * the rings on quicksand. Drawn as shapes over the pixel bake because at this
 * scale a handful of rects beats a per-pixel branch.
 */
function paintDetails(
  g: CanvasRenderingContext2D, map: GameMap, terrain: TerrainInfo, detail: NoisePlane,
): void {
  const t = map.tile;
  const tone = (r: Ramp, i: number): string => {
    const w = r[Math.max(0, Math.min(r.length - 1, i))];
    return `rgb(${w & 0xff},${(w >> 8) & 0xff},${(w >> 16) & 0xff})`;
  };

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = tileAt(map, tx, ty);
      const x = tx * t, y = ty * t;
      const n = detail.at(x + t / 2, y + t / 2);

      if (tile === Tile.Bridge) {
        // Boards laid across the span, each a slightly different weathered tone
        // and grained along its length. A flat fill with evenly spaced dark
        // lines reads as decking in an architectural drawing.
        // Boards lie across the span: if the bridge runs east-west, the boards
        // run north-south, because that is the way you lay a deck.
        const spanEW = tileAt(map, tx - 1, ty) === Tile.Bridge || tileAt(map, tx + 1, ty) === Tile.Bridge;
        const across = !spanEW;
        for (let s2 = 0; s2 < t; s2++) {
          const board = ((across ? y + s2 : x + s2) / 3) | 0;
          const wear = ((board * 2654435761) >>> 24) / 255;
          g.fillStyle = tone(PLANKS, 1 + ((wear * 3) | 0));
          if (across) g.fillRect(x, y + s2, t, 1);
          else g.fillRect(x + s2, y, 1, t);
          // The gap between boards, and the grain within one.
          if ((across ? y + s2 : x + s2) % 3 === 0) {
            g.fillStyle = 'rgba(18,12,4,0.55)';
            if (across) g.fillRect(x, y + s2, t, 1);
            else g.fillRect(x + s2, y, 1, t);
          }
        }
        // A rail along each side of the span, which is what gives it height.
        g.fillStyle = tone(PLANKS, 4);
        const railed = (dx: number, dy: number): boolean => tileAt(map, tx + dx, ty + dy) !== Tile.Bridge;
        if (across) {
          if (railed(0, -1)) g.fillRect(x, y, t, 2);
          if (railed(0, 1)) g.fillRect(x, y + t - 2, t, 2);
        } else {
          if (railed(-1, 0)) g.fillRect(x, y, 2, t);
          if (railed(1, 0)) g.fillRect(x + t - 2, y, 2, t);
        }
      } else if (tile === Tile.Fence) {
        g.fillStyle = '#4a3c26';
        g.fillRect(x, y + 7, t, 2);
        g.fillRect(x, y + 12, t, 2);
        g.fillStyle = '#7b6743';
        g.fillRect(x, y + 6, t, 1);
        for (let px = 1; px < t; px += 5) g.fillRect(x + px, y + 3, 2, 12);
      } else if (tile === Tile.Quicksand) {
        // Concentric ripples read as "this will swallow you".
        for (let r = 2; r < 9; r += 2) {
          g.strokeStyle = r % 4 === 0 ? 'rgba(160,140,80,0.55)' : 'rgba(70,58,26,0.6)';
          g.beginPath();
          g.ellipse(x + t / 2, y + t / 2, r, r * 0.6, 0, 0, Math.PI * 2);
          g.stroke();
        }
      } else if (tile === Tile.Ice) {
        // Cracks: short bright diagonals, sparse enough to read as flaws.
        if (n > 0.52) {
          g.fillStyle = 'rgba(245,252,255,0.75)';
          const cx = x + ((n * 97) % t | 0), cy = y + ((n * 211) % t | 0);
          const len = 3 + ((n * 13) % 4 | 0);
          const dir = n > 0.7 ? 1 : -1;
          for (let s = 0; s < len; s++) g.fillRect(cx + s, cy + s * dir, 1, 1);
        }
      } else if (tile === Tile.Road) {
        // Wheel ruts: two broken tracks worn into the surface, not two solid
        // rails. Evenly-spaced full-width stripes turn a road into a barcode,
        // which is the single most machine-made thing a tile map can do.
        const vertical = tileAt(map, tx, ty - 1) === Tile.Road || tileAt(map, tx, ty + 1) === Tile.Road;
        const wander = ((detail.at(x + t / 2, y + t / 2) - 0.5) * 5) | 0;
        for (const lane of [-4, 4]) {
          for (let s2 = 0; s2 < t; s2++) {
            // Broken, wandering, and mostly absent. A rut that runs unbroken the
            // length of a road is a rail; what makes it a track is the gaps.
            const at = vertical ? y + s2 : x + s2;
            const n2 = detail.at(vertical ? x + lane : at, vertical ? at : y + lane);
            if (n2 > 0.4) continue;
            g.fillStyle = n2 < 0.22 ? 'rgba(32,25,15,0.42)' : 'rgba(52,42,28,0.24)';
            const off = t / 2 + lane + wander + (n2 * 7 | 0) - 3;
            if (vertical) g.fillRect(x + off, y + s2, 1, 1);
            else g.fillRect(x + s2, y + off, 1, 1);
          }
        }
        // Loose stones kicked out of the surface.
        if (n > 0.66) {
          g.fillStyle = 'rgba(28,22,14,0.45)';
          g.fillRect(x + ((n * 131) % t | 0), y + ((n * 197) % t | 0), 2, 1);
        }
      }
    }
  }
  void terrain;
}

/** Exposed for the renderer's canopy shadow pass. */
export const groundShadow = (theme: string): number =>
  packColor(theme === 'arctic' ? '#4a5a66' : theme === 'desert' ? '#4a4020' : '#1a2a10');

export { shade };
