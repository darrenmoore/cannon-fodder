# 021 -- sink: where were the other waves?

> map: the sink
> veteran
> really fun
> it said there was a wave, and i think i only saw one wave?
> if it's a wave one then fine, but 45 seconds wasn't long enough

## Findings

The sink declares `waves: 4@11` -- four waves -- and on veteran they land at
**22.0s, 31.5s, 41.0s, 50.5s** (lead 22s, then 11s x pace x spawnInterval),
sized 7, 10, 13, 16. The owner saw one because:

- **The hold can end before the waves arrive.** The 45s hold clock starts
  accumulating the moment a soldier stands in the zone; a squad in place
  early wins around t=50 -- wave 4 lands at 50.5 and wave 3 at 41 barely
  walks in. Nothing binds `duration` to the wave schedule (the
  `CONTRADICTIONS` list at `sim/map.ts:27-44` doesn't cover it).
- **Spawned men are silently dropped** when no doorway exists outside 190px
  and out of sight (`sim/buildings.ts:156-163`) -- on a map that is one open
  quicksand bowl, that gate bites, and wading men can't fire, so arrivals
  are slow and quiet.
- **`hold` shows no wave counter.** `waveStatus()` exists
  (`objectives.ts:172-177`) but only the `survive` branch appends it; the
  hold branch doesn't. The only feedback is a transient in-world "wave N"
  popup over the squad.

## Classification

Broken, cause found (three small causes stacking).

## Plan (one sitting)

1. `duration: 45 -> 75` in `data/the-sink.map` (hand-written map, safe from
   regen) -- enough that wave 4 (50.5s) lands and must be survived, without
   turning a "really fun" map into a slog. Note this also softens 001's
   "super long" complaint the other way; the pause feedback from
   [001](001-sink-no-spawn.md) is what makes 75 honest.
2. Append `waveStatus()` in the `hold` branch of `objectives.ts` so the
   counter shows ("wave 2/4 in 9s") -- also serves
   [013](013-timer-clarity.md)'s formatting.
3. Add a wave/duration coherence check to the validator: on a `hold` +
   `waves` map, the last wave must land at least ~15s before the earliest
   possible win.

## Done when

- On veteran the sink's four waves all arrive before a fastest-path hold
  completes (computable from the config; verified by `/playtest`).
- The HUD shows wave progress during a hold mission.
- `npm run check` passes with the new coherence rule.
