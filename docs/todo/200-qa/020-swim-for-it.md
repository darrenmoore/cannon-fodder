# 020 -- swim for it: veteran too easy

> map: swim for it
> in veteran
> it was way too easy
> - a lot more troops on the north side of the bridge
> - put a spawning hut at the top, a bunch of them

## Findings

- Census: 10 `E` + 2 `S` + 1 `B`, +3 veteran extras, **zero huts**, no
  clock; nearest enemy 34.8 tiles -- so the whole opening is uncontested and
  the trickle system never arms.
- The map is **hand-written**: `swim-for-it` appears nowhere in the
  `CAMPAIGN` table of `tools/generate-levels.mjs` -- it is a `data/*.map`
  file edited directly, and `npm run levels` will not touch it (unlike most
  maps, where hand edits are lost).

## Classification

New work, precisely specified by the owner.

## Plan (one short sitting)

Edit `data/swim-for-it.map` directly: thicken the north-of-bridge garrison
substantially, add a cluster of spawner huts (`h` 2x2 blocks) at the top --
huts arm the veteran trickle at 4 alive per hut, ~5s a man, which is where
veteran difficulty actually lives ([003](003-veteran-balance.md) findings).
Keep the south approach as-is so the swim remains the safe(ish) route.
Respect [010](010-spawn-distance.md). Prove winnable on veteran.

## Done when

- North side holds a visibly larger garrison plus multiple spawner huts
  (map diff), and `npm run check` proves the mission still winnable.
- A veteran `/playtest` crossing the bridge north meets sustained
  opposition.
