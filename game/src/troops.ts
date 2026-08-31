import { CONFIG } from './config.js';
import { sfxOrder } from './audio.js';
import { buildingAt } from './buildings.js';
import { fire } from './combat.js';
import { hasLineOfFire, hasLineOfSight, nearestWalkable } from './map.js';
import { buildFlowField, circleBlocked, flowTarget } from './pathfind.js';
import { assignSlots, formationSlots, moveWithCollision, soldierSteerOpts, steer, unstick } from './steering.js';
import { SoldierState } from './types.js';
import type { Actor, Building, Soldier, Vec2 } from './types.js';
import type { World } from './world.js';

/**
 * The player squad.
 *
 * One order produces one flow field, which the whole herd samples -- that is
 * what makes them move as a group rather than six independent pathfinders. Each
 * soldier is also given a personal arrival slot, which is what stops them all
 * piling onto the single pixel you clicked.
 */

/** How close to the order goal a soldier switches from the field to its own slot. */
const SLOT_HANDOFF = 40;
/** Distance at which a soldier considers itself parked. */
const ARRIVED = 2.5;
/** The squad target has to move this far before the field is rebuilt. */
const REPATH_DISTANCE = 20;

/** Whatever the click landed on: an enemy, a building, or bare ground. */
export type ClickTarget =
  | { kind: 'enemy'; actor: Actor }
  | { kind: 'building'; building: Building }
  | { kind: 'ground' };

export function classifyClick(world: World, p: Vec2, slack = 9): ClickTarget {
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
    if (d <= e.radius + slack && d < bestD) { bestD = d; best = e; }
  }
  if (best) return { kind: 'enemy', actor: best };

  // Clicking a standing building is an order to shoot at it.
  const building = buildingAt(world, p.x, p.y, 2);
  if (building) return { kind: 'building', building };

  return { kind: 'ground' };
}

/** Walks the squad to a point, spreading them over a ring of arrival slots. */
export function orderMove(world: World, rawGoal: Vec2): void {
  const goal = nearestWalkable(world.map, rawGoal);
  world.squadTarget = null;
  world.targetBuilding = null;
  world.field = buildFlowField(world.map, goal);
  world.orderGoal = goal;
  world.orderMarker = 0.6;

  assignFormation(world, goal);
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    s.state = SoldierState.Moving;
  }
  sfxOrder();
}

/** Sends the squad after an enemy: close to firing range, then shoot it. */
export function orderAttack(world: World, target: Actor): void {
  world.squadTarget = target;
  world.targetBuilding = null;
  world.field = buildFlowField(world.map, target.pos);
  world.orderGoal = { ...target.pos };
  world.orderMarker = 0.6;
  world.lastTargetPos = { ...target.pos };
  world.repathTimer = 0;

  assignFormation(world, target.pos);
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    s.state = SoldierState.Engaging;
  }
  sfxOrder();
}

/**
 * Orders fire onto a building. Rifles barely scratch it, so this mostly serves
 * to walk the squad into grenade range of something that needs levelling.
 */
export function orderDemolish(world: World, building: Building): void {
  world.squadTarget = null;
  world.targetBuilding = building;
  const approach = nearestWalkable(world.map, building.centre);
  world.field = buildFlowField(world.map, approach);
  world.orderGoal = { ...building.centre };
  world.orderMarker = 0.6;

  assignFormation(world, approach);
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    s.state = SoldierState.Engaging;
  }
  sfxOrder();
}

/** Ring of walkable slots around a point, one per surviving soldier. */
function assignFormation(world: World, centre: Vec2): void {
  const living = world.soldiers.filter((s) => s.alive);
  const spacing = CONFIG.soldier.radius * 2.6;
  // Over-generate, then drop any slot sitting in scenery.
  const candidates = formationSlots(centre, living.length * 3, spacing)
    .filter((p) => !circleBlocked(world.map, p.x, p.y, CONFIG.soldier.radius))
    .slice(0, Math.max(living.length, 1));

  if (candidates.length === 0) {
    for (const s of living) s.slot = { ...centre };
    return;
  }
  const assigned = assignSlots(living, candidates);
  for (const s of living) s.slot = assigned.get(s) ?? { ...centre };
}

export function stepSoldiers(world: World, dt: number, manualFireAt: Vec2 | null): void {
  const cfg = CONFIG.soldier;

  // Keep the field pointed at a target that is running away.
  if (world.squadTarget) {
    if (!world.squadTarget.alive) {
      world.squadTarget = null;
    } else {
      world.repathTimer -= dt;
      const moved = world.lastTargetPos
        ? Math.hypot(world.squadTarget.pos.x - world.lastTargetPos.x, world.squadTarget.pos.y - world.lastTargetPos.y)
        : Infinity;
      if (world.repathTimer <= 0 && moved > REPATH_DISTANCE) {
        world.field = buildFlowField(world.map, world.squadTarget.pos);
        world.orderGoal = { ...world.squadTarget.pos };
        world.lastTargetPos = { ...world.squadTarget.pos };
        assignFormation(world, world.squadTarget.pos);
        world.repathTimer = 0.35;
      }
    }
  }
  if (world.targetBuilding && !world.targetBuilding.standing) world.targetBuilding = null;

  for (const s of world.soldiers) {
    if (!s.alive) continue;
    s.prev.x = s.pos.x;
    s.prev.y = s.pos.y;
    s.fireCooldown -= dt;

    const moveTarget = chooseMoveTarget(world, s);
    steer(s, moveTarget, world.hash, world.map, soldierSteerOpts, dt);
    moveWithCollision(s, world.map, dt);
    unstick(s, world.map);

    if (s.wading && Math.random() < 0.08 && Math.hypot(s.vel.x, s.vel.y) > 8) {
      world.fx.splash(s.pos);
    }

    updateFiring(world, s, manualFireAt, cfg);
  }
}

/** Where this soldier is walking this step, or null if it should hold still. */
function chooseMoveTarget(world: World, s: Soldier): Vec2 | null {
  const cfg = CONFIG.soldier;

  // Engaging: close until in range with a clear shot, then stand and fire.
  const holdAt = world.squadTarget?.alive
    ? world.squadTarget.pos
    : world.targetBuilding?.standing
      ? world.targetBuilding.centre
      : null;

  if (holdAt) {
    const d = Math.hypot(holdAt.x - s.pos.x, holdAt.y - s.pos.y);
    if (d <= cfg.fireRange - cfg.engageBuffer && hasLineOfFire(world.map, s.pos, holdAt)) {
      s.state = SoldierState.Engaging;
      return null;
    }
  }

  if (s.state === SoldierState.Idle || !s.slot) return null;

  const toSlot = Math.hypot(s.slot.x - s.pos.x, s.slot.y - s.pos.y);
  if (toSlot <= ARRIVED) {
    if (!holdAt) s.state = SoldierState.Idle;
    return null;
  }

  // Near the destination, steer at the personal slot; the field only handles
  // the long haul, and following it all the way in would bunch everyone up.
  if (toSlot < SLOT_HANDOFF || !world.field) return s.slot;

  const via = flowTarget(world.field, world.map, s.pos, s.radius);
  return via ?? s.slot;
}

function updateFiring(world: World, s: Soldier, manualFireAt: Vec2 | null, cfg: typeof CONFIG.soldier): void {
  // Wading soldiers hold their weapons clear of the water and cannot shoot.
  if (s.wading) {
    if (Math.hypot(s.vel.x, s.vel.y) > 2) s.angle = Math.atan2(s.vel.y, s.vel.x);
    return;
  }

  let aim: Vec2 | null = null;

  if (manualFireAt) {
    aim = manualFireAt;
  } else if (world.squadTarget?.alive && inFiringSolution(world, s, world.squadTarget.pos)) {
    aim = world.squadTarget.pos;
  } else if (world.targetBuilding?.standing && inFiringSolution(world, s, world.targetBuilding.centre)) {
    aim = world.targetBuilding.centre;
  } else if (cfg.autoEngage) {
    const opportunist = nearestVisibleEnemy(world, s);
    if (opportunist) aim = opportunist.pos;
  }

  if (!aim) {
    if (Math.hypot(s.vel.x, s.vel.y) > 2) s.angle = Math.atan2(s.vel.y, s.vel.x);
    return;
  }

  s.angle = Math.atan2(aim.y - s.pos.y, aim.x - s.pos.x);
  if (s.fireCooldown <= 0) {
    s.fireCooldown = cfg.fireInterval;
    fire(world, s, aim, cfg.spread);
  }
}

const inFiringSolution = (world: World, s: Soldier, at: Vec2): boolean =>
  Math.hypot(at.x - s.pos.x, at.y - s.pos.y) <= CONFIG.soldier.fireRange &&
  hasLineOfFire(world.map, s.pos, at);

/** Closest enemy this soldier can actually see and shoot right now. */
function nearestVisibleEnemy(world: World, s: Soldier): Actor | null {
  let best: Actor | null = null;
  // Deliberately shorter than an ordered attack: walking past a sentry should
  // not silently clear the map for you.
  let bestD: number = CONFIG.soldier.fireRange * CONFIG.soldier.autoEngageRange;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - s.pos.x, e.pos.y - s.pos.y);
    // Tall grass hides them from sight even though a round would get through.
    if (d < bestD && hasLineOfSight(world.map, s.pos, e.pos) && hasLineOfFire(world.map, s.pos, e.pos)) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
