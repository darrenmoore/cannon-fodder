import { CONFIG } from '../config.js';
import { livingSoldiers, squadCentre } from '../sim/world.js';
import type { Soldier, Vec2 } from '../types.js';
import type { World } from '../sim/world.js';

/**
 * Where the squad is pointing, and what it is about to throw.
 *
 * The original expressed both of these as modifier keys -- hold right to fire,
 * left-while-right to lob a grenade -- which works only if you have three
 * buttons and can see where the cursor is. A finger has neither, so both become
 * explicit, visible, cancellable states, and the renderer draws them.
 *
 * The state lives here rather than in `input.ts` because the renderer needs to
 * read it and the input layer needs to write it, and neither should own the
 * other. `resolve` is pure geometry over the world, so the reticle the player
 * sees and the throw the simulation makes are computed once, together.
 */

export type AimMode = 'idle' | 'fire' | 'grenade';

/** How far above the touch point the reticle sits, in CSS pixels. */
export const RETICLE_LIFT_CSS = 44;

export class Aim {
  mode: AimMode = 'idle';
  /** The world point being fired at or thrown at. */
  point: Vec2 = { x: 0, y: 0 };
  /** Who will throw. Highlighted, so "nearest to the cursor" is not invisible. */
  thrower: Soldier | null = null;
  /** The reticle is at maximum range and cannot go further. */
  clamped = false;
  /** The blast would catch one of your own. */
  friendly = false;
  /** No one can throw right now -- everyone is wading, or the squad is gone. */
  blocked = false;
  /** True once the player has actually placed the reticle this arming. */
  placed = false;

  get arming(): boolean { return this.mode === 'grenade'; }
  get firing(): boolean { return this.mode === 'fire'; }

  idle(): void {
    this.mode = 'idle';
    this.thrower = null;
    this.placed = false;
    this.clamped = false;
    this.friendly = false;
    this.blocked = false;
  }

  /**
   * Arms the grenade and parks the reticle somewhere sensible, so the state is
   * visible before the player has moved a finger.
   */
  armGrenade(world: World): void {
    this.mode = 'grenade';
    this.placed = false;
    const centre = squadCentre(world) ?? { x: 0, y: 0 };
    this.resolveGrenade(world, centre);
  }

  /** Aims the squad's manual fire at a world point. */
  fireAt(at: Vec2): void {
    this.mode = 'fire';
    this.point.x = at.x;
    this.point.y = at.y;
  }

  /**
   * Aims manual fire along a direction, for the thumbstick.
   *
   * The stick gives a heading, not a place, so the point is projected out to
   * the squad's own firing range: aiming past what you can hit would have the
   * soldiers shooting at nothing.
   */
  fireAlong(world: World, dir: Vec2): void {
    const centre = squadCentre(world);
    if (!centre) return;
    const len = Math.hypot(dir.x, dir.y);
    if (len < 0.001) return;
    const reach = CONFIG.soldier.fireRange * 0.9;
    this.mode = 'fire';
    this.point.x = centre.x + (dir.x / len) * reach;
    this.point.y = centre.y + (dir.y / len) * reach;
  }

  /**
   * Places the grenade reticle, clamping it into range rather than refusing.
   *
   * A press that silently does nothing is the worst thing a touch control can
   * do, so out-of-range slides the reticle back to the furthest reachable point
   * and says so, instead of dropping the throw on the floor.
   */
  resolveGrenade(world: World, raw: Vec2): void {
    this.placed = true;
    const cfg = CONFIG.grenade;

    let thrower: Soldier | null = null;
    let best = Infinity;
    for (const s of livingSoldiers(world)) {
      // Wading soldiers have their hands full staying upright.
      if (s.wading) continue;
      const d = Math.hypot(s.pos.x - raw.x, s.pos.y - raw.y);
      if (d < best) { best = d; thrower = s; }
    }

    this.thrower = thrower;
    this.blocked = !thrower;
    if (!thrower) {
      this.point.x = raw.x;
      this.point.y = raw.y;
      this.clamped = false;
      this.friendly = false;
      return;
    }

    this.clamped = best > cfg.throwRange;
    if (this.clamped) {
      const t = cfg.throwRange / best;
      this.point.x = thrower.pos.x + (raw.x - thrower.pos.x) * t;
      this.point.y = thrower.pos.y + (raw.y - thrower.pos.y) * t;
    } else {
      this.point.x = raw.x;
      this.point.y = raw.y;
    }

    // Blasts kill your own men, and at phone zoom you cannot eyeball 34 world
    // pixels -- so the ring says it rather than leaving you to find out.
    this.friendly = livingSoldiers(world).some(
      (s) => Math.hypot(s.pos.x - this.point.x, s.pos.y - this.point.y) <= cfg.blastRadius,
    );
  }

  /** True when releasing now would actually produce a throw. */
  canThrow(world: World): boolean {
    return this.mode === 'grenade'
      && !this.blocked
      && world.grenadesHeld > 0
      && world.grenadeCooldown <= 0;
  }
}
