import { CONFIG } from './config.js';
import { isDoctrineId } from './difficulty.js';
import { LEGEND, MARKERS, Tile, TILES, themeColors } from './tiles.js';
import type { DoctrineId } from './difficulty.js';
import type { Theme } from './tiles.js';
import type { Vec2 } from './types.js';

/** What a mission asks of you. See objectives.ts for the evaluation. */
export type ObjectiveKind = 'eliminate' | 'demolish' | 'rescue' | 'reach' | 'survive';

/** A contiguous block of hut or factory tiles, grouped at parse time. */
export interface BuildingSpec {
  kind: 'hut' | 'factory';
  /** Tile coordinates the building occupies. */
  tiles: Array<[number, number]>;
  centre: Vec2;
  /** Bounding box in tiles, for sprite placement. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export interface GameMap {
  id: string;
  name: string;
  theme: Theme;
  tile: number;
  width: number;
  height: number;
  /** Row-major tile ids, width * height. */
  grid: Uint8Array;
  /** Untouched copy of `grid`, so a restart can undo demolition. */
  pristine: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  colors: Record<Tile, { color: string; speckle: string }>;

  objective: ObjectiveKind;
  /** The garrison's standing orders; bends the difficulty levers. */
  doctrine: DoctrineId;
  /** Seconds to hold out, for `survive`. */
  duration: number;
  /** One-line description of the mission's new idea, shown on the menu. */
  brief: string;
  mechanic: string;

  playerSpawns: Vec2[];
  enemySpawns: Vec2[];
  sniperSpawns: Vec2[];
  bazookaSpawns: Vec2[];
  patrolNodes: Vec2[];
  crates: Vec2[];
  barrels: Vec2[];
  mines: Vec2[];
  hostages: Vec2[];
  extraction: Vec2[];
  buildings: BuildingSpec[];
}

const OBJECTIVES: ObjectiveKind[] = ['eliminate', 'demolish', 'rescue', 'reach', 'survive'];
const THEME_NAMES: Theme[] = ['jungle', 'desert', 'arctic'];

/**
 * Parses `key: value` header lines, a `---` separator, then the ASCII art.
 * Short rows are padded with grass so maps can be edited without counting
 * columns.
 */
export function parseMap(src: string, id = 'level'): GameMap {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const header: Record<string, string> = {};

  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') { i++; break; }
    const m = /^\s*([a-z_]+)\s*:\s*(.*)$/i.exec(line);
    if (m) header[m[1].toLowerCase()] = m[2].trim();
  }

  // Every non-empty line after the separator is art. '#' is the rock tile, so
  // it cannot double as a comment marker here.
  const rows = lines.slice(i).filter((l) => l.length > 0);
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  if (rows.length === 0) throw new Error('map has no rows');

  const width = Math.max(...rows.map((r) => r.length));
  const height = rows.length;
  const grid = new Uint8Array(width * height);
  const tile = Number(header.tile) || CONFIG.TILE;

  const map: GameMap = {
    id,
    name: header.name ?? 'Unnamed',
    theme: THEME_NAMES.includes(header.theme as Theme) ? (header.theme as Theme) : 'jungle',
    tile,
    width,
    height,
    grid,
    pristine: grid,
    pixelWidth: width * tile,
    pixelHeight: height * tile,
    colors: themeColors(THEME_NAMES.includes(header.theme as Theme) ? (header.theme as Theme) : 'jungle'),
    objective: OBJECTIVES.includes(header.objective as ObjectiveKind)
      ? (header.objective as ObjectiveKind)
      : 'eliminate',
    doctrine: isDoctrineId(header.doctrine ?? '') ? (header.doctrine as DoctrineId) : 'garrison',
    duration: Number(header.duration) || 90,
    brief: header.brief ?? '',
    mechanic: header.mechanic ?? '',
    playerSpawns: [],
    enemySpawns: [],
    sniperSpawns: [],
    bazookaSpawns: [],
    patrolNodes: [],
    crates: [],
    barrels: [],
    mines: [],
    hostages: [],
    extraction: [],
    buildings: [],
  };

  const centre = (x: number, y: number): Vec2 => ({ x: (x + 0.5) * tile, y: (y + 0.5) * tile });

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = x < row.length ? row[x] : '.';
      let t = LEGEND[ch];
      if (t === undefined) {
        const under = MARKERS[ch];
        if (under === undefined) throw new Error(`unknown map character '${ch}' at ${x},${y}`);
        t = under;
        const p = centre(x, y);
        if (ch === 'P') map.playerSpawns.push(p);
        else if (ch === 'E') map.enemySpawns.push(p);
        else if (ch === 'S') map.sniperSpawns.push(p);
        else if (ch === 'B') map.bazookaSpawns.push(p);
        else if (ch === 'p') map.patrolNodes.push(p);
        else if (ch === 'c') map.crates.push(p);
        else if (ch === 'o') map.barrels.push(p);
        else if (ch === '*') map.mines.push(p);
        else if (ch === 'H') map.hostages.push(p);
        else if (ch === 'X') map.extraction.push(p);
      }
      grid[y * width + x] = t;
    }
  }

  map.pristine = grid.slice();
  map.buildings = findBuildings(map);
  // Tents double as delivery/extraction points, so a rescue map only has to
  // draw one rather than also remembering to mark it with an X.
  for (const centreOf of tentCentres(map)) map.extraction.push(centreOf);
  return map;
}

/** Flood-fills contiguous hut and factory tiles into building records. */
function findBuildings(map: GameMap): BuildingSpec[] {
  const seen = new Uint8Array(map.width * map.height);
  const out: BuildingSpec[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = tileAt(map, x, y);
      if ((t !== Tile.Hut && t !== Tile.Factory) || seen[y * map.width + x]) continue;

      const tiles: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[x, y]];
      seen[y * map.width + x] = 1;
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;

      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        tiles.push([cx, cy]);
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy);
        x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          if (seen[ny * map.width + nx] || tileAt(map, nx, ny) !== t) continue;
          seen[ny * map.width + nx] = 1;
          stack.push([nx, ny]);
        }
      }

      out.push({
        kind: t === Tile.Factory ? 'factory' : 'hut',
        tiles,
        centre: { x: ((x0 + x1) / 2 + 0.5) * map.tile, y: ((y0 + y1) / 2 + 0.5) * map.tile },
        x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1,
      });
    }
  }
  return out;
}

/** One point per contiguous block of tent tiles. */
function tentCentres(map: GameMap): Vec2[] {
  const seen = new Uint8Array(map.width * map.height);
  const out: Vec2[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tileAt(map, x, y) !== Tile.Tent || seen[y * map.width + x]) continue;
      const stack: Array<[number, number]> = [[x, y]];
      seen[y * map.width + x] = 1;
      let x0 = x, y0 = y, x1 = x, y1 = y;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy);
        x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          if (seen[ny * map.width + nx] || tileAt(map, nx, ny) !== Tile.Tent) continue;
          seen[ny * map.width + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      out.push({ x: ((x0 + x1) / 2 + 0.5) * map.tile, y: ((y0 + y1) / 2 + 0.5) * map.tile });
    }
  }
  return out;
}

/** Off-map reads return Tree, so the world is implicitly walled in. */
export function tileAt(map: GameMap, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return Tile.Tree;
  return map.grid[ty * map.width + tx] as Tile;
}

export function tileAtWorld(map: GameMap, wx: number, wy: number): Tile {
  return tileAt(map, Math.floor(wx / map.tile), Math.floor(wy / map.tile));
}

export const isSolidAt = (map: GameMap, tx: number, ty: number): boolean =>
  TILES[tileAt(map, tx, ty)].solid;

/** The tile definition under a world point -- speed, wading, slipperiness. */
export const defAtWorld = (map: GameMap, wx: number, wy: number) => TILES[tileAtWorld(map, wx, wy)];

export const setTile = (map: GameMap, tx: number, ty: number, t: Tile): void => {
  if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) map.grid[ty * map.width + tx] = t;
};

/** Undoes demolition so a restart gets the level back as authored. */
export const restoreTiles = (map: GameMap): void => { map.grid.set(map.pristine); };

/**
 * Supercover line walk across the tile grid. `mode` picks which flag stops it:
 * sight is blocked by tall grass, shots are not.
 */
function walkLine(map: GameMap, a: Vec2, b: Vec2, mode: 'sight' | 'shots'): boolean {
  const t = map.tile;
  let x = Math.floor(a.x / t);
  let y = Math.floor(a.y / t);
  const ex = Math.floor(b.x / t);
  const ey = Math.floor(b.y / t);
  if (x === ex && y === ey) return true;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(t / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(t / dy);
  let tMaxX = dx === 0 ? Infinity : ((x + (stepX > 0 ? 1 : 0)) * t - a.x) / dx;
  let tMaxY = dy === 0 ? Infinity : ((y + (stepY > 0 ? 1 : 0)) * t - a.y) / dy;

  // Bounded so a degenerate ray can never spin forever.
  for (let guard = 0; guard < 8192; guard++) {
    if (tMaxX < tMaxY) {
      if (tMaxX > 1) return true;
      tMaxX += tDeltaX;
      x += stepX;
    } else {
      if (tMaxY > 1) return true;
      tMaxY += tDeltaY;
      y += stepY;
    }
    if (x === ex && y === ey) return true;
    const def = TILES[tileAt(map, x, y)];
    if (mode === 'sight' ? def.blocksSight : def.blocksShots) return false;
  }
  return true;
}

export const hasLineOfSight = (map: GameMap, a: Vec2, b: Vec2): boolean => walkLine(map, a, b, 'sight');
export const hasLineOfFire = (map: GameMap, a: Vec2, b: Vec2): boolean => walkLine(map, a, b, 'shots');

/** Nearest walkable tile centre to a world point, searched in rings. */
export function nearestWalkable(map: GameMap, p: Vec2, maxRadius = 24): Vec2 {
  const tx = Math.floor(p.x / map.tile);
  const ty = Math.floor(p.y / map.tile);
  if (!isSolidAt(map, tx, ty)) return { x: p.x, y: p.y };

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!isSolidAt(map, nx, ny)) return { x: (nx + 0.5) * map.tile, y: (ny + 0.5) * map.tile };
      }
    }
  }
  return { x: p.x, y: p.y };
}
