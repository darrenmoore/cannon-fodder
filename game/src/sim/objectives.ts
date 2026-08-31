import { Phase } from '../types.js';
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

export function evaluate(w: World, dt: number): Progress {
  switch (w.map.objective) {
    case 'demolish': {
      const total = w.buildings.length;
      const done = w.buildings.filter((b) => !b.standing).length;
      return { status: `${total - done} building${total - done === 1 ? '' : 's'} left`, done, total, won: done >= total && total > 0 };
    }

    case 'rescue': {
      const total = w.hostages.length;
      const done = w.hostages.filter((h) => h.delivered).length;
      // A dead hostage makes the mission unwinnable, so it counts as a loss.
      const lost = w.hostages.some((h) => !h.alive && !h.delivered);
      return {
        status: lost ? 'hostage lost' : `${done}/${total} rescued`,
        done, total,
        won: !lost && done >= total && total > 0,
      };
    }

    case 'reach': {
      const living = livingSoldiers(w);
      const inZone = living.filter((s) =>
        w.extraction.some((z) => Math.hypot(z.x - s.pos.x, z.y - s.pos.y) <= CONFIG.extraction.radius),
      ).length;
      // Everyone still standing has to make it to the pickup.
      return {
        status: `${inZone}/${living.length} at extraction`,
        done: inZone,
        total: living.length,
        won: living.length > 0 && inZone === living.length,
      };
    }

    case 'survive': {
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      const s = Math.ceil(w.timeLeft);
      const keep = protectedBuilding(w);
      const hp = keep ? ` · outpost ${Math.max(0, Math.round((keep.hp / keep.maxHp) * 100))}%` : '';
      return {
        status: `hold ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}${hp}${waveStatus(w)}`,
        done: Math.round(w.map.duration - w.timeLeft),
        total: Math.round(w.map.duration),
        won: w.timeLeft <= 0,
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
  return ` · wave ${w.wavesSent + 1}/${spec.count} in ${Math.max(0, Math.ceil(w.waveTimer))}s`;
}

/** True when the mission can no longer be completed, whatever the objective. */
export function isFailed(w: World): boolean {
  if (livingSoldiers(w).length === 0) return true;
  // Rescue missions are lost the moment a hostage dies.
  if (w.map.objective === 'rescue' && w.hostages.some((h) => !h.alive && !h.delivered)) return true;
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

/** Human-readable objective, for the menu and the mission banner. */
export const OBJECTIVE_TEXT: Record<string, string> = {
  eliminate: 'Kill every enemy',
  demolish: 'Level every enemy building',
  rescue: 'Walk every hostage to a tent',
  reach: 'Get the squad to the extraction point',
  survive: 'Hold out until the clock runs down',
};
