# The visual gauntlet loop

A record of the overnight run against `docs/original-images/`. Written down
because the loop only works if the three elements are fixed in advance and not
quietly renegotiated when a round is hard.

## Objective

The game's terrain, actors, HUD and menu read as the same game as the
screenshots in `docs/original-images/` — Sensible Software's *Cannon Fodder*,
1993, Amiga. Not a homage: the same density, the same palette weight, the same
organic terrain silhouettes.

## Metric

`node tools/shoot.mjs --out shots/<round>` drives the real game in a real
browser and writes real pixels. A critic with fresh context is shown those
pixels beside the reference and asked for the single largest remaining gap.
The critic inspects the image, never a summary of it — and never the diff.

Hard gates that run every round:

```bash
npm run check    # tsc --noEmit, level validation, map tests
node tools/shoot.mjs --out shots/<round>   # must be a clean run: zero page errors
```

## Boundary

- May change: `game/src/**`, `game/public/**`, `game/tools/**`, `data/**`, `docs/**`.
- Must not change: the ASCII map format's *authoring* contract. One character
  is still one tile. Richness is **derived** at load time, never hand-authored.
- Must not regress: `npm run check`, frame budget (terrain stays baked, not
  per-frame), or any mission's completability.
- Stop when a round produces no critic-agreed improvement, or the ranked gap
  list is exhausted.

## The ranked gap list, from the baseline

Ordered by how much screen area each one governs, which is the only honest
ordering when the objective is "looks like the reference".

1. **Ground reads as flat paint.** ~80% of every frame. The reference dithers
   two tones at pixel scale *and* varies tone in metre-scale blotches.
2. **Foliage is a grid of identical lollipops.** The reference has contiguous
   canopy masses with irregular silhouettes that merge into each other.
3. **No undergrowth fringe.** The reference edges every foliage mass with dark
   red-brown scrub. It is the most recognisable single detail in the game.
4. **Shorelines are a hard colour boundary.** The reference banks water with a
   rocky red-brown fringe.
5. **Arctic reads as white paper**, and its water reads as land.
6. **The whole palette sits too light and too desaturated.**
7. **The HUD is a browser toolbar**, not the game's left sidebar.
8. **The menu is a flat list** of identically-bordered rows.

## Rounds

Each round: build the part, capture, hand the pixels to a critic with fresh
context and the reference beside them, record the verdict and the next gap.

### 0 — the metric

Before anything was drawn, `tools/shoot.mjs`: enters every mission by the same
click path a player uses, aims the camera, and writes real pixels. Without it
there is no loop, only opinions.

It was wrong twice, and both times it produced a *confident false critique*,
which is the failure mode worth naming:

1. `centreOn` is undone by the squad-follow on the next frame, so every "aim at
   the water" shot silently framed the squad instead. A critic reported, with
   pixel counts, that the arctic mission contained no water. It contains 630
   tiles of it. Fixed by giving the camera an honest `lookAt`.
2. The feature-finding window was three times the size of the viewport, so it
   picked the map's centre of mass rather than the feature.

**A metric that can lie will eventually be believed.** Both fixes went in before
any further judgement was accepted.

### 1 — the ground

Replaced the per-tile fill-and-speckle painter with a per-pixel bake: tone ramps,
ordered dither, and a domain-warped material lookup. This is where the tiling
method changed from "one character, one square" to "one character, one sample
into a derived field", and `terrain.ts` exists from here on.

*Critic:* the ground reads as ground now; the hem around every treeline is a
diamond. It was — the distance fields used four-neighbour BFS. Chebyshev fixed it.

### 2 — the treeline

Trees stopped being one sprite per tile and became a single baked mass: warped
silhouette, cellular-noise lumps, lit from the top-left.

*Critic:* "our jungle looks like a modern hex-grid strategy game's forest tile."
Two specific measurements followed, and both were right:

- **The palette was the wrong hue.** The original's grass is olive — `#526b21`
  and `#949429`, red climbing to meet green and blue at almost nothing. Ours was
  blue-shifted emerald.
- **The dither contrast was a quarter of the original's**, so the two tones
  optically averaged back into one flat colour.

### 3 — the palette, and the things on the ground

Retinted everything to the measured olive. Added grass blades, undergrowth as
*plants* rather than as a dithered halo around every clump, and wind-combed sand.

*Critic (arctic):* the arctic has no black in it, and the original's does — a
quarter of its frame is near-black crag, and that is what the snow is bright
*against*.

### 4 — the shell

The HUD became the original's left sidebar, built from five reusable components
in `ui.ts`, with the squad listed by name — because a casualty should read as a
name leaving a list, not as a counter going down. The end-of-mission panel reads
the casualties back and offers the next mission. The mission select groups into
theatres. `tools/playtest.mjs` was written at the same time, to assert on the
paths a screenshot cannot reach.

### 5 — the machine-made tells

Both critics independently named the same thing: every shape betrayed its
generator. Fixed in order of how loudly:

| Tell | Fix |
|---|---|
| Shorelines drawn as three concentric bands | one narrow dark fringe, straight into saturated water |
| ~9px diagonal corduroy through the canopy | warp the cellular grid, but by *less* than one cell |
| Tall grass stamped on a readable 16px lattice | baked as a mass, like the trees |
| Rock outcrops as a wall of near-identical boulders | baked as a mass, faceted, snow-capped |
| Roads as evenly spaced full-width stripes | broken wandering ruts, and an eroded verge |
| Red plants strung evenly along the treeline contour | clustered into stands by a noise field |
| Anti-aliased translucent drop shadows | dithered coverage of a darkened ground tone |
| Rectangular map borders of uniform thickness | `frame()`: a thickness that walks, with copses and bays |
| Marooned single tiles reading as hard squares | `smooth()`, a majority filter, on every map |

### 6 — measuring instead of arguing

The last critic round contradicted the earlier ones. It claimed our canopy was
lighter than the grass (the original's is darker), and that our snow was
"mint-cyan, not white".

`tools/measure.mjs` was written to settle it, and settled it both ways:

- **Wrong about the snow.** Our dominant snow tone is `#bcdde2` at luminance
  214. The original's dominant snow tone is `#bcdde2` at luminance 214. An exact
  match, so it was left alone.
- **Right about the ratio.** The original's grass mixes its two tones 28.9% to
  28.1% — almost exactly 1:1. Ours was 1.9:1, dark-biased, which is why it read
  as murky. One `bias` constant.
- **Right about the black.** The original's arctic frame is 14.3% pure `#000000`.
  Ours bottomed out at `#04070a` and never reached it.

**A critic is evidence, not a verdict.** Three of the claims in that round were
measurably false and the rest were measurably true, and there was no way to tell
which without measuring.

## Where it stands

Every gate green: `npm run check` (36 map assertions across 8 missions),
`npm run playtest` (13 assertions on the mission shell), and a clean capture run
with no page errors.

The ranked gap list from the baseline is exhausted. What is left is not on it:

- **The map is stiller than it was.** Per-tree wind was a property of there being
  one sprite per tree. The treeline is one baked layer now and does not move.
- **Individual plant variety.** The canopy varies in tone and lump size across a
  map, but a palm and a broadleaf are the same mass with different colours.
- **Water has no surface life** beyond the existing shimmer pass — no current, no
  wake where a soldier wades.
