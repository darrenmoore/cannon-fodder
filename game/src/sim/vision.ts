/**
 * Who can see whom, and from how far.
 *
 * ## The bug this module was written to fix
 *
 * `TILES[Tile.TallGrass]` has carried `blocksSight: true` since it was added,
 * `nearestVisibleSoldier` is commented *"Tall grass breaks sight, which is
 * what makes it worth hiding in"*, and `undergrowth.map` -- 52% tall grass --
 * ships with the brief line *"Tall grass hides you but not your bullets."*
 *
 * None of it was true. `walkLine` is a DDA that returns *visible* the moment
 * it reaches the target's tile, **before testing that tile**:
 *
 *     if (x === ex && y === ey) return true;
 *     const def = TILES[tileAt(map, x, y)];
 *     if (def.blocksSight) return false;
 *
 * So grass between you and them blocked sight, and the grass you were standing
 * in did nothing at all. A man who ran into the long grass and stopped was
 * seen perfectly. The mission designed around the mechanic was designed around
 * a mechanic that did not exist (201-qa 010).
 *
 * ## What replaces it
 *
 * Not a fix to `walkLine`. Making the target's own tile opaque would make a
 * man in grass invisible from one pixel away, which is nonsense, and it could
 * not express water at all -- a swimmer is low in the water, which is a
 * *detection* effect and not a geometric one.
 *
 * Instead, standing in cover shrinks how far you can be **noticed**, with a
 * floor: hidden across a clearing, plainly visible at three tiles. That is the
 * behaviour the brief actually described -- break a chase by getting into the
 * bushes, not vanish from the man standing on your foot -- and it gives grass
 * and deep water one mechanism rather than two.
 *
 * ## Both ways, deliberately
 *
 * The same rule hides *enemies* from the squad. If cover only worked for the
 * player, `undergrowth` would get easier twice over: the squad would cross it
 * untouched *and* still see everything. `hiddenFromSquad` is what the renderer
 * asks before drawing an enemy.
 *
 * The floor is not a tuning knob. It is the entire reason a 52%-grass mission
 * survives this change, so if concealment ever needs weakening, move the tile
 * value or the difficulty lever -- never the floor.
 */

import { TILES } from './tiles.js';
import { hasLineOfSight, tileAtWorld } from './map.js';
import type { GameMap } from './map.js';
import type { Actor, Vec2 } from '../types.js';

/**
 * Nobody is ever concealed closer than this, in tiles.
 *
 * Three: close enough that a patrol walking past still finds you, far enough
 * that breaking contact and getting into cover works.
 */
const FLOOR_TILES = 3;

/** How exposed this point is, 1 in the open and lower in cover. */
export function concealmentAt(map: GameMap, x: number, y: number): number {
  return TILES[tileAtWorld(map, x, y)].concealment;
}

/**
 * How far `target` can be noticed from, given a watcher's ordinary range.
 *
 * `lever` is the difficulty's `concealment`: 1 lets cover work fully, 0 means
 * the watcher sees straight through it. It is interpolated rather than
 * multiplied so that a lever of 0 restores the open-ground range exactly.
 */
export function noticeRange(base: number, map: GameMap, target: Vec2, lever: number): number {
  const cover = concealmentAt(map, target.x, target.y);
  if (cover >= 1) return base;
  const eased = 1 - (1 - cover) * Math.max(0, Math.min(1, lever));
  return Math.max(FLOOR_TILES * map.tile, base * eased);
}

/**
 * Can a watcher at `from` with range `base` see `target` right now?
 *
 * Line of sight and notice range in one call, so the two sides of the mechanic
 * cannot drift apart -- which is exactly what happened to the comment and the
 * code the first time.
 */
export function canNotice(
  map: GameMap, from: Vec2, target: Vec2, base: number, lever: number,
): boolean {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const range = noticeRange(base, map, target, lever);
  if (dx * dx + dy * dy > range * range) return false;
  return hasLineOfSight(map, from, target);
}

/**
 * True when no living soldier is close enough to pick this actor out of the
 * cover he is standing in.
 *
 * The player's half of the symmetry. The fog answers "is this ground lit";
 * this answers "and is he findable on it".
 */
export function hiddenFromSquad(
  map: GameMap, watchers: readonly Actor[], target: Vec2, base: number, lever: number,
): boolean {
  const cover = concealmentAt(map, target.x, target.y);
  // The overwhelmingly common case: open ground, nothing to work out.
  if (cover >= 1) return false;
  const range = noticeRange(base, map, target, lever);
  const r2 = range * range;
  for (const s of watchers) {
    if (!s.alive) continue;
    const dx = target.x - s.pos.x;
    const dy = target.y - s.pos.y;
    if (dx * dx + dy * dy <= r2) return false;
  }
  return true;
}
