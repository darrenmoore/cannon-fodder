import { CONFIG } from './config.js';
import { sfxDeath, sfxEnemyShot, sfxExplosion, sfxShot } from './audio.js';
import { buildingAt, damageBuilding } from './buildings.js';
import { raiseAlarm } from './enemies.js';
import { killHostage } from './hostages.js';
import { tileAtWorld } from './map.js';
import { primeMinesInBlast } from './mines.js';
import { TILES } from './tiles.js';
import { EnemyKind, Faction } from './types.js';
import type { Actor, Bullet, Vec2 } from './types.js';
import type { World } from './world.js';

/**
 * Bullets, rockets, grenades and dying. Machine guns kill infantry in one shot,
 * both ways, exactly as in the original -- which is why this file is short and
 * why the game is about where you stand rather than how fast you click.
 *
 * Buildings are the exception: rifle rounds barely scratch them, so levelling
 * one takes explosives.
 */

/** Spawns a round from `shooter` toward `target`, with a little aim error. */
export function fire(world: World, shooter: Actor, target: Vec2, spread: number): void {
  const dx = target.x - shooter.pos.x;
  const dy = target.y - shooter.pos.y;
  const angle = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * spread;
  shooter.angle = Math.atan2(dy, dx);

  // Bazookateers lob slow explosive rounds instead of bullets.
  const rocket = shooter.faction === Faction.Enemy && (shooter as { kind?: EnemyKind }).kind === EnemyKind.Bazooka;
  const speed = rocket ? CONFIG.bazooka.rocketSpeed : CONFIG.bullet.speed;

  const muzzleX = shooter.pos.x + Math.cos(angle) * CONFIG.bullet.muzzle;
  const muzzleY = shooter.pos.y + Math.sin(angle) * CONFIG.bullet.muzzle - 3;

  world.bullets.push({
    pos: { x: muzzleX, y: muzzleY },
    prev: { x: muzzleX, y: muzzleY },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    faction: shooter.faction,
    life: rocket ? 2.4 : CONFIG.bullet.life,
    buildingDamage: CONFIG.building.bulletDamage,
    blast: rocket ? CONFIG.bazooka.blastRadius : 0,
  });

  world.fx.muzzle({ x: muzzleX, y: muzzleY }, angle);
  if (shooter.faction === Faction.Player) {
    sfxShot();
    // Your own gunfire is the loudest thing on the map. On the difficulties
    // where they can hear it, shooting is a decision, not a freebie.
    raiseAlarm(world, shooter.pos, world.levers.hearing);
  } else {
    sfxEnemyShot();
  }
}

/** Squared distance from point p to the segment a-b. */
function distToSegment2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 < 1e-9 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

export function stepBullets(world: World, dt: number): void {
  const { map } = world;

  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      if (b.blast > 0) detonateRound(world, b);
      world.bullets.splice(i, 1);
      continue;
    }

    b.prev.x = b.pos.x;
    b.prev.y = b.pos.y;
    const nx = b.pos.x + b.vel.x * dt;
    const ny = b.pos.y + b.vel.y * dt;

    // Walk the step in short slices so a fast round cannot skip through a trunk.
    const dist = Math.hypot(nx - b.pos.x, ny - b.pos.y);
    const slices = Math.max(1, Math.ceil(dist / 4));
    let hitTerrain = false;
    for (let s = 1; s <= slices; s++) {
      const t = s / slices;
      const x = b.prev.x + (nx - b.prev.x) * t;
      const y = b.prev.y + (ny - b.prev.y) * t;
      if (TILES[tileAtWorld(map, x, y)].blocksShots) {
        b.pos.x = x;
        b.pos.y = y;
        hitTerrain = true;
        break;
      }
    }
    if (!hitTerrain) { b.pos.x = nx; b.pos.y = ny; }

    if (hitTerrain) {
      // A round that stopped on a building damages it; on a tree it just chips.
      const struck = buildingAt(world, b.pos.x, b.pos.y, 3);
      if (struck) damageBuilding(world, struck, b.blast > 0 ? CONFIG.building.blastDamage : b.buildingDamage);
      if (b.blast > 0) detonateRound(world, b);
      else world.fx.impact(b.pos);
      world.bullets.splice(i, 1);
      continue;
    }

    if (resolveBulletHit(world, b)) world.bullets.splice(i, 1);
  }
}

const detonateRound = (world: World, b: Bullet): void => { explode(world, b.pos, b.blast); };

/** Swept test against actors of the opposing faction, hostages and crates. */
function resolveBulletHit(world: World, b: Bullet): boolean {
  for (const a of world.actors) {
    if (!a.alive || a.faction === b.faction) continue;
    const r = a.radius + CONFIG.bullet.radius;
    if (distToSegment2(a.pos.x, a.pos.y, b.prev.x, b.prev.y, b.pos.x, b.pos.y) <= r * r) {
      if (b.blast > 0) detonateRound(world, b);
      else damage(world, a);
      return true;
    }
  }
  // Hostages are hit by anything, including your own fire.
  for (const h of world.hostages) {
    if (!h.alive || h.delivered) continue;
    const r = h.radius + CONFIG.bullet.radius;
    if (distToSegment2(h.pos.x, h.pos.y, b.prev.x, b.prev.y, b.pos.x, b.pos.y) <= r * r) {
      if (b.blast > 0) detonateRound(world, b);
      else killHostage(world, h);
      return true;
    }
  }
  for (const crate of world.crates) {
    if (!crate.alive) continue;
    const r = (crate.barrel ? CONFIG.barrel.radius : CONFIG.crate.radius) + CONFIG.bullet.radius;
    if (distToSegment2(crate.pos.x, crate.pos.y, b.prev.x, b.prev.y, b.pos.x, b.pos.y) <= r * r) {
      detonateCrate(world, crate);
      return true;
    }
  }
  return false;
}

export function damage(world: World, actor: Actor, amount = 1): void {
  if (!actor.alive) return;
  actor.hp -= amount;
  if (actor.hp > 0) return;

  actor.alive = false;
  actor.vel.x = 0;
  actor.vel.y = 0;
  world.fx.blood(actor.pos);
  world.fx.corpse(actor.pos, actor.faction === Faction.Enemy ? 'enemy' : 'player');
  sfxDeath();

  if (actor.faction === Faction.Enemy) {
    world.kills++;
    // Free up a reinforcement slot on whichever building produced it.
    const from = (actor as { spawnedBy?: number }).spawnedBy ?? -1;
    if (from >= 0) {
      const building = world.buildings.find((b) => b.id === from);
      if (building) building.spawned = Math.max(0, building.spawned - 1);
    }
  }

  // Anyone aiming at the dead man forgets about them straight away.
  for (const e of world.enemies) if (e.target === actor) e.target = null;
  if (world.squadTarget === actor) world.squadTarget = null;
}

/** Blast damage: everything alive inside the radius dies, friend or foe. */
export function explode(world: World, pos: Vec2, radius: number): void {
  world.fx.explosion(pos);
  sfxExplosion();
  world.shake += CONFIG.fx.screenShake;
  // An explosion carries a great deal further than a rifle shot.
  raiseAlarm(world, pos, world.levers.hearing * 2);

  for (const a of world.actors) {
    if (!a.alive) continue;
    if (Math.hypot(a.pos.x - pos.x, a.pos.y - pos.y) <= radius) damage(world, a);
  }
  for (const h of world.hostages) {
    if (!h.alive || h.delivered) continue;
    if (Math.hypot(h.pos.x - pos.x, h.pos.y - pos.y) <= radius) killHostage(world, h);
  }
  // Explosives are how buildings come down.
  const struck = buildingAt(world, pos.x, pos.y, radius);
  if (struck) damageBuilding(world, struck, CONFIG.building.blastDamage);

  // Crates and mines within the blast go up too -- chain them for a big clear.
  for (const crate of world.crates) {
    if (!crate.alive) continue;
    if (Math.hypot(crate.pos.x - pos.x, crate.pos.y - pos.y) <= radius) detonateCrate(world, crate);
  }
  primeMinesInBlast(world, pos.x, pos.y, radius);
}

export function detonateCrate(world: World, crate: { pos: Vec2; alive: boolean; barrel: boolean }): void {
  if (!crate.alive) return;
  crate.alive = false;
  explode(world, crate.pos, crate.barrel ? CONFIG.barrel.blastRadius : CONFIG.crate.blastRadius);
}

export function throwGrenade(world: World, from: Vec2, to: Vec2, faction: Faction): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const range = Math.min(dist, CONFIG.grenade.throwRange);
  const scale = dist < 1e-6 ? 0 : range / dist;

  world.grenades.push({
    pos: { x: from.x, y: from.y },
    prev: { x: from.x, y: from.y },
    from: { x: from.x, y: from.y },
    to: { x: from.x + dx * scale, y: from.y + dy * scale },
    t: 0,
    // Short throws land sooner, so lobbing at your feet still feels responsive.
    duration: CONFIG.grenade.flightTime * Math.max(0.35, range / CONFIG.grenade.throwRange),
    faction,
  });
}

export function stepGrenades(world: World, dt: number): void {
  for (let i = world.grenades.length - 1; i >= 0; i--) {
    const g = world.grenades[i];
    g.prev.x = g.pos.x;
    g.prev.y = g.pos.y;
    g.t += dt / g.duration;
    if (g.t >= 1) {
      explode(world, g.to, CONFIG.grenade.blastRadius);
      world.grenades.splice(i, 1);
      continue;
    }
    g.pos.x = g.from.x + (g.to.x - g.from.x) * g.t;
    g.pos.y = g.from.y + (g.to.y - g.from.y) * g.t;
  }
}

/** Height of a grenade above the ground at time t, for the render shadow. */
export const grenadeArc = (t: number): number => Math.sin(t * Math.PI) * 11;
