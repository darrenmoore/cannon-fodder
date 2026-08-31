import { CONFIG } from '../config.js';
import { sfxExplosion } from '../shell/audio.js';
import { hasLineOfSight, setTile } from './map.js';
import { circleBlocked } from './pathfind.js';
import { Tile } from './tiles.js';
import { EnemyKind, EnemyState } from '../types.js';
import { makeEnemy, squadCentre } from './world.js';
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
 *
 * A `waves:` map spends the same buildings differently: instead of trickling a
 * man out whenever the squad wanders close, the garrison empties itself on a
 * schedule. Both routes go through the same doorways, and both stop dead when
 * the building comes down -- which is the point of doing it this way rather
 * than spawning at the map edge. Levelling the huts is how you turn the tap
 * off, and a mission with no huts left cannot send another wave.
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

    // An outpost is the squad's to hold, not a barracks. This is the whole of
    // the Last Stand complaint: the building the player was told to defend was
    // producing the men attacking him.
    if (b.role !== 'spawner') continue;

    // On a wave map the schedule owns the doorway. Leaving the trickle running
    // underneath it would fill the gaps that make waves legible as waves.
    if (world.map.waves) continue;

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

/**
 * Sends the next wave, if it is due.
 *
 * The size is `maxSpawned` -- the lever that already means "how hard a hut
 * pushes back" -- scaled by the fraction of the garrison still standing, so
 * every hut the player levels is visibly subtracted from the next attack and
 * the last one turns the mechanic off entirely. Difficulty is carried mostly by
 * that size rather than by the interval; see `CONFIG.wave.pace`.
 */
export function stepWaves(world: World, dt: number): void {
  const spec = world.map.waves;
  if (!spec || world.wavesSent >= spec.count) return;

  world.waveTimer -= dt;
  if (world.waveTimer > 0) return;

  world.wavesSent++;
  const { pace } = CONFIG.wave;
  world.waveTimer = spec.interval * (1 - pace + pace * world.levers.spawnInterval);

  const spawners = world.buildings.filter((b) => b.role === 'spawner');
  const standing = spawners.filter((b) => b.standing);
  if (standing.length === 0 || spawners.length === 0) return;

  /*
   * Bigger every time, and starting at a number that is already a fight.
   *
   * The old size was `maxSpawned` scaled by how many huts were still standing,
   * which meant a mission that got *easier* as it went on and could be switched
   * off by levelling the buildings -- so wave one was the peak and the rest was
   * arithmetic. Wave spawners are indestructible now (see `createWorld`), so
   * there is nothing to switch off and the only shape left is the ramp.
   *
   * Difficulty multiplies through, rather than the ramp replacing it: Elite's
   * `maxSpawned` is what makes its fifth wave a different event from Rookie's.
   */
  const { first, growth, sizeFrom, sizeRange } = CONFIG.wave;
  const step = 1 + (world.wavesSent - 1) * growth;
  const scale = Math.min(sizeRange[1], Math.max(sizeRange[0], world.levers.maxSpawned / sizeFrom));
  const size = Math.max(1, Math.round(first * step * scale));

  /*
   * And they come for what you are defending, not for you.
   *
   * Waves used to be spawned straight into `Investigate` aimed at the squad,
   * which walked every man at wherever the players' men happened to be -- so a
   * squad that stood off to one side pulled the whole assault away from the
   * outpost it was supposed to be protecting, and the objective became a
   * spectator. Where a mission has something to hold, they are spawned `Idle`
   * instead, which is the state `siege` acts on: they walk at the keep and
   * shoot it, and `acquire` still turns them onto any soldier who gets in the
   * way. Where there is nothing to hold, the squad is the objective and the old
   * behaviour is the right one.
   */
  const keep = world.buildings.find((b) => b.role === 'protect' && b.standing);
  const target = keep ? keep.centre : squadCentre(world);

  // Spread across the doorways rather than emptying one at a time, so a wave
  // arrives from several sides instead of forming a queue at the nearest hut.
  const order = standing.map((b, i) => ({ b, k: (i + world.wavesSent) % standing.length }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.b);

  let sent = 0;
  for (let i = 0; i < size; i++) {
    const b = order[i % order.length];
    const door = findDoorway(world, b, true);
    // No hidden way out of this hut means this man does not come. Camping on
    // top of the huts is supposed to be worth something, and a trooper
    // materialising six feet away in plain sight is the one thing waves must
    // never do.
    if (!door) continue;

    const counter = { nextId: world.nextId };
    const enemy = makeEnemy(counter, door, EnemyKind.Rifle, null, world.levers, b.id);
    if (keep) {
      // `siege` owns him from here: walk at the keep, stop at firing range,
      // shoot it. He is not investigating anything -- he was told where to go.
      enemy.state = EnemyState.Idle;
    } else {
      enemy.state = EnemyState.Investigate;
      enemy.investigate = target ? { ...target } : { ...door };
      enemy.memory = CONFIG.enemy.alertMemory;
    }
    world.nextId = counter.nextId;
    world.enemies.push(enemy);
    world.actors.push(enemy);
    world.enemyTotal++;
    b.spawned++;
    sent++;
  }

  if (sent > 0 && target) world.fx.popup(target, `wave ${world.wavesSent}`, '#ff8a3c');
}

/**
 * An open tile next to the building for a trooper to step out onto.
 *
 * `hidden` additionally refuses any doorway a living soldier can both see and
 * is close enough to have in view -- distance alone is not enough, because a
 * hut fifty pixels away behind a treeline is a perfectly fair place to come
 * from, and line of sight alone is not enough on an open map.
 */
function findDoorway(world: World, b: Building, hidden = false): Vec2 | null {
  const t = world.map.tile;
  const candidates: Vec2[] = [];
  for (let y = b.y0 - 1; y <= b.y0 + b.h; y++) {
    for (let x = b.x0 - 1; x <= b.x0 + b.w; x++) {
      const inside = x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h;
      if (inside) continue;
      const p = { x: (x + 0.5) * t, y: (y + 0.5) * t };
      if (circleBlocked(world.map, p.x, p.y, CONFIG.enemy.radius)) continue;
      if (hidden && seenBySquad(world, p)) continue;
      candidates.push(p);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

/** Near enough to a living soldier, and in his line of sight. */
function seenBySquad(world: World, p: Vec2): boolean {
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    if (Math.hypot(s.pos.x - p.x, s.pos.y - p.y) > CONFIG.wave.hideRadius) continue;
    if (hasLineOfSight(world.map, s.pos, p)) return true;
  }
  return false;
}

/** Rifle rounds chip; explosives do real damage. Returns true if it collapsed. */
/**
 * Hurts a building, and says which kind of hurt it was.
 *
 * `at` and `from` are where the round stopped and where it came from; with them
 * a scratch can throw chips back along its own path instead of flashing the
 * whole building white. The flash is reserved for a hit that moved the bar
 * enough to see, which is what makes the two readable as different events
 * rather than as one event with an invisible magnitude.
 */
export function damageBuilding(
  world: World,
  b: Building,
  amount: number,
  at: Vec2 | null = null,
  from: Vec2 | null = null,
): boolean {
  if (!b.standing) return false;

  /*
   * An indestructible building still *reacts*. It flashes, it spalls, and its
   * bar is drawn -- it just never runs out. Swallowing the hit silently would
   * be the bug that was reported in the first place ("they can be shot but the
   * power bar never goes down"), only deliberate; the player has to be able to
   * tell "my rounds are not landing" from "my rounds do not matter here".
   */
  if (b.indestructible) {
    b.flash = Math.max(b.flash, 0.4);
    if (at) world.fx.spall(at, from ?? b.centre);
    return false;
  }

  b.hp -= amount;

  const scratch = amount < b.maxHp * CONFIG.building.scratchFraction;
  if (scratch && at) world.fx.spall(at, from ?? b.centre);
  // A scratch still lights the building, faintly -- enough to place the hit,
  // not enough to claim it landed.
  b.flash = scratch ? 0.25 : 1;

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
