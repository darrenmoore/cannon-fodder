import { CONFIG } from '../config.js';
import { buildFlowField } from './pathfind.js';
import { EnemyKind, EnemyState, Faction } from '../types.js';
import { resolveLevers } from './difficulty.js';
import { makeEnemy } from './world.js';
import type { Building, Enemy, Vec2 } from '../types.js';
import type { World } from './world.js';

/**
 * Two machines fighting over a clearing, and the only new AI in the arena.
 *
 * Everything about *how a man fights* already existed and is untouched:
 * `enemies.ts` engages, flanks, rushes, throws grenades and shouts for its
 * neighbours, and it is the reason a firefight here is worth watching. What was
 * missing is the layer above it -- what a *group* should do when nobody is
 * shooting at it yet -- and that is all this file is.
 *
 * Three ideas, all of them old and none of them clever:
 *
 *   **Muster before you attack.** A man walks out of a hut to a rally point
 *   behind the line and waits there. Nothing ever attacks alone. When four have
 *   gathered -- or twelve seconds pass, so a losing side still comes -- they are
 *   committed as a squad and march together. Without this the mode is a queue:
 *   one man walks out, dies, and another follows him a few seconds later, which
 *   is exactly the failure the brief named.
 *
 *   **An influence map** decides where a committed squad goes. It is the
 *   standard one (Tozour, *AI Game Programming Wisdom*): a coarse grid, every
 *   living man stamping a falloff of strength signed by his side. The sum of
 *   the two sides is *tension* -- where the fighting is -- and the difference is
 *   who holds the ground. A squad reinforces the highest-tension cell it can
 *   reach, and only goes hunting for a hut when the field is quiet. This is
 *   what turns a dozen unrelated duels into one moving front, and it is most of
 *   why the mode reads as a battle rather than as a screensaver.
 *
 *   **Territory feeds reinforcement.** A side that holds more of the grid
 *   produces faster. Win a push, reinforce quicker, push further, over-extend,
 *   get rolled back by the other side's shorter lines. Two identical sides with
 *   identical spawn rates on a near-symmetric map produce a *stalemate* on the
 *   centre line -- every firefight correct, the battle going nowhere -- and this
 *   is the ten lines that fix it. It is clamped hard at both ends, because the
 *   same loop unbounded wipes one side inside two minutes, which is the
 *   opposite failure and just as dull to watch.
 *
 * The commander never steers a man, never fires, and never overrides one who
 * has a target. It decides where a squad walks when it has nothing to shoot at,
 * and nothing else.
 */

/** How close counts as having reached the muster point. */
const MUSTERED = 34;

/** A group of men marching to one place, sharing one flow field. */
interface Squad {
  id: number;
  side: Faction;
  members: Enemy[];
  /** Null while still forming. */
  goal: Vec2 | null;
  /** Seconds since the first man arrived to wait, for the commit timeout. */
  age: number;
  /** Counts down to the next look at where the front is. */
  retarget: number;
}

/**
 * The influence map: who is where, and how hard.
 *
 * Deliberately coarse. At four tiles a cell this is twelve by nine on the
 * shipped arena, which is small enough to rebuild several times a second
 * without thinking about it and detailed enough to tell one gap in the treeline
 * from another. A finer grid would cost more and say the same thing.
 */
export class InfluenceMap {
  readonly cols: number;
  readonly rows: number;
  /** Strength per side, indexed by faction. */
  private readonly side: [Float32Array, Float32Array];
  private timer = 0;

  constructor(private readonly world: World) {
    const cells = CONFIG.arena.influenceCell;
    this.cols = Math.max(1, Math.ceil(world.map.width / cells));
    this.rows = Math.max(1, Math.ceil(world.map.height / cells));
    const n = this.cols * this.rows;
    this.side = [new Float32Array(n), new Float32Array(n)];
    this.rebuild();
  }

  /** World position of a cell's centre. */
  centreOf(index: number): Vec2 {
    const t = this.world.map.tile * CONFIG.arena.influenceCell;
    return {
      x: ((index % this.cols) + 0.5) * t,
      y: (Math.floor(index / this.cols) + 0.5) * t,
    };
  }

  /** Everybody in this cell, whoever they belong to. */
  presence(i: number): number { return this.side[0][i] + this.side[1][i]; }

  /**
   * How *contested* this cell is: twice the weaker side's strength in it.
   *
   * The obvious definition is the sum of both sides -- "how much is happening
   * here" -- and it is wrong in a way that took a stalled battle to see. A
   * side's own muster point holds eighteen men and therefore has the highest
   * sum on the map, so every squad was sent to reinforce the front it was
   * already standing in. Both sides did it, neither ever left home, and five
   * minutes passed with thirty-six men marching on their own rally points and
   * not a shot fired. It happened about one battle in five.
   *
   * `min` is zero wherever only one side is present, and largest where the two
   * are mixed together -- which is what a front line actually is.
   */
  contested(i: number): number { return 2 * Math.min(this.side[0][i], this.side[1][i]); }

  /** Positive where green holds the ground, negative where red does. */
  influence(i: number): number { return this.side[0][i] - this.side[1][i]; }

  /** Fraction of the contested grid this side holds. Drives reinforcement. */
  fractionHeld(side: Faction): number {
    let mine = 0;
    let any = 0;
    for (let i = 0; i < this.cols * this.rows; i++) {
      const t = this.presence(i);
      if (t <= 0.05) continue;
      any++;
      const inf = this.influence(i);
      if (side === Faction.Player ? inf > 0 : inf < 0) mine++;
    }
    return any === 0 ? 0.5 : mine / any;
  }

  /**
   * The hottest cell, which is where the fighting is -- and what the camera
   * drifts toward when nobody is driving it.
   */
  hottest(): { index: number; tension: number } {
    let best = 0;
    let bestT = 0;
    for (let i = 0; i < this.cols * this.rows; i++) {
      const t = this.contested(i);
      if (t > bestT) { bestT = t; best = i; }
    }
    return { index: best, tension: bestT };
  }

  step(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CONFIG.arena.influenceInterval;
    this.rebuild();
  }

  private rebuild(): void {
    this.side[0].fill(0);
    this.side[1].fill(0);
    const t = this.world.map.tile * CONFIG.arena.influenceCell;
    const reach = CONFIG.arena.influenceRadius * this.world.map.tile;
    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      const grid = this.side[e.faction === Faction.Player ? 0 : 1];
      const cx = e.pos.x / t;
      const cy = e.pos.y / t;
      const span = Math.ceil(reach / t);
      for (let gy = Math.floor(cy - span); gy <= cy + span; gy++) {
        for (let gx = Math.floor(cx - span); gx <= cx + span; gx++) {
          if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
          const d = Math.hypot((gx + 0.5 - cx) * t, (gy + 0.5 - cy) * t);
          // Linear falloff. A gaussian would look identical at this resolution
          // and cost an exp per man per cell.
          const w = 1 - d / reach;
          if (w > 0) grid[gy * this.cols + gx] += w;
        }
      }
    }
  }
}

/** One side's staff: its huts, its rally point, and its squads. */
class Commander {
  private readonly squads: Squad[] = [];
  private nextSquad: number;
  readonly muster: Vec2;

  constructor(
    private readonly world: World,
    readonly side: Faction,
    huts: Building[],
    private readonly influence: InfluenceMap,
    seed: number,
  ) {
    this.nextSquad = seed;
    // Rally a little in front of the huts, toward the middle: far enough back
    // to be out of the fight, far enough forward that a committed squad is
    // already facing the right way.
    const cx = huts.reduce((s, b) => s + b.centre.x, 0) / huts.length;
    const cy = huts.reduce((s, b) => s + b.centre.y, 0) / huts.length;
    const mid = (world.map.width * world.map.tile) / 2;
    this.muster = { x: cx + (cx < mid ? 1 : -1) * world.map.tile * 4, y: cy };
  }

  /** Men of this side who are alive and not attached to a squad yet. */
  private strays(): Enemy[] {
    return this.world.enemies.filter((e) => e.alive && e.faction === this.side && e.squad < 0);
  }

  alive(): number {
    let n = 0;
    for (const e of this.world.enemies) if (e.alive && e.faction === this.side) n++;
    return n;
  }

  step(dt: number): void {
    // Adopt anyone new out of a hut, into the squad that is currently forming.
    const forming = this.squads.find((s) => s.goal === null)
      ?? this.open();
    for (const e of this.strays()) {
      if (this.alive() > CONFIG.arena.maxAlive) break;
      forming.members.push(e);
      e.squad = forming.id;
      e.state = EnemyState.Advance;
    }

    for (const squad of this.squads) {
      squad.members = squad.members.filter((e) => e.alive);
      squad.age += dt;

      if (squad.goal === null) {
        // Still forming. The field points at the rally point so they walk to it
        // rather than standing in the doorway.
        if (!this.world.squadFields[squad.id]) {
          this.world.squadFields[squad.id] = buildFlowField(this.world.map, this.muster, true);
        }
        const waiting = squad.members.filter(
          (e) => Math.hypot(e.pos.x - this.muster.x, e.pos.y - this.muster.y) < MUSTERED,
        ).length;
        const ready = waiting >= CONFIG.arena.squadSize
          || (squad.age > CONFIG.arena.musterTimeout && squad.members.length > 0);
        if (ready) this.commit(squad);
        continue;
      }

      // Committed. Look at the front again every few seconds, so a squad that
      // set off toward one gap does not walk into a fight that has moved.
      squad.retarget -= dt;
      if (squad.retarget <= 0) {
        squad.retarget = CONFIG.arena.retargetInterval;
        this.aim(squad);
      }

      /*
       * Put anyone back on the march who has finished fighting.
       *
       * `enemies.ts` drops a man to Idle or Patrol when he loses his target,
       * and an idle man in the middle of a battle is the thing that makes an
       * arena look broken -- a knot of soldiers standing about while the fight
       * carries on twenty feet away. He is only ever taken back when he has
       * *nothing to shoot at*: a man in Alert or Engage is left alone.
       */
      for (const e of squad.members) {
        if (e.state === EnemyState.Idle || e.state === EnemyState.Patrol) {
          e.state = EnemyState.Advance;
        }
      }

      if (squad.members.length === 0) this.retire(squad);
    }
  }

  private open(): Squad {
    const squad: Squad = {
      id: this.nextSquad,
      side: this.side,
      members: [],
      goal: null,
      age: 0,
      retarget: 0,
    };
    // Two commanders, one `squadFields` array: ids step by two from different
    // seeds so the two sides can never be handed the same slot.
    this.nextSquad += 2;
    this.squads.push(squad);
    return squad;
  }

  private retire(squad: Squad): void {
    this.world.squadFields[squad.id] = null;
    const at = this.squads.indexOf(squad);
    if (at >= 0) this.squads.splice(at, 1);
  }

  private commit(squad: Squad): void {
    squad.goal = this.muster;
    squad.retarget = 0;
    this.aim(squad);
    for (const e of squad.members) e.state = EnemyState.Advance;
  }

  /**
   * Where this squad is going.
   *
   * Reinforce the front if there is one; otherwise go and start one at the
   * nearest enemy hut. Those two lines are the whole of the mode's shape: the
   * first keeps the fighting in one place long enough to look like a battle,
   * and the second stops both sides sitting at home when the field goes quiet.
   */
  private aim(squad: Squad): void {
    const from = squad.members.length > 0
      ? {
        x: squad.members.reduce((s, e) => s + e.pos.x, 0) / squad.members.length,
        y: squad.members.reduce((s, e) => s + e.pos.y, 0) / squad.members.length,
      }
      : this.muster;

    let goal: Vec2 | null = null;
    let best: number = CONFIG.arena.tensionThreshold;
    for (let i = 0; i < this.influence.cols * this.influence.rows; i++) {
      const t = this.influence.contested(i);
      if (t < best) continue;
      const p = this.influence.centreOf(i);
      // Weighted toward the front nearest this squad, so the two huts of one
      // side feed the two ends of the line rather than both walking to the
      // middle of it.
      const score = t - Math.hypot(p.x - from.x, p.y - from.y) / (this.world.map.tile * 40);
      if (score > best) { best = score; goal = p; }
    }

    if (!goal) {
      // Quiet: go and knock on a door.
      let nearest: Building | null = null;
      let bestD = Infinity;
      for (const b of this.world.buildings) {
        if (b.owner === this.side || !b.standing) continue;
        const d = Math.hypot(b.centre.x - from.x, b.centre.y - from.y);
        if (d < bestD) { bestD = d; nearest = b; }
      }
      goal = nearest ? nearest.centre : this.muster;
    }

    squad.goal = goal;
    this.world.squadFields[squad.id] = buildFlowField(this.world.map, goal, true);
  }
}

/**
 * The whole arena: two commanders and the grid they share.
 *
 * Installed onto a world by `ArenaGame`, and the only thing that knows both
 * sides exist. Nothing in `sim/` imports it.
 */
export class Arena {
  readonly influence: InfluenceMap;
  private readonly green: Commander;
  private readonly red: Commander;
  /** Kills by side, for the spectator bar. `world.kills` means something else. */
  readonly losses: [number, number] = [0, 0];
  private counted = new Set<number>();

  constructor(private readonly world: World) {
    /*
     * A doctrine each, and this is the reason the pair exists.
     *
     * Two sides running the same numbers on a near-symmetric map produce a
     * stalemate on the centre line: every firefight is correct and the battle
     * never goes anywhere. Red comes in numbers and closes; green goes wide and
     * shoots better. You can tell them apart by how they move rather than only
     * by colour, and when one of them turns out to always win there is
     * somewhere for the tuning to go.
     *
     * The rung is the same for both -- the asymmetry is the whole point, and an
     * asymmetry of *difficulty* would just be one side losing.
     */
    world.sideLevers = {
      [Faction.Player]: resolveLevers('veteran', 'arena-green'),
      [Faction.Enemy]: resolveLevers('veteran', 'arena-red'),
    };

    this.influence = new InfluenceMap(world);
    const owned = (side: Faction): Building[] => world.buildings.filter((b) => b.owner === side);
    this.green = new Commander(world, Faction.Player, owned(Faction.Player), this.influence, 0);
    this.red = new Commander(world, Faction.Enemy, owned(Faction.Enemy), this.influence, 1);

    /*
     * One sniper apiece, posted on a flank.
     *
     * Placed here rather than as map markers because every unit marker in the
     * format spawns for the garrison: two `S` on the map would be two snipers
     * for red and none for green, which is not a fight. Posted rather than
     * mustered, since a sniper who charges is a wasted sniper -- `makeEnemy`
     * already roots any specialist.
     *
     * They are here for the look of the thing. One long tracer across the
     * middle distance every few seconds gives the eye somewhere to go between
     * pushes, which a field of riflemen at the same range does not.
     */
    for (const side of [Faction.Player, Faction.Enemy] as const) {
      const huts = owned(side);
      if (huts.length === 0) continue;
      const post = {
        x: huts[0].centre.x + (side === Faction.Player ? 1 : -1) * world.map.tile * 2,
        y: huts[0].centre.y - world.map.tile * 2,
      };
      const counter = { nextId: world.nextId };
      const sniper = makeEnemy(counter, post, EnemyKind.Sniper, null, world.sideLevers[side]!, -1, side);
      world.nextId = counter.nextId;
      world.enemies.push(sniper);
      world.actors.push(sniper);
      // -2 rather than -1: never adopted by a commander, and visibly not merely
      // "not yet adopted".
      sniper.squad = -2;
    }

    /*
     * Territory feeds reinforcement -- and it feeds the side that is *losing*
     * it, which is the opposite of what this file first said.
     *
     * The original reasoning was that a side which wins ground should reinforce
     * faster, push further, over-extend and be rolled back: a tide. It does not
     * do that. It is positive feedback, and positive feedback runs away. What
     * actually happened, measured over five minutes: the winning side reached
     * the loser's huts, killed every man at the door, held all the ground,
     * reinforced faster for holding it, and stayed there. Losses came out
     * almost exactly even -- 182 against 186 -- while one side had nineteen men
     * standing and the other had none. The combat was fair and the battle was
     * over in ninety seconds.
     *
     * Inverted, it is negative feedback and it behaves the way the first
     * version was supposed to: a side pushed back onto its own huts replaces
     * men faster, the front comes back toward the middle, overshoots, and goes
     * again. The mechanism is unashamedly a rubber band -- the goal here is a
     * battle worth watching for ten minutes, not a fair simulation of one.
     *
     * Returned as a multiplier on the spawn *interval*, so below 1 is faster.
     * Clamped tight at both ends: a strong rubber band is as unwatchable as
     * none, because nothing that happens on the field is allowed to matter.
     */
    world.arenaPace = (side: Faction): number => {
      const { paceRange } = CONFIG.arena;
      const held = this.influence.fractionHeld(side);
      return paceRange[0] + (paceRange[1] - paceRange[0]) * held;
    };
  }

  step(dt: number): void {
    this.influence.step(dt);
    this.green.step(dt);
    this.red.step(dt);

    // Counted here rather than in `combat.ts`, which has one kill counter and
    // it means "enemies the player killed".
    for (const e of this.world.enemies) {
      if (e.alive || this.counted.has(e.id)) continue;
      this.counted.add(e.id);
      this.losses[e.faction === Faction.Player ? 0 : 1]++;
    }
  }

  /** Live count per side, for the readout. */
  standing(side: Faction): number {
    return side === Faction.Player ? this.green.alive() : this.red.alive();
  }

  /** Where the fighting is, or null when nothing is happening yet. */
  front(): Vec2 | null {
    const hot = this.influence.hottest();
    return hot.tension < CONFIG.arena.tensionThreshold ? null : this.influence.centreOf(hot.index);
  }
}
