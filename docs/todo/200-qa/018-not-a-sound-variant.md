# 018 -- duplicate not-a-sound as a loud one

> not a sound map
> duplicate this map
> rotate it around and make it a bit different
> but then make it a fighting one where you have to clear all the troops
> no huts
> it's a cool map
>
> (from a later item: "for this map i cannot shoot anyone")

## Findings

Not-a-sound is a hand builder (`tools/generate-levels.mjs:1340`), 108x58,
rescue + `nokill`, garrison doctrine, 15 riflemen, no huts already. A
rotated variant with `objective: eliminate` and no `nokill` drops the
constraint that shaped its spacing -- the builder used "Twelve tiles, not
eight" specifically for the nokill rule, so the fighting variant can tighten
some of that.

## Classification

New work -- a `/map` job cut from an existing builder.

## Plan (one sitting)

New builder derived from not-a-sound's: rotate/mirror the layout, reshape
enough that it isn't a mirror-memory of the original (shift a compound, swap
a copse), `objective: eliminate`, no `nokill`, no huts (per the brief), keep
its garrison density but arm it for a fight -- and give it patrol routes once
[016](016-patrols.md) lands, since the bones suit them. New name, new
campaign table entry near not-a-sound's order. Respect
[010](010-spawn-distance.md). Prove winnable.

## Done when

- A new mission exists whose layout is recognisably not-a-sound rotated but
  reads as its own map; objective is eliminate-all; zero huts.
- `npm run check` passes including the new map's winnability.
