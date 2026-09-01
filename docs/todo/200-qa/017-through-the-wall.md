# 017 -- through the wall: boring after the factory falls

> map: through the wall
> it was a bit boring
> i take the factory down and then have a few enemies
> make it more exciting, change the map or something

## Findings

The census agrees: 7 `E` (+2 on veteran), 1 sniper, 1 bazooka on a 96x64
gated map -- the nearest enemy is **50 tiles** from the start, so the mission
is a walk, one wall demolition, then a thin garrison. It has a hand builder
(`tools/generate-levels.mjs:1421`) and one factory of 9 `F` tiles; no `p`
patrol nodes, no huts, so nothing moves or replenishes.

## Classification

New work -- map redesign, with latitude granted ("change the map or
something").

## Plan (one sitting)

Rework the builder around the wall as a *moment*: a garrison visible but
unreachable behind the wall (so the approach builds tension), a counter-force
that pours out when the wall is breached (huts behind the wall arm the
trickle system -- veteran holds 4 per hut), and a reason to move fast after
the breach. Patrol routes on the approach once [016](016-patrols.md) lands.
Respect [010](010-spawn-distance.md)'s start rule. Prove winnable.

## Done when

- Breaching the wall triggers visible opposition (playtest: enemy count near
  the breach rises after demolition).
- The approach contains at least one threat older than the wall.
- `npm run check` passes; the mission is proven winnable on veteran.
