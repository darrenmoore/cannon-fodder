import { hasLineOfSight, tileAt } from '../sim/map.js';
import { TILES } from '../sim/tiles.js';
import type { GameMap } from '../sim/map.js';
import type { Soldier } from '../types.js';

/**
 * Fog of war, at tile resolution.
 *
 * Two masks: what the squad can see *right now*, and what it has seen at some
 * point. The renderer blacks out the unexplored, dims the remembered, and hides
 * enemies you have no eyes on -- so on the harder difficulties you are fighting
 * something you have to find first.
 *
 * Recomputed on a timer rather than every frame. Line of sight per tile per
 * soldier is not free, and fog that updates ten times a second is
 * indistinguishable from fog that updates sixty.
 */

/** Seconds between recomputes. Fast enough that walking never outruns it. */
const UPDATE_INTERVAL = 0.08;

export class Fog {
  /** 1 where a soldier can see right now. */
  readonly visible: Uint8Array;
  /** 1 where the squad has ever seen. */
  readonly explored: Uint8Array;
  /** Radius in world pixels; 0 disables the fog entirely. */
  readonly radius: number;

  private timer = 0;
  private readonly width: number;
  private readonly height: number;
  private readonly tile: number;

  constructor(map: GameMap, radius: number) {
    this.width = map.width;
    this.height = map.height;
    this.tile = map.tile;
    this.radius = radius;
    this.visible = new Uint8Array(map.width * map.height);
    this.explored = new Uint8Array(map.width * map.height);
    // With fog off, everything is permanently lit.
    if (radius <= 0) {
      this.visible.fill(1);
      this.explored.fill(1);
    }
  }

  get enabled(): boolean { return this.radius > 0; }

  /** True if the squad can currently see this world point. */
  isVisible(wx: number, wy: number): boolean {
    if (!this.enabled) return true;
    const tx = Math.floor(wx / this.tile);
    const ty = Math.floor(wy / this.tile);
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    return this.visible[ty * this.width + tx] === 1;
  }

  step(map: GameMap, soldiers: Soldier[], dt: number): void {
    if (!this.enabled) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = UPDATE_INTERVAL;
    this.recompute(map, soldiers);
  }

  /** Forces an immediate recompute -- used when a mission starts. */
  refresh(map: GameMap, soldiers: Soldier[]): void {
    if (!this.enabled) return;
    this.timer = UPDATE_INTERVAL;
    this.recompute(map, soldiers);
  }

  private recompute(map: GameMap, soldiers: Soldier[]): void {
    this.visible.fill(0);
    const reach = Math.ceil(this.radius / this.tile);
    const r2 = this.radius * this.radius;

    for (const s of soldiers) {
      if (!s.alive) continue;
      const cx = Math.floor(s.pos.x / this.tile);
      const cy = Math.floor(s.pos.y / this.tile);

      for (let ty = cy - reach; ty <= cy + reach; ty++) {
        if (ty < 0 || ty >= this.height) continue;
        for (let tx = cx - reach; tx <= cx + reach; tx++) {
          if (tx < 0 || tx >= this.width) continue;
          const i = ty * this.width + tx;
          if (this.visible[i]) continue;

          const wx = (tx + 0.5) * this.tile;
          const wy = (ty + 0.5) * this.tile;
          const dx = wx - s.pos.x;
          const dy = wy - s.pos.y;
          if (dx * dx + dy * dy > r2) continue;
          // Sight is blocked by the same things that hide an enemy from you,
          // so you cannot see through a treeline or a stand of tall grass.
          if (!hasLineOfSight(map, s.pos, { x: wx, y: wy })) continue;

          this.visible[i] = 1;
          this.explored[i] = 1;
        }
      }
    }

    // A blocking tile the squad is looking at should light up even though its
    // own centre is unreachable through itself; otherwise every treeline reads
    // as a hole in the fog. Collected first, then applied -- writing during the
    // scan would cascade the light outward one tile per row.
    const edge: number[] = [];
    for (let ty = 0; ty < this.height; ty++) {
      for (let tx = 0; tx < this.width; tx++) {
        const i = ty * this.width + tx;
        if (this.visible[i]) continue;
        if (!TILES[tileAt(map, tx, ty)].blocksSight) continue;
        const lit =
          (tx > 0 && this.visible[i - 1] === 1) ||
          (tx < this.width - 1 && this.visible[i + 1] === 1) ||
          (ty > 0 && this.visible[i - this.width] === 1) ||
          (ty < this.height - 1 && this.visible[i + this.width] === 1);
        if (lit) edge.push(i);
      }
    }
    for (const i of edge) {
      this.visible[i] = 1;
      this.explored[i] = 1;
    }
  }
}
