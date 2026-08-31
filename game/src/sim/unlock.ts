import { groupByTheatre } from '../ui/menu.js';
import type { CampaignState } from './campaign.js';
import type { LevelInfo } from '../ui/menu.js';

/**
 * Which missions a player may start, and why.
 *
 * The rule, from the brief: **the first three of every theatre are always
 * open, and clearing any mission opens one more in the theatre it belongs to.**
 * Not a chain -- clearing mission four does not specifically unlock mission
 * five. It is a budget: three free, plus one per clear, spent down the
 * theatre's own order.
 *
 * Two things that shape is chosen for.
 *
 * **Three open in every theatre, not three in the first one.** A player stuck
 * on a jungle mission can go and fight in the desert instead, which is the
 * point the brief makes in its own words -- *"this helps giving the player
 * options and things to explore if they get stuck"*. A single chain across the
 * whole campaign turns one bad mission into a wall.
 *
 * **Clears count, attempts do not.** Losing costs nothing anywhere else in this
 * game -- a failed mission does not bury anybody -- and it should not quietly
 * cost progress here either.
 *
 * Locked missions are *shown*, and shown as locked. A goal you cannot see is
 * not a goal, which is the same argument the mission card's dim stars make.
 */
export interface UnlockState {
  /** Mission ids the player may start. */
  open: Set<string>;
  /** Per theatre: how many are open, cleared, and there in total. */
  byTheatre: Map<string, { open: number; cleared: number; total: number }>;
}

/** How many are open before a single mission has been won. */
export const FREE_PER_THEATRE = 3;

export function resolveUnlocks(levels: LevelInfo[], campaign: CampaignState): UnlockState {
  const open = new Set<string>();
  const byTheatre = new Map<string, { open: number; cleared: number; total: number }>();

  for (const group of groupByTheatre(levels)) {
    // Dev maps are not campaign progress and must never be gated behind it --
    // a test range you have to earn is a test range nobody can use.
    if (group.theatre.id === 'test') {
      for (const l of group.levels) open.add(l.id);
      continue;
    }

    const ordered = group.levels;
    const cleared = ordered.filter((l) => (campaign.records[l.id]?.clears.length ?? 0) > 0).length;
    const allowed = Math.min(ordered.length, FREE_PER_THEATRE + cleared);

    for (let i = 0; i < allowed; i++) open.add(ordered[i].id);
    // A mission already beaten stays open even if the order changes underneath
    // it, so a campaign edit can never lock somebody out of their own history.
    for (const l of ordered) {
      if ((campaign.records[l.id]?.clears.length ?? 0) > 0) open.add(l.id);
    }

    byTheatre.set(group.theatre.id, { open: allowed, cleared, total: ordered.length });
  }

  return { open, byTheatre };
}
