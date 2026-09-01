# 008 -- hut: no visible front door

> the hut doesn't clearly show a front door, it's mostly just the roof

## Findings

The hut **has** a door -- and then buries it. `bakeHut`
(`render/sprites/buildings.ts:25-188`, 36x36):

- The door is drawn first: an 11-row black arch at `:96-100`.
- The thatch dome is filled *after* it (`:107-132`) and reaches y=29 at the
  door's columns, overwriting rows 22-29 of it.
- The fringe teeth (`:146-156`) then cover rows 29-31, and the creeper
  speckles (`:159-164`) dust whatever survives.
- Net: the roof occupies ~28 of 36 rows and only ~3 rows of wall remain
  visible at centre -- despite the comment at `:75-80` aiming for "closer to
  sixty-forty" wall-to-roof.

## Classification

Broken, cause found: draw order, plus a dome that is simply too deep.

## Plan (one short sitting)

Either draw the door after the roof (carving a notch into the fringe so the
arch reads under an eave), or lift the dome's lower extent at the door
columns so the intended wall band actually shows. Match the original's hut
proportions -- `/pixelate` against `docs/original-images/` has settled this
kind of argument before. Check damage stages still read. Verify via
`/sprites` `#hut.0` and a `/grill` of any jungle mission.

## Done when

- The door arch is clearly visible in the gallery at stages 0-2, at 1x, with
  a visible wall band around it.
- `npm run check` passes.
