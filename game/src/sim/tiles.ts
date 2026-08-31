/**
 * The tile table. The ASCII legend lives here, not in the .map file, so map
 * files stay pure art. See docs/map-format.md.
 *
 * Movement, sight and shots are three separate flags rather than one "solid"
 * bit, which is what lets tall grass hide you without stopping bullets, and
 * deep water stop you without blocking your line of fire.
 */

export enum Tile {
  Grass = 0,
  Sand = 1,
  Tree = 2,
  Water = 3,
  Bridge = 4,
  Rock = 5,
  Hut = 6,
  DeepWater = 7,
  TallGrass = 8,
  Quicksand = 9,
  Ice = 10,
  Road = 11,
  Fence = 12,
  Rubble = 13,
  Factory = 14,
  Tent = 15,
}

export interface TileDef {
  id: Tile;
  name: string;
  /** Blocks movement. */
  solid: boolean;
  /** Blocks line of sight, so enemies cannot see you through it. */
  blocksSight: boolean;
  /** Stops bullets. */
  blocksShots: boolean;
  /** Wading: slow, and you cannot fire. */
  wade: boolean;
  /** Movement speed multiplier on this tile. */
  speed: number;
  /** Low friction -- soldiers slide and steer badly. */
  slippery: boolean;
  /** Base fill, plus a speckle colour that breaks up large areas. */
  color: string;
  speckle: string;
  /** Tall scenery: drawn after the actors so they can pass behind it. */
  canopy: boolean;
  /** Foliage that sways in the wind. */
  sway: boolean;
}

const def = (id: Tile, name: string, color: string, speckle: string, over: Partial<TileDef> = {}): TileDef => ({
  id, name, color, speckle,
  solid: false, blocksSight: false, blocksShots: false, wade: false,
  speed: 1, slippery: false, canopy: false, sway: false,
  ...over,
});

export const TILES: Record<Tile, TileDef> = {
  [Tile.Grass]:     def(Tile.Grass, 'grass', '#4a7a2c', '#578a33'),
  [Tile.Sand]:      def(Tile.Sand, 'sand', '#a5924f', '#b6a15c'),
  [Tile.Road]:      def(Tile.Road, 'road', '#8d8574', '#9c9483', { speed: 1.18 }),
  [Tile.Tree]:      def(Tile.Tree, 'tree', '#3d6624', '#345a1e', { solid: true, blocksSight: true, blocksShots: true, canopy: true, sway: true }),
  [Tile.Rock]:      def(Tile.Rock, 'rock', '#6b6f66', '#7b8076', { solid: true, blocksSight: true, blocksShots: true, canopy: true }),
  [Tile.Hut]:       def(Tile.Hut, 'hut', '#8d5a2b', '#7c4e24', { solid: true, blocksSight: true, blocksShots: true, canopy: true }),
  [Tile.Factory]:   def(Tile.Factory, 'factory', '#6d6f74', '#5e6065', { solid: true, blocksSight: true, blocksShots: true, canopy: true }),
  [Tile.Fence]:     def(Tile.Fence, 'fence', '#7a6440', '#6a5636', { solid: true, blocksShots: true }),
  [Tile.Rubble]:    def(Tile.Rubble, 'rubble', '#5c5348', '#6a6055', { speed: 0.8 }),
  // Shallow water: crossable, but slow and you cannot shoot from it.
  [Tile.Water]:     def(Tile.Water, 'water', '#2f6d92', '#3a7ea6', { wade: true, speed: 0.45 }),
  // Deep water stops you dead -- but it is flat, so you can still shoot across it.
  [Tile.DeepWater]: def(Tile.DeepWater, 'deep water', '#1d4665', '#245478', { solid: true }),
  [Tile.Bridge]:    def(Tile.Bridge, 'bridge', '#8a6c3f', '#7a5f37'),
  // Cover you can walk through: hides you without stopping bullets.
  [Tile.TallGrass]: def(Tile.TallGrass, 'tall grass', '#3f6b28', '#4c7d31', { blocksSight: true, speed: 0.82, sway: true }),
  [Tile.Quicksand]: def(Tile.Quicksand, 'quicksand', '#8a7a44', '#7a6b3a', { speed: 0.24, wade: true }),
  [Tile.Ice]:       def(Tile.Ice, 'ice', '#c3dbe6', '#d5e8f0', { slippery: true, speed: 1.08 }),
  [Tile.Tent]:      def(Tile.Tent, 'tent', '#c9c2ac', '#b8b19b'),
};

/** Terrain characters. Entity markers are handled separately by the parser. */
export const LEGEND: Record<string, Tile> = {
  '.': Tile.Grass,
  ',': Tile.Sand,
  '_': Tile.Road,
  'T': Tile.Tree,
  '~': Tile.Water,
  'W': Tile.DeepWater,
  '=': Tile.Bridge,
  '#': Tile.Rock,
  'h': Tile.Hut,
  'F': Tile.Factory,
  '+': Tile.Fence,
  '"': Tile.TallGrass,
  '%': Tile.Quicksand,
  'i': Tile.Ice,
  ':': Tile.Rubble,
  'A': Tile.Tent,
};

/** Markers that spawn something and leave the named terrain behind. */
export const MARKERS: Record<string, Tile> = {
  'P': Tile.Grass,  // player squad spawn
  'E': Tile.Grass,  // enemy
  'S': Tile.Grass,  // sniper: longer range, slower, deadlier
  'B': Tile.Grass,  // bazookateer: fires explosive rounds
  'c': Tile.Grass,  // pickup crate
  'o': Tile.Grass,  // explosive barrel
  '*': Tile.Grass,  // mine
  'p': Tile.Grass,  // enemy patrol node
  'H': Tile.Grass,  // hostage
  'X': Tile.Grass,  // extraction zone
};

/** Per-theme recolours. Anything absent falls back to the table above. */
export type Theme = 'jungle' | 'desert' | 'arctic';

export const THEMES: Record<Theme, Partial<Record<Tile, [string, string]>>> = {
  jungle: {},
  desert: {
    [Tile.Grass]: ['#b4a065', '#c1ad72'],
    [Tile.Sand]: ['#d3bd7f', '#e0cb8e'],
    [Tile.TallGrass]: ['#93884a', '#a29656'],
    [Tile.Tree]: ['#5c7a35', '#4a6529'],
    [Tile.Rock]: ['#8a7d63', '#9a8d73'],
  },
  arctic: {
    [Tile.Grass]: ['#dae6ec', '#e8f1f5'],
    [Tile.Sand]: ['#c2ced6', '#d0dbe2'],
    [Tile.TallGrass]: ['#a9bcc4', '#b8c9d0'],
    [Tile.Tree]: ['#2e5240', '#264636'],
    [Tile.Rock]: ['#8f9aa2', '#9faab2'],
    [Tile.Road]: ['#a8b3ba', '#b6c0c6'],
  },
};

/** Tile colours for a theme, resolved once per map load. */
export function themeColors(theme: Theme): Record<Tile, { color: string; speckle: string }> {
  const overrides = THEMES[theme] ?? {};
  const out = {} as Record<Tile, { color: string; speckle: string }>;
  for (const key of Object.keys(TILES) as unknown as Tile[]) {
    const id = Number(key) as Tile;
    const swap = overrides[id];
    out[id] = swap
      ? { color: swap[0], speckle: swap[1] }
      : { color: TILES[id].color, speckle: TILES[id].speckle };
  }
  return out;
}
