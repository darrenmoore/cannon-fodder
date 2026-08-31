import { CONFIG } from '../config.js';
import { RANKS, rankTier } from './campaign.js';
import { sfxOrder } from '../shell/audio.js';
import { buildingAt } from './buildings.js';
import { fire } from './combat.js';
import { raiseNotice } from './enemies.js';
import { hasLineOfFire, hasLineOfSight, nearestWalkable, tileAt, tileAtWorld } from './map.js';
import { buildFlowField, circleBlocked, flowTarget, hasWalkableLine } from './pathfind.js';
import { assignSlots, bankFrom, formationSlots, moveWithCollision, soldierSteerOpts, steer, stumble, unstick } from './steering.js';
import { Tile, TILES } from './tiles.js';
import { SoldierState } from '../types.js';
import type { Actor, Building, Soldier, Vec2 } from '../types.js';
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
/** Below this speed while trying to reach a slot counts as no progress. */
const STUCK_SPEED = 6;
/** Seconds of no progress before a soldier is given a different slot. */
const STUCK_TRIGGER = 0.7;

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

  // Clicking a standing building is an order to shoot at it -- unless it is the
  // one the mission is lost without, in which case it is somewhere to stand.
  const building = buildingAt(world, p.x, p.y, 2);
  if (building && building.role !== 'protect') return { kind: 'building', building };

  return { kind: 'ground' };
}

/** Walks the squad to a point, spreading them over a ring of arrival slots. */
export function orderMove(world: World, rawGoal: Vec2): void {
  const goal = nearestWalkable(world.map, rawGoal);
  world.squadTarget = null;
  world.targetBuilding = null;
  world.field = buildFlowField(world.map, goal, true);
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
  world.field = buildFlowField(world.map, target.pos, true);
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
  world.field = buildFlowField(world.map, approach, true);
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
  const spacing = CONFIG.soldier.formationSpacing;
  const jitter = CONFIG.soldier.formationJitter;

  /*
   * The ring, roughened.
   *
   * A clean ring of slots put six men down in a shape you could measure with a
   * compass, identical every time the same spot was clicked -- which reads as a
   * parade rather than a squad taking a position. The offset is rolled per
   * order rather than per soldier so that clicking the same place twice gives a
   * different arrangement, which is what the owner actually asked for.
   */
  const candidates = formationSlots(centre, living.length * 3, spacing)
    .map((p) => ({
      x: p.x + (Math.random() * 2 - 1) * jitter,
      y: p.y + (Math.random() * 2 - 1) * jitter,
    }))
    .filter((p) => !circleBlocked(world.map, p.x, p.y, CONFIG.soldier.radius))
    .slice(0, Math.max(living.length, 1));

  if (candidates.length === 0) {
    for (const s of living) { s.slot = { ...centre }; s.slotStuck = 0; }
    return;
  }
  const assigned = assignSlots(living, candidates);
  for (const s of living) {
    s.slot = assigned.get(s) ?? { ...centre };
    s.slotStuck = 0;
  }
}

/**
 * A different slot for a man who cannot reach the one he was given.
 *
 * Arrival slots are drawn as a ring around the click without knowing what is
 * standing there, so ordering a squad into a treeline hands somebody a slot
 * inside a trunk, and he shoves at it until another order arrives. This looks
 * for somewhere he can actually stand *and actually walk to*, and prefers cover
 * while it is looking -- which is the other half of what the owner asked for:
 * clicking trees should put men between the trunks, not in a line at the edge.
 */
function reslot(world: World, s: Soldier): void {
  const spacing = CONFIG.soldier.formationSpacing;
  const goal = world.orderGoal ?? s.pos;
  let best: Vec2 | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = spacing * (0.5 + Math.random() * 2);
    const p = { x: goal.x + Math.cos(a) * r, y: goal.y + Math.sin(a) * r };
    if (circleBlocked(world.map, p.x, p.y, s.radius)) continue;
    // Reachable in a straight line from where he is now: a slot he can see is
    // a slot he will not get wedged on the way to.
    if (!hasWalkableLine(world.map, s.pos, p, s.radius)) continue;

    // Nearer the order is better; cover is better still.
    const d = Math.hypot(p.x - goal.x, p.y - goal.y);
    const inCover = TILES[tileAtWorld(world.map, p.x, p.y)].blocksSight;
    const score = -d + (inCover ? spacing * 1.5 : 0);
    if (score > bestScore) { bestScore = score; best = p; }
  }

  s.slotStuck = 0;
  if (best) s.slot = best;
}

export function stepSoldiers(world: World, dt: number, manualFireAt: Vec2 | null): void {
  const cfg = CONFIG.soldier;
  footsteps(world, dt);

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
        world.field = buildFlowField(world.map, world.squadTarget.pos, true);
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

    // Blown off his feet: no orders reach him until he is back on them.
    if (stumble(s, world.map, dt)) continue;

    // Same rule as the garrison: a firing solution found from the middle of a
    // river is not a reason to stop there, because he cannot fire from it.
    const moveTarget = chooseMoveTarget(world, s) ?? bankFrom(world.map, s);
    steer(s, moveTarget, world.hash, world.map, soldierSteerOpts, dt);
    moveWithCollision(s, world.map, dt);
    unstick(s, world.map);

    // Trying to reach a slot and getting nowhere: give him a different one
    // rather than letting him shove at a tree until the next order.
    if (moveTarget && s.slot && Math.hypot(s.vel.x, s.vel.y) < STUCK_SPEED) {
      s.slotStuck += dt;
      if (s.slotStuck > STUCK_TRIGGER) reslot(world, s);
    } else if (s.slotStuck > 0) {
      s.slotStuck = Math.max(0, s.slotStuck - dt * 2);
    }

    if (s.wading && Math.random() < 0.08 && Math.hypot(s.vel.x, s.vel.y) > 8) {
      // Mud throws clods, not spray. `sim` decides *which*, because it is the
      // side that knows what he is standing in; `fx` decides what that looks
      // like, so no colour crosses the boundary.
      const t = tileAt(world.map, Math.floor(s.pos.x / world.map.tile), Math.floor(s.pos.y / world.map.tile));
      world.fx.splash(s.pos, t === Tile.Quicksand);
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
    const edge = veteranEdge(s);
    s.fireCooldown = edge.fireInterval;
    fire(world, s, aim, edge.spread);
  }
}

/**
 * What rank is worth in a firefight.
 *
 * Interpolated smoothly across the whole ladder rather than stepped at each
 * promotion, so surviving always improves a soldier slightly instead of doing
 * nothing for four missions and then a lot. A Private fires at exactly the
 * numbers in CONFIG; only a General sees the full CONFIG.veteran multipliers,
 * and nobody has ever met one.
 */
function veteranEdge(s: Soldier): { spread: number; fireInterval: number } {
  const cfg = CONFIG.soldier;
  if (s.rank <= 0) return { spread: cfg.spread, fireInterval: cfg.fireInterval };
  const t = rankTier(s.rank) / (RANKS.length - 1);
  return {
    spread: cfg.spread * (1 + (CONFIG.veteran.spread - 1) * t),
    fireInterval: cfg.fireInterval * (1 + (CONFIG.veteran.fireInterval - 1) * t),
  };
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

/**
 * Walking makes a noise, and it is the quietest noise in the game.
 *
 * Nothing here used to: `raiseAlarm` had six callers -- gunfire, a round
 * stopping on scenery, a death, an explosion, a wounded man, and first sight --
 * and movement was not among them. So a squad was only ever *seen*, never
 * heard, and creeping was worth nothing that hiding was not already worth.
 *
 * It is `raiseNotice`, never `raiseAlarm`, and that is the load-bearing part.
 * A garrison that could be walked onto the player would change every existing
 * mission and make open ground unusable; one that only turns its head gives the
 * player the thing the brief asked for -- *"they might hear you, they might not
 * walk your way, but they'll face the direction for a bit"* -- which is a
 * warning, and a warning is what makes moving carefully a decision.
 *
 * Loudest from the fastest man rather than from the middle of the herd: one
 * soldier sprinting across a gap is what gets the squad noticed, and the noise
 * comes from him.
 */
function footsteps(world: World, dt: number): void {
  world.stepNoise -= dt;
  if (world.stepNoise > 0) return;
  world.stepNoise = CONFIG.enemy.stepInterval;

  let loudest: Soldier | null = null;
  let best = 0;
  for (const s of world.soldiers) {
    if (!s.alive || s.wading) continue;
    const speed = Math.hypot(s.vel.x, s.vel.y);
    if (speed > best) { best = speed; loudest = s; }
  }
  if (!loudest) return;

  // Scaled by how fast he is actually moving, so a man edging forward is
  // quieter than one running -- which is the only control the player has over
  // it, and it should therefore do something.
  const share = Math.min(1, best / CONFIG.soldier.speed);
  raiseNotice(world, loudest.pos, CONFIG.enemy.stepNoise * share);
}
