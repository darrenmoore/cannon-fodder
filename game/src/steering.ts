import { CONFIG } from './config.js';
import { circleBlocked } from './pathfind.js';
import { defAtWorld, nearestWalkable } from './map.js';
import type { GameMap } from './map.js';
import type { Actor, Vec2 } from './types.js';

/**
 * Movement for everything that walks. Three things have to hold at once:
 * units head where they were told, they never overlap each other, and they
 * never end a step inside a tree. The order below is what makes that work --
 * steer, integrate against walls, push apart, then re-check walls, so a
 * de-overlap push can never shove somebody into scenery.
 *
 * Terrain modulates all of it: quicksand and water slow you to a crawl, roads
 * speed you up, and ice cuts your acceleration so you slide through turns.
 */

const cellKey = (cx: number, cy: number): number => (cx * 73856093) ^ (cy * 19349663);

/** Uniform grid over actor positions, rebuilt each step. Cheap at this scale. */
export class SpatialHash {
  private readonly cell: number;
  private readonly buckets = new Map<number, Actor[]>();

  constructor(cell = 24) {
    this.cell = cell;
  }

  rebuild(actors: Actor[]): void {
    this.buckets.clear();
    for (const a of actors) {
      if (!a.alive) continue;
      const key = cellKey(Math.floor(a.pos.x / this.cell), Math.floor(a.pos.y / this.cell));
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(a);
      else this.buckets.set(key, [a]);
    }
  }

  /** Every actor in the cells overlapping a circle. May include the caller. */
  query(x: number, y: number, radius: number, out: Actor[]): Actor[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / this.cell);
    const maxX = Math.floor((x + radius) / this.cell);
    const minY = Math.floor((y - radius) / this.cell);
    const maxY = Math.floor((y + radius) / this.cell);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(cellKey(cx, cy));
        if (bucket) for (const a of bucket) out.push(a);
      }
    }
    return out;
  }
}

const scratch: Actor[] = [];

export interface SteerOpts {
  speed: number;
  accel: number;
  separation: number;
  separationRadius: number;
  /** Acceleration multiplier while on ice. */
  iceAccel: number;
}

/**
 * Accelerates an actor toward `target`, blending in a push away from crowded
 * neighbours. Separation is a suggestion that keeps the herd looking loose;
 * `resolveOverlaps` is what actually guarantees they never sit on top of
 * one another.
 */
export function steer(
  actor: Actor,
  target: Vec2 | null,
  hash: SpatialHash,
  map: GameMap,
  opts: SteerOpts,
  dt: number,
): void {
  let dx = 0;
  let dy = 0;

  if (target) {
    dx = target.x - actor.pos.x;
    dy = target.y - actor.pos.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      // Ease off over the last few pixels so units settle instead of jittering.
      const scale = Math.min(1, len / 6) / len;
      dx *= scale;
      dy *= scale;
    } else {
      dx = 0;
      dy = 0;
    }
  }

  const neighbours = hash.query(actor.pos.x, actor.pos.y, opts.separationRadius, scratch);
  let sx = 0;
  let sy = 0;
  for (const other of neighbours) {
    if (other === actor || !other.alive) continue;
    const ox = actor.pos.x - other.pos.x;
    const oy = actor.pos.y - other.pos.y;
    const d2 = ox * ox + oy * oy;
    if (d2 >= opts.separationRadius * opts.separationRadius || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    // Falls off linearly to zero at the separation radius.
    const push = (1 - d / opts.separationRadius) / d;
    sx += ox * push;
    sy += oy * push;
  }

  let vx = dx + sx * opts.separation;
  let vy = dy + sy * opts.separation;
  const mag = Math.hypot(vx, vy);
  if (mag > 1) {
    vx /= mag;
    vy /= mag;
  }

  const terrain = defAtWorld(map, actor.pos.x, actor.pos.y);
  actor.wading = terrain.wade;
  actor.sliding = terrain.slippery;

  const speed = opts.speed * terrain.speed;
  const desiredX = vx * speed;
  const desiredY = vy * speed;
  // Ice cuts responsiveness hard, so momentum carries you through corners.
  const accel = terrain.slippery ? opts.accel * opts.iceAccel : opts.accel;
  const k = Math.min(1, (accel * dt) / Math.max(1, speed));
  actor.vel.x += (desiredX - actor.vel.x) * k;
  actor.vel.y += (desiredY - actor.vel.y) * k;
}

/**
 * Integrates velocity with per-axis collision, so a unit walking into a
 * treeline slides along it instead of sticking to it.
 */
export function moveWithCollision(actor: Actor, map: GameMap, dt: number): void {
  const stepX = actor.vel.x * dt;
  const stepY = actor.vel.y * dt;

  if (stepX !== 0) {
    const nx = actor.pos.x + stepX;
    if (circleBlocked(map, nx, actor.pos.y, actor.radius)) actor.vel.x = 0;
    else actor.pos.x = nx;
  }
  if (stepY !== 0) {
    const ny = actor.pos.y + stepY;
    if (circleBlocked(map, actor.pos.x, ny, actor.radius)) actor.vel.y = 0;
    else actor.pos.y = ny;
  }

  const moved = Math.hypot(actor.pos.x - actor.prev.x, actor.pos.y - actor.prev.y);
  actor.walkPhase += moved;
}

/**
 * The hard no-overlap guarantee. Runs after integration: each overlapping pair
 * is pushed apart by half the penetration, and any push that would land a unit
 * in solid terrain is given entirely to the other unit instead.
 */
export function resolveOverlaps(actors: Actor[], hash: SpatialHash, map: GameMap, iterations = 2): void {
  const nearby: Actor[] = [];
  for (let pass = 0; pass < iterations; pass++) {
    for (const a of actors) {
      if (!a.alive) continue;
      hash.query(a.pos.x, a.pos.y, a.radius * 2 + 2, nearby);
      for (const b of nearby) {
        // Each unordered pair is handled once.
        if (b === a || !b.alive || b.id <= a.id) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const minDist = a.radius + b.radius;
        let d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;

        let ux: number;
        let uy: number;
        if (d2 < 1e-6) {
          // Exactly coincident: shove apart on a deterministic axis.
          ux = a.id % 2 === 0 ? 1 : 0;
          uy = a.id % 2 === 0 ? 0 : 1;
          d2 = 0;
        } else {
          const d = Math.sqrt(d2);
          ux = dx / d;
          uy = dy / d;
        }
        const overlap = minDist - Math.sqrt(d2);
        const half = overlap * 0.5;

        const aOk = !circleBlocked(map, a.pos.x - ux * half, a.pos.y - uy * half, a.radius);
        const bOk = !circleBlocked(map, b.pos.x + ux * half, b.pos.y + uy * half, b.radius);

        if (aOk && bOk) {
          a.pos.x -= ux * half; a.pos.y -= uy * half;
          b.pos.x += ux * half; b.pos.y += uy * half;
        } else if (bOk) {
          // A is pinned against scenery, so B absorbs the whole correction.
          if (!circleBlocked(map, b.pos.x + ux * overlap, b.pos.y + uy * overlap, b.radius)) {
            b.pos.x += ux * overlap; b.pos.y += uy * overlap;
          } else {
            b.pos.x += ux * half; b.pos.y += uy * half;
          }
        } else if (aOk) {
          if (!circleBlocked(map, a.pos.x - ux * overlap, a.pos.y - uy * overlap, a.radius)) {
            a.pos.x -= ux * overlap; a.pos.y -= uy * overlap;
          } else {
            a.pos.x -= ux * half; a.pos.y -= uy * half;
          }
        }
        // If neither can move, both are wedged; the next step will free them.
      }
    }
  }
}

/**
 * Last line of defence: nudge anyone who has ended up inside scenery back out.
 * Tries a fine ring first, which handles the common case of clipping a corner,
 * then falls back to a tile-grid search -- a fine search alone cannot escape
 * something wider than it, like the middle of a deep river.
 */
export function unstick(actor: Actor, map: GameMap): void {
  if (!circleBlocked(map, actor.pos.x, actor.pos.y, actor.radius)) return;

  for (let r = 1; r <= 6; r++) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const nx = actor.pos.x + Math.cos(angle) * r;
      const ny = actor.pos.y + Math.sin(angle) * r;
      if (!circleBlocked(map, nx, ny, actor.radius)) {
        actor.pos.x = nx;
        actor.pos.y = ny;
        actor.vel.x = 0;
        actor.vel.y = 0;
        return;
      }
    }
  }

  const out = nearestWalkable(map, actor.pos);
  if (out.x !== actor.pos.x || out.y !== actor.pos.y) {
    actor.pos.x = out.x;
    actor.pos.y = out.y;
    actor.vel.x = 0;
    actor.vel.y = 0;
  }
}

/** Ring of arrival slots around a point, so a herd spreads out on arrival. */
export function formationSlots(centre: Vec2, count: number, spacing: number): Vec2[] {
  const slots: Vec2[] = [{ x: centre.x, y: centre.y }];
  let ring = 1;
  while (slots.length < count) {
    const perRing = Math.max(4, Math.round((Math.PI * 2 * ring) / 1.15));
    for (let i = 0; i < perRing && slots.length < count; i++) {
      const angle = (i / perRing) * Math.PI * 2 + ring * 0.6;
      slots.push({
        x: centre.x + Math.cos(angle) * ring * spacing,
        y: centre.y + Math.sin(angle) * ring * spacing,
      });
    }
    ring++;
  }
  return slots;
}

/**
 * Greedy nearest-first assignment of actors to slots. Not optimal, but it is
 * enough to stop the herd crossing over itself on the way in.
 */
export function assignSlots<T extends { pos: Vec2 }>(units: T[], slots: Vec2[]): Map<T, Vec2> {
  const out = new Map<T, Vec2>();
  const taken = new Set<number>();
  for (const unit of units) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (taken.has(i)) continue;
      const d = (slots[i].x - unit.pos.x) ** 2 + (slots[i].y - unit.pos.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      taken.add(best);
      out.set(unit, slots[best]);
    }
  }
  return out;
}

export const soldierSteerOpts: SteerOpts = {
  speed: CONFIG.soldier.speed,
  accel: CONFIG.soldier.accel,
  separation: CONFIG.soldier.separation,
  separationRadius: CONFIG.soldier.separationRadius,
  iceAccel: CONFIG.soldier.iceAccel,
};
