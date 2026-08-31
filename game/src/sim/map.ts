import { CONFIG } from '../config.js';
import { isDoctrineId } from './difficulty.js';
import { LEGEND, MARKERS, Tile, TILES, themeColors } from './tiles.js';
import type { DoctrineId } from './difficulty.js';
import type { Theme } from './tiles.js';
import type { Vec2 } from '../types.js';

/** What a mission asks of you. See objectives.ts for the evaluation. */
export type ObjectiveKind =
  | 'eliminate' | 'demolish' | 'rescue' | 'reach' | 'survive' | 'covert'
  | 'hold' | 'collect' | 'assassinate';

/**
 * Pairings that are not hard but incoherent, rejected at load.
 *
 * A constraint and an obligation must not contradict. "Kill nobody" beside
 * "kill everybody" is the obvious case; the others are the same mistake in
 * different clothes -- a mission you cannot complete by playing well is not a
 * difficult mission, it is a broken file, and it should say so at the point it
 * is read rather than forty seconds into a doomed attempt.
 *
 * Deliberately a rejection rather than a fallback. An unknown theme is a typo
 * and costs a mission its flavour; this is a design error and costs the player
 * their time. See docs/map-format.md, "What cannot go together" -- that table
 * and this list are meant to be the same list.
 */
const CONTRADICTIONS: Array<{ when: (m: GameMap) => boolean; why: string }> = [
  {
    when: (m) => m.nokill && m.objective === 'eliminate',
    why: '`nokill` with `eliminate`: the objective cannot be met without the kill that fails it',
  },
  {
    when: (m) => m.nokill && m.objective === 'assassinate',
    why: '`nokill` with `assassinate`: the objective is a kill',
  },
  {
    when: (m) => m.nokill && m.waves !== null,
    why: '`nokill` with `waves`: reinforcements walk into the route the approach depends on being empty',
  },
  {
    when: (m) => m.timeLimit > 0 && m.objective === 'survive',
    why: '`timelimit` with `survive`: the mission already has a clock, and the two run opposite ways',
  },
];

/** A contiguous block of hut or factory tiles, grouped at parse time. */
export interface BuildingSpec {
  kind: 'hut' | 'factory' | 'outpost' | 'bunker';
  /** Derived from the character: an outpost is the squad's to hold. */
  role: 'spawner' | 'protect' | 'neutral';
  /** Tile coordinates the building occupies. */
  tiles: Array<[number, number]>;
  centre: Vec2;
  /** Bounding box in tiles, for sprite placement. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/**
 * A mission that attacks in waves rather than reacting to being walked into.
 *
 * `waves: 5@22` -- five waves, twenty-two seconds apart. The men come out of
 * the standing garrison buildings, so this is a schedule, not a headcount: what
 * a wave is *worth* depends on how many huts the player has left standing.
 */
export interface WaveSpec {
  count: number;
  interval: number;
}

/**
 * Somewhere the mission wants people taken to, and how big the thing there is.
 *
 * `pad` is the half-extent of whatever sits under the point -- zero for a bare
 * `X` marker on the ground, half a tent's wider side for a tent. Everything
 * that asks "is somebody at the extraction" adds it to its own radius, so the
 * question is always *how close to the edge of it*, never *how close to the
 * middle of it*.
 */
export interface Zone extends Vec2 {
  pad: number;
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

  /**
   * What the mission asks of you, after `covert` has been unfolded into
   * `reach` + `nokill`. A map file may still say `covert`; nothing downstream
   * of the parser ever sees it.
   */
  objective: ObjectiveKind;
  /**
   * The mission is lost the moment the kill count leaves zero -- a rule layered
   * on top of the objective rather than fused into it.
   *
   * `covert` used to *be* an objective, and it was two ideas welded together:
   * reach the extraction, and kill nobody. That worked exactly once. The moment
   * a mission wanted "recover the hostages without firing a shot" there was
   * nowhere to put it -- the only way to say it would have been a
   * `covert-rescue` objective, then a `covert-collect` one, and so on for every
   * pairing. As a modifier it costs a header line instead.
   */
  nokill: boolean;
  /**
   * Seconds before the mission is lost, or 0 for no clock.
   *
   * A modifier rather than an objective, so any mission can be made a race
   * without a `reach-but-quickly` objective existing. Distinct from `duration`,
   * which is how long `survive` wants you to *last* -- the two run in opposite
   * directions and declaring both is rejected.
   */
  timeLimit: number;
  /**
   * The only route to something runs through a building that must be levelled.
   *
   * Declared, never inferred. Levelling a hut turns its tiles into walkable
   * rubble, so a wall of huts really is a door you have to knock down -- but the
   * completability fill treats every building as solid, and it has to, or an
   * objective accidentally sealed behind one would start passing the gate. So a
   * map that wants the puzzle says so, and `npm run check` then admits the
   * second fill for that map only. A map that needs it and does not declare it
   * fails, which is what keeps it from ever happening by accident.
   */
  gated: boolean;
  /** The garrison's standing orders; bends the difficulty levers. */
  doctrine: DoctrineId;
  /** Seconds to hold out, for `survive`; seconds to stand in the zone, for `hold`. */
  duration: number;
  /** Set by a `waves:` header; null on a map whose garrison merely reacts. */
  waves: WaveSpec | null;
  /** One-line description of the mission's new idea, shown on the menu. */
  brief: string;
  mechanic: string;

  playerSpawns: Vec2[];
  /**
   * How many men this mission fields.
   *
   * Defaults to the number of `P` markers, which is what every campaign map
   * relies on. A `squad:` header overrides it downward, so a mission can send
   * one man into a place six would never get out of.
   */
  squadSize: number;
  enemySpawns: Vec2[];
  sniperSpawns: Vec2[];
  bazookaSpawns: Vec2[];
  patrolNodes: Vec2[];
  crates: Vec2[];
  barrels: Vec2[];
  mines: Vec2[];
  hostages: Vec2[];
  /** Objective items for a `collect` mission. Not ammo crates. */
  supplies: Vec2[];
  /** The officer a `assassinate` mission is about. One per map. */
  officers: Vec2[];
  extraction: Zone[];
  buildings: BuildingSpec[];
}

/** `5@22`, or a bare `5` to take the default interval. Anything else is off. */
function parseWaves(src: string | undefined): WaveSpec | null {
  if (!src) return null;
  const m = /^(\d+)\s*(?:@\s*([\d.]+))?$/.exec(src.trim());
  if (!m) return null;
  const count = Number(m[1]);
  if (count <= 0) return null;
  return { count, interval: Number(m[2]) || CONFIG.wave.interval };
}

const OBJECTIVES: ObjectiveKind[] = [
  'eliminate', 'demolish', 'rescue', 'reach', 'survive', 'covert',
  'hold', 'collect', 'assassinate',
];
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
  // What the file asked for, before `covert` is unfolded. An unknown objective
  // falls back rather than failing, so a typo costs flavour and not the build.
  const askedFor: ObjectiveKind = OBJECTIVES.includes(header.objective as ObjectiveKind)
    ? (header.objective as ObjectiveKind)
    : 'eliminate';

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
    // `covert` is an alias, unfolded here so exactly one place in the codebase
    // knows it is not really an objective of its own.
    objective: askedFor === 'covert' ? 'reach' : askedFor,
    nokill: askedFor === 'covert' || header.nokill === 'true',
    timeLimit: Math.max(0, Number(header.timelimit) || 0),
    gated: header.gated === 'true',
    doctrine: isDoctrineId(header.doctrine ?? '') ? (header.doctrine as DoctrineId) : 'garrison',
    duration: Number(header.duration) || 90,
    waves: parseWaves(header.waves),
    brief: header.brief ?? '',
    mechanic: header.mechanic ?? '',
    playerSpawns: [],
    squadSize: 0,
    enemySpawns: [],
    sniperSpawns: [],
    bazookaSpawns: [],
    patrolNodes: [],
    crates: [],
    barrels: [],
    mines: [],
    hostages: [],
    supplies: [],
    officers: [],
    extraction: [],
    buildings: [],
  };

  for (const rule of CONTRADICTIONS) {
    if (rule.when(map)) throw new Error(`${id}: ${rule.why}`);
  }

  const centre = (x: number, y: number): Vec2 => ({ x: (x + 0.5) * tile, y: (y + 0.5) * tile });
  /** Where every marker stood, so the ground under it can be resolved after. */
  const markers: Array<[number, number]> = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = x < row.length ? row[x] : '.';
      let t = LEGEND[ch];
      if (t === undefined) {
        const under = MARKERS[ch];
        if (under === undefined) throw new Error(`unknown map character '${ch}' at ${x},${y}`);
        t = under;
        markers.push([x, y]);
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
        else if (ch === 'k') map.supplies.push(p);
        else if (ch === 'C') map.officers.push(p);
        else if (ch === 'X') map.extraction.push({ ...p, pad: 0 });
      }
      grid[y * width + x] = t;
    }
  }

  resolveMarkerGround(map, rows, markers);
  map.pristine = grid.slice();
  // Declared size wins, clamped to the men the map actually has room for; with
  // no header it is simply however many `P` markers were placed.
  const declared = Number(header.squad) || 0;
  map.squadSize = declared > 0
    ? Math.min(declared, map.playerSpawns.length)
    : map.playerSpawns.length;
  map.buildings = findBuildings(map);
  // Tents double as delivery/extraction points, so a rescue map only has to
  // draw one rather than also remembering to mark it with an X.
  for (const centreOf of tentCentres(map)) map.extraction.push(centreOf);
  return map;
}

/**
 * Ground a marker may be standing on, once it has been lifted off the map.
 *
 * Deliberately not every walkable tile. Water and quicksand are walkable and
 * are *hazards*: inheriting one would put a man in a bog because a bog happened
 * to be next door, which changes how the mission plays rather than how it
 * looks. A tent is excluded for a harder reason -- `tentCentres` scans for it,
 * so inheriting one would conjure an extraction zone out of a crate.
 */
const MARKER_GROUND: Tile[] = [
  Tile.Grass, Tile.Sand, Tile.Road, Tile.TallGrass, Tile.Ice, Tile.Rubble, Tile.Bridge,
];

/**
 * Puts the surrounding ground back under every entity marker.
 *
 * A marker used to leave Grass, always. On a jungle map nobody noticed; on sand
 * or snow every soldier, crate and mine punched a single green tile into the
 * desert -- one hard-edged 16px square per entity, which is exactly the defect
 * the density rules exist to prevent, and there were forty-five of them on
 * Minefield alone. A crate on a sand island sat in its own little lawn.
 *
 * Resolved from the *original characters* rather than from the grid, in a pass
 * of its own, so the answer cannot depend on the order tiles were written in.
 * Rings widen outward because a cluster of six men has no un-marked neighbour
 * at radius one, and falls back to Grass only when nothing walkable is near --
 * which keeps the old behaviour as the floor rather than as the rule.
 */
function resolveMarkerGround(map: GameMap, rows: string[], markers: Array<[number, number]>): void {
  const charAt = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || y >= rows.length || x >= map.width) return null;
    return x < rows[y].length ? rows[y][x] : '.';
  };

  for (const [mx, my] of markers) {
    let chosen: Tile | null = null;
    for (let r = 1; r <= 4 && chosen === null; r++) {
      const tally = new Map<Tile, number>();
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // The ring only, so nearer ground always outvotes further ground.
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ch = charAt(mx + dx, my + dy);
          if (ch === null) continue;
          const t = LEGEND[ch];
          if (t === undefined || !MARKER_GROUND.includes(t)) continue;
          tally.set(t, (tally.get(t) ?? 0) + 1);
        }
      }
      // Ties break on the lower tile id, so parsing the same file twice cannot
      // produce two different maps.
      let best: Tile | null = null;
      let bestN = 0;
      for (const t of MARKER_GROUND) {
        const n = tally.get(t) ?? 0;
        if (n > bestN) { best = t; bestN = n; }
      }
      if (best !== null) chosen = best;
    }
    if (chosen !== null && chosen !== Tile.Grass) map.grid[my * map.width + mx] = chosen;
  }
}

/** Flood-fills contiguous hut and factory tiles into building records. */
function findBuildings(map: GameMap): BuildingSpec[] {
  const seen = new Uint8Array(map.width * map.height);
  const out: BuildingSpec[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = tileAt(map, x, y);
      if ((t !== Tile.Hut && t !== Tile.Factory && t !== Tile.Outpost && t !== Tile.Bunker)
        || seen[y * map.width + x]) continue;

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

      const kind = t === Tile.Factory ? 'factory'
        : t === Tile.Outpost ? 'outpost'
        : t === Tile.Bunker ? 'bunker'
        : 'hut';
      out.push({
        kind,
        // The map says what a building is for by which character it is drawn
        // with, so a mission's mechanics live in the mission file.
        // A bunker is a thing to hold, like an outpost; it just cannot be lost.
        role: kind === 'outpost' || kind === 'bunker' ? 'protect' : 'spawner',
        tiles,
        centre: { x: ((x0 + x1) / 2 + 0.5) * map.tile, y: ((y0 + y1) / 2 + 0.5) * map.tile },
        x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1,
      });
    }
  }
  return out;
}

/**
 * One zone per contiguous block of tent tiles, sized to the block.
 *
 * The `pad` is what stops a delivery circle being swallowed by the building it
 * is drawn on. A tent is usually 2x2 of 16px tiles, so its centre -- which is
 * the only point this used to return -- sits 16px from its own edge, and
 * `deliverRadius` of 18 cleared the footprint by two pixels. In practice that
 * meant walking three freed prisoners *onto* the tent one at a time, which is
 * exactly as fiddly as it sounds. Measured from the edge instead, a tent of any
 * size has a ring around it rather than a dot inside it.
 */
function tentCentres(map: GameMap): Zone[] {
  const seen = new Uint8Array(map.width * map.height);
  const out: Zone[] = [];
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
      out.push({
        x: ((x0 + x1) / 2 + 0.5) * map.tile,
        y: ((y0 + y1) / 2 + 0.5) * map.tile,
        // Half the wider side. Not the half-diagonal: a square pad this size
        // plus the delivery radius already clears the corners comfortably, and
        // the diagonal would make a big tent's ring look detached from it.
        pad: (Math.max(x1 - x0, y1 - y0) + 1) * map.tile / 2,
      });
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
