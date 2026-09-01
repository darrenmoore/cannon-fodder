/**
 * The sprite atlas.
 *
 * There are no image files in this project. Every sprite is plotted pixel by
 * pixel into an offscreen canvas at boot, which is why the whole game is a
 * bundle and nothing else, and why a colour can be changed in one place and
 * apply everywhere. This module owns the atlas and the one-time bake; the
 * drawing itself is split by subject into the modules it imports.
 *
 * Everything added here appears on the sprite gallery -- `/sprites.html` under
 * `npm run dev` -- without the gallery being told about it, because it walks
 * this object. `npm run sheet` dumps the same thing to a PNG. Both exist because
 * looking at four stages of a wrecked hut should not require levelling four huts.
 */

import { PALETTES } from './paint.js';
import { variant } from './tint.js';
import { bakeBunker, bakeCabin, bakeFactory, bakeHut, bakeOutpost, bakeTent } from './buildings.js';
import { bakeBarrel, bakeCrate, bakeGrenadeIcon, bakeHostageIcon, bakeMine, bakeMuzzleFlash, bakeSupply } from './icons.js';
import { bakeLogo, bakeLogoParts } from './logo.js';
import { bakeBroadleaf, bakePalm, bakePine, bakeRock, bakeTallGrass, bakeTuft } from './terrain.js';
import { FACINGS, UNIT_VARIANTS, WALK_FRAMES, bakeCorpse, bakeSoldier } from './units.js';
import type { Foliage } from './terrain.js';
import type { Palette, Sprite } from './paint.js';

export { PALETTES } from './paint.js';
export type { Palette, Sprite } from './paint.js';
export { FACINGS, SOLDIER_ANCHOR, UNIT_VARIANTS, WALK_FRAMES, facingIndex } from './units.js';
export type { Foliage } from './terrain.js';

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
  camo: Sprite[][][];
  sniper: Sprite[][][];
  bazooka: Sprite[][][];
  officer: Sprite[][][];
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
  /**
   * The same hut with a green roof: the arena's allied barracks.
   *
   * Not a second drawing. It is `hut` put through `variant`, which swaps the
   * thatch ramp for the moss one -- so the two can never drift apart, and a
   * change to the hut is a change to both. See `tint.ts`.
   */
  hutAllied: Sprite[];
  /** The arctic's building. Same four stages. */
  cabin: Sprite[];
  factory: Sprite[];
  /** The building the squad holds, in its states of repair. */
  outpost: Sprite[];
  /** One state: nothing in the game can damage it. */
  bunker: Sprite;
  tent: Sprite;
  crate: Sprite;
  supply: Sprite;
  barrel: Sprite;
  mine: Sprite;
  muzzle: Sprite;
  /** Badges for the floating pickup labels, keyed by `PopupIcon`. */
  icons: Record<'grenade' | 'hostage', Sprite>;
  /**
   * The wordmark, and the pieces it is assembled from.
   *
   * Here rather than in `ui/` because it is a plotted sprite like everything
   * else in this file, and because the atlas is what the sprite gallery walks:
   * a logo nobody can look at is a logo nobody can correct.
   */
  logo: Sprite;
  logoParts: Record<string, Sprite>;
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

  // Baked once and then tinted for the arena's allied side, so the two roofs
  // can never drift apart.
  const huts = [0, 1, 2, 3].map(bakeHut);

  cached = {
    player: bakeUnit(PALETTES.player, 'rifle'),
    enemy: bakeUnit(PALETTES.enemy, 'rifle'),
    camo: bakeUnit(PALETTES.camo, 'rifle'),
    sniper: bakeUnit(PALETTES.sniper, 'long'),
    bazooka: bakeUnit(PALETTES.bazooka, 'tube'),
    officer: bakeUnit(PALETTES.officer, 'rifle'),
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
    hut: huts,
    hutAllied: huts.map((h) => variant(h, { thatch: 'moss' })),
    cabin: [0, 1, 2, 3].map(bakeCabin),
    factory: [0, 1, 2, 3].map(bakeFactory),
    outpost: [0, 1, 2, 3].map(bakeOutpost),
    bunker: bakeBunker(),
    tent: bakeTent(),
    crate: bakeCrate(),
    supply: bakeSupply(),
    barrel: bakeBarrel(),
    mine: bakeMine(),
    muzzle: bakeMuzzleFlash(),
    icons: { grenade: bakeGrenadeIcon(), hostage: bakeHostageIcon() },
    logo: bakeLogo(),
    logoParts: bakeLogoParts(),
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
