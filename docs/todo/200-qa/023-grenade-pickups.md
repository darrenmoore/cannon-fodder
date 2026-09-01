# 023 -- over the water: the bridge pickups should be grenades

> map: over the water
> the things on the bridge should be grenade pickups, what they pick up now is wrong
> we are teaching them about grenades

## Findings

The owner is exactly right, and the map's own header agrees with him:
`data/training-bridge.map` line 7 -- *"There are grenades on the bridge --
walk over them, then use them."* But the bridge carries three **`k`** supply
boxes, not `c` crates. Per `docs/map-format.md`, `k` is a collect-mission
objective, not ammo -- and this mission is `demolish`, so the boxes grant
nothing and count for nothing (`sim/pickups.ts:15-50`): they sparkle,
pop "RECOVERED", and do nothing at all.

The consequence is sharp on veteran: the squad starts with **2** grenades
(`difficulty.ts:111`), and levelling the two huts needs 4 (hut 60hp, blast
45) -- the mission ships under-armed with no crate anywhere, exactly the gap
the three bridge markers were meant to fill.

## Classification

Broken, cause found. Trivial -- a wrong character.

## Plan (minutes)

The map is generated: fix the builder (`tools/generate-levels.mjs:866`,
campaign entry `:1974`) to place `c` instead of `k` on the bridge, run
`npm run levels`, then `npm run check`.

## Done when

- The bridge carries 3 `c` crates (9 grenades); no `k` remains on the map.
- `npm run check` passes; the map regenerates identically from the table.
