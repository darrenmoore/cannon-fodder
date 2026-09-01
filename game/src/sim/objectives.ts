import { EnemyKind, Phase } from '../types.js';
import { CONFIG } from '../config.js';
import { livingSoldiers } from './world.js';
import type { Building } from '../types.js';
import type { World } from './world.js';

/**
 * Mission objectives. The original was never only about killing everything --
 * levels asked you to level the buildings, walk hostages to a tent, or just
 * get someone out alive. Each kind reports progress for the HUD and decides
 * whether the mission is won.
 *
 * Losing is universal and handled by the caller: no soldiers left, no mission.
 */

export interface Progress {
  /** Short status line for the HUD, e.g. "3 of 5 huts standing". */
  status: string;
  done: number;
  total: number;
  won: boolean;
}

/**
 * The running kill count, for a mission that is not allowed one.
 *
 * Kept beside the objective the whole way rather than announced at the end: the
 * number that ends the mission should never arrive as a surprise. Empty on a
 * map without the modifier, so it can be appended unconditionally.
 */
const quietly = (w: World): string =>
  w.map.nokill ? ` · ${w.kills === 0 ? 'no kills' : 'compromised'}` : '';

/** m:ss, for the two objectives that put a clock in the status line. */
const clock = (s: number): string => {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function evaluate(w: World, dt: number): Progress {
  switch (w.map.objective) {
    case 'demolish': {
      const total = w.buildings.length;
      const done = w.buildings.filter((b) => !b.standing).length;
      return {
        status: `${total - done} building${total - done === 1 ? '' : 's'} left${quietly(w)}`,
        done, total, won: done >= total && total > 0,
      };
    }

    case 'rescue': {
      const total = w.hostages.length;
      const done = w.hostages.filter((h) => h.delivered).length;
      // A dead hostage makes the mission unwinnable, so it counts as a loss.
      const lost = w.hostages.some((h) => !h.alive && !h.delivered);
      return {
        status: lost ? 'hostage lost' : `${done}/${total} rescued${quietly(w)}`,
        done, total,
        won: !lost && done >= total && total > 0,
      };
    }

    case 'reach': {
      const living = livingSoldiers(w);
      const inZone = living.filter((s) =>
        w.extraction.some((z) => Math.hypot(z.x - s.pos.x, z.y - s.pos.y) <= z.pad + CONFIG.extraction.radius),
      ).length;
      return {
        status: `${inZone}/${living.length} at extraction${quietly(w)}`,
        done: inZone,
        total: living.length,
        won: living.length > 0 && inZone === living.length,
      };
    }

    case 'hold': {
      /*
       * Stand in the zone until the clock fills.
       *
       * The clock only runs while somebody is in it, which is the entire
       * difference between this and `survive`: there, the mission is time, and
       * here the mission is *ground*, and time is only how the ground is
       * measured. Leaving pauses rather than resets, because a defence that
       * punishes you for falling back is a defence with one tactic.
       */
      const living = livingSoldiers(w);
      w.inZone = living.some((s) =>
        w.extraction.some((z) => Math.hypot(z.x - s.pos.x, z.y - s.pos.y) <= z.pad + CONFIG.extraction.radius),
      );
      if (w.inZone) w.heldFor = Math.min(w.map.duration, w.heldFor + dt);
      return {
        status: `hold ${clock(w.heldFor)}/${clock(w.map.duration)}${w.inZone ? '' : ' · zone empty'}`,
        done: Math.round(w.heldFor),
        total: Math.round(w.map.duration),
        won: w.heldFor >= w.map.duration,
      };
    }

    case 'collect': {
      const total = w.supplies.length;
      const done = w.supplies.filter((s) => s.collected).length;
      // A destroyed box can never be collected, so the mission is already over
      // -- said here as well as in `isFailed` so the sidebar explains it.
      const lost = w.supplies.some((s) => !s.alive && !s.collected);
      return {
        status: lost ? 'supplies destroyed' : `${done}/${total} recovered${quietly(w)}`,
        done, total,
        won: !lost && done >= total && total > 0,
      };
    }

    case 'assassinate': {
      const officers = w.enemies.filter((e) => e.kind === EnemyKind.Officer);
      const down = officers.filter((e) => !e.alive).length;
      return {
        status: down > 0 ? 'the officer is dead' : 'the officer is still standing',
        done: down,
        total: officers.length,
        won: officers.length > 0 && down >= officers.length,
      };
    }

    case 'survive': {
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      const s = Math.ceil(w.timeLeft);
      const keep = protectedBuilding(w);
      const hp = keep && !keep.indestructible
        ? ` · outpost ${Math.max(0, Math.round((keep.hp / keep.maxHp) * 100))}%`
        : '';
      /*
       * On a wave map the waves are the mission, not the clock.
       *
       * The clock is how long the schedule takes to run; once the last wave has
       * been sent *and* killed there is nothing left that can hurt you, and
       * standing in an empty field waiting for a timer is not an ending, it is
       * a wait. So the last man of the last wave finishing is the win, and the
       * clock stays as the backstop for a map with no waves at all.
       */
      const lastWaveDown = w.map.waves !== null
        && w.wavesSent >= w.map.waves.count
        && !w.enemies.some((e) => e.alive);
      return {
        status: lastWaveDown
          ? 'the last of them'
          : `hold ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}${hp}${waveStatus(w)}`,
        done: Math.round(w.map.duration - w.timeLeft),
        total: Math.round(w.map.duration),
        won: w.timeLeft <= 0 || lastWaveDown,
      };
    }

    case 'eliminate':
    default: {
      const remaining = Math.max(0, w.enemyTotal - w.kills);
      return {
        status: `${remaining} enem${remaining === 1 ? 'y' : 'ies'} left`,
        done: w.kills,
        total: w.enemyTotal,
        won: remaining === 0 && w.enemyTotal > 0,
      };
    }
  }
}

/**
 * What the next wave is, for the HUD.
 *
 * A defender needs to know both how many are left and how long he has, because
 * the two together are the whole decision: spend the lull pushing out to level
 * another hut, or dig in. Empty on a map with no waves.
 */
export function waveStatus(w: World): string {
  const spec = w.map.waves;
  if (!spec) return '';
  if (w.wavesSent >= spec.count) return ' · last wave';
  return ` · wave ${w.wavesSent + 1}/${spec.count} in ${clock(Math.max(0, w.waveTimer))}`;
}

/** True when the mission can no longer be completed, whatever the objective. */
export function isFailed(w: World): boolean {
  if (livingSoldiers(w).length === 0) return true;
  // `nokill`: firing is allowed, killing is not. Checked as a count rather than
  // as an event so it cannot be missed -- a man killed by a mine, by a barrel,
  // or by his own side's grenade compromises the approach just as thoroughly as
  // one shot deliberately, and the player is the reason any of it happened.
  if (w.map.nokill && w.kills > 0) return true;
  // A clock on any objective, as opposed to `survive`'s clock which *is* the
  // objective. Shared here rather than per-objective so it composes.
  if (w.map.timeLimit > 0 && w.time >= w.map.timeLimit) return true;
  // Rescue missions are lost the moment a hostage dies.
  if (w.map.objective === 'rescue' && w.hostages.some((h) => !h.alive && !h.delivered)) return true;
  // Same reasoning for a supply box: blown up is not "harder to collect", it is
  // gone, and the mission cannot be finished.
  if (w.map.objective === 'collect' && w.supplies.some((s) => !s.alive && !s.collected)) return true;
  // A map that gives you something to hold is lost when it falls, whatever
  // else the objective happens to be. Holding out for two minutes means
  // nothing if the thing you were holding is rubble at ninety seconds.
  const keep = protectedBuilding(w);
  if (keep && !keep.standing) return true;
  return false;
}

/** A building the mission is lost without, if this map has one. */
export const protectedBuilding = (w: World): Building | null =>
  w.buildings.find((b) => b.role === 'protect') ?? null;

export function resolvePhase(w: World, dt: number): void {
  if (w.phase !== Phase.Playing) return;
  const progress = evaluate(w, dt);
  w.status = progress.status;

  if (progress.won) {
    w.phase = Phase.Won;
    w.phaseTime = 0;
  } else if (isFailed(w)) {
    w.phase = Phase.Lost;
    w.phaseTime = 0;
  }
}

/**
 * Human-readable objective, for the menu and the mission banner.
 *
 * `covert` keeps an entry because the level select reads the *raw* header --
 * `summarise` in server.js never parses the grid, so it has no idea the word is
 * an alias. Anything working from a parsed map should call `objectiveText`,
 * which composes the modifier back in rather than needing a fused word for
 * every pairing.
 */
export const OBJECTIVE_TEXT: Record<string, string> = {
  eliminate: 'Kill every enemy',
  demolish: 'Level every enemy building',
  rescue: 'Walk every hostage to a tent',
  reach: 'Get the squad to the extraction point',
  survive: 'Hold out until the clock runs down',
  covert: 'Reach the extraction without killing anybody',
  hold: 'Take the zone and hold it',
  collect: 'Recover every supply box',
  assassinate: 'Find the enemy officer and kill him',
};

/** What this mission asks, objective and modifiers together. */
export function objectiveText(map: { objective: string; nokill: boolean; timeLimit?: number }): string {
  const base = OBJECTIVE_TEXT[map.objective] ?? map.objective;
  // `reach` + nokill reads better as its own line than as the general form, and
  // it is on the menu beside thirty others. `covert` reaches here only from the
  // level select, which reads the raw header and so still sees the alias -- its
  // text already carries the rule, and appending it again said it twice.
  const carriesRule = map.objective === 'reach' || map.objective === 'covert';
  const withRule = map.nokill && carriesRule
    ? OBJECTIVE_TEXT.covert
    : map.nokill ? `${base} — without killing anybody` : base;
  return map.timeLimit ? `${withRule}, inside ${clock(map.timeLimit)}` : withRule;
}
