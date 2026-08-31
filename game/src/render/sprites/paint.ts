/**
 * The kit every sprite is built from: a canvas, a pixel, a rectangle, an
 * outline pass, and the deterministic noise that makes scenery vary without
 * flickering -- plus the palettes, which are the game's colour vocabulary.
 *
 * Nothing in here knows what it is drawing. Everything that does imports it.
 */

export type Sprite = HTMLCanvasElement;

export interface Palette {
  outline: string;
  /** The crown, catching the light from directly above. The brightest pixel. */
  helmetLight: string;
  helmet: string;
  /** The brim, and the back of the head when he is walking away. */
  helmetDark: string;
  face: string;
  faceDark: string;
  /** The body, which is nearly black. Kit is what you actually read. */
  body: string;
  bodyLight: string;
  /** Webbing, pouches, a rolled blanket: scattered flecks of contrast. */
  kit: string;
  kitAlt: string;
  boots: string;
  gun: string;
}


/**
 * Unit palettes.
 *
 * Two things about the original's men are worth stating outright, because both
 * are counter-intuitive and both are why ours looked like toy soldiers before:
 *
 * **A soldier is a bright hat on a black body.** Not a uniformly coloured
 * figure. The helmet crown is close to the brightest thing on screen, the face
 * is a small hot orange patch under it, and everything below the collar is
 * near-black with a handful of contrasting kit pixels scattered through it. The
 * value range inside one 13-pixel-wide sprite is nearly the full range of the
 * palette.
 *
 * **Separation, not realism.** The ground is a strong olive and the canopy a
 * dark one, so anything khaki disappears into it — which is why the reference
 * dresses its garrison in cold blue. Your own men stay green, close enough to
 * the grass to feel exposed and light enough to count at a glance.
 */
export const PALETTES = {
  player: {
    outline: '#0a1204',
    helmetLight: '#c4d472',
    helmet: '#5e8c2c',
    helmetDark: '#2a4014',
    face: '#e89848',
    faceDark: '#a05020',
    body: '#2a4014',
    bodyLight: '#4a7024',
    kit: '#8ad655',
    kitAlt: '#d8c060',
    boots: '#100c08',
    gun: '#14181c',
  },
  enemy: {
    outline: '#05070c',
    helmetLight: '#c8d4e8',
    helmet: '#5a72a0',
    helmetDark: '#1e2840',
    face: '#dc8c40',
    faceDark: '#94481c',
    body: '#22304e',
    bodyLight: '#3f5480',
    kit: '#6a86bc',
    kitAlt: '#c0a048',
    boots: '#0a0a10',
    gun: '#14181c',
  },
  /*
   * Camouflage: dark jungle greens, pitched *below* the grass rather than at it.
   *
   * Matching the grass exactly would have made him invisible rather than hard to
   * see, and matching it approximately would have made him look like one of your
   * own -- the squad is green too. So he sits in the tone of tree shadow: he
   * disappears against the canopy and the dark half of a field, reads as a
   * silhouette on open ground, and never reads as yours, because yours are a
   * lighter green with a lime kit and rank pips over their heads.
   */
  camo: {
    outline: '#060a04',
    helmetLight: '#6a8438',
    helmet: '#3a5220',
    helmetDark: '#182608',
    face: '#b4763a',
    faceDark: '#6e3c14',
    body: '#1f3210',
    bodyLight: '#33501c',
    kit: '#4a5f28',
    kitAlt: '#5c5424',
    boots: '#080c04',
    gun: '#14181c',
  },
  sniper: {
    outline: '#080a0e',
    helmetLight: '#b0b8c8',
    helmet: '#4a5060',
    helmetDark: '#1d2028',
    face: '#c88040',
    faceDark: '#84441c',
    body: '#232830',
    bodyLight: '#3d434f',
    kit: '#616978',
    kitAlt: '#8c3038',
    boots: '#0a0a0c',
    gun: '#0e1014',
  },
  /*
   * The officer.
   *
   * He has to be pickable out of a crowd of riflemen at thirteen pixels, and
   * the only levers that read at that size are the helmet and the torso -- kit
   * detail is two pixels and disappears. So he gets a peaked cap in near-black
   * against a pale band, which is the highest-contrast thing on the sprite and
   * sits where the eye already looks, and a dress tunic several steps darker
   * and bluer than a rifleman's field green. The gold collar is one pixel and
   * is a bonus, not the tell.
   */
  officer: {
    outline: '#07080c',
    helmetLight: '#8d939e',
    helmet: '#1a1d26',
    helmetDark: '#0b0d12',
    face: '#d08848',
    faceDark: '#8c4c1e',
    body: '#1d2a22',
    bodyLight: '#33463a',
    kit: '#c8a84c',
    kitAlt: '#8e1f24',
    boots: '#08080a',
    gun: '#101418',
  },

  bazooka: {
    outline: '#0c0603',
    helmetLight: '#e8a878',
    helmet: '#9c3a20',
    helmetDark: '#4a2013',
    face: '#dc8c40',
    faceDark: '#94481c',
    body: '#3a1a0e',
    bodyLight: '#6a3020',
    kit: '#c25438',
    kitAlt: '#d8b048',
    boots: '#100806',
    gun: '#14181c',
  },
  hostage: {
    outline: '#100e0a',
    helmetLight: '#f4ecd4',
    helmet: '#b8a882',
    helmetDark: '#6b5029',
    face: '#e89848',
    faceDark: '#a05020',
    body: '#5c5442',
    bodyLight: '#8c8268',
    kit: '#cfc4a6',
    kitAlt: '#9c8a5c',
    boots: '#2a2018',
    gun: '#00000000',
  },
} satisfies Record<string, Palette>;

export const makeCanvas = (w: number, h: number): { c: Sprite; g: CanvasRenderingContext2D } => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return { c, g };
};

/** A single opaque pixel. Everything in this file is built from these. */
export const px = (g: CanvasRenderingContext2D, x: number, y: number, color: string): void => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
};

export const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

/**
 * Adds a 1px hard outline around every opaque cluster, the way the original art
 * reads at this size. Done as a post-pass so the drawing code never has to
 * think about silhouettes.
 */
export function addOutline(c: Sprite, color: string): void {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const src = img.data;
  const alpha = new Uint8Array(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = src[i * 4 + 3] > 8 ? 1 : 0;

  const [r, gg, b] = hexToRgb(color);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = y * c.width + x;
      if (alpha[i]) continue;
      const touches =
        (x > 0 && alpha[i - 1]) ||
        (x < c.width - 1 && alpha[i + 1]) ||
        (y > 0 && alpha[i - c.width]) ||
        (y < c.height - 1 && alpha[i + c.width]);
      if (!touches) continue;
      const o = i * 4;
      src[o] = r; src[o + 1] = gg; src[o + 2] = b; src[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

export const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];


/** Deterministic per-instance noise, so scenery varies but never flickers. */
export const hashRnd = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

