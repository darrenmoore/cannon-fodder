# 002 -- mud: stepping effect, and the wallpaper pattern

> mud
> when stepping in mud, is it the same method as water?
> it could look a bit better
>
> also the mud itself is a bit too uniform, like on the sink it looks like a pattern

## Findings

"Mud" is `Tile.Quicksand`, map char `%`. The sink has 693 of its tiles; nine
other maps have a few (dust-devils 22, minefield 81, ...).

- **Stepping: yes, same method.** One shared `fx.splash(pos, thick)` call
  (`sim/troops.ts:233-239` -- the only call site, player soldiers only;
  enemies wading are silent). The mud branch differs only in particle count
  (2 vs 3), speed, lifetime and colour (`render/fx.ts:252-265`). No ripple
  rings, no footprints, no sound (audio.ts has no wading sfx at all).
- **The pattern has a root cause: mud has no material of its own.**
  `render/terrain.ts:38-41` maps `Quicksand -> Material.Sand`, and the whole
  ground bake is keyed on Material. So mud gets sand's near-smooth ramp
  (`palette.ts:98`, scale 0.05 -- "allowed to stay nearly smooth"), sand's
  sine-wave wind ripples (`ground.ts:293-327` -- the one pass in the codebase
  that produces regular parallel crests), and **no** strokes, undergrowth,
  shimmer, or shore treatment. The only mud-specific drawing is one crust
  ring per tile (`ground.ts:696-730`) -- jittered, but still one motif on a
  16px lattice, ~693 near-identical rings on the sink. A lattice of blobs is
  still a lattice. Against sand the warp can't even fray the boundary,
  because both sides are the same material.

## Classification

Broken, cause found -- the uniformity is structural, not a tuning miss.

## Plan

One sitting for the ground; the stepping polish is a second, smaller one.

1. Add `Material.Mud` + a `SURFACES` entry: its own darker ramp, higher drift
   contrast, coarser grain. Exclude mud from the sand ripple pass.
2. Break the ring lattice: place crust rings on a jittered multi-tile basis
   (skip more tiles, vary radius more, allow rings to straddle tiles), and
   give the mud/sand boundary a hem the way water shores get one.
3. Stepping (after 1-2): slower, darker, lower splash already exists -- add a
   brief sucking bootprint decal or a heavier particle, and consider a
   wading sfx. Enemies should emit it too (move the call out of troops.ts).

Visual work: `/style` first, `/pixel-check` before and after, judged by
`/grill` on the sink -- not by the session that drew it.

## Done when

- Mud has its own `Material` and surface ramp; the sand ripple pass no longer
  touches it (`ground.ts` greps clean).
- A `/grill` of the sink no longer names the mud pattern as the largest gap.
- Stepping in mud is visibly and audibly distinct from water in a playtest.
