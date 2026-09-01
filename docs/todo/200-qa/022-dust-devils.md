# 022 -- dust devils: empty bottom-left, too easy

> map dust devils on veteran
> nice map, but nothing in bottom left
> and it was too easy

## Findings

Census: 10 `E` + 1 `S` + 1 `B` (+3 veteran extras) on a 104x80 eliminate
map, hunters doctrine, no huts, no clock; 3 `p` nodes. Generated from the
campaign table (`tools/generate-levels.mjs:2209`). The bottom-left emptiness
is the generator's placement, seeded -- nothing pins content there.

## Classification

Partly covered elsewhere, partly map work: "too easy" is largely
[003](003-veteran-balance.md)'s lever (this map gets +100% placed enemies
when that lands) plus [015](015-veteran-fire-range.md). The bottom-left gap
is this issue's own work.

## Plan (one short sitting, after 003)

Re-judge difficulty once 003/015 land -- then fill the corner: either reroll
the seed/params in the campaign table until the layout uses the corner
(cheap, but re-rolls the whole map), or add a placed feature there -- a small
garrisoned camp or hut cluster that an eliminate mission must visit. Prefer
the placed feature: the owner likes the map ("nice map"), so don't reroll
what he praised. Prove winnable.

## Done when

- The bottom-left quarter contains something worth clearing (map diff +
  screenshot), and the map still passes `npm run check`.
- A veteran playtest after 003 lands is re-judged against "too easy".
