import { resolveOverlaps } from './steering.js';
import { stepBuildings, stepWaves } from './buildings.js';
import { stepBullets, stepDying, stepGrenades } from './combat.js';
import { stepEnemies } from './enemies.js';
import { stepHostages } from './hostages.js';
import { stepMines } from './mines.js';
import { stepPickups } from './pickups.js';
import { applyPressure, stepPressure } from './pressure.js';
import { stepSoldiers } from './troops.js';
import { CONFIG } from '../config.js';
import { Phase } from '../types.js';
import type { Vec2 } from '../types.js';
import type { World } from './world.js';

/**
 * One ordered pass over a world, and the only one.
 *
 * This used to live inside `Game.step`, which was correct while a mission was
 * the only thing that ran a world. It is not any more: the arena
 * (`sim/arena-game.ts`) runs the same systems with no squad and no player, and
 * a second copy of this sequence would drift from the first within a week --
 * silently, because the two would still both *work*.
 *
 * So the order lives here and the callers keep only what is theirs. `Game`
 * keeps input, the camera and the objective; `ArenaGame` keeps the camera and
 * its commanders. Neither knows what order the systems run in, which is the
 * point.
 *
 * **The order matters, and here is why.** Soldiers and enemies both steer and
 * integrate against terrain first; only then does `resolveOverlaps` push apart
 * anyone who ended up sharing space. Doing it the other way round would let a
 * de-overlap push survive into the next frame with a unit standing inside a
 * tree. `stepPressure` runs before any AI because it decides what this step's
 * levers are and every system below reads them rather than the base. The
 * spatial hash is rebuilt before the AI so separation queries see this step's
 * layout, and `stepWaves` runs after `stepBuildings` so a hut levelled this
 * step is already missing from the wave it would otherwise contribute to.
 */

/**
 * What the player is doing to their squad this step, or null where there is no
 * squad and no player.
 *
 * Null is not "a squad with no orders" -- it means `stepSoldiers` is not called
 * at all, which is what the arena needs. A world with an empty `soldiers` array
 * would step harmlessly either way; passing null says so out loud, and costs
 * the arena nothing to be explicit about.
 */
export interface SquadInput {
  /** Where the player is firing, or null when nobody is holding the button. */
  manualAim: Vec2 | null;
  /** The cursor in world space, for idle men to watch. Null when it is away. */
  cursor: Vec2 | null;
}

export function stepWorld(world: World, dt: number, squad: SquadInput | null): void {
  world.time += dt;
  world.phaseTime += dt;

  if (world.phase !== Phase.Playing) {
    // The world keeps ticking so blood settles and the last shots land -- and
    // so the man killed on the winning shot finishes falling rather than
    // freezing mid-collapse under the results panel.
    world.fx.step(dt);
    stepBullets(world, dt);
    stepGrenades(world, dt);
    stepDying(world, dt);
    return;
  }

  world.orderMarker = Math.max(0, world.orderMarker - dt);
  world.grenadeCooldown = Math.max(0, world.grenadeCooldown - dt);

  // Both before the AI runs: the pressure decides what this step's levers are,
  // and every system below reads them rather than the base.
  stepPressure(world, dt);
  applyPressure(world);

  // Rebuilt before the AI runs, so separation queries see this step's layout.
  world.hash.rebuild(world.actors);

  if (squad) stepSoldiers(world, dt, squad.manualAim, squad.cursor);
  stepEnemies(world, dt);

  // Hard no-overlap pass, after everyone has moved and slid along walls.
  resolveOverlaps(world.actors, world.hash, world.map, 2);

  // The squad's trail goes cold, which is what lets you break contact.
  world.lastKnownAge += dt;
  world.fog.step(world.map, world.soldiers, dt);

  stepHostages(world, dt);
  stepBuildings(world, dt);
  // After the buildings, so a hut levelled this step is already missing from
  // the wave it would otherwise have contributed to.
  stepWaves(world, dt);
  stepBullets(world, dt);
  stepGrenades(world, dt);
  stepDying(world, dt);
  stepMines(world, dt);
  stepPickups(world);
  world.fx.step(dt);
  if (world.map.arena) reap(world, dt);
}

/**
 * Clearing the dead out of an endless battle.
 *
 * A mission never needed this and must never have it. It is bounded -- fifty
 * units, a few minutes -- and `world.soldiers` has to keep its dead, because
 * the results panel reads the names off it. So a corpse simply stays in the
 * arrays with `alive: false`, which costs nothing worth measuring.
 *
 * An arena is not bounded. At roughly five deaths every ten seconds, twenty
 * minutes leaves some six hundred dead entries that every system still walks
 * every step -- and it is worse than a slow leak, because `nearestVisibleFoe`
 * scans `world.actors` where it used to scan at most six soldiers. Every living
 * man pays for every corpse, sixty times a second, and the mode gets quietly
 * choppier the longer it is left running. Measured before this existed: sixty
 * eight actors after ninety seconds, of which twenty were alive.
 *
 * Safe at `deathTime`, because by then `stepDying` has already stamped the body
 * into the decal layer -- the corpse the viewer sees is a painted pixel, not
 * this object, and nothing else holds a reference: `e.target` is cleared for
 * every enemy when an actor dies (`combat.ts`), and a squad drops its dead each
 * step (`arena.ts`).
 */
function reap(world: World, dt: number): void {
  world.reapTimer -= dt;
  if (world.reapTimer > 0) return;
  world.reapTimer = 2;

  const gone = (a: { alive: boolean; deathTime: number }): boolean =>
    !a.alive && a.deathTime >= CONFIG.fx.deathTime;
  if (!world.actors.some(gone)) return;

  world.enemies = world.enemies.filter((e) => !gone(e));
  world.actors = world.actors.filter((a) => !gone(a));
}
