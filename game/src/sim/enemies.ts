import { CONFIG } from '../config.js';
import { fire, throwGrenade } from './combat.js';
import { hasLineOfFire, hasLineOfSight } from './map.js';
import { circleBlocked, findPath, hasWalkableLine } from './pathfind.js';
import { moveWithCollision, steer, stumble, unstick } from './steering.js';
import { EnemyState, Faction } from '../types.js';
import type { SteerOpts } from './steering.js';
import type { Actor, Enemy, Vec2 } from '../types.js';
import type { World } from './world.js';

/**
 * Enemy AI.
 *
 * The base loop is a state machine -- idle or patrolling until you are seen,
 * a beat of reaction, then engage. What makes a fight feel different from one
 * mission to the next is layered on top of that:
 *
 *   - **Alerts.** A gunshot or a sighting wakes everyone within earshot, and
 *     they walk to it. This is what turns a map of isolated sentries into an
 *     enemy that reacts to you, and it is the single biggest difficulty lever.
 *   - **Hunters** keep going to the squad's last known position rather than
 *     giving up, so you cannot break contact by backing off.
 *   - **Rushers** ignore preferred range and close to knife distance.
 *   - **Flankers** approach off-axis instead of walking down your sights.
 *   - **Grenadiers** lob explosives at a clustered squad, punishing you for
 *     bunching up behind cover.
 *
 * Which of those any given enemy has is rolled at spawn from the difficulty
 * profile and the mission's doctrine -- see difficulty.ts.
 */

const STUCK_TRIGGER = 0.55;
/** Below this speed while trying to move counts as no progress. */
const STUCK_SPEED = 6;
/** How close counts as having reached the thing you went to look at. */
const ARRIVED = 9;
/** How far off his mark an idle man will drift while fidgeting. */
const FIDGET_RANGE = 7;

const steerOpts = (e: Enemy): SteerOpts => ({
  speed: e.stats.speed,
  accel: CONFIG.enemy.accel,
  separation: CONFIG.enemy.separation,
  separationRadius: CONFIG.enemy.separationRadius,
  iceAccel: CONFIG.enemy.iceAccel,
});

/**
 * Wakes everyone within earshot and sends them to look. Called for gunfire,
 * explosions, and the moment anybody first spots the squad.
 *
 * Enemies already fighting are left alone -- they have better information than
 * the alert does.
 */
export function raiseAlarm(world: World, at: Vec2, radius: number): void {
  if (radius <= 0) return;
  const r2 = radius * radius;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (e.state === EnemyState.Engage || e.state === EnemyState.Alert) continue;
    const dx = e.pos.x - at.x;
    const dy = e.pos.y - at.y;
    if (dx * dx + dy * dy > r2) continue;

    e.state = EnemyState.Investigate;
    e.investigate = { x: at.x, y: at.y };
    e.searchTime = 0;
    e.memory = CONFIG.enemy.alertMemory;
    e.path.length = 0;
  }
}

export function stepEnemies(world: World, dt: number): void {
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.prev.x = e.pos.x;
    e.prev.y = e.pos.y;
    e.fireCooldown -= dt;
    e.grenadeCooldown -= dt;

    // Blown off his feet. He keeps whatever he knew about you -- an explosion
    // is not amnesia -- but he cannot act on it until he lands.
    if (stumble(e, world.map, dt)) continue;

    acquire(world, e, dt);

    let moveTarget: Vec2 | null = null;
    switch (e.state) {
      case EnemyState.Idle:
        moveTarget = siege(world, e) ?? idleFidget(e, dt);
        break;
      case EnemyState.Patrol:
        moveTarget = siege(world, e) ?? patrol(world, e, dt);
        break;
      case EnemyState.Investigate:
        moveTarget = investigate(world, e, dt);
        break;
      case EnemyState.Alert:
        e.reaction -= dt;
        // Turn to face the threat while the reaction beat runs down.
        if (e.target) e.angle = Math.atan2(e.target.pos.y - e.pos.y, e.target.pos.x - e.pos.x);
        if (e.reaction <= 0) e.state = EnemyState.Engage;
        break;
      case EnemyState.Engage:
        moveTarget = engage(world, e);
        break;
    }

    if (moveTarget) moveTarget = viaPath(world, e, moveTarget);

    steer(e, moveTarget, world.hash, world.map, steerOpts(e), dt);
    moveWithCollision(e, world.map, dt);
    unstick(e, world.map);

    // No progress while trying to move means it is snagged on scenery.
    const speed = Math.hypot(e.vel.x, e.vel.y);
    if (moveTarget && speed < STUCK_SPEED) e.stuck += dt;
    else e.stuck = Math.max(0, e.stuck - dt * 2);

    if (!moveTarget && speed < 2 && e.target && e.state === EnemyState.Engage) {
      e.angle = Math.atan2(e.target.pos.y - e.pos.y, e.target.pos.x - e.pos.x);
    } else if (speed > 2) {
      e.angle = Math.atan2(e.vel.y, e.vel.x);
    }
  }
}

/** Picks up, keeps or forgets a target, and reports sightings to everyone else. */
function acquire(world: World, e: Enemy, dt: number): void {
  if (e.target && !e.target.alive) e.target = null;

  const seen = nearestVisibleSoldier(world, e);
  if (seen) {
    // Everyone shares what anyone sees: this is the squad's last known position.
    world.lastKnown = { x: seen.pos.x, y: seen.pos.y };
    world.lastKnownAge = 0;

    if (!e.target) {
      // First contact: freeze for a beat, then engage -- and shout.
      e.state = EnemyState.Alert;
      e.reaction = e.stats.reactionTime;
      e.path.length = 0;
      raiseAlarm(world, seen.pos, world.levers.hearing);
    }
    e.target = seen;
    e.memory = CONFIG.enemy.alertMemory;
    return;
  }

  if (!e.target) return;

  e.memory -= dt;
  if (e.memory > 0) return;

  // Lost them. A hunter goes looking; everyone else stands down.
  e.target = null;
  e.path.length = 0;
  if (e.traits.hunter && world.lastKnown) {
    e.state = EnemyState.Investigate;
    e.investigate = { ...world.lastKnown };
    e.searchTime = 0;
  } else {
    e.state = e.patrols ? EnemyState.Patrol : EnemyState.Idle;
    e.goal = null;
  }
}

function nearestVisibleSoldier(world: World, e: Enemy): Actor | null {
  let best: Actor | null = null;
  let bestD: number = e.stats.aggroRadius;
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    const d = Math.hypot(s.pos.x - e.pos.x, s.pos.y - e.pos.y);
    // Tall grass breaks sight, which is what makes it worth hiding in.
    if (d < bestD && hasLineOfSight(world.map, e.pos, s.pos)) { bestD = d; best = s; }
  }
  return best;
}

/**
 * Advancing on the thing the squad has been told to hold.
 *
 * With nobody to shoot at, a garrison used to stand around waiting to be
 * provoked, which made "hold out for two minutes" a test of patience rather
 * than of anything. If the map names a building the player must keep, an enemy
 * with no target walks to it and shoots it -- so the clock is not the enemy,
 * the enemy is.
 *
 * Returns null when there is nothing to besiege, so the ordinary idle and
 * patrol behaviour takes over.
 */
function siege(world: World, e: Enemy): Vec2 | null {
  const keep = world.buildings.find((b) => b.role === 'protect' && b.standing);
  if (!keep) return null;

  const dx = keep.centre.x - e.pos.x;
  const dy = keep.centre.y - e.pos.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Close enough, and with a clear line: shoot it.
  if (dist <= e.stats.fireRange && hasLineOfFire(world.map, e.pos, keep.centre) && !e.wading) {
    e.angle = Math.atan2(dy, dx);
    if (e.fireCooldown <= 0) {
      e.fireCooldown = e.stats.fireInterval * (0.8 + Math.random() * 0.4);
      fire(world, e, keep.centre, e.stats.spread);
    }
    return null;
  }
  return { x: keep.centre.x, y: keep.centre.y };
}

/**
 * A man standing at his post, not a bollard.
 *
 * Idle used to mean *perfectly* still -- an enemy who had not seen you was
 * indistinguishable from scenery until he opened fire, which made a quiet map
 * read as an empty one. Every persona fidgets now: a look left and right, a
 * shift of weight, and for anyone not rooted to a firing position, the odd step
 * off the mark. He never leaves his post, so this changes how the map *reads*
 * without changing where anybody is.
 */
function idleFidget(e: Enemy, dt: number): Vec2 | null {
  if (e.home && Math.hypot(e.home.x - e.pos.x, e.home.y - e.pos.y) > FIDGET_RANGE * 2) return e.home;

  e.idleTimer -= dt;
  if (e.idleTimer > 0) return null;

  // A rusher is twitchy; a sniper watching a road is not. Both move.
  const restless = e.traits.rusher ? 0.55 : e.traits.hunter ? 0.75 : 1;
  const [lo, hi] = CONFIG.enemy.fidgetPause;
  e.idleTimer = (lo + Math.random() * (hi - lo)) * restless;

  // Look somewhere new: a glance, not a spin. A full turn every few seconds
  // looks like a lighthouse rather than a sentry.
  e.angle += (Math.random() * 2 - 1) * 1.2;

  // Rooted men hold their firing position and only look; the rest may shuffle.
  if (e.rooted || !e.home || Math.random() < 0.45) return null;
  const a = Math.random() * Math.PI * 2;
  const r = FIDGET_RANGE * (0.4 + Math.random() * 0.6);
  return { x: e.home.x + Math.cos(a) * r, y: e.home.y + Math.sin(a) * r };
}

function patrol(world: World, e: Enemy, dt: number): Vec2 | null {
  if (e.pause > 0) {
    e.pause -= dt;
    return null;
  }
  if (!e.goal || Math.hypot(e.goal.x - e.pos.x, e.goal.y - e.pos.y) < 5 || e.stuck > STUCK_TRIGGER) {
    e.goal = pickPatrolPoint(world, e);
    e.stuck = 0;
    e.path.length = 0;
    const [lo, hi] = CONFIG.enemy.patrolPause;
    e.pause = lo + Math.random() * (hi - lo);
    return null;
  }
  return e.goal;
}

/**
 * Walking to whatever raised the alarm. A hunter keeps re-aiming at the squad's
 * last known position while the trail is warm, which is what makes it feel like
 * being pursued rather than like walking past a statue.
 */
function investigate(world: World, e: Enemy, dt: number): Vec2 | null {
  if (e.traits.hunter && world.lastKnown && world.lastKnownAge < CONFIG.enemy.trailMemory) {
    e.investigate = { ...world.lastKnown };
  }
  if (!e.investigate) {
    e.state = e.patrols ? EnemyState.Patrol : EnemyState.Idle;
    return null;
  }

  const d = Math.hypot(e.investigate.x - e.pos.x, e.investigate.y - e.pos.y);
  if (d > ARRIVED) return e.investigate;

  // Arrived. Sweep the area for a moment before giving up.
  e.searchTime += dt;
  e.angle += dt * 2.2;
  if (e.searchTime > CONFIG.enemy.searchTime) {
    e.investigate = null;
    e.searchTime = 0;
    e.state = e.patrols ? EnemyState.Patrol : EnemyState.Idle;
    e.goal = null;
  }
  return null;
}

/** A walkable point within the patrol radius of home, reachable in a straight line. */
function pickPatrolPoint(world: World, e: Enemy): Vec2 {
  const home = e.home ?? e.pos;
  for (let attempt = 0; attempt < 12; attempt++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * CONFIG.enemy.patrolRadius;
    const p = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
    if (circleBlocked(world.map, p.x, p.y, e.radius)) continue;
    if (hasWalkableLine(world.map, e.pos, p, e.radius)) return p;
  }
  return { ...home };
}

/**
 * Fighting. Holds roughly `preferredRange` -- unless it is a rusher, which
 * closes right in -- and approaches off-axis if it flanks. Snipers and
 * bazookateers are rooted and hold whatever position they already have.
 */
function engage(world: World, e: Enemy): Vec2 | null {
  const target = e.target;
  if (!target) {
    e.state = e.patrols ? EnemyState.Patrol : EnemyState.Idle;
    return null;
  }

  const dx = target.pos.x - e.pos.x;
  const dy = target.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Shooting needs a clear line of fire; seeing needs a clear line of sight.
  const canShoot = hasLineOfFire(world.map, e.pos, target.pos);

  if (canShoot && dist <= e.stats.fireRange && !e.wading) {
    e.angle = Math.atan2(dy, dx);
    if (e.fireCooldown <= 0) {
      e.fireCooldown = e.stats.fireInterval * (0.8 + Math.random() * 0.4);
      fire(world, e, target.pos, e.stats.spread);
    }
  }

  tryGrenade(world, e, dist);

  // A sniper that gives up its position is a dead sniper.
  if (e.rooted) {
    if (dist < e.stats.preferredRange * 0.45) return backOff(world, e, dx, dy, dist, 20);
    return null;
  }

  const preferred = e.traits.rusher ? CONFIG.enemy.rushRange : e.stats.preferredRange;
  if (!canShoot) return approach(e, target.pos, dx, dy, dist);
  if (dist > preferred * 1.15) return approach(e, target.pos, dx, dy, dist);
  // Rushers never give ground -- that is the whole point of them.
  if (!e.traits.rusher && dist < preferred * 0.6) return backOff(world, e, dx, dy, dist, 24);
  return null;
}

/**
 * Where to walk to reach the target. A flanker aims at a point offset
 * perpendicular to the approach, so the squad gets hit from an angle it is not
 * already facing.
 */
function approach(e: Enemy, at: Vec2, dx: number, dy: number, dist: number): Vec2 {
  if (e.traits.flank <= 0) return at;
  // The offset fades as it closes, so the arc ends on the target.
  const strength = Math.min(1, dist / 140);
  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = e.traits.flank * e.traits.flankSide * strength;
  return { x: at.x + nx * offset, y: at.y + ny * offset };
}

/** Gives ground, but only onto open terrain. */
function backOff(world: World, e: Enemy, dx: number, dy: number, dist: number, by: number): Vec2 | null {
  const back = { x: e.pos.x - (dx / dist) * by, y: e.pos.y - (dy / dist) * by };
  return circleBlocked(world.map, back.x, back.y, e.radius) ? null : back;
}

/**
 * Grenadiers throw at the *centre of the nearest cluster* rather than at one
 * man, which is what makes bunching up behind a treeline dangerous.
 */
function tryGrenade(world: World, e: Enemy, dist: number): void {
  if (!e.traits.grenadier || e.grenades <= 0 || e.grenadeCooldown > 0) return;
  if (e.wading) return;
  if (dist > CONFIG.enemy.grenadeRange || dist < CONFIG.enemy.grenadeMinRange) return;

  // Find the tightest knot of soldiers worth spending a grenade on.
  let bestPos: Vec2 | null = null;
  let bestCount = 0;
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    let count = 0;
    let cx = 0;
    let cy = 0;
    for (const other of world.soldiers) {
      if (!other.alive) continue;
      if (Math.hypot(other.pos.x - s.pos.x, other.pos.y - s.pos.y) > CONFIG.grenade.blastRadius) continue;
      count++;
      cx += other.pos.x;
      cy += other.pos.y;
    }
    if (count > bestCount) {
      bestCount = count;
      bestPos = { x: cx / count, y: cy / count };
    }
  }

  if (!bestPos || bestCount < CONFIG.enemy.grenadeMinCluster) return;
  if (Math.hypot(bestPos.x - e.pos.x, bestPos.y - e.pos.y) > CONFIG.enemy.grenadeRange) return;

  e.grenades--;
  e.grenadeCooldown = CONFIG.enemy.grenadeCooldown;
  throwGrenade(world, e.pos, bestPos, Faction.Enemy);
}

/**
 * Straight line where possible, A* where not. The path is only computed once
 * an enemy has demonstrably failed to make progress, so this stays cheap.
 */
function viaPath(world: World, e: Enemy, goal: Vec2): Vec2 {
  if (e.stuck < STUCK_TRIGGER) {
    if (e.path.length === 0) return goal;
  } else if (e.path.length === 0) {
    e.path = findPath(world.map, e.pos, goal).slice(0, 40);
    e.stuck = 0;
    if (e.path.length === 0) return goal;
  }

  // Consume waypoints as they are reached, and drop the path once the goal is
  // in plain sight again.
  while (e.path.length > 0 && Math.hypot(e.path[0].x - e.pos.x, e.path[0].y - e.pos.y) < 7) {
    e.path.shift();
  }
  if (e.path.length === 0 || hasWalkableLine(world.map, e.pos, goal, e.radius)) {
    e.path.length = 0;
    return goal;
  }
  return e.path[0];
}
