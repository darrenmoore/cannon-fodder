import { CONFIG } from '../config.js';
import { squadCentre } from './world.js';
import type { Enemy } from '../types.js';
import type { World } from './world.js';

/**
 * The answer to standing still and shooting everything that walks into range.
 *
 * A player who finds a rock with a clear field of fire can beat most missions
 * without moving, and the game had nothing to say about it: reinforcements
 * arrived on a fixed clock and walked into the same guns. This counts kills
 * made *from a spot the squad has not left* and, past a threshold, spends the
 * count on making the garrison arrive sooner and go looking.
 *
 * Three things it is careful about, all from the brief:
 *
 *  - **It caps.** Camping should get worse and then stop getting worse; an
 *    unbounded counter turns a slow mission into an unwinnable one, which
 *    punishes the patient rather than the passive.
 *  - **Moving relieves it.** The point is to make the player move, so moving
 *    has to work -- otherwise it is a timer, not a lever, and the only lesson
 *    is that long missions are punished.
 *  - **It applies at Rookie.** Camping is a habit, and the tier where it is
 *    most likely to be learnt is the one where it is least likely to be
 *    punished by anything else.
 *
 * The counter itself is never shown. What the player sees is men arriving
 * faster and coming the right way -- which is a thing happening in the world
 * rather than a meter, and is the same standard the wounded man and the
 * building that shrugs off a rifle round are held to.
 */

/** Folds the current pressure into the live levers. Called once per step. */
export function applyPressure(world: World): void {
  const base = world.baseLevers;
  const cfg = CONFIG.camping;
  const t = Math.min(1, world.pressure / cfg.cap);

  /*
   * Only the two levers this system owns, and written into the existing object
   * rather than replacing it.
   *
   * Assigning the whole of `baseLevers` over the top was the obvious way to
   * write this and it is wrong: it runs every step, so it silently reverts
   * anything else that had set a lever mid-mission -- the debug panel's fog
   * switch, a harness poking `hearing` to test an alarm. Both looked like they
   * had worked and neither had. Pressure moves spawn rate and hearing; nothing
   * else is its business.
   */
  world.levers.spawnInterval = base.spawnInterval * (1 - t * cfg.spawnBoost);
  world.levers.hearing = base.hearing * (1 + t * cfg.hearingBoost);
}

/**
 * Tracks whether the squad has left the spot, and drains the count when it has.
 *
 * The anchor is only moved when the squad is genuinely somewhere else, so
 * shuffling about inside the same firing position does not read as moving --
 * which is the loophole a radius-free "did they move this frame" check would
 * leave wide open.
 */
export function stepPressure(world: World, dt: number): void {
  const centre = squadCentre(world);
  if (!centre) return;

  if (!world.campAnchor) {
    world.campAnchor = { ...centre };
    world.stillFor = 0;
    return;
  }

  const cfg = CONFIG.camping;

  // Are they moving *now*, rather than have they moved far enough lately. The
  // anchor follows them while they walk and freezes where they stop, which is
  // the spot `creditKill` then measures kills against.
  let fastest = 0;
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    fastest = Math.max(fastest, Math.hypot(s.vel.x, s.vel.y));
  }

  if (fastest > cfg.movingSpeed) {
    world.campAnchor = { ...centre };
    world.stillFor = 0;
  } else {
    world.stillFor += dt;
  }

  // Draining is tied to not being settled, and settling is a matter of having
  // stopped rather than of having stayed put. An earlier version drained only
  // on the frame the squad crossed the radius, which fired once and never
  // again; the one after that drained by distance-since-last and stopped
  // draining for anybody walking slower than forty-five pixels a second.
  if (world.stillFor < cfg.settle) {
    world.pressure = Math.max(0, world.pressure - cfg.relief * dt);
  }
  // Standing still is not itself an offence -- only killing from a stand is --
  // so nothing rises here. `creditKill` is the only thing that adds.
}

/** A kill was made. Counts only if it was made from the spot they are sitting on. */
export function creditKill(world: World): void {
  // Settled, not merely stationary this instant: a squad that has just arrived
  // somewhere and is shooting its way back out is manoeuvring, not camping.
  if (world.stillFor < CONFIG.camping.settle) return;
  world.pressure = Math.min(CONFIG.camping.cap, world.pressure + 1);
}

/**
 * Does this man go looking for you?
 *
 * His trait says whether he was *born* a hunter; past the threshold everybody
 * is one, which is the whole of "they start to come for you". Read live rather
 * than rolled into `traits`, because a trait is fixed at spawn and the men
 * already on the map are exactly the ones the player has been shooting.
 */
export const hunts = (world: World, e: Enemy): boolean =>
  e.traits.hunter || world.pressure >= CONFIG.camping.huntFrom;
