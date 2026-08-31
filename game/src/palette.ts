/**
 * Ground palettes, as tone ramps rather than flat colours.
 *
 * The Amiga original never paints a flat surface. Every square inch of ground
 * is two tones of the same hue interleaved at pixel scale, and the *choice* of
 * which two drifts slowly across the map, so a field reads as a field and not
 * as a fill. Reproducing that needs a ramp per surface — four or five tones
 * from shadow to highlight — and a noise field to pick a position along it.
 *
 * Ramps are ordered dark to light. Colours are packed 0xAABBGGRR so they can be
 * written straight into a `Uint32Array` view of an ImageData buffer, which is
 * the only way per-pixel terrain baking is affordable at map scale.
 */

import { Material } from './terrain.js';
import type { Theme } from './tiles.js';

/** `#rrggbb` to the little-endian 0xAABBGGRR word canvas ImageData expects. */
export const packColor = (hex: string): number => {
  const v = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0;
};

export const unpack = (word: number): string => {
  const r = word & 0xff, g = (word >> 8) & 0xff, b = (word >> 16) & 0xff;
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

export type Ramp = Uint32Array;

const ramp = (...hex: string[]): Ramp => Uint32Array.from(hex, packColor);

/**
 * A surface: the ramp it is dithered from, how fast the tone drifts across the
 * map, and how much of the ramp a single patch spans.
 */
export interface Surface {
  ramp: Ramp;
  /** Noise frequency in tiles. Small numbers mean broad, slow blotches. */
  scale: number;
  /** How much of the ramp the drift covers, 0..1 of its length. */
  contrast: number;
  /**
   * Where the middle of the drift sits along the ramp, 0..1.
   *
   * Worth setting deliberately rather than leaving at the midpoint. A five-entry
   * ramp at bias 0.5 lands squarely *on* entry 2, so the dither has no fraction
   * to resolve and the ground comes out as a single flat tone with a little
   * noise on it. Offsetting the bias to sit between two entries is what makes
   * the pair interleave — the reference's grass is close to a 1:1 mix of its
   * two tones, and a 5:1 mix of the same two hexes just looks murky.
   */
  bias: number;
  /** Extra high-frequency speckle, 0..1. Grass wants it; ice does not. */
  grain: number;
}

const surface = (r: Ramp, over: Partial<Surface> = {}): Surface => ({
  ramp: r, scale: 0.09, contrast: 0.8, bias: 0.5, grain: 0.35, ...over,
});

/**
 * Jungle grass, sampled off the reference rather than invented.
 *
 * Two things about it are counter-intuitive, and both matter more than any
 * amount of added detail:
 *
 * **It is olive, not green.** The reference's grass alternates `#526b21` and
 * `#949429`. Red climbs to meet green and blue falls to almost nothing — hue
 * around 60°, not the 110° leaf-green that a palette named "jungle" reaches
 * for. A blue-shifted emerald reads as a modern strategy game from across the
 * room, whatever else is right about it.
 *
 * **The two dither tones sit far apart.** That `#526b21`/`#949429` pair is a
 * ~50% step in relative luminance. Interleaving tones a few percent apart just
 * averages back to one flat colour; the visible vibration *is* the texture. So
 * these ramps are deliberately short, which forces neighbouring entries wide.
 */
const JUNGLE_GRASS = ramp('#2b3a0f', '#3f5216', '#526b21', '#949429', '#aba838');
const DESERT_GRASS = ramp('#5e5322', '#7d6d2c', '#9d8a38', '#c4ad5c', '#ddc87e');
/** Snow is cyan, not grey: blue and green together, red trailing well behind. */
const ARCTIC_GRASS = ramp('#6e929c', '#8bb0b9', '#a9c9d0', '#bcdde2', '#dcf0f3');

const SURFACES: Record<Theme, Partial<Record<Material, Surface>>> = {
  jungle: {
    [Material.Ground]: surface(JUNGLE_GRASS, { scale: 0.045, contrast: 0.52, bias: 0.615, grain: 0.42 }),
    [Material.Sand]: surface(ramp('#6b5a28', '#8d7836', '#ab9448', '#c9b165', '#ddc98a'), { grain: 0.6 }),
    [Material.Wet]: surface(ramp('#08203a', '#0e3457', '#154a76', '#1d6296', '#2a7cb4'), { scale: 0.11, contrast: 0.75, grain: 0.2 }),
    [Material.Stone]: surface(ramp('#2a2e22', '#3e4433', '#565c46', '#6e755c', '#878e74'), { grain: 0.7 }),
    [Material.Built]: surface(ramp('#241f14', '#3a3221', '#544a32', '#6e6144', '#877858'), { grain: 0.6 }),
    [Material.Ice]: surface(ramp('#88aebc', '#a3c6d1', '#bcdce4', '#d2ecf1', '#e8f8fa'), { grain: 0.14 }),
    [Material.Road]: surface(ramp('#3a3325', '#514736', '#6a5e48', '#84765c', '#9c8d70'), { scale: 0.16, grain: 0.75 }),
  },
  desert: {
    [Material.Ground]: surface(DESERT_GRASS, { scale: 0.045, contrast: 0.52, bias: 0.62, grain: 0.42 }),
    // Sand is the one surface allowed to stay nearly smooth: it is the contrast
    // against everything rougher that makes a desert read as a desert.
    [Material.Sand]: surface(ramp('#8a7338', '#a88f48', '#c4a95c', '#dcc47c', '#eedaa0'), { scale: 0.05, contrast: 0.85, grain: 0.5 }),
    [Material.Wet]: surface(ramp('#0e3049', '#154566', '#1e5c88', '#2874a8', '#348dc6'), { scale: 0.11, grain: 0.2 }),
    [Material.Stone]: surface(ramp('#463c26', '#61543a', '#7c6d4f', '#968666', '#ad9d80'), { grain: 0.7 }),
    [Material.Built]: surface(ramp('#332b1a', '#4c4128', '#665738', '#7f6e4a', '#98865f'), { grain: 0.6 }),
    [Material.Ice]: surface(ramp('#a9bfc7', '#bacfd6', '#cadde3', '#d9e9ee', '#e8f4f7'), { grain: 0.12 }),
    [Material.Road]: surface(ramp('#514026', '#6b5a36', '#87744a', '#a08c60', '#b8a37a'), { scale: 0.16, grain: 0.75 }),
  },
  /**
   * Arctic. Snow is not white — the reference washes it blue in shadow and
   * only reaches near-white on the crests, which is what keeps a snowfield
   * from reading as blank paper.
   */
  arctic: {
    [Material.Ground]: surface(ARCTIC_GRASS, { scale: 0.04, contrast: 0.66, bias: 0.66, grain: 0.34 }),
    [Material.Sand]: surface(ramp('#5e7079', '#7a8d96', '#96a9b2', '#b2c5cd', '#cee0e6'), { grain: 0.35 }),
    // Arctic water is the most saturated thing on the map on purpose: in the
    // reference it is the one colour that says "this is a hole, not a floor".
    [Material.Wet]: surface(ramp('#08375f', '#0d4a7d', '#135e9b', '#1a74b8', '#2489d2'), { scale: 0.1, contrast: 0.62, grain: 0.14 }),
    // Near-black rock. The reference's arctic gets its brightness from having a
    // real black in the frame; without one, the snow is only paper.
    [Material.Stone]: surface(ramp('#10171c', '#1e2a31', '#2f3f48', '#45575f', '#5d7078'), { grain: 0.7 }),
    [Material.Built]: surface(ramp('#181f26', '#28323a', '#3a464f', '#4d5a64', '#616f79'), { grain: 0.55 }),
    // Ice is not paler snow, it is a different material: bluer, glassier, and
    // smoother, because what makes it read is the absence of the snow's grain
    // rather than a shift in brightness. Two patches of near-identical tone
    // separated only by a soft edge read as a translucent overlay.
    [Material.Ice]: surface(ramp('#2f6d8e', '#4a8cad', '#6fabc7', '#98c9de', '#c8e8f4'), { scale: 0.15, contrast: 1, bias: 0.62, grain: 0.05 }),
    [Material.Road]: surface(ramp('#3d4a52', '#54636b', '#6b7b84', '#82929b', '#99a9b2'), { scale: 0.16, grain: 0.55 }),
  },
};

export const surfaceFor = (theme: Theme, material: Material): Surface =>
  SURFACES[theme][material] ?? SURFACES.jungle[Material.Ground]!;

/**
 * Foliage. Three ramps per theme: the canopy proper, the shadowed underside
 * that separates one clump from the next, and the hem.
 *
 * The hem is the detail that makes the original recognisable at a glance. Every
 * treeline in the game is skirted in dark red-brown scrub, and without it a
 * forest is just a green shape on green ground.
 */
export interface FoliagePalette {
  canopy: Ramp;
  shadow: number;
  /** Undergrowth at the hem: dark, then the brighter flecks over it. */
  scrub: Ramp;
  /** Litter scattered on the ground just outside the treeline. */
  litter: Ramp;
}

const FOLIAGE: Record<Theme, FoliagePalette> = {
  jungle: {
    // Straight off the reference: `#404000`, `#606010`, `#808010` — red equal
    // to green and blue at almost nothing — bottoming out in a near-black.
    canopy: ramp('#0a1200', '#1a2404', '#2c3406', '#404000', '#565608', '#6c6c10', '#808010', '#9a9a24'),
    shadow: packColor('#0a1002'),
    /** Crimson, and used as a plant rather than as an outline. */
    scrub: ramp('#4a0d02', '#701a04', '#9c2806', '#c04010'),
    litter: ramp('#3a4a10', '#54601a', '#8c2408'),
  },
  desert: {
    canopy: ramp('#141a04', '#242c06', '#38400a', '#4c520c', '#626610', '#787c18', '#8e9224', '#a4a838'),
    shadow: packColor('#120e02'),
    scrub: ramp('#3a1e04', '#5c3208', '#824a10', '#a4661c'),
    litter: ramp('#5e5228', '#776834', '#7a4a16'),
  },
  arctic: {
    // Near-black, with just enough blue left in it to stay cold rather than
    // muddy. This is the mass that gives an arctic map its value range.
    canopy: ramp('#000000', '#04080b', '#0c141a', '#182430', '#26343f', '#36464e', '#46585f', '#586b73'),
    shadow: packColor('#000000'),
    scrub: ramp('#1a1008', '#2e1e10', '#452e1c', '#5c4028'),
    litter: ramp('#48585f', '#647880', '#2e1e10'),
  },
};

export const foliageFor = (theme: Theme): FoliagePalette => FOLIAGE[theme];

/**
 * Crag. Rock is baked as a mass for the same reason foliage is: one boulder
 * sprite per tile turns an outcrop into a wall of near-identical stones laid in
 * rows, which is exactly as obvious as a wall of near-identical trees was.
 *
 * `cap` is what catches on the upper surfaces — snow in the arctic, dust in the
 * desert, moss in the jungle. Without it an arctic crag is a flat silhouette;
 * the reference's are capped in bright blue-white and that is what gives them
 * their shape against the drifts.
 */
export interface StonePalette {
  face: Ramp;
  cap: number;
  shadow: number;
}

const STONE: Record<Theme, StonePalette> = {
  jungle: {
    face: ramp('#14170f', '#242a1c', '#383f2c', '#4e563e', '#666e52', '#7f8768', '#98a081'),
    cap: packColor('#404000'),
    shadow: packColor('#0d1008'),
  },
  desert: {
    face: ramp('#231d10', '#3a301c', '#524529', '#6c5c38', '#877449', '#a28d5e', '#bca877'),
    cap: packColor('#c4a95c'),
    shadow: packColor('#171208'),
  },
  arctic: {
    // Near-black basalt with a bright snow cap: the strongest value contrast on
    // an arctic map, and the reason its snow reads as bright at all.
    face: ramp('#000000', '#050a10', '#101a24', '#1e2c38', '#2e3f4c', '#405260', '#546877'),
    cap: packColor('#eefaff'),
    shadow: packColor('#000000'),
  },
};

export const stoneFor = (theme: Theme): StonePalette => STONE[theme];

/**
 * Shorelines.
 *
 * The reference does not band its edges. Snow meets water through one to three
 * pixels of near-black spiky fringe and then straight into saturated blue —
 * there is no grey transition and no white outline stroke anywhere in it.
 *
 * Drawn as three concentric bands instead, an edge stops reading as an edge and
 * starts reading as a contour line on a map key: pale ground, a wide flat mid
 * band, a bright outline, then the fill. That is a topographic legend, not a
 * coastline, and it was the single loudest machine-made artefact in the whole
 * render before this became one narrow dark line.
 */
export interface ShorePalette {
  /** The fringe on the land side, one to three pixels of it. Dark. */
  fringe: Ramp;
  /** A hint of shelf just inside the water. Subtle, and never brighter than the land. */
  shallow: Ramp;
}

const SHORE: Record<Theme, ShorePalette> = {
  jungle: {
    // Wet silt and root litter: near-black, with the game's crimson in it.
    fringe: ramp('#140c02', '#2e1604', '#4c1c04', '#6b2606'),
    shallow: ramp('#123c5c', '#1a4f74'),
  },
  desert: {
    fringe: ramp('#1c1405', '#382a0c', '#544012', '#6e5418'),
    shallow: ramp('#154a6c', '#1e5f88'),
  },
  arctic: {
    // Wet rock at the waterline, almost black against both the snow and the sea.
    fringe: ramp('#04070c', '#0b1219', '#152029', '#20303c'),
    shallow: ramp('#0a4272', '#10558e'),
  },
};

export const shoreFor = (theme: Theme): ShorePalette => SHORE[theme];

/** Tone ramp for the tile a bridge's planks are cut from. */
export const PLANKS = ramp('#3d2c17', '#4f3a1f', '#634a29', '#7a5d34', '#916f3f');

/**
 * 8x8 ordered dither. The classic Bayer matrix, normalised to 0..1: comparing
 * a fractional tone against `BAYER[y%8][x%8]` is what turns a smooth gradient
 * into two interleaved palette entries.
 */
const BAYER_RAW = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];
export const BAYER = Float32Array.from(BAYER_RAW, (v) => (v + 0.5) / 64);

/** Fine 2x2 checker, for the tight pixel-scale interleave the Amiga favours. */
export const CHECKER = Float32Array.from([0.25, 0.75, 0.75, 0.25]);

/**
 * Bayer thresholds with a fixed per-pixel jitter folded in.
 *
 * Pure Bayer at around 50% coverage is a perfect grid, and a perfect grid over
 * a whole field reads as a screen door rather than as ground. Perturbing each
 * threshold by a hash of its position keeps the tone exact and the ordering
 * roughly Bayer, while breaking the eye's ability to lock onto the lattice.
 */
const JITTER = 0.34;
export const THRESH = (() => {
  const size = 64;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = (x * 374761393 + y * 668265263) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      const b = BAYER[(y & 7) * 8 + (x & 7)];
      out[y * size + x] = Math.min(0.999, Math.max(0.001, b + (r - 0.5) * JITTER));
    }
  }
  return out;
})();

/** Threshold for a pixel, from the jittered 64x64 tile. */
export const threshAt = (x: number, y: number): number => THRESH[(y & 63) * 64 + (x & 63)];

/**
 * Picks a ramp entry for a pixel. `level` is a position along the ramp in
 * 0..ramp.length-1; the fractional part is resolved by dithering against the
 * Bayer threshold for this pixel, so adjacent tones interleave rather than
 * banding.
 */
export function dither(r: Ramp, level: number, x: number, y: number): number {
  const top = r.length - 1;
  const l = level <= 0 ? 0 : level >= top ? top : level;
  const i = l | 0;
  if (i >= top) return r[top];
  return threshAt(x, y) < l - i ? r[i + 1] : r[i];
}

/** As `dither`, but on the tight 2x2 checker. */
export function ditherFine(r: Ramp, level: number, x: number, y: number): number {
  const top = r.length - 1;
  const l = level <= 0 ? 0 : level >= top ? top : level;
  const i = l | 0;
  if (i >= top) return r[top];
  return CHECKER[(y & 1) * 2 + (x & 1)] < l - i ? r[i + 1] : r[i];
}

/** Darkens a packed colour towards black by `amount` in 0..1. */
export function shade(word: number, amount: number): number {
  const k = 1 - amount;
  const r = (word & 0xff) * k;
  const g = ((word >> 8) & 0xff) * k;
  const b = ((word >> 16) & 0xff) * k;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/** Mixes two packed colours; `t` of 0 is `a`. */
export function mix(a: number, b: number, t: number): number {
  const ar = a & 0xff, ag = (a >> 8) & 0xff, ab = (a >> 16) & 0xff;
  const br = b & 0xff, bg = (b >> 8) & 0xff, bb = (b >> 16) & 0xff;
  const r = (ar + (br - ar) * t) | 0;
  const g = (ag + (bg - ag) * t) | 0;
  const bl = (ab + (bb - ab) * t) | 0;
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0;
}
