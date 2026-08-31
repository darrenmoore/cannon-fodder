import { CONFIG } from '../config.js';
import { sfxExplosion } from '../shell/audio.js';
import { setTile } from './map.js';
import { circleBlocked } from './pathfind.js';
import { Tile } from './tiles.js';
import { EnemyKind, EnemyState } from '../types.js';
import { makeEnemy } from './world.js';
import type { Building, Vec2 } from '../types.js';
import type { World } from './world.js';

/**
 * Huts and factories.
 *
 * In the original, anything with a door kept producing troopers until you blew
 * it up -- which is why levels build pressure instead of presenting a fixed
 * headcount, and why you need explosives rather than just rifles. Rifle rounds
 * barely scratch a building; grenades, rockets and barrels level it.
 *
 * A demolished building turns its tiles to rubble, which opens the ground up
 * for movement and permanently changes the shape of the level.
 */

/** Ticks reinforcement spawning and the smoke coming off the ruins. */
export function stepBuildings(world: World, dt: number): void {
  for (const b of world.buildings) {
    b.flash = Math.max(0, b.flash - dt * 3);

    if (!b.standing) {
      // A wreck keeps smoking, heavily at first and then just smouldering, so
      // it stays readable as "this one is dealt with" from across the map.
      b.ruinAge += dt;
      const heat = Math.max(0.12, 1 - b.ruinAge / CONFIG.building.smokeDuration);
      if (Math.random() < heat * 0.75) {
        world.fx.smoke(
          { x: b.centre.x + (Math.random() - 0.5) * b.w * 12, y: b.centre.y + (Math.random() - 0.5) * b.h * 8 },
          heat,
        );
      }
      continue;
    }

    // A building on its last legs starts to burn before it comes down.
    b.damageStage = b.hp > b.maxHp * 0.66 ? 0 : b.hp > b.maxHp * 0.3 ? 1 : 2;
    if (b.damageStage === 2 && Math.random() < 0.14) {
      world.fx.smoke({ x: b.centre.x + (Math.random() - 0.5) * 10, y: b.centre.y - 6 }, 0.4);
    }

    // Only reinforce while the squad is near enough to be threatened by it.
    const near = world.soldiers.some(
      (s) => s.alive && Math.hypot(s.pos.x - b.centre.x, s.pos.y - b.centre.y) < CONFIG.building.spawnAggroRange,
    );
    if (!near) continue;

    b.spawnTimer -= dt;
    if (b.spawnTimer > 0) continue;
    b.spawnTimer = CONFIG.building.spawnInterval * world.levers.spawnInterval;
    if (b.spawned >= world.levers.maxSpawned) continue;

    const door = findDoorway(world, b);
    if (!door) continue;

    const counter = { nextId: world.nextId };
    const enemy = makeEnemy(counter, door, EnemyKind.Rifle, null, world.levers, b.id);
    // A trooper that just watched you attack its hut knows exactly where to go.
    enemy.state = EnemyState.Investigate;
    enemy.investigate = world.lastKnown ? { ...world.lastKnown } : { ...door };
    enemy.memory = CONFIG.enemy.alertMemory;
    world.nextId = counter.nextId;
    world.enemies.push(enemy);
    world.actors.push(enemy);
    world.enemyTotal++;
    b.spawned++;
  }
}

/** An open tile next to the building for a trooper to step out onto. */
function findDoorway(world: World, b: Building): Vec2 | null {
  const t = world.map.tile;
  const candidates: Vec2[] = [];
  for (let y = b.y0 - 1; y <= b.y0 + b.h; y++) {
    for (let x = b.x0 - 1; x <= b.x0 + b.w; x++) {
      const inside = x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h;
      if (inside) continue;
      const p = { x: (x + 0.5) * t, y: (y + 0.5) * t };
      if (!circleBlocked(world.map, p.x, p.y, CONFIG.enemy.radius)) candidates.push(p);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

/** Rifle rounds chip; explosives do real damage. Returns true if it collapsed. */
export function damageBuilding(world: World, b: Building, amount: number): boolean {
  if (!b.standing) return false;
  b.hp -= amount;
  b.flash = 1;
  if (b.hp > 0) return false;
  collapse(world, b);
  return true;
}

/** The building nearest a point that a blast or round actually overlaps. */
export function buildingAt(world: World, x: number, y: number, radius = 0): Building | null {
  const t = world.map.tile;
  for (const b of world.buildings) {
    if (!b.standing) continue;
    for (const [tx, ty] of b.tiles) {
      // Closest point on the tile box to the test point.
      const cx = Math.max(tx * t, Math.min(x, (tx + 1) * t));
      const cy = Math.max(ty * t, Math.min(y, (ty + 1) * t));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) return b;
    }
  }
  return null;
}

function collapse(world: World, b: Building): void {
  b.standing = false;
  b.hp = 0;
  b.damageStage = 2;
  b.ruinAge = 0;

  // The footprint becomes walkable rubble, reshaping the level for good.
  for (const [tx, ty] of b.tiles) setTile(world.map, tx, ty, Tile.Rubble);

  world.fx.explosion(b.centre);
  world.shake += CONFIG.fx.screenShake * 1.6;
  sfxExplosion();

  // Debris, thrown wide enough to read as a building rather than a grenade.
  for (const [tx, ty] of b.tiles) {
    const p = { x: (tx + 0.5) * world.map.tile, y: (ty + 0.5) * world.map.tile };
    world.fx.explosion(p);
    world.fx.pendingDecals.push({ kind: 'scorch', pos: p, seed: (Math.random() * 1e9) | 0 });
  }
}
