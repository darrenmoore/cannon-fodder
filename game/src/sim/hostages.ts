import { CONFIG } from '../config.js';
import { sfxPickup } from '../shell/audio.js';
import { defAtWorld } from './map.js';
import { circleBlocked } from './pathfind.js';
import type { Hostage, Soldier, Vec2 } from '../types.js';
import type { World } from './world.js';

/**
 * Hostages. A soldier walking up to one frees them; from then on they trail
 * behind their escort until they reach a tent, at which point they are out of
 * the fight. They die to any bullet -- including yours -- and losing one loses
 * the mission, which is what makes rescue levels tense rather than tedious.
 */

export function stepHostages(world: World, dt: number): void {
  for (const h of world.hostages) {
    if (!h.alive || h.delivered) continue;
    h.prev.x = h.pos.x;
    h.prev.y = h.pos.y;

    if (!h.freed) {
      const rescuer = nearestSoldier(world, h.pos, CONFIG.hostage.freeRadius);
      if (rescuer) {
        h.freed = true;
        world.fx.sparkle(h.pos, '#8fe0ff');
        world.fx.popup({ x: h.pos.x, y: h.pos.y - 12 }, 'RESCUED', '#8fe0ff', 'hostage');
        sfxPickup();
      }
      continue;
    }

    // Delivered the moment they touch a tent.
    for (const tent of world.extraction) {
      if (Math.hypot(tent.x - h.pos.x, tent.y - h.pos.y) <= CONFIG.hostage.deliverRadius) {
        h.delivered = true;
        world.fx.sparkle(h.pos, '#9bf07a');
        world.fx.popup({ x: h.pos.x, y: h.pos.y - 12 }, 'DELIVERED', '#9bf07a', 'hostage');
        sfxPickup();
        break;
      }
    }
    if (h.delivered) continue;

    follow(world, h, dt);
  }
}

function nearestSoldier(world: World, p: Vec2, within: number): Soldier | null {
  let best: Soldier | null = null;
  let bestD = within;
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    const d = Math.hypot(s.pos.x - p.x, s.pos.y - p.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/**
 * Trails the nearest soldier at a fixed distance. Deliberately simple steering
 * with wall sliding -- a hostage that pathfinds independently reads as another
 * squad member rather than someone being led out.
 */
function follow(world: World, h: Hostage, dt: number): void {
  const escort = nearestSoldier(world, h.pos, Infinity);
  if (!escort) {
    h.vel.x *= 0.9;
    h.vel.y *= 0.9;
    return;
  }

  const dx = escort.pos.x - h.pos.x;
  const dy = escort.pos.y - h.pos.y;
  const dist = Math.hypot(dx, dy);

  let desiredX = 0;
  let desiredY = 0;
  if (dist > CONFIG.hostage.followDistance) {
    const terrain = defAtWorld(world.map, h.pos.x, h.pos.y);
    const speed = CONFIG.hostage.speed * terrain.speed;
    // Ease off over the last few pixels so they settle instead of jittering.
    const ease = Math.min(1, (dist - CONFIG.hostage.followDistance) / 8);
    desiredX = (dx / dist) * speed * ease;
    desiredY = (dy / dist) * speed * ease;
  }

  const k = Math.min(1, 9 * dt);
  h.vel.x += (desiredX - h.vel.x) * k;
  h.vel.y += (desiredY - h.vel.y) * k;

  const nx = h.pos.x + h.vel.x * dt;
  if (!circleBlocked(world.map, nx, h.pos.y, h.radius)) h.pos.x = nx;
  else h.vel.x = 0;
  const ny = h.pos.y + h.vel.y * dt;
  if (!circleBlocked(world.map, h.pos.x, ny, h.radius)) h.pos.y = ny;
  else h.vel.y = 0;

  const moved = Math.hypot(h.pos.x - h.prev.x, h.pos.y - h.prev.y);
  h.walkPhase += moved;
  if (moved > 0.05) h.angle = Math.atan2(h.vel.y, h.vel.x);
}

/** Bullets and blasts kill hostages. Called from combat.ts. */
export function killHostage(world: World, h: Hostage): void {
  if (!h.alive || h.delivered) return;
  h.alive = false;
  world.fx.blood(h.pos);
  world.fx.corpse(h.pos, 'hostage');
}
