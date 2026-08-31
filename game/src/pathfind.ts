import { isSolidAt } from './map.js';
import type { GameMap } from './map.js';
import type { Vec2 } from './types.js';

/**
 * A Dijkstra flow field over the walkable tiles, built once per move order and
 * shared by the whole herd. Every soldier just samples it, so ordering six men
 * across the map costs one search, not six.
 */
export interface FlowField {
  goal: Vec2;
  /** Cost-to-goal per tile; Infinity where unreachable. */
  dist: Float64Array;
  /** Index of the next tile on the way to the goal, or -1. */
  next: Int32Array;
  width: number;
  height: number;
}

// 8-way neighbours. Diagonals cost sqrt(2) and are only used when both
// orthogonal partners are open, so units never clip a tree corner.
const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Binary min-heap keyed on cost; plenty for a grid this size. */
class Heap {
  private items: number[] = [];
  private costs: number[] = [];

  get size(): number { return this.items.length; }

  push(item: number, cost: number): void {
    this.items.push(item);
    this.costs.push(cost);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.items.length && this.costs[l] < this.costs[best]) best = l;
        if (r < this.items.length && this.costs[r] < this.costs[best]) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const item = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = item;
    const cost = this.costs[a];
    this.costs[a] = this.costs[b];
    this.costs[b] = cost;
  }
}

export function buildFlowField(map: GameMap, goal: Vec2): FlowField {
  const { width, height } = map;
  const dist = new Float64Array(width * height).fill(Infinity);
  const next = new Int32Array(width * height).fill(-1);

  const gx = Math.min(width - 1, Math.max(0, Math.floor(goal.x / map.tile)));
  const gy = Math.min(height - 1, Math.max(0, Math.floor(goal.y / map.tile)));
  const start = gy * width + gx;

  const heap = new Heap();
  dist[start] = 0;
  heap.push(start, 0);

  while (heap.size > 0) {
    const cur = heap.pop();
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const cd = dist[cur];

    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (isSolidAt(map, nx, ny)) continue;
      // No cutting diagonally past a corner.
      if (dx !== 0 && dy !== 0 && (isSolidAt(map, cx + dx, cy) || isSolidAt(map, cx, cy + dy))) continue;

      const ni = ny * width + nx;
      const nd = cd + cost;
      if (nd < dist[ni] - 1e-9) {
        dist[ni] = nd;
        next[ni] = cur;   // the field flows backwards, toward the goal
        heap.push(ni, nd);
      }
    }
  }

  return { goal: { x: goal.x, y: goal.y }, dist, next, width, height };
}

const tileIndex = (map: GameMap, p: Vec2): number => {
  const tx = Math.floor(p.x / map.tile);
  const ty = Math.floor(p.y / map.tile);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return -1;
  return ty * map.width + tx;
};

/**
 * Where a unit standing at p should walk next. Prefers a straight run at the
 * goal when the corridor is clear -- that is what stops movement from looking
 * like it is snapped to a tile grid -- and falls back to the field otherwise.
 */
export function flowTarget(field: FlowField, map: GameMap, p: Vec2, radius: number): Vec2 | null {
  if (hasWalkableLine(map, p, field.goal, radius)) return field.goal;

  const i = tileIndex(map, p);
  if (i < 0 || !Number.isFinite(field.dist[i])) return null;

  // Look a few steps down the chain and take the furthest one we can walk to
  // directly, so units cut corners smoothly instead of zig-zagging.
  let node = field.next[i];
  let best: Vec2 | null = null;
  for (let step = 0; step < 4 && node >= 0; step++) {
    const nx = node % field.width;
    const ny = (node - nx) / field.width;
    const c = { x: (nx + 0.5) * map.tile, y: (ny + 0.5) * map.tile };
    if (step === 0 || hasWalkableLine(map, p, c, radius)) best = c;
    node = field.next[node];
  }
  return best;
}

/** Samples a circle of the given radius along the segment; false if it clips solid terrain. */
export function hasWalkableLine(map: GameMap, a: Vec2, b: Vec2, radius: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return !circleBlocked(map, a.x, a.y, radius);

  const stepCount = Math.ceil(len / (map.tile * 0.5));
  for (let s = 0; s <= stepCount; s++) {
    const t = s / stepCount;
    if (circleBlocked(map, a.x + dx * t, a.y + dy * t, radius)) return false;
  }
  return true;
}

/** True if a circle at (x, y) overlaps any solid tile. */
export function circleBlocked(map: GameMap, x: number, y: number, radius: number): boolean {
  const minTx = Math.floor((x - radius) / map.tile);
  const maxTx = Math.floor((x + radius) / map.tile);
  const minTy = Math.floor((y - radius) / map.tile);
  const maxTy = Math.floor((y + radius) / map.tile);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidAt(map, tx, ty)) continue;
      // Closest point on the tile box to the circle centre.
      const cx = Math.max(tx * map.tile, Math.min(x, (tx + 1) * map.tile));
      const cy = Math.max(ty * map.tile, Math.min(y, (ty + 1) * map.tile));
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy < radius * radius) return true;
    }
  }
  return false;
}

/**
 * A* between two world points, used by enemies that get wedged on scenery.
 * Enemies steer directly most of the time; this is the escape hatch.
 */
export function findPath(map: GameMap, from: Vec2, to: Vec2, limit = 3000): Vec2[] {
  const { width, height } = map;
  const startI = tileIndex(map, from);
  const goalI = tileIndex(map, to);
  if (startI < 0 || goalI < 0) return [];

  const gx = goalI % width;
  const gy = (goalI - gx) / width;
  const gScore = new Float64Array(width * height).fill(Infinity);
  const cameFrom = new Int32Array(width * height).fill(-1);
  const closed = new Uint8Array(width * height);
  const heap = new Heap();

  const h = (i: number): number => {
    const x = i % width;
    const y = (i - x) / width;
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    // Octile distance -- admissible for 8-way movement.
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore[startI] = 0;
  heap.push(startI, h(startI));
  let expanded = 0;

  while (heap.size > 0 && expanded++ < limit) {
    const cur = heap.pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (isSolidAt(map, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isSolidAt(map, cx + dx, cy) || isSolidAt(map, cx, cy + dy))) continue;
      const ni = ny * width + nx;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni] - 1e-9) {
        gScore[ni] = tentative;
        cameFrom[ni] = cur;
        heap.push(ni, tentative + h(ni));
      }
    }
  }

  if (!Number.isFinite(gScore[goalI])) return [];
  const out: Vec2[] = [];
  for (let i = goalI; i !== -1 && i !== startI; i = cameFrom[i]) {
    const x = i % width;
    const y = (i - x) / width;
    out.push({ x: (x + 0.5) * map.tile, y: (y + 0.5) * map.tile });
  }
  return out.reverse();
}
