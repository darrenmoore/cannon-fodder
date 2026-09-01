/**
 * Derived terrain metadata.
 *
 * The map format stays one character per tile — that is what makes a mission
 * hand-editable — but one character is nowhere near enough to draw from. A tile
 * that knows only "I am grass" can only be painted as a square of grass, and a
 * grid of squares is exactly what the original does not look like.
 *
 * So the richness is computed, not authored. At load time every tile learns
 * where it sits in the shape it belongs to: which contiguous mass, how deep
 * inside it, which neighbours match, and where the nearest edge lies in
 * sub-tile precision. A renderer holding that can draw a forest as one organic
 * silhouette with scrub around its hem, rather than as N identical trees.
 *
 * All of it is O(tiles) and runs once per map load.
 */

import { tileAt } from '../sim/map.js';
import { Tile } from '../sim/tiles.js';
import type { GameMap } from '../sim/map.js';

/**
 * What a tile is made of, for drawing purposes. Coarser than `Tile`: the
 * renderer wants to know "is my neighbour also wet", not "is my neighbour also
 * specifically shallow water".
 */
export enum Material {
  Ground = 0,
  Sand = 1,
  Wet = 2,
  Stone = 3,
  Built = 4,
  Ice = 5,
  Road = 6,
  /**
   * Quicksand. Its own material and not sand's (200-qa 002): sharing sand's
   * meant the sink's 693-tile bog took sand's near-smooth ramp *and* its wind
   * ripples, and the domain warp could not fray a boundary between two tiles
   * of the same material -- so the hazard was invisible except for its crust
   * rings, which tiled.
   */
  Mud = 7,
}

/** The surface painted under a tile, ignoring anything standing on it. */
export function materialOf(tile: Tile): Material {
  switch (tile) {
    case Tile.Water: case Tile.DeepWater: return Material.Wet;
    case Tile.Sand: return Material.Sand;
    case Tile.Quicksand: return Material.Mud;
    case Tile.Rock: return Material.Stone;
    case Tile.Rubble: case Tile.Bridge: case Tile.Tent: return Material.Built;
    // A hut's sprite covers its own footprint, so the ground under it is just
    // ground. Painting it as masonry leaves a hard grey square poking out from
    // behind every building on the map.
    case Tile.Hut: case Tile.Factory: return Material.Ground;
    case Tile.Ice: return Material.Ice;
    case Tile.Road: return Material.Road;
    default: return Material.Ground;
  }
}

/**
 * Tiles that read as one canopy mass. Trees and tall grass are drawn as a
 * single blanket of foliage rather than as individual plants, so they share a
 * mass even though they play completely differently.
 */
const isFoliage = (tile: Tile): boolean => tile === Tile.Tree || tile === Tile.TallGrass;

const MAX_DEPTH = 31;

export interface TerrainInfo {
  width: number;
  height: number;
  /** Coarse material per tile. */
  material: Uint8Array;
  /**
   * How deep inside its own material a tile sits, in tiles. 0 means it touches
   * something different; 1 means its neighbours do. Capped at 31.
   */
  depth: Uint8Array;
  /** 1 where the tile carries tree or tall-grass foliage. */
  foliage: Uint8Array;
  /** As `depth`, but for the foliage blanket. 0 for tiles with no foliage. */
  canopyDepth: Uint8Array;
  /**
   * Distance in tiles from a *bare* tile to the nearest foliage. 1 for a tile
   * touching the treeline. Lets scrub and leaf litter spill outward past the
   * hem instead of stopping dead on the tile boundary.
   */
  canopyNear: Uint8Array;
  /** Contiguous same-material region id, or -1. Regions are 4-connected. */
  mass: Int32Array;
  /** Tile count of each mass, indexed by mass id. */
  massSize: Int32Array;
  /** 8-neighbour "same material" bitmask: N,NE,E,SE,S,SW,W,NW from bit 0. */
  bits: Uint8Array;
  /** Foliage equivalent of `bits`, for shaping the canopy silhouette. */
  canopyBits: Uint8Array;
  /**
   * Signed distance in tiles to the water's edge: negative inside water,
   * positive on land, zero on the line. Sampling this bilinearly and warping
   * the sample point with noise is what turns a staircase of square tiles into
   * a curved shore that owes nothing to the grid.
   */
  wetSdf: Float32Array;
  /** As `wetSdf`, for the foliage blanket. */
  foliageSdf: Float32Array;
  /**
   * As `wetSdf`, for tree cover alone. Trees bake into one canopy mass; tall
   * grass stays a per-tile sprite so it can still move in the wind, so the two
   * need separate shapes even though they share a hem.
   */
  treeSdf: Float32Array;
  /** 1 where the tile is a tree. */
  tree: Uint8Array;
  /**
   * As `wetSdf`, for tall grass. Baked into the same layer as the canopy but
   * with its own, shorter texture — drawing it as one sprite per tile put a
   * readable repeating glyph on a 16px lattice across whole missions.
   */
  grassSdf: Float32Array;
  /** 1 where the tile is tall grass. */
  tallGrass: Uint8Array;
  /** As `wetSdf`, for solid rock. */
  stoneSdf: Float32Array;
  /** Stable per-map noise, sampled in world pixels. */
  noise: Noise;
}

/**
 * Value noise with fractal octaves. Not the fastest possible, but this runs
 * once per map bake and per-pixel over a few million pixels — a lookup table
 * and integer hashing keep it to well under a frame's worth of work.
 */
export class Noise {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const order = new Uint8Array(256);
    for (let i = 0; i < 256; i++) order[i] = i;
    // Fisher-Yates from a seeded xorshift, so a map's texture is reproducible.
    let s = (seed * 2654435761) >>> 0 || 1;
    const rnd = (): number => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = order[i & 255];
  }

  /** Single octave, in 0..1. */
  value(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    // Smoothstep, so cells blend without visible diamond artefacts.
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const p = this.perm;
    const a = p[(p[xi & 255] + (yi & 255)) & 255] / 255;
    const b = p[(p[(xi + 1) & 255] + (yi & 255)) & 255] / 255;
    const c = p[(p[xi & 255] + ((yi + 1) & 255)) & 255] / 255;
    const d = p[(p[(xi + 1) & 255] + ((yi + 1) & 255)) & 255] / 255;
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }

  /** Summed octaves, in 0..1. */
  fbm(x: number, y: number, octaves = 3, lacunarity = 2.13, gain = 0.5): number {
    let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (let i = 0; i < octaves; i++) {
      sum += this.value(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity; fy *= lacunarity;
    }
    return sum / norm;
  }
}

/**
 * The eight neighbours of a cell, clipped to the grid. Distances measured
 * through eight neighbours are Chebyshev, which grows a mass as a rounded blob;
 * measuring through four grows it as a diamond, and a map full of diamonds is
 * unmistakable.
 */
function around(i: number, w: number, h: number): number[] {
  const x = i % w, y = (i / w) | 0;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      out.push(ny * w + nx);
    }
  }
  return out;
}

/**
 * Multi-source BFS: fills `out` with the distance from every tile of interest
 * to the nearest tile that is *not* of interest. Distance 0 means "on the
 * boundary". Tiles that are not of interest stay 0.
 */
function depthField(w: number, h: number, inside: Uint8Array, out: Uint8Array): void {
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      // A tile on the map edge counts as bounded, so masses hug the border.
      let boundary = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (!boundary) for (const nb of around(i, w, h)) if (!inside[nb]) { boundary = true; break; }
      if (boundary) { out[i] = 1; queue[tail++] = i; }
    }
  }

  while (head < tail) {
    const i = queue[head++];
    const d = out[i];
    if (d >= MAX_DEPTH) continue;
    for (const n of around(i, w, h)) {
      if (!inside[n] || out[n] !== 0) continue;
      out[n] = d + 1;
      queue[tail++] = n;
    }
  }
  // Shift so a boundary tile reads 0, which is the more natural thing to test.
  for (let i = 0; i < out.length; i++) if (out[i] > 0) out[i]--;
}

/** Outward distance: how far each *empty* tile is from the nearest filled one. */
function outwardField(w: number, h: number, inside: Uint8Array, limit: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let i = 0; i < inside.length; i++) if (inside[i]) queue[tail++] = i;

  while (head < tail) {
    const i = queue[head++];
    const d = out[i];
    if (d >= limit) continue;
    for (const n of around(i, w, h)) {
      if (inside[n] || out[n] !== 0) continue;
      out[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return out;
}

/**
 * A signed distance field in tiles, from inward and outward BFS distances.
 * Negative inside the set, positive outside, and the zero crossing sits on the
 * boundary between the two rows of tiles rather than on either one's edge —
 * which is what lets a caller threshold it and get a line down the middle.
 */
function signedField(w: number, h: number, inside: Uint8Array, limit: number): Float32Array {
  const n = w * h;
  const inDepth = new Uint8Array(n);
  depthField(w, h, inside, inDepth);
  const outDist = outwardField(w, h, inside, limit);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = inside[i] ? -(inDepth[i] + 0.5) : (outDist[i] === 0 ? limit + 0.5 : outDist[i] - 0.5);
  }
  return out;
}

/**
 * Bilinear sample of a tile-resolution field at a world-pixel position. Tile
 * values are treated as sitting at tile centres, so the interpolation is
 * smooth across a boundary instead of stepping at it.
 */
export function sampleField(
  field: Float32Array, w: number, h: number, tile: number, px: number, py: number,
): number {
  const fx = px / tile - 0.5;
  const fy = py / tile - 0.5;
  let x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const cx = (v: number): number => (v < 0 ? 0 : v > w - 1 ? w - 1 : v);
  const cy = (v: number): number => (v < 0 ? 0 : v > h - 1 ? h - 1 : v);
  const x1 = cx(x0 + 1), y1 = cy(y0 + 1);
  x0 = cx(x0); y0 = cy(y0);
  const a = field[y0 * w + x0], b = field[y0 * w + x1];
  const c = field[y1 * w + x0], d = field[y1 * w + x1];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export function analyseTerrain(map: GameMap): TerrainInfo {
  const w = map.width, h = map.height;
  const n = w * h;

  const material = new Uint8Array(n);
  const foliage = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tileAt(map, x, y);
      const i = y * w + x;
      material[i] = materialOf(tile);
      foliage[i] = isFoliage(tile) ? 1 : 0;
    }
  }

  // Depth per material, one BFS each. Six passes over the grid is nothing
  // against how much the result buys the renderer.
  const depth = new Uint8Array(n);
  const scratchIn = new Uint8Array(n);
  const scratchOut = new Uint8Array(n);
  const materials = new Set(material);
  for (const m of materials) {
    scratchIn.fill(0);
    scratchOut.fill(0);
    for (let i = 0; i < n; i++) scratchIn[i] = material[i] === m ? 1 : 0;
    depthField(w, h, scratchIn, scratchOut);
    for (let i = 0; i < n; i++) if (scratchIn[i]) depth[i] = scratchOut[i];
  }

  const canopyDepth = new Uint8Array(n);
  depthField(w, h, foliage, canopyDepth);
  const canopyNear = outwardField(w, h, foliage, 6);

  const wet = new Uint8Array(n);
  for (let i = 0; i < n; i++) wet[i] = material[i] === Material.Wet ? 1 : 0;
  const stone = new Uint8Array(n);
  for (let i = 0; i < n; i++) stone[i] = material[i] === Material.Stone ? 1 : 0;
  const tree = new Uint8Array(n);
  const tallGrass = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tileAt(map, x, y);
      tree[y * w + x] = tile === Tile.Tree ? 1 : 0;
      tallGrass[y * w + x] = tile === Tile.TallGrass ? 1 : 0;
    }
  }

  // Flood fill contiguous same-material regions.
  const mass = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (mass[start] !== -1) continue;
    const id = sizes.length;
    const m = material[start];
    let count = 0, sp = 0;
    stack[sp++] = start;
    mass[start] = id;
    while (sp > 0) {
      const i = stack[--sp];
      count++;
      const x = i % w;
      for (const nb of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (nb < 0 || nb >= n) continue;
        if (mass[nb] !== -1 || material[nb] !== m) continue;
        mass[nb] = id;
        stack[sp++] = nb;
      }
    }
    sizes.push(count);
  }

  const bits = new Uint8Array(n);
  const canopyBits = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let b = 0, cb = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + NEIGHBOURS[k][0], ny = y + NEIGHBOURS[k][1];
        // Off-map counts as matching, so masses do not get a false hem at the
        // border of a map that is meant to continue past the screen.
        const off = nx < 0 || ny < 0 || nx >= w || ny >= h;
        const j = off ? -1 : ny * w + nx;
        if (off || material[j] === material[i]) b |= 1 << k;
        if (!off && foliage[j]) cb |= 1 << k;
      }
      bits[i] = b;
      canopyBits[i] = cb;
    }
  }

  return {
    width: w, height: h,
    material, foliage, depth, canopyDepth, canopyNear,
    wetSdf: signedField(w, h, wet, 6),
    foliageSdf: signedField(w, h, foliage, 6),
    tree, treeSdf: signedField(w, h, tree, 6),
    tallGrass, grassSdf: signedField(w, h, tallGrass, 5),
    stoneSdf: signedField(w, h, stone, 4),
    mass, massSize: Int32Array.from(sizes), bits, canopyBits,
    // Texture is keyed to the mission id, so a map always looks like itself.
    noise: new Noise([...map.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)),
  };
}

/** Convenience readers that clamp off-map to something sensible. */
export const depthAt = (t: TerrainInfo, x: number, y: number): number =>
  x < 0 || y < 0 || x >= t.width || y >= t.height ? MAX_DEPTH : t.depth[y * t.width + x];

export const canopyDepthAt = (t: TerrainInfo, x: number, y: number): number =>
  x < 0 || y < 0 || x >= t.width || y >= t.height ? 0 : t.canopyDepth[y * t.width + x];

export const canopyNearAt = (t: TerrainInfo, x: number, y: number): number =>
  x < 0 || y < 0 || x >= t.width || y >= t.height ? 0 : t.canopyNear[y * t.width + x];

export const materialAt = (t: TerrainInfo, x: number, y: number): Material =>
  x < 0 || y < 0 || x >= t.width || y >= t.height ? Material.Ground : t.material[y * t.width + x];

/** True where a tile carries tree or tall-grass foliage. */
export const hasFoliage = (t: TerrainInfo, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < t.width && y < t.height && t.foliage[y * t.width + x] === 1;
