/**
 * The sprite bakery.
 *
 * Nothing here is loaded from disk. Every sprite is plotted pixel by pixel into
 * a small offscreen canvas at boot, at 1x world scale, and blitted with
 * smoothing off so integer camera zoom stays crisp. Soldiers are drawn
 * parametrically from a facing angle rather than hand-authored per direction,
 * so all eight facings and the walk cycle come from one routine -- and a palette
 * swap is all that separates our men from theirs.
 *
 * Foliage is baked in two pieces, trunk and canopy, so the renderer can offset
 * the canopy alone and let the trees move in the wind.
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

const SOLDIER_W = 13;
const SOLDIER_H = 15;
/** Where the sprite sits relative to the actor position (its feet). */
export const SOLDIER_ANCHOR = { x: 6, y: 12 };

export const FACINGS = 8;
/** How many differently-kitted men each unit type is baked in. */
export const UNIT_VARIANTS = 4;
export const WALK_FRAMES = 4;

const makeCanvas = (w: number, h: number): { c: Sprite; g: CanvasRenderingContext2D } => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return { c, g };
};

/** A single opaque pixel. Everything in this file is built from these. */
const px = (g: CanvasRenderingContext2D, x: number, y: number, color: string): void => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
};

const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

/**
 * Adds a 1px hard outline around every opaque cluster, the way the original art
 * reads at this size. Done as a post-pass so the drawing code never has to
 * think about silhouettes.
 */
function addOutline(c: Sprite, color: string): void {
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

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * One soldier, seen from a high three-quarter angle.
 *
 * `facing` is 0..7 clockwise from south (toward the viewer), matching
 * `facingIndex`. `frame` drives the leg swing. `weapon` picks the silhouette:
 * a rifle stub, a long sniper barrel, or a fat launcher tube. `variant` is the
 * man himself — see below.
 *
 * The construction matters more than the palette here. Three rules, all taken
 * off the original, and all of them things the first version of this function
 * broke:
 *
 * **Light comes from straight above.** So the sprite is a bright dome of helmet
 * over a hot little face over a near-black body. A figure shaded evenly in its
 * uniform colour reads as a toy; the value range inside these thirteen pixels
 * is nearly the whole palette.
 *
 * **Nothing is symmetrical.** Stacked rectangles with matching shoulders look
 * machined. Kit hangs off one side, the shoulders differ, and the helmet's
 * highlight sits off-centre.
 *
 * **Detail is scattered pixels, not shading.** What you actually read at this
 * size is a handful of contrasting flecks — webbing, a pouch, a strap — against
 * the dark mass. Smooth bands across the torso read as nothing at all.
 */
function bakeSoldier(
  pal: Palette, facing: number, frame: number,
  weapon: 'rifle' | 'long' | 'tube' | 'none', variant = 0,
): Sprite {
  const { c, g } = makeCanvas(SOLDIER_W, SOLDIER_H);
  const angle = (facing / FACINGS) * Math.PI * 2 + Math.PI / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const cx = 6;

  // The man's own kit layout. Stable per variant, so a given soldier looks the
  // same from every angle and in every frame, and six of them in a squad are
  // six different men rather than one man stamped six times.
  const rnd = hashRnd(9173 + variant * 2749);
  const kitSide = variant % 2 === 0 ? 1 : -1;
  const spots = Array.from({ length: 3 }, () => ({
    x: cx - 2 + ((rnd() * 5) | 0),
    y: 8 + ((rnd() * 4) | 0),
    alt: rnd() < 0.34,
  }));

  const facingAway = dy < -0.3;
  const sideways = Math.abs(dy) <= 0.3;

  // --- legs, first, so the body overlaps them
  //
  // Short, thick and barely separated. There is no room at this size for legs
  // that read as legs, and trying gives you two thin dark spikes under the
  // torso -- which, with a shadow behind them, is a spider. What is wanted is a
  // base the figure stands on, with just enough asymmetry between the two to
  // carry the walk cycle.
  const swing = [0, 1, 0, -1][frame];
  rect(g, cx - 2, 11, 2, 2 + Math.max(0, swing), pal.body);
  rect(g, cx + 1, 11, 2, 2 + Math.max(0, -swing), pal.body);
  rect(g, cx - 2, 12 + Math.max(0, swing), 2, 1, pal.boots);
  rect(g, cx + 1, 12 + Math.max(0, -swing), 2, 1, pal.boots);

  // --- body: a dark mass, wider at the shoulders, and not the same on both
  //     sides. The right shoulder carries the weapon and sits a pixel higher.
  // Shoulders as one solid block that tapers into the waist, not as a torso
  // with a one-pixel column stuck on either side -- those columns read as thin
  // arms, and thin arms on a 13px sprite read as legs on a spider.
  rect(g, cx - 3, 7, 7, 2, pal.body);
  rect(g, cx - 2, 9, 5, 3, pal.body);
  // The right shoulder carries the weapon and sits a pixel proud of the left.
  px(g, cx + 3, 9, pal.body);
  // A single lifted edge along the top of the shoulders: the only place light
  // reaches the body at all.
  rect(g, cx - 3, 7, 5, 1, pal.bodyLight);
  px(g, cx + 2, 7, pal.bodyLight);

  // Kit. Scattered, asymmetric, and biased to the side this man carries it on.
  for (const s of spots) {
    px(g, s.x, s.y, s.alt ? pal.kitAlt : pal.kit);
  }
  // A strap running diagonally across the chest, and a pouch on the hip.
  if (!facingAway) {
    px(g, cx - kitSide, 8, pal.kit);
    px(g, cx - kitSide * 2, 9, pal.kit);
    px(g, cx + kitSide, 11, pal.kit);
  }
  px(g, cx + kitSide * 2, 10, pal.kitAlt);
  // A bedroll or pack on his back, visible when he is walking away from you.
  if (facingAway) {
    rect(g, cx - 2, 8, 4, 3, pal.bodyLight);
    px(g, cx - 2, 8, pal.kitAlt);
    px(g, cx + 1, 10, pal.kitAlt);
  }

  // --- weapon, projecting from the chest along the facing
  if (weapon !== 'none') {
    const reach = weapon === 'long' ? 5.4 : weapon === 'tube' ? 4.2 : 3.2;
    const gx = cx + dx * reach;
    const gy = 7 + dy * (reach * 0.8);
    px(g, cx + dx * 1.8, 7 + dy * 1.4, pal.gun);
    px(g, gx, gy, pal.gun);
    px(g, gx + dx * 1.4, gy + dy * 1.4, pal.gun);
    if (weapon === 'long') px(g, gx + dx * 2.6, gy + dy * 2.6, pal.gun);
    if (weapon === 'tube') {
      px(g, gx - dy, gy + dx, pal.gun);
      px(g, gx + dx * 1.4 - dy, gy + dy * 1.4 + dx, pal.gun);
    }
  }

  // --- head: a dome, brightest at the crown, with the brim in its own shadow
  //
  // Five pixels across, not seven. A helmet as wide as the shoulders turns the
  // figure into a mushroom and leaves no room for a face under it — and the
  // face, small as it is, is most of what says which way he is looking.
  rect(g, cx - 1, 1, 3, 1, pal.helmet);
  rect(g, cx - 2, 2, 5, 1, pal.helmet);
  rect(g, cx - 2, 3, 5, 1, pal.helmetDark);
  // The crown catches the light: two or three pixels, off-centre, and the
  // brightest thing on the sprite.
  px(g, cx - 1, 1, pal.helmetLight);
  px(g, cx, 1, pal.helmetLight);
  px(g, cx - 2, 2, pal.helmetLight);
  // A dent, so no two helmets in a squad are quite the same shape.
  if (variant % 4 === 1) px(g, cx + 2, 2, pal.helmetDark);
  if (variant % 4 === 2) px(g, cx - 1, 2, pal.helmetLight);
  if (variant % 4 === 3) px(g, cx + 1, 1, pal.helmetLight);

  // --- face, only where there is something to see
  if (!facingAway) {
    if (sideways) {
      // Side-on: a cheek and jaw on the leading edge, and one eye.
      const sd = Math.sign(dx) || 1;
      rect(g, cx, 4, 3 * sd > 0 ? 2 : 2, 3, pal.face);
      px(g, cx + sd, 4, pal.face);
      px(g, cx + sd * 2, 5, pal.face);
      px(g, cx, 4, pal.faceDark);
      px(g, cx + sd, 5, pal.outline);
      px(g, cx + sd, 6, pal.faceDark);
    } else {
      // Three rows of it. The face is the largest warm area on the sprite in
      // the original, and leading with a big helmet instead turns the figure
      // into a mushroom with a chin.
      rect(g, cx - 1, 4, 3, 3, pal.face);
      px(g, cx - 2, 5, pal.faceDark);
      px(g, cx + 2, 5, pal.faceDark);
      // Two eyes. At thirteen pixels wide these are two dark dots, and they do
      // more work than everything below the collar put together.
      px(g, cx - 1, 5, pal.outline);
      px(g, cx + 1, 5, pal.outline);
      px(g, cx, 6, pal.faceDark);
    }
  } else {
    // The back of the head: helmet all the way down, and the collar under it.
    rect(g, cx - 2, 4, 5, 2, pal.helmetDark);
    px(g, cx, 6, pal.helmetDark);
  }

  addOutline(c, pal.outline);
  return c;
}

/** 0..7 clockwise from south. Matches the layout used by `bakeSoldier`. */
export function facingIndex(angle: number): number {
  const a = angle - Math.PI / 2;
  const i = Math.round((a / (Math.PI * 2)) * FACINGS);
  return ((i % FACINGS) + FACINGS) % FACINGS;
}

/** Deterministic per-instance noise, so scenery varies but never flickers. */
const hashRnd = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

/** Foliage is split so the renderer can sway the canopy without the trunk. */
export interface Foliage {
  canopy: Sprite;
  trunk: Sprite;
  /** Where the canopy sits relative to the trunk sprite's top-left. */
  canopyOffsetY: number;
}

const TREE_W = 20;

function bakeBroadleaf(seed: number, leafDark: string, leafMid: string, leafLight: string): Foliage {
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

function bakePalm(seed: number): Foliage {
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

function bakePine(seed: number): Foliage {
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
function bakeTallGrass(seed: number, dark: string, mid: string, light: string): Sprite {
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
function bakeRock(seed: number, light: string, mid: string, dark: string, cap?: string): Sprite {
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

/**
 * A grass hut, in three states of repair. Damage is drawn, not just tinted:
 * holes punched through the thatch, then a wall caving in, then a wreck. A
 * levelled hut has to read as levelled from across the map.
 */
/**
 * The village hut.
 *
 * The reference's hut is not a cottage. It is a round mud-walled drum under an
 * enormous circular thatch roof, seen from almost directly above, so what you
 * actually see is a disc of burnt-orange straw with a smoke hole punched in the
 * middle and a sliver of wall and a black doorway peeking out beneath its
 * southern rim. A pitched roof and a gable end is the wrong building entirely,
 * and reads as a European farmhouse dropped into a jungle.
 */
function bakeHut(stage: number): Sprite {
  const { c, g } = makeCanvas(36, 36);
  const rnd = hashRnd(97 + stage * 31);

  const CX = 18, CY = 15;      // centre of the roof disc
  const RX = 17, RY = 14;      // its radii

  if (stage >= 3) {
    // Wrecked.
    //
    // The whole point of this sprite is to say "dealt with" from across the map,
    // and drawn in burnt browns it said "still a hut, but scruffier" -- the same
    // family of colour as the thatch it used to be. Ash is grey, so the wreck
    // goes grey: a pale bed of it where the roof came down, charcoal beams
    // through it, and only a few embers left with any warmth in them.
    for (let i = 0; i < 110; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 16;
      px(g, CX + Math.cos(a) * r, 24 + Math.sin(a) * r * 0.6,
        rnd() < 0.5 ? '#4a4a48' : rnd() < 0.6 ? '#63635f' : '#2e2e2c');
    }
    // The collapsed roof, as a mound of ash where the dome used to sit.
    for (let y = -7; y <= 6; y++) {
      for (let x = -13; x <= 13; x++) {
        if ((x * x) / 169 + (y * y) / 49 > 1) continue;
        if (rnd() < 0.24) continue;
        const lit = -(x * 0.4 + y * 0.8) / 10;
        px(g, CX + x, CY + y + 6,
          lit > 0.4 ? '#8e8e88' : lit > 0.05 ? '#6e6e68' : rnd() < 0.3 ? '#3a3a38' : '#4e4e4a');
      }
    }
    // A broken ring of wall, gapped where it fell in. Scorched, not burnt away.
    for (let a = 0; a < Math.PI * 2; a += 0.09) {
      const x = CX + Math.cos(a) * 12;
      const y = 24 + Math.sin(a) * 6;
      if (rnd() < 0.22) continue;
      const h = 3 + ((rnd() * 4) | 0);
      rect(g, x, y - h, 1, h, rnd() < 0.5 ? '#5e5a50' : '#43403a');
      px(g, x, y - h, '#26241f');
    }
    // Charred roof beams laid through the ash, and a handful of embers.
    for (let i = 0; i < 15; i++) px(g, 9 + i, 25 - ((i * 0.5) | 0), '#1c1a16');
    for (let i = 0; i < 11; i++) px(g, 25 - i, 22 + ((i * 0.4) | 0), '#141310');
    for (let i = 0; i < 7; i++) {
      px(g, 8 + rnd() * 20, 20 + rnd() * 8, rnd() < 0.5 ? '#8a3410' : '#5c2008');
    }
    addOutline(c, '#141310');
    return c;
  }

  // --- the wall drum, drawn first so the roof overhangs it
  //
  // It wants to be a real proportion of the sprite. Almost all roof and a grey
  // sliver of wall reads as a disc lying on the ground; the reference is closer
  // to sixty-forty, and the wall is what makes the hut a building you can walk
  // round rather than a plate.
  for (let y = 20; y < 33; y++) {
    const k = (y - 20) / 12;
    const half = Math.round(13 - k * 2.5);
    for (let x = CX - half; x <= CX + half; x++) {
      // Mud and stone, lit from the upper left like everything else, and
      // greened where the wall meets the ground.
      const across = (x - CX) / half;
      const lit = -across * 0.55 + (1 - k) * 0.45;
      const n = (x * 7 + y * 13) % 5;
      let colour = lit > 0.42 ? '#8d8a70' : lit > 0.05 ? '#75705c' : lit > -0.3 ? '#5d5847' : '#453f32';
      if (n === 0) colour = '#4e4a3a';
      if (k > 0.82) colour = '#332f26';
      px(g, x, y, colour);
    }
  }
  // Doorway: a tall arch, black, offset a little off centre as in the original.
  for (let y = 0; y < 11; y++) {
    const arch = y < 3 ? 2 + y : 4;
    for (let x = -arch; x <= arch; x++) px(g, CX - 1 + x, 22 + y, '#0b0803');
  }

  // --- the thatch dome
  //
  // Lit hard from the upper left, cream through rust to maroon on the far side.
  // A flat disc with radial spokes from a centred hole is a cinnamon bun; what
  // makes it a roof is that the tone follows a sphere.
  for (let y = -RY; y <= RY; y++) {
    for (let x = -RX; x <= RX; x++) {
      const e = (x * x) / (RX * RX) + (y * y) / (RY * RY);
      if (e > 1) continue;

      // Surface normal of a dome, dotted with a light up and to the left.
      const nx = x / RX, ny = y / RY;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = (-nx * 0.55 - ny * 0.7 + nz * 0.45);

      // Straw laid in courses running down the slope, so the surface has grain
      // without the spokes converging on a single point.
      const a = Math.atan2(y * 1.25, x);
      const course = Math.sin(a * 17 + e * 9) * 0.5 + 0.5;
      const shade2 = lit + (course - 0.5) * 0.22 + (rnd() - 0.5) * 0.1;

      let colour: string;
      if (shade2 > 0.62) colour = '#ffbd5a';
      else if (shade2 > 0.42) colour = '#e79034';
      else if (shade2 > 0.24) colour = '#c4631f';
      else if (shade2 > 0.06) colour = '#a03d12';
      else if (shade2 > -0.12) colour = '#7b1c07';
      else colour = '#511003';
      px(g, CX + x, CY + y, colour);
    }
  }
  // The smoke hole sits up on the lit slope, not dead centre.
  for (let y = -2; y <= 1; y++) {
    for (let x = -2; x <= 2; x++) {
      if ((x * x) / 4 + (y * y) / 2.2 > 1) continue;
      px(g, CX + x - 2, CY + y - 4, '#1a0d03');
    }
  }
  px(g, CX - 4, CY - 6, '#ffbd5a');
  px(g, CX - 3, CY - 6, '#ffbd5a');

  // The thatch fringe: 1-3px teeth of straw overhanging the wall, with leaf
  // specks caught in it. This is the edge that stops the roof reading as a
  // stamped shape, so it is drawn per column rather than as an outline.
  for (let x = -RX; x <= RX; x++) {
    const k = x / RX;
    const drop = Math.round(Math.sqrt(Math.max(0, 1 - k * k)) * RY);
    if (drop <= 0) continue;
    const teeth = 1 + ((rnd() * 3) | 0);
    for (let s = 0; s < teeth; s++) {
      const y = CY + drop + s;
      px(g, CX + x, y, s === teeth - 1 ? '#3a0c02' : rnd() < 0.4 ? '#7b1c07' : '#511003');
    }
    if (rnd() < 0.14) px(g, CX + x, CY + drop + teeth, '#404000');
  }

  // Vegetation creeping up the wall, which is what roots the hut in the ground.
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI;
    const x = CX + Math.cos(a) * 13;
    const y = 27 + Math.sin(a) * 4;
    rect(g, x, y - 1 - ((rnd() * 3) | 0), 1, 2 + ((rnd() * 2) | 0), rnd() < 0.5 ? '#404000' : '#565608');
  }

  if (stage >= 1) {
    // Scarred: the thatch torn open in patches, and pocks in the wall.
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.3 + rnd() * 0.6;
      px(g, CX + Math.cos(a) * RX * r, CY + Math.sin(a) * RY * r, rnd() < 0.5 ? '#3a1605' : '#512008');
    }
    for (let i = 0; i < 14; i++) px(g, CX - 12 + rnd() * 24, 23 + rnd() * 8, '#332d20');
  }

  if (stage >= 2) {
    // Barely standing: a hole clean through the roof, and the wall breached.
    for (let i = 0; i < 46; i++) {
      const a = 2.1 + rnd() * 1.5;
      const r = 0.2 + rnd() * 0.62;
      px(g, CX + Math.cos(a) * RX * r, CY + Math.sin(a) * RY * r, rnd() < 0.55 ? '#180d04' : '#2e1707');
    }
    rect(g, CX - 12, 24, 5, 7, '#100c05');
    for (let i = 0; i < 22; i++) px(g, CX - 14 + rnd() * 28, 29 + rnd() * 4, rnd() < 0.5 ? '#4a4436' : '#61594a');
  }

  return c;
}

/**
 * The arctic cabin.
 *
 * A thatched mud hut in a snowfield is a mission brief nobody wrote. The
 * reference's arctic buildings are squat log cabins: horizontal timber courses,
 * a snow-laden roof pitched toward the viewer, a black doorway, and a drift
 * banked against the windward wall.
 */
function bakeCabin(stage: number): Sprite {
  const { c, g } = makeCanvas(38, 34);
  const rnd = hashRnd(1471 + stage * 53);

  if (stage >= 3) {
    // Burnt out: a bed of ash where the cabin stood, four charred corner posts
    // still up, and snow already starting to take it back.
    for (let y = 16; y < 30; y++) {
      for (let x = 5; x < 33; x++) {
        if (rnd() < 0.2) continue;
        const lit = -((x - 19) * 0.3 + (y - 23) * 0.8) / 9;
        px(g, x, y, lit > 0.35 ? '#7e8288' : lit > 0 ? '#5e6266' : rnd() < 0.3 ? '#2a2c2e' : '#42464a');
      }
    }
    for (let i = 0; i < 60; i++) {
      px(g, 5 + rnd() * 28, 17 + rnd() * 13, rnd() < 0.5 ? '#1a1a1c' : '#33373a');
    }
    for (const x of [7, 12, 24, 30]) {
      const h = 5 + ((rnd() * 6) | 0);
      rect(g, x, 28 - h, 2, h, rnd() < 0.5 ? '#2a2624' : '#171514');
      px(g, x, 28 - h, '#d2e6ee');
    }
    // Snow drifting back over the cold edges of it.
    for (let i = 0; i < 26; i++) px(g, 5 + rnd() * 28, 26 + rnd() * 5, '#a8c2ce');
    for (let i = 0; i < 5; i++) px(g, 9 + rnd() * 20, 19 + rnd() * 8, '#7a2c0c');
    addOutline(c, '#0a0d10');
    return c;
  }

  // Walls: horizontal log courses, each with a lit top edge and a dark seam.
  for (let y = 14; y < 30; y++) {
    const course = ((y - 14) / 3) | 0;
    for (let x = 5; x < 33; x++) {
      const lit = x < 17;
      let colour = (y - 14) % 3 === 0 ? '#3a2a18'
        : lit ? '#7a5630' : '#5c4022';
      if ((x * 5 + course * 11) % 7 === 0) colour = '#4a3420';
      px(g, x, y, colour);
    }
  }
  // The end grain of the logs, poking past the corners.
  for (let y = 14; y < 30; y += 3) {
    px(g, 4, y + 1, '#8a6438');
    px(g, 33, y + 1, '#5c4022');
  }

  // Roof: pitched toward the viewer, with a deep load of snow on it.
  for (let y = 0; y < 15; y++) {
    const inset = Math.round((14 - y) * 0.55);
    for (let x = 2 + inset; x < 36 - inset; x++) {
      // Snow on top, shingle showing along the eave where it has slid off.
      const snow = y < 10 - (rnd() < 0.2 ? 1 : 0);
      px(g, x, y, snow
        ? (y < 4 ? '#f2fbfd' : y < 7 ? '#dcf0f6' : '#c2dde8')
        : (x % 4 === 0 ? '#2e2418' : '#483722'));
    }
  }
  // The ridge line, and icicles hanging off the eave.
  for (let x = 2; x < 36; x++) px(g, x, 0, '#ffffff');
  for (let x = 3; x < 35; x++) {
    if (rnd() > 0.24) continue;
    const len = 1 + ((rnd() * 3) | 0);
    for (let s = 0; s < len; s++) px(g, x, 15 + s, s === len - 1 ? '#a8ccdc' : '#dceef6');
  }

  // Doorway, and a drift banked against the wall beside it.
  rect(g, 17, 21, 6, 9, '#080a0c');
  rect(g, 16, 21, 1, 9, '#3a2a18');
  rect(g, 23, 21, 1, 9, '#3a2a18');
  for (let x = 3; x < 35; x++) {
    const drift = Math.round(3 + Math.sin(x * 0.4) * 1.6 + rnd() * 1.5);
    for (let s = 0; s < drift; s++) px(g, x, 30 - s, s > drift - 2 ? '#b4d2de' : '#dcf0f6');
  }

  if (stage >= 1) {
    for (let i = 0; i < 24; i++) px(g, 6 + rnd() * 26, 15 + rnd() * 14, rnd() < 0.5 ? '#33240f' : '#241a10');
    for (let i = 0; i < 12; i++) px(g, 8 + rnd() * 20, 2 + rnd() * 9, '#7a8c96');
  }
  if (stage >= 2) {
    rect(g, 7, 18, 6, 8, '#080a0c');
    for (let i = 0; i < 30; i++) px(g, 4 + rnd() * 30, 3 + rnd() * 24, rnd() < 0.5 ? '#1c1610' : '#2e2418');
    for (let i = 0; i < 16; i++) px(g, 5 + rnd() * 28, 28 + rnd() * 4, '#8fa8b4');
  }

  addOutline(c, '#0a0d10');
  return c;
}

/** A concrete blockhouse: the objective on demolition maps. */
function bakeFactory(stage: number): Sprite {
  const { c, g } = makeCanvas(52, 54);
  const rnd = hashRnd(613 + stage * 47);

  if (stage >= 3) {
    // Wrecked: the shell has gone, leaving broken walls and a slab of roof.
    // Debris first, structure over the top, so the ruin keeps its silhouette.
    for (let i = 0; i < 110; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 24;
      px(g, 26 + Math.cos(a) * r, 46 + Math.sin(a) * r * 0.4, rnd() < 0.5 ? '#20221f' : '#2e312d');
    }
    for (let i = 0; i < 60; i++) px(g, 3 + rnd() * 46, 36 + rnd() * 14, rnd() < 0.5 ? '#26282b' : '#41444a');

    // Broken wall, taller and more varied so it reads as a gutted building.
    for (let x = 5; x < 47; x++) {
      const h = 9 + ((x * 13) % 15);
      rect(g, x, 48 - h, 1, h, x % 3 === 0 ? '#54565a' : '#65676c');
      px(g, x, 48 - h, '#33353a');
    }
    // Blown-out doorway and a window that survived.
    rect(g, 20, 34, 11, 14, '#1a1c1f');
    rect(g, 8, 32, 6, 6, '#20313d');
    rect(g, 8, 32, 6, 1, '#2d4553');
    rect(g, 4, 46, 44, 3, '#3e4044');

    // A tilted slab of the fallen roof leaning against the wall.
    for (let i = 0; i < 24; i++) {
      const y = 30 + Math.floor(i * 0.45);
      rect(g, 26 + i * 0.8, y, 2, 4, i % 3 === 0 ? '#4e5054' : '#5f6165');
    }
    // Twisted reinforcing bars poking out of the top.
    for (const bx of [11, 24, 36, 44]) {
      for (let i = 0; i < 7; i++) px(g, bx + Math.round(Math.sin(i * 0.9) * 2), 30 - i, '#7d6a44');
    }
    addOutline(c, '#17181b');
    return c;
  }

  rect(g, 4, 16, 44, 32, '#6d6f74');
  rect(g, 4, 16, 44, 2, '#84868c');
  rect(g, 4, 44, 44, 4, '#54565a');
  // Corrugated roof.
  for (let y = 6; y < 17; y++) {
    const half = Math.round(10 + ((y - 6) / 10) * 12);
    for (let x = 26 - half; x <= 25 + half; x++) {
      px(g, x, y, x % 3 === 0 ? '#4e5054' : '#5f6165');
    }
  }
  // Windows and a big roller door.
  for (const wx of [9, 17, 33, 41]) {
    rect(g, wx, 24, 5, 5, '#20313d');
    rect(g, wx, 24, 5, 1, '#2d4553');
  }
  rect(g, 20, 32, 12, 16, '#2a2c30');
  rect(g, 20, 32, 12, 1, '#3c3e44');
  for (let y = 34; y < 48; y += 3) rect(g, 20, y, 12, 1, '#232529');
  // Chimney.
  rect(g, 38, 2, 6, 12, '#5a5c60');
  rect(g, 37, 1, 8, 2, '#6c6e73');

  if (stage >= 1) {
    // Scarred: shattered windows and pocked concrete.
    rect(g, 17, 24, 5, 5, '#161d23');
    for (let i = 0; i < 40; i++) px(g, 5 + rnd() * 42, 17 + rnd() * 30, rnd() < 0.5 ? '#5a5c60' : '#4a4c50');
  }

  if (stage >= 2) {
    // Barely standing: a breach through the wall, roof holed, chimney down.
    rect(g, 7, 30, 9, 16, '#1e2023');
    for (let i = 0; i < 22; i++) px(g, 6 + rnd() * 12, 29 + rnd() * 18, '#33353a');
    rect(g, 30, 8, 10, 6, '#2a2c30');
    rect(g, 38, 2, 6, 8, '#00000000');
    // Chimney lying on the roof.
    for (let i = 0; i < 10; i++) rect(g, 33 + i, 10 + Math.floor(i * 0.3), 1, 3, '#4e5054');
    for (let i = 0; i < 50; i++) px(g, 4 + rnd() * 44, 16 + rnd() * 32, rnd() < 0.5 ? '#26282b' : '#44464a');
  }

  addOutline(c, '#17181b');
  return c;
}

/** MASH tent: where rescued hostages are delivered. */
function bakeTent(): Sprite {
  const { c, g } = makeCanvas(30, 26);
  for (let y = 0; y < 18; y++) {
    const half = Math.round((y / 17) * 13);
    for (let x = 15 - half; x <= 14 + half; x++) {
      px(g, x, y + 6, x % 5 === 0 ? '#b0a88f' : '#cdc5ab');
    }
  }
  rect(g, 11, 16, 8, 8, '#3a3529');
  // Red cross.
  rect(g, 13, 10, 4, 2, '#c8352a');
  rect(g, 14, 9, 2, 4, '#c8352a');
  addOutline(c, '#3a3529');
  return c;
}

/** Ammo crate. Shoot it and it takes the neighbourhood with it. */
function bakeCrate(): Sprite {
  const { c, g } = makeCanvas(12, 12);
  rect(g, 1, 2, 10, 9, '#9a6f34');
  rect(g, 1, 2, 10, 2, '#b98a45');
  rect(g, 1, 9, 10, 2, '#7a561f');
  for (let i = 0; i < 8; i++) {
    px(g, 2 + i, 3 + i, '#6a4a1c');
    px(g, 9 - i, 3 + i, '#6a4a1c');
  }
  rect(g, 4, 0, 4, 2, '#c8b23c');
  addOutline(c, '#2a1c0a');
  return c;
}

/** Fuel barrel: scenery explosive, no pickup. */
function bakeBarrel(): Sprite {
  const { c, g } = makeCanvas(12, 14);
  rect(g, 2, 2, 8, 11, '#8a3a2c');
  rect(g, 2, 2, 3, 11, '#a54838');
  rect(g, 8, 2, 2, 11, '#6b2a20');
  rect(g, 2, 5, 8, 1, '#5c241b');
  rect(g, 2, 9, 8, 1, '#5c241b');
  rect(g, 3, 1, 6, 2, '#c2543f');
  rect(g, 4, 6, 4, 3, '#e0c03a');
  addOutline(c, '#2a1109');
  return c;
}

/** Mine, drawn only once it has been triggered. */
function bakeMine(): Sprite {
  const { c, g } = makeCanvas(10, 8);
  rect(g, 2, 3, 6, 3, '#3c4038');
  rect(g, 2, 3, 6, 1, '#50554a');
  px(g, 1, 4, '#3c4038');
  px(g, 8, 4, '#3c4038');
  rect(g, 4, 1, 2, 2, '#c8352a');
  addOutline(c, '#1a1c17');
  return c;
}

/**
 * The badge on a pickup label: a grenade, small enough to sit beside 5px text.
 * Deliberately not the crate sprite -- the crate is what you walked into, and
 * the label is about what you walked away with.
 */
function bakeGrenadeIcon(): Sprite {
  const { c, g } = makeCanvas(8, 9);
  rect(g, 3, 1, 2, 1, '#8a9370');
  px(g, 5, 2, '#8a9370');
  rect(g, 2, 3, 4, 4, '#3f4a35');
  rect(g, 2, 3, 4, 1, '#57633f');
  px(g, 3, 4, '#c9d4b8');
  addOutline(c, '#161c10');
  return c;
}

/** The badge on a rescue label: a civilian, waving. */
function bakeHostageIcon(): Sprite {
  const { c, g } = makeCanvas(8, 9);
  rect(g, 3, 1, 2, 2, PALETTES.hostage.face);
  rect(g, 2, 3, 4, 3, PALETTES.hostage.kit);
  px(g, 1, 2, PALETTES.hostage.kit);
  px(g, 6, 3, PALETTES.hostage.kit);
  rect(g, 2, 6, 1, 2, PALETTES.hostage.body);
  rect(g, 5, 6, 1, 2, PALETTES.hostage.body);
  addOutline(c, PALETTES.hostage.outline);
  return c;
}

/**
 * Face-down corpse, burnt into the decal layer where someone fell.
 *
 * Sprawled, not laid out. A tidy symmetrical body reads as a sleeping figure;
 * what makes this one read as a casualty is that the limbs went where they fell
 * and the helmet has come off and rolled clear.
 */
function bakeCorpse(pal: Palette): Sprite {
  const { c, g } = makeCanvas(15, 12);
  // Torso, twisted a little off the vertical.
  rect(g, 4, 5, 6, 4, pal.body);
  px(g, 10, 5, pal.body);
  px(g, 3, 8, pal.body);
  // Arms thrown out, one further than the other.
  rect(g, 1, 6, 3, 1, pal.body);
  rect(g, 10, 7, 2, 1, pal.body);
  px(g, 12, 8, pal.body);
  // Legs, uneven.
  rect(g, 5, 9, 1, 2, pal.body);
  rect(g, 8, 9, 1, 1, pal.body);
  px(g, 5, 11, pal.boots);
  px(g, 9, 10, pal.boots);
  // Kit still on him, and the helmet a couple of pixels away from his head.
  px(g, 6, 6, pal.kit);
  px(g, 8, 7, pal.kitAlt);
  rect(g, 5, 3, 3, 2, pal.helmetDark);
  px(g, 9, 2, pal.helmet);
  px(g, 10, 2, pal.helmetDark);
  addOutline(c, pal.outline);
  return c;
}

function bakeMuzzleFlash(): Sprite {
  const { c, g } = makeCanvas(7, 7);
  px(g, 3, 3, '#fffbe0');
  for (const [x, y] of [[2, 3], [4, 3], [3, 2], [3, 4]]) px(g, x, y, '#ffe27a');
  for (const [x, y] of [[1, 3], [5, 3], [3, 1], [3, 5], [2, 2], [4, 4], [2, 4], [4, 2]]) px(g, x, y, '#ff9b2e');
  return c;
}

/** Small ground detail scattered over open terrain to break up flat colour. */
function bakeTuft(seed: number, dark: string, light: string): Sprite {
  const { c, g } = makeCanvas(7, 5);
  const rnd = hashRnd(seed * 7717 + 21);
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(rnd() * 5);
    const h = 1 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) px(g, x, 4 - y, y === h - 1 ? light : dark);
  }
  return c;
}

export type TreeSpecies = 'broadleaf' | 'palm' | 'pine';

export interface Atlas {
  /** [facing][walk frame] */
  /**
   * Indexed [variant][facing][walk frame]. The variant is the man: six
   * identical figures walking in step is the single most toy-soldier thing a
   * squad can do, so each carries his kit differently and his helmet is dented
   * differently, chosen once per actor and stable thereafter.
   */
  player: Sprite[][][];
  enemy: Sprite[][][];
  sniper: Sprite[][][];
  bazooka: Sprite[][][];
  hostage: Sprite[][][];
  corpsePlayer: Sprite;
  corpseEnemy: Sprite;
  corpseHostage: Sprite;
  trees: Record<TreeSpecies, Foliage[]>;
  /** Ground detail per theme: green tufts, dry scrub, or dark arctic shrub. */
  grassTufts: Record<string, Sprite[]>;
  tallGrass: Sprite[];
  rocks: Sprite[];
  /** [intact, scarred, barely standing, wrecked] */
  hut: Sprite[];
  /** The arctic's building. Same four stages. */
  cabin: Sprite[];
  factory: Sprite[];
  tent: Sprite;
  crate: Sprite;
  barrel: Sprite;
  mine: Sprite;
  muzzle: Sprite;
  /** Badges for the floating pickup labels, keyed by `PopupIcon`. */
  icons: Record<'grenade' | 'hostage', Sprite>;
}

let cached: Atlas | null = null;

export function buildAtlas(): Atlas {
  if (cached) return cached;

  const bakeUnit = (pal: Palette, weapon: 'rifle' | 'long' | 'tube' | 'none'): Sprite[][][] =>
    Array.from({ length: UNIT_VARIANTS }, (_, v) =>
      Array.from({ length: FACINGS }, (_, f) =>
        Array.from({ length: WALK_FRAMES }, (_, w) => bakeSoldier(pal, f, w, weapon, v)),
      ),
    );

  cached = {
    player: bakeUnit(PALETTES.player, 'rifle'),
    enemy: bakeUnit(PALETTES.enemy, 'rifle'),
    sniper: bakeUnit(PALETTES.sniper, 'long'),
    bazooka: bakeUnit(PALETTES.bazooka, 'tube'),
    hostage: bakeUnit(PALETTES.hostage, 'none'),
    corpsePlayer: bakeCorpse(PALETTES.player),
    corpseEnemy: bakeCorpse(PALETTES.enemy),
    corpseHostage: bakeCorpse(PALETTES.hostage),
    // A handful of variants is enough to stop the forest looking tiled.
    trees: {
      broadleaf: Array.from({ length: 6 }, (_, i) => bakeBroadleaf(i + 1, '#22461a', '#356524', '#4e8330')),
      palm: Array.from({ length: 4 }, (_, i) => bakePalm(i + 1)),
      pine: Array.from({ length: 4 }, (_, i) => bakePine(i + 1)),
    },
    grassTufts: {
      jungle: Array.from({ length: 4 }, (_, i) => bakeTuft(i + 1, '#3d6a22', '#5c9436')),
      desert: Array.from({ length: 4 }, (_, i) => bakeTuft(i + 5, '#8a7a3e', '#a89a58')),
      arctic: Array.from({ length: 4 }, (_, i) => bakeTuft(i + 9, '#5c6b62', '#8fa096')),
    },
    tallGrass: Array.from({ length: 5 }, (_, i) => bakeTallGrass(i + 1, '#2c5219', '#417026', '#5b9134')),
    // A handful of loose stones, for scattering as ground detail. Outcrops
    // proper are baked as a mass in canopy.ts, not stamped per tile.
    rocks: Array.from({ length: 6 }, (_, i) => bakeRock(i + 1, '#8d9384', '#666c5e', '#3c4038')),
    hut: [0, 1, 2, 3].map(bakeHut),
    cabin: [0, 1, 2, 3].map(bakeCabin),
    factory: [0, 1, 2, 3].map(bakeFactory),
    tent: bakeTent(),
    crate: bakeCrate(),
    barrel: bakeBarrel(),
    mine: bakeMine(),
    muzzle: bakeMuzzleFlash(),
    icons: { grenade: bakeGrenadeIcon(), hostage: bakeHostageIcon() },
  };
  // Debug handle, alongside `window.game`: lets tools/sheet.mjs lay every baked
  // sprite out on a grid without the game having to be played to reach them.
  (window as unknown as { __atlas: Atlas }).__atlas = cached;
  return cached;
}

/** Which tree a theme plants. */
export const TREE_FOR_THEME: Record<string, TreeSpecies> = {
  jungle: 'broadleaf',
  desert: 'palm',
  arctic: 'pine',
};
