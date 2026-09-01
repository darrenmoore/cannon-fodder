import { CONFIG } from '../config.js';
import { debug } from '../ui/debug.js';
import { sfxDeath, sfxEnemyShot, sfxExplosion, sfxShot } from '../shell/audio.js';
import { buildingAt, damageBuilding } from './buildings.js';
import { raiseAlarm } from './enemies.js';
import { creditKill } from './pressure.js';
import { killHostage } from './hostages.js';
import { tileAtWorld } from './map.js';
import { primeMinesInBlast } from './mines.js';
import { TILES } from './tiles.js';
import { EnemyKind, Faction } from '../types.js';
import type { Actor, Bullet, Vec2 } from '../types.js';
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
    world.shotsFired++;
    // Brass, from your own men only. Every enemy on the map ejecting cases,
    // most of them under fog, is litter the player cannot read anything from;
    // from the squad it says plainly where the shooting has been (201-qa 012).
    // Rockets do not eject anything.
    if (!rocket) world.fx.casing({ x: muzzleX, y: muzzleY }, angle);
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
      if (struck && !friendlyToKeep(struck, b.faction)) {
        // Where it stopped and where it was travelling from, so a round that
        // barely scratches the wall can throw its chips back at the shooter.
        const from = { x: b.pos.x - b.vel.x, y: b.pos.y - b.vel.y };
        damageBuilding(world, struck,
          b.blast > 0 ? CONFIG.building.blastDamage : b.buildingDamage,
          { x: b.pos.x, y: b.pos.y }, from);
      }
      if (b.blast > 0) detonateRound(world, b);
      else world.fx.impact(b.pos);
      // Where the round *landed*, not where it was fired from. This is the
      // decoy: put one into a hut across the clearing and the garrison walks
      // to the hut.
      // The floor matters more than the fraction here: see `impactAlarmFloor`.
      // A decoy that only carries four tiles is not a decoy.
      raiseAlarm(world, b.pos, Math.max(
        world.levers.hearing * CONFIG.enemy.impactAlarm,
        CONFIG.enemy.impactAlarmFloor,
      ));
      world.bullets.splice(i, 1);
      continue;
    }

    if (resolveBulletHit(world, b)) world.bullets.splice(i, 1);
  }
}

const detonateRound = (world: World, b: Bullet): void => { explode(world, b.pos, b.blast, b.faction); };

/**
 * Is this round the squad's own, arriving at the building they are defending?
 *
 * The garrison besieges the outpost, so the squad shoots *toward* it, and every
 * round that misses a man was landing on the thing the mission is lost without.
 * Standing near your own objective was quietly costing you the map -- and
 * clicking it ordered a demolition, which is worse. Their fire still damages it;
 * that is the siege. Yours does not.
 */
function friendlyToKeep(struck: { role: string }, by: Faction | undefined): boolean {
  return struck.role === 'protect' && by === Faction.Player;
}

/**
 * Does this round's path cross the body standing at `pos`?
 *
 * Both the round and the man are segments: the round swept from where it was to
 * where it is, the man a vertical capsule from his boots to the top of his
 * helmet. Testing a point against a circle at his feet -- which is what this
 * did -- meant the drawn figure and the thing you could hit were different
 * shapes, and the head was not in either.
 */
function bulletHitsBody(b: Bullet, pos: Vec2, radius: number): boolean {
  const body = CONFIG.body;
  const r = radius + CONFIG.bullet.radius;
  // Sample the standing capsule along its height. Three points over a dozen
  // pixels is enough at this scale, and far cheaper than segment-to-segment.
  const top = pos.y - body.rise;
  const bottom = pos.y + body.drop;
  for (let i = 0; i <= 3; i++) {
    const y = top + ((bottom - top) * i) / 3;
    if (distToSegment2(pos.x, y, b.prev.x, b.prev.y, b.pos.x, b.pos.y) <= r * r) return true;
  }
  return false;
}

/** Swept test against actors of the opposing faction, hostages and crates. */
function resolveBulletHit(world: World, b: Bullet): boolean {
  for (const a of world.actors) {
    if (!a.alive || a.faction === b.faction) continue;
    if (bulletHitsBody(b, a.pos, CONFIG.body.radius)) {
      // Counted here rather than in damage(), which has no idea who fired and
      // is also reached by blasts, mines and falling buildings.
      if (b.faction === Faction.Player) world.shotsHit++;
      if (b.blast > 0) detonateRound(world, b);
      else damage(world, a);
      return true;
    }
  }
  // Hostages are hit by anything, including your own fire.
  for (const h of world.hostages) {
    if (!h.alive || h.delivered) continue;
    if (bulletHitsBody(b, h.pos, CONFIG.body.radius)) {
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

/**
 * The moment between being shot and being a stain.
 *
 * Runs the collapse for everyone killed this mission, then hands each body to
 * the decal layer exactly once. Keeping it here rather than in the soldier and
 * enemy steps means both sides die the same way, and neither step has to think
 * about actors it has already skipped for being dead.
 */
export function stepDying(world: World, dt: number): void {
  for (const a of world.actors) {
    if (a.alive || a.deathTime < 0 || a.deathTime >= CONFIG.fx.deathTime) continue;
    a.deathTime += dt;
    if (a.deathTime < CONFIG.fx.deathTime) continue;
    a.deathTime = CONFIG.fx.deathTime;
    // Down. A second spray as he lands, then the body joins the scenery.
    world.fx.blood(a.pos);
    world.fx.corpse(a.pos, a.faction === Faction.Enemy ? 'enemy' : 'player');
  }
}

/**
 * Down, not out.
 *
 * The one-hit rule is the game's central bargain and it is what makes every
 * record honest, so it is untouched for the squad -- this only ever fires on
 * theirs, and only once per man. What it buys is a different kind of enemy for
 * the price of a coin flip: one who cannot shoot back, still counts against the
 * objective, and screams for his friends every couple of seconds until somebody
 * finishes him. Walking away from one is a choice with a cost.
 *
 * A wounding is *not* a kill, which is the rule doing something quietly clever
 * on a covert mission: putting a sentry down does not end the run, and leaving
 * him screaming is how it ends up ending anyway.
 *
 * Returns true if the man was wounded rather than killed.
 */
function wound(world: World, actor: Actor): boolean {
  /*
   * Never in an arena, and this is fairness rather than tidiness.
   *
   * The rule below is "the garrison can be wounded, the squad cannot", which is
   * the right asymmetry in a mission -- the squad's one-hit bargain is what
   * makes the roster mean anything. Carried into a fight between two AI sides
   * it becomes *blue men lie screaming and green men do not*, and a wounded man
   * is not merely a decoration: he blocks, he draws fire, and he shouts for
   * help. One side getting that and the other not is a visible unfairness in a
   * mode whose whole content is watching the two of them.
   */
  if (world.map.arena) return false;
  if (actor.faction !== Faction.Enemy || actor.wounded) return false;
  if (Math.random() >= CONFIG.enemy.woundChance) return false;

  actor.wounded = true;
  actor.hp = 1;                 // the next hit, whatever it is, finishes him
  actor.vel.x = 0;
  actor.vel.y = 0;
  actor.screamTimer = 0;        // he calls out at once
  world.fx.blood(actor.pos);
  return true;
}

export function damage(world: World, actor: Actor, amount = 1): void {
  if (!actor.alive) return;
  // The only line the debug panel costs the simulation. `__DEV__` is folded to
  // `false` in a production build, so this and the import vanish with it.
  if (__DEV__ && debug.invulnerable && actor.faction === Faction.Player) return;
  actor.hp -= amount;
  if (actor.hp > 0) return;
  if (wound(world, actor)) return;

  actor.alive = false;
  actor.vel.x = 0;
  actor.vel.y = 0;
  actor.deathTime = 0;
  world.fx.blood(actor.pos);
  sfxDeath();

  // A man going down is a noise. Shooting a sentry used to teach the man beside
  // him nothing at all, which is why a silenced-looking kill felt like a bug.
  raiseAlarm(world, actor.pos, world.levers.hearing * CONFIG.enemy.deathAlarm);

  if (actor.faction === Faction.Enemy) {
    // The mission's kill count means "enemies the player killed", so it stays
    // exactly that. The arena keeps its own, per side, in `sim/arena.ts`.
    world.kills++;
    // Counted against the spot it was made from, not against the mission.
    creditKill(world);
  }

  /*
   * Free up a reinforcement slot on whichever building produced this man --
   * whoever he belonged to.
   *
   * This used to sit inside the branch above, which was invisible while every
   * building in the game produced for the same side. Give the other side huts
   * and it becomes a one-way ratchet: green men die without ever releasing
   * their slot, so green's huts fill their `maxSpawned` quota once and stop for
   * ever. Measured, green fielded exactly twenty-one men per battle and was
   * then wiped out at the same minute every time, which read as a balance
   * problem and was arithmetic.
   */
  const from = (actor as { spawnedBy?: number }).spawnedBy ?? -1;
  if (from >= 0) {
    const building = world.buildings.find((b) => b.id === from);
    if (building) building.spawned = Math.max(0, building.spawned - 1);
  }

  // Anyone aiming at the dead man forgets about them straight away.
  for (const e of world.enemies) if (e.target === actor) e.target = null;
  if (world.squadTarget === actor) world.squadTarget = null;
}

/**
 * An explosion, in two rings.
 *
 * Close in you die; further out you are thrown clear and spend a moment on the
 * ground, useless. One code path for every explosive in the game, applied to
 * both sides, so a grenade means the same thing whoever threw it.
 *
 * The knockback is an impulse on the victim's own velocity rather than a
 * teleport, so the ordinary collision step carries it -- which is what stops a
 * man being flung through a wall or out into deep water.
 */
export function explode(world: World, pos: Vec2, radius: number, by?: Faction): void {
  world.fx.explosion(pos);
  sfxExplosion();
  world.shake += CONFIG.fx.screenShake;
  // An explosion carries a great deal further than a rifle shot.
  raiseAlarm(world, pos, world.levers.hearing * 2);

  const lethal = radius * CONFIG.blast.lethal;
  for (const a of world.actors) {
    if (!a.alive) continue;
    const dx = a.pos.x - pos.x;
    const dy = a.pos.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d > radius) continue;
    if (d <= lethal) { damage(world, a); continue; }

    // Survived it. How hard he is thrown falls off across the outer ring, so
    // the man who nearly died goes furthest and the one at the edge stumbles.
    const bite = 1 - (d - lethal) / Math.max(1e-6, radius - lethal);
    const away = d < 1e-6 ? { x: 0, y: -1 } : { x: dx / d, y: dy / d };
    a.vel.x += away.x * CONFIG.blast.knockback * bite;
    a.vel.y += away.y * CONFIG.blast.knockback * bite;
    a.stagger = Math.max(a.stagger, CONFIG.blast.stagger * bite);
  }
  for (const h of world.hostages) {
    if (!h.alive || h.delivered) continue;
    if (Math.hypot(h.pos.x - pos.x, h.pos.y - pos.y) <= lethal) killHostage(world, h);
  }
  // Explosives are how buildings come down.
  const struck = buildingAt(world, pos.x, pos.y, radius);
  // A grenade thrown at men swarming your own outpost must not be the thing
  // that levels it. Theirs still can; a barrel going up still can.
  if (struck && !friendlyToKeep(struck, by)) damageBuilding(world, struck, CONFIG.building.blastDamage);

  // Crates and mines within the blast go up too -- chain them for a big clear.
  for (const crate of world.crates) {
    if (!crate.alive) continue;
    if (Math.hypot(crate.pos.x - pos.x, crate.pos.y - pos.y) <= radius) detonateCrate(world, crate);
  }
  primeMinesInBlast(world, pos.x, pos.y, radius);

  /*
   * A supply box in the blast is destroyed, and with it the mission.
   *
   * Blasts only -- a rifle round through a crate of supplies leaves supplies
   * with a hole in them. Making every stray bullet a mission-ender would turn a
   * `collect` map into a mission about not shooting near the objective, which
   * is a worse game than one about getting to it. A grenade is a decision, and
   * a decision is allowed to cost you.
   */
  for (const box of world.supplies) {
    if (!box.alive || box.collected) continue;
    if (Math.hypot(box.pos.x - pos.x, box.pos.y - pos.y) <= radius) {
      box.alive = false;
      world.fx.sparkle(box.pos, '#c86a3a');
      world.fx.popup({ x: box.pos.x, y: box.pos.y - 10 }, 'SUPPLIES LOST', '#ff6a48', 'hostage');
    }
  }
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
      explode(world, g.to, CONFIG.grenade.blastRadius, g.faction);
      world.grenades.splice(i, 1);
      continue;
    }
    g.pos.x = g.from.x + (g.to.x - g.from.x) * g.t;
    g.pos.y = g.from.y + (g.to.y - g.from.y) * g.t;
  }
}

/** Height of a grenade above the ground at time t, for the render shadow. */
export const grenadeArc = (t: number): number => Math.sin(t * Math.PI) * 11;
