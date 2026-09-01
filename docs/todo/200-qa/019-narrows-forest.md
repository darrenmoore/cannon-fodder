# 019 -- a forest narrows, with troops hidden at the edges

> the narrows - veteran
> this map is cool, make a forest themed one, and make it so the troops are hidden a little
> at the edges and in bushes..

## Findings

The narrows is a generated canyon (desert, 152x58, `reach`, ambush doctrine,
`timelimit: 240`). A jungle-theme corridor gets concealment for free: the
treeline/canopy system bakes continuous masses (`render/ground.ts`,
`render/canopy.ts`), and tall grass (`bakeTallGrass`) reads as bush cover.
Ambush doctrine already shrinks aggro (x0.62) -- men who hold fire until
close -- which against a green treeline *is* "hidden a little".

## Classification

New work -- a `/map` job.

## Plan (one sitting)

New mission: a jungle corridor in the narrows' spirit (one route, no room),
enemies tucked into treeline pockets and grass at the corridor's edges,
ambush doctrine. Whether it carries a clock like the narrows or trades the
clock for dread is a design call to make in the `/map` skill's coherence
check. Order it after the narrows in the campaign table. Respect
[010](010-spawn-distance.md) -- hidden is fine, adjacent is not. Prove
winnable, and `/grill` a mid-corridor screen to check the concealment reads.

## Done when

- A jungle corridor mission ships where edge enemies are visually inside
  treeline/grass until approached (screenshot evidence).
- `npm run check` passes including winnability.
