# 016 -- real patrols, learnable and predictable

> not a sound map
> is better because the enemies are moving around a bit now
> but in a map not just this one, some of them should be patrolling
> and it'll be predictable, so players can learn their movements and get around them
> because for this map i cannot shoot anyone

## Findings

- What the owner saw on not-a-sound is **not patrolling** -- the map has zero
  `p` nodes, so all 15 riflemen are `Idle`; the movement is `idleFidget()`
  (`sim/enemies.ts:340-385`), a ~1.9-tile random shuffle. Its own doc
  comment calls it "a *legibility* lever", not a threat.
- Real `Patrol` state exists but is also random: a man with a `p` node walks
  to random points within a 46px (2.9-tile) radius and pauses
  (`enemies.ts:387-401`, `pickPatrolPoint` `:433-443`). There is **no
  route/waypoint system** -- nothing a player can learn.
- Coverage is thin: dry run, no way off, landing ground, the narrows, dust
  devils, cold keep have 2-3 `p` nodes each; swim for it, through the wall,
  not a sound, over the water, the sink have none.

## Classification

The brief's ask ("predictable, learnable") is **new work** -- random-beat
patrols cannot satisfy it by tuning.

## Plan (one sitting for the system, a second for map coverage)

1. Route patrols: chain `p` nodes into an ordered loop (nearest-neighbour
   chaining per contiguous group is enough -- no new map chars), and make
   `Patrol` walk the chain node-to-node with a pause at each, reversing or
   looping. A lone `p` keeps today's radius beat.
2. Alert/Investigate/Engage still interrupt as now; a survivor returns to
   his route (the `home` field already exists).
3. Map coverage: lay 2-4 node routes on not-a-sound (the covert showcase --
   crossing routes the player times), swim for it, and through the wall.
   `docs/map-format.md` gets the route semantics; the `/map` skill's
   checklist mentions routes for covert maps.

## Done when

- On not-a-sound, at least two enemies walk fixed repeating routes a
  watching player can time (driven `/playtest`: positions sampled over two
  loops repeat within a tile).
- Interrupted patrollers resume their route after alerts clear.
- `npm run check` passes; map-format.md documents route chaining.
