# 001 -- sink: ran out of troops, hold felt endless

> the sink
> i ran out of troops, they didn't seem to spawn anymore
> so i'm sitting there waiting to hold
> and the hold is super long, like over a minute

## Findings

- **Player troops never spawn mid-mission, by design.** The squad is built once
  in `createWorld` (`sim/world.ts:243-258`) from the map's `P` markers -- the
  sink has 6 -- and nothing anywhere adds a `Soldier` after that. The recruit
  pool only tops the roster up *between* missions (`sim/campaign.ts:278-297`).
  Losing the last man is instant mission loss (`sim/objectives.ts:181`).
- **Nothing tells the player this.** No screen, briefing, or HUD line says
  reinforcements do not exist.
- **The hold is 45 seconds, not "over a minute" -- but the clock pauses.**
  `sim/objectives.ts:76-97`: `heldFor` only advances while a living soldier
  stands in the 46px zone. Every second spent repositioning, wading, or dead
  is added to the wall-clock without being shown as paused -- the only hint is
  `· zone empty` in the objective line. `duration: 45` is in the map header
  and identical on every difficulty.

## Classification

Already true (no reinforcements is the design, as in the original) -- so what
this issue is really asking for is **feedback**: the game must *say* the squad
is all you get, and *show* the hold clock pausing instead of silently stalling.

**Decision (Q1, answered 2026-09-01): option 1** -- the no-reinforcements
design stands; fix the feedback.

## Plan

- Briefing/objective text for `hold`: include the duration ("hold it for
  0:45"), the way `timeLimit` already does (`objectives.ts:243-254`).
- Make the paused state loud: when `inZone` is false and `heldFor > 0`, the
  HUD objective line should visibly change state, not just append two words.
- Surface "no reinforcements" once per campaign (briefing line), not as nag.

## Done when

- The sink's briefing states the hold duration before the mission starts.
- Standing outside the zone visibly pauses the clock (playtest screenshot).
- A player who loses all six men sees a failure line that says the squad was
  the whole supply.
