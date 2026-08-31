# Design and architecture

How the prototype is put together, and why. See [research.md](research.md) for
the mechanics this is reproducing.

## Stack

- **Canvas 2D**, not SVG DOM. Hundreds of sprites, a camera that scrolls every
  frame, and pixel art that needs `imageSmoothingEnabled = false` to stay crisp.
  An SVG scene graph would fight all three.
- **TypeScript**, bundled by **esbuild**. Two dev dependencies, no runtime ones.
- **Node's built-in `http`** for the server — no Express, ~90 lines.
- **No art or audio files.** Sprites are plotted into offscreen canvases at boot
  ([`sprites.ts`](../game/src/render/sprites/index.ts)); sound is synthesised with WebAudio
  ([`audio.ts`](../game/src/shell/audio.ts)).

## Module map

The four directories are the dependency direction made visible: `sim` never
imports `render` or `ui`, and `render` only reads. `game.ts` names `Camera`,
`Renderer` and `Input`, but as types only — they erase at compile time, so no
runtime dependency crosses out of `sim`.

```
main.ts ── boots, level select, mission shell
loop.ts ── fixed 60Hz step + interpolated draw
config.ts (every tunable) · types.ts

sim/     the mission, and nothing that draws it
  game.ts ────── orders in, simulation order, phase transitions
  world.ts ───── the mutable state of one mission
  troops.ts ──── player squad state machine
  enemies.ts ─── enemy AI (rifle / sniper / bazooka)
  combat.ts ──── bullets, rockets, grenades, blasts, dying
  buildings.ts ─ destructible huts, reinforcements and waves
  hostages.ts ── freeing, following, delivering
  mines.ts ───── triggering, fuses, chain detonation
  pickups.ts ─── crate collection
  objectives.ts  per-mission win conditions and HUD status
  steering.ts · pathfind.ts (flow field + A*)
  map.ts · tiles.ts · difficulty.ts (levers) · campaign.ts (the roster)

render/  reads the world, never touches it
  render.ts ──── layer order, y-sorted actors, FX, decals
  terrain.ts ─── derived per-tile shape data (see "Terrain as shape")
  ground.ts ──── the ground bake: dither, shores, scrub, detail
  canopy.ts ──── treeline, tall grass and crag, baked as masses
  palette.ts ─── tone ramps, ordered dither, colour maths
  camera.ts · fog.ts · fx.ts · pixelfont.ts
  sprites/ ───── the atlas, baked at boot and split by subject:
      paint.ts (canvas, pixel, outline, palettes, noise)
      units.ts · buildings.ts · terrain.ts · icons.ts
      index.ts (the Atlas and the one-time bake)

ui/      chrome, in the DOM
  hud.ts ─────── the sidebar, the briefing, the end-of-mission panel
  menu.ts ────── the intro/level-select screen and difficulty picker
  sheet.ts ───── pause and settings, as modals
  boothill.ts ── the graves
  ui.ts ──────── the chrome components everything else is built from
  controls.ts · layout.ts · settings.ts

shell/   the machine the game is running on
  input.ts ───── intent, from whatever the player is holding
  pointer.ts ─── raw pointer events recognised into gestures
  aim.ts ─────── where the squad is pointing, and what it will throw
  audio.ts · music.ts · analytics.ts

tools/generate-levels.mjs -- writes the whole campaign into data/
tools/shoot.mjs           -- drives the real game and screenshots it
tools/playtest.mjs        -- drives the mission shell and asserts on it
tools/measure.mjs         -- pixel statistics, for settling arguments
tools/sheet.mjs           -- lays every baked sprite out on a grid
tools/crop.mjs            -- crops and magnifies, for comparing against the original
```

Dependency direction is one-way: `world.ts` holds state, the systems mutate it,
`game.ts` sequences them, `objectives.ts` judges it, and `render.ts` only reads.
Nothing imports `game.ts` except `main.ts`.

## The three problems worth explaining

### 1. Herd movement — one field, not six pathfinders

A move order builds **one Dijkstra flow field** over the walkable tiles
([`buildFlowField`](../game/src/sim/pathfind.ts)), and every soldier samples it. Six
men crossing the map costs one search, not six, and they naturally funnel around
obstacles together instead of each finding a private route.

Two refinements keep it from looking like grid-following:

- `flowTarget` first tries a **straight run at the goal** and only falls back to
  the field when the corridor is blocked, then looks a few steps down the chain
  and takes the furthest node it can walk to directly. That is what smooths the
  corners.
- Each soldier gets a **personal arrival slot** from a ring around the
  destination (`formationSlots` + greedy nearest-first `assignSlots`). Within
  `SLOT_HANDOFF` px it steers at its own slot instead of the shared goal. Without
  this, six men converge on one pixel and shove each other forever.

### 2. No overlap *and* no walking through trees

These two constraints fight each other: a separation push can shove a soldier
into a tree, and a wall resolution can shove two soldiers into each other. The
fix is a fixed order per step, in [`game.ts`](../game/src/sim/game.ts):

1. `steer` — seek the target, blended with a **soft** separation push from
   neighbours found via a spatial hash. This is a suggestion, for looseness.
2. `moveWithCollision` — integrate **X and Y independently**, cancelling the
   axis that would end inside a solid tile. Per-axis is what makes them *slide*
   along a treeline rather than stick to it.
3. `unstick` — nudge anyone who ended up inside scenery back out. A fine ring
   search first, then a tile-grid fallback: a fine search alone cannot escape
   something wider than it, like the middle of a deep river.
4. `resolveOverlaps` — the **hard guarantee**. Every overlapping pair is pushed
   apart by half the penetration each; if one of them would land in solid
   terrain, the other absorbs the whole correction instead.

Step 4 runs last and re-checks terrain on every push, so it can never undo
step 2. The headless driver asserts both invariants continuously during play.

### 3. Frame-rate independence

[`loop.ts`](../game/src/loop.ts) runs a fixed 1/60s accumulator with capped
catch-up, and the renderer interpolates between the last two positions using the
`prev` field every actor carries. Steering, fire rates and collision therefore
behave identically on a 60Hz and a 144Hz display, while motion stays smooth.

## Terrain as data

[`tiles.ts`](../game/src/sim/tiles.ts) is the whole terrain model. Every tile carries
**three separate blocking flags** rather than one `solid` bit:

| Flag | Example that needs it |
|---|---|
| `solid` | Deep water stops you, but you can shoot across it |
| `blocksSight` | Tall grass hides you; bullets pass straight through |
| `blocksShots` | A fence stops rounds but you can see over it |

Plus `speed`, `wade` and `slippery`, which `steering.ts` reads every step. That
is why roads are faster, quicksand is a trap and ice sends the squad skidding
through corners, without any of it being special-cased in the movement code.

`hasLineOfSight` and `hasLineOfFire` are the same grid walk with a different
flag, which is what keeps the two consistent.

## Missions and objectives

[`objectives.ts`](../game/src/sim/objectives.ts) turns "is the mission over?" into
one function per objective kind, each returning a HUD status line and a win flag.
`game.ts` calls `resolvePhase` once per step and does not know the rules.

Adding an objective is a new case in `evaluate` plus an entry in
`OBJECTIVE_TEXT`. Losing is shared — no soldiers left — plus a per-objective
hook, which is how `rescue` fails the instant a hostage dies.

## Buildings, hostages and mines

- **Objectives** are a header, not a code path per mission. `covert` is the odd
  one: it wins like `reach` and is failed by `w.kills > 0`, counted rather than
  hooked, so a man killed by a mine or by his own side ends the approach exactly
  as a deliberate shot does. Its mission is generated the opposite way round
  from every other -- route first, garrison into the pockets that leaves -- and
  both `npm run levels` and `npm run check` re-prove, on the finished grid, that
  a way to the extraction exists that never comes within a sentry's own aggro
  radius.
- **Buildings** ([`buildings.ts`](../game/src/sim/buildings.ts)) group contiguous
  hut/factory tiles at parse time. Rifle rounds do 1 damage against 60+ HP;
  explosives do 45. A standing building emits a trooper every few seconds while
  the squad is within range, capped so a village cannot spiral. When it
  collapses its tiles become walkable rubble — the level's shape changes
  permanently, which is why `map.pristine` exists to restore it on restart.
  A map with a `waves:` header spends the same buildings on a schedule instead:
  the garrison empties itself in bursts out of those same doorways, sized by how
  many of them are still standing, so levelling the huts is how the player turns
  the attacks off. The proximity trickle is switched off on those maps, since
  leaving it running underneath would fill in the lulls that make a wave read as
  a wave.
- **Swimming** is a movement rule rather than a terrain property. Deep water
  stays `solid`, because that flag is what spawn placement, patrol picking,
  formation slots, hostage movement and the completability test all read; it
  also carries `swim`, and `blocksMovement` in `pathfind.ts` is the only thing
  that looks at both. So everything that decides *where to put* a man still
  treats the river as a wall, and only a man deliberately crossing it goes in --
  slowly, up to his neck, and unable to fire, because swimming is expressed as a
  deeper kind of wading and the "rifle held clear of the water" rule already
  existed. Water costs the route planner four tiles of land, which is what keeps
  a nearby bridge the fast way over rather than a decoration. Anything that
  would hold position while swimming is sent to the nearest bank instead: a line
  of fire crosses deep water, so "close to preferred range and stop" would
  otherwise leave a man treading water he cannot shoot from.
- **Hostages** ([`hostages.ts`](../game/src/sim/hostages.ts)) deliberately do *not*
  pathfind: they trail their nearest escort with simple seek-and-slide. Anything
  cleverer reads as another squad member rather than someone being led out.
- **Mines** ([`mines.ts`](../game/src/sim/mines.ts)) are invisible until triggered,
  then run a short fuse. Blasts prime neighbouring mines with a small stagger, so
  a chain reads as a ripple rather than one bang.

## Enemy AI

A four-state machine in [`enemies.ts`](../game/src/sim/enemies.ts), shared by all
three enemy kinds:

```
Idle/Patrol ──(soldier in aggro radius + LOS)──> Alert ──(reaction beat)──> Engage
     ^                                                                        │
     └────────────────────(alertMemory expires without sight)─────────────────┘
```

Kinds differ only in stats and one flag: riflemen close to `preferredRange`,
while **snipers** and **bazookateers** are `rooted` and hold their firing
position — a sniper that gives up its position is a dead sniper.

Enemies steer directly rather than each running a flow field, with a **stuck
detector** triggering a one-off A* as an escape hatch. They fire slower and less
accurately than your men; with one-hit kills on both sides, that margin is the
only thing making the odds survivable.

## Terrain as shape

One character per tile is a good *authoring* format and a hopeless *drawing*
format. A tile that knows only "I am grass" can be painted only as a square of
grass, and a grid of squares is exactly what the original does not look like.

So none of the richness is authored. [`terrain.ts`](../game/src/render/terrain.ts) runs
once per map load and derives, for every tile:

| Field | What it is | What it buys |
|---|---|---|
| `material` | coarse surface class — ground, sand, wet, stone, built, ice, road | neighbour tests that ask "also wet", not "also specifically shallow water" |
| `depth` | how far inside its own material a tile sits | tone that deepens toward the middle of a mass |
| `mass` / `massSize` | contiguous region id and its size | treating one lake as one thing |
| `bits` / `canopyBits` | 8-neighbour match masks | local silhouette decisions |
| `wetSdf`, `foliageSdf`, `treeSdf`, `grassSdf`, `stoneSdf` | **signed distance in tiles**, negative inside | the whole organic look — see below |

The distance fields are the important ones. Sampled bilinearly, with the sample
point displaced by a noise field first, a staircase of square tiles becomes a
curve that owes nothing to the grid it came from. Every shoreline, treeline and
crag edge in the game is one threshold on one of those fields.

Distances are Chebyshev, through eight neighbours, not four. Four-neighbour
distance grows a mass as a diamond, and a map full of diamonds is unmistakable.

## Rendering

Layers, in order:

1. **Ground** — baked once per map into a full-map offscreen canvas, blitted by
   visible rect. One `drawImage` per frame however detailed it is.
2. **Decals** — a second full-map canvas holding blood, corpses and scorch. Burnt
   in once and never simulated again, so the battlefield stays marked.
3. **Scenery and actors, y-sorted together**, keyed on where each touches the
   ground.
4. **The canopy layer** — treeline, tall grass and crag — over the actors.
5. Crates, mines, target brackets, bullets, grenades, particles, muzzle flashes.
6. Fog.

### The ground bake

[`ground.ts`](../game/src/render/ground.ts) writes pixels straight into an `ImageData`
buffer. A 220x44 mission is 2.5 million pixels: far too many to touch every
frame, and completely fine to touch once. Three ideas do most of the work.

**Ramps, not colours.** Every surface is four to six tones and a noise field
picks a position along it, so tone drifts across a field instead of sitting
flat. The ramps live in [`palette.ts`](../game/src/render/palette.ts).

**Ordered dither.** The fractional position between two ramp entries is resolved
against a Bayer threshold, so the two tones interleave at pixel scale. The
threshold carries a fixed per-pixel jitter, because pure Bayer at 50% coverage
is a perfect lattice and a perfect lattice across a whole field reads as a
screen door rather than as ground.

**Domain warping.** The tile a pixel reads its material from is offset by a
noise field *before* the lookup. That one substitution dissolves every straight
tile boundary into a wandering edge, with neither the map format nor the
collision grid knowing anything about it. The warp has to exceed the tile size
to do its job — at a third of a tile, a lone tile of grass in a field of sand
still reads as a square with slightly soft corners.

On top of that, in order: wind-combed sand ripples, the waterline, the forest
floor and its litter, undergrowth, and the handful of things that really are
tile-shaped — planking, fence rails, quicksand ripples, ice cracks, wheel ruts.

### The canopy bake

[`canopy.ts`](../game/src/render/canopy.ts) bakes the treeline, tall grass and rock
outcrops into a single full-map layer with alpha, drawn **over** the actors.

That is not a compromise. Trees and rock are solid, so nothing can stand inside
one, and the small overhang onto a soldier at the hem is what the original
shows. Tall grass genuinely should cover you — hiding in it is the point of it.

The *shape* is a warped distance field. The *texture* is cellular (Worley)
noise: a jittered grid of feature points, each becoming one rounded lump of
leaves, where the offset from a pixel to its nearest feature point doubles as
that lump's surface normal and lights it from the top-left.

The cellular grid is itself warped before sampling. One feature point per cell,
however well jittered, still leaves a lattice — a cell can hold neither zero
points nor two — and the eye reads faint diagonal rows straight through the
mass. The warp has to stay *under* the cell size, though: warp by more than a
cell and the lumps shear into long worms and the canopy reads as brain coral.

Crag uses the same machinery with the hardness turned up: fewer and larger
lumps, a quantised normal so the surface breaks into facets instead of
graduating, a hard black underside on every stone, and a bright cap on the upper
surfaces. On an arctic map that cap is most of why the snow reads as bright.

### Things that are deliberately absent

- **No alpha blending, and no anti-aliasing.** Both are things the hardware being
  imitated could not do, and the eye picks a soft gradient out of a dithered
  frame instantly. Shadows are dithered coverage of a *darkened ground tone*,
  not a translucent black shape — a near-black ellipse under a building reads as
  a hole cut in the map, and on snow it reads as a stain.
- **No banded edges.** A shoreline drawn as bank, then foam, then shallows is
  three concentric isolines, and it reads as a contour-map key rather than as a
  coast. What the original actually does is one to three pixels of near-black
  wet ground and then straight into saturated water.
- **No per-tile stamp for anything that forms a mass.** Trees, tall grass and
  rock were each one sprite per tile once. On a 16px grid that is a readable
  repeating motif across a whole mission — wallpaper, corduroy, or a wall of
  near-identical boulders, depending on the sprite.

### The men

A soldier is thirteen pixels wide, which is not many, and the first version of
this spent them the obvious way: a helmet rectangle over a face rectangle over a
uniform-coloured torso, symmetrical, softly shaded in three bands. It read as a
toy soldier. Three rules off the original fixed it.

**Light comes from straight above, so a soldier is a bright hat on a black
body.** The helmet crown is close to the brightest thing on screen, the face is
a small hot orange patch under it, and everything below the collar is nearly
black. The value range inside one 13-pixel sprite is most of the palette's. A
figure shaded evenly in its own uniform colour has no focal point at all.

**Nothing is symmetrical.** Kit hangs off one side, the shoulders differ by a
pixel, the helmet's highlight sits off-centre. Bilateral symmetry is the single
strongest signal that something was generated rather than drawn.

**Detail is scattered pixels, not shading.** What reads at this size is three or
four contrasting flecks — webbing, a pouch, a strap — against the dark mass.
Smooth tonal bands across a five-pixel torso read as nothing whatsoever.

Sprites are baked in four variants per unit type, indexed
`[variant][facing][frame]` and chosen by actor id, so a man keeps his kit for
as long as he lives. Six identical figures walking in step is the most toy-like
thing a squad can do — and the same argument applies one level up, which is why
`squad()` in the generator scatters the spawn instead of laying a 3x2 lattice,
and why `spawnActor` gives each man a facing a step or two off his neighbour's.

Shadows are the figure's own silhouette in solid black, offset down and right.
Dithering it looked like the right call — it stops the shadow doubling the
figure's visual mass — but a checkered copy of a sprite that already has thin
legs produces a ragged fringe of dark spikes around the lower body, and six of
those in a clearing look like spiders. A shadow has to be one clean shape or it
stops reading as one. The same argument drove the sprite itself: the legs are
short and thick and barely separated, and the shoulders are one solid block
rather than a torso with a one-pixel column stuck on either side.

Everything the atlas bakes can be looked at directly with `npm run sheet`, which
is how the wrecked buildings got fixed — to see a ruin in the game you have to
level one first, and to compare four damage stages you have to level four.

### Still per-tile, and rightly so

- **Ruins.** Buildings are drawn from live state rather than baked, so they can
  swap to a wrecked sprite and show a damage bar.
- **Themed buildings.** Jungle and desert get the round thatched hut; the arctic
  gets a log cabin. A mud hut in a snowfield is a brief nobody wrote.
- **Hashed sprite variants.** Variant choice runs tile coordinates through an
  integer hash — a linear combination like `(tx + ty * 3) % n` bands into visible
  diagonal stripes along a straight border.

### Palette

The ground ramps are sampled off the original rather than invented, and two
things about them are counter-intuitive.

**The jungle is olive, not green.** The original's grass alternates `#526b21`
and `#949429` — red climbing to meet green, blue at almost nothing. That is a
hue around 60 degrees, not the 110 that a palette named "jungle" reaches for. A
blue-shifted emerald reads as a modern strategy game from across the room,
whatever else is right about it.

**The two dither tones sit far apart, and mix about 1:1.** That pair is roughly
a 50% step in relative luminance, and in the original they cover 28.9% and 28.1%
of the frame. Interleaving tones a few percent apart just averages back to one
flat colour; the visible vibration *is* the texture. `tools/measure.mjs` reports
both numbers, which is how they came to be matched rather than guessed.

## Difficulty, as levers

A single difficulty multiplier makes enemies predictable: they only ever get
more accurate. What actually changes how a mission plays is *which* levers move
-- whether they hear you, whether they come looking, whether they charge or hold
their range, whether they flank, whether the huts keep feeding, and whether you
can see the map at all.

So [`difficulty.ts`](../game/src/sim/difficulty.ts) defines a whole **profile** of
~16 levers per setting, and each mission's `doctrine` header then bends that
profile in its own direction. Veteran on a garrison map and Veteran on a hunters
map are genuinely different fights.

| Lever | What it changes |
|---|---|
| `spread`, `fireInterval`, `fireRange`, `speed` | The basic shooting stats |
| `aggro`, `reaction` | How far and how fast they notice you |
| `hearing` | **How far a gunshot travels as an alert.** The biggest single knob |
| `hunters` | Fraction that cross the map to your last known position |
| `rushers` | Fraction that charge to knife range instead of holding off |
| `grenadiers` | Fraction that lob grenades at a clustered squad |
| `flank` | How far off-axis they approach |
| `vision` | Fog-of-war radius; 0 disables the fog |
| `extraEnemies`, `spawnInterval`, `maxSpawned` | Garrison size and reinforcement pressure |
| `grenades` | What you start with |

**Doctrines** (`garrison`, `patrol`, `hunters`, `ambush`, `swarm`) multiply into
that profile. A garrison damps hunting and charging but sees further; an ambush
has a short aggro radius with a very fast reaction and tight grouping; a swarm
triples the headcount and sends them all at you.

Per-enemy **traits** are rolled at spawn from the resolved levers
(`rollTraits` in `world.ts`), so within one mission some enemies hunt, some
charge, some flank left, some flank right. Two runs of the same level are not
the same fight.

The menu shows the resolved levers per mission as chips, so the difficulty is
legible before you commit rather than a mystery number.

### Alerts: the thing that makes them feel alive

`raiseAlarm` in [`enemies.ts`](../game/src/sim/enemies.ts) wakes every enemy within
earshot and sends them to look, via a new `Investigate` state. It fires on:

- your gunfire (radius = `hearing`) -- **shooting is now a decision**
- explosions (radius = `hearing * 2`)
- the moment anybody first spots the squad

`world.lastKnown` is the squad position any enemy last actually saw, shared
across all of them. Hunters keep re-aiming at it while the trail is warm
(`enemy.trailMemory`), which is what turns "walk to where the noise was" into
being pursued.

## Fog of war

[`fog.ts`](../game/src/render/fog.ts) keeps two tile masks: what the squad can see now,
and what it has ever seen. Enemies outside the visible mask are not drawn, so on
Veteran and Elite you are fighting something you have to find first.

It is recomputed on a 0.08s timer rather than per frame -- per-tile line of sight
per soldier is not free, and fog that updates twelve times a second is
indistinguishable from fog that updates sixty. The renderer builds the overlay at
**one pixel per tile** and blits it up to world scale with smoothing on, which
turns the tile grid into a soft falloff for nothing.

Fog uses the same `blocksSight` flag as enemy vision, so it is symmetric: tall
grass hides them from you exactly as it hides you from them. On Undergrowth --
a map that is almost entirely tall grass -- that makes Veteran genuinely
claustrophobic. That is deliberate, and `CONFIG.fog` plus `levers.vision` are
where to soften it.

## Buildings, visually

A building carries a `damageStage` derived from its HP, and
[`sprites.ts`](../game/src/render/sprites/buildings.ts) bakes four states of each: intact,
scarred (pocked walls, torn thatch), failing (a hole clean through, the roof
caving), and wrecked. A wreck keeps smoking for `building.smokeDuration` seconds
and then smoulders, so "this one is dealt with" reads from across the map.

A wreck is drawn in **ash grey**, not in burnt browns. Brown is the family the
thatch was already in, so a ruined hut read as a scruffier hut rather than as a
destroyed one; grey says the fire has been and gone. Charcoal beams lie through
it and a handful of embers keep some warmth, but the mass of it is cold.

There are two sets. The jungle and desert build the round mud-walled hut: an
enormous circular thatch roof seen from almost directly above, lit as a dome
from the upper left, with a smoke hole punched off-centre on the lit slope and a
fringe of straw teeth overhanging the wall. The arctic builds a log cabin —
horizontal timber courses, a snow-laden pitched roof, icicles along the eave,
and a drift banked against the windward wall.

Two things about drawing them are easy to get wrong and obvious afterwards. The
roof must be lit as a *sphere*: a flat disc with radial spokes converging on a
centred hole is a cinnamon bun, not a building. And the wall wants to be a real
fraction of the sprite — roughly forty percent — because almost-all-roof reads
as a plate lying on the ground rather than as something you can walk around.

Inside the wrecked sprites the draw order matters: scorch and debris go down
*first* and the surviving structure on top. Painting the char last buries the
walls and leaves an unreadable brown mound.


## Tuning

Everything lives in [`config.ts`](../game/src/config.ts) — speeds, radii, ranges,
fire rates, blast sizes, camera and wind. The dev server rebuilds on save, so
tuning is edit-and-reload. Notable knobs:

| Knob | Effect |
|---|---|
| `camera.zoom` | Integer scale. 3 keeps soldiers at roughly the original's relative size. |
| `soldier.fireRange` | Ordered fire, 80px. Deliberately short -- a firefight should be close work. |
| `soldier.autoEngageRange` | Unordered return fire, as a fraction of `fireRange`. Shorter, so walking past a sentry does not silently clear the map. |
| `soldier.autoEngage` | Idle soldiers return fire at anything they can see. Off makes it much harder. |
| `soldier.iceAccel` | How badly ice ruins your footing. |
| `enemy.aggroRadius` / `reactionTime` | Base values; the difficulty levers scale them. |
| `enemy.rushRange` / `searchTime` / `trailMemory` | Charging, searching and how long they chase a cold trail. |
| `fog.unexplored` / `fog.remembered` | How dark the two fog states are. |
| `sniper.*` / `bazooka.*` | The two specialist enemy types. |
| `building.spawnInterval` / `maxSpawned` | How hard a village pushes back. |
| `wind.*` | Foliage sway speed, amplitude and gust drift. |
| `fx.decals` | Off to stop blood and corpses accumulating. |

## Testing

- `npm run check` — `tsc --noEmit`, then the generator's own validator, then
  [`test/map.test.mjs`](../game/test/map.test.mjs), which parses **every**
  mission in `data/` and asserts squad size, that nothing spawns in solid
  terrain, that sight and fire blocking differ where they should, and a **flood
  fill proving each mission's objective is actually completable**. An unwinnable
  map fails the build, not the player.
- `node tools/playtest.mjs` — drives the mission shell in headless Chromium and
  asserts on it: the mission select groups and lists every mission, a mission
  starts, the sidebar names the squad, losing raises the end panel and does *not*
  quietly restart, "try again" restarts in place, winning offers the next
  mission, "next mission" goes straight into it without passing through the list,
  Esc comes back, and the final mission offers no "next". Screenshots prove the
  game renders; this proves it still plays, which is the half a visual refit is
  most likely to break without leaving a mark on any screenshot.
- `node tools/shoot.mjs` — enters every mission by the same click path a player
  uses, aims the camera at the densest cluster of a named terrain character, and
  writes real pixels. `--fit` adds a whole-map view, which is the only way to
  judge composition. A run that logs a page error fails.
- `node tools/measure.mjs <png>` — dominant colours by share, the luminance
  histogram, and the two-mass split. For questions like "is the canopy darker
  than the grass" that are numbers rather than opinions.
- The campaign was also driven end-to-end in headless Chromium: every mission's
  specific mechanic (deep water, tall grass, mines, building reinforcement,
  hostage rescue and delivery, ice, the survive clock), core combat, grenades and
  chain detonation — with the no-overlap and no-clipping invariants asserted
  throughout.

## Known limitations

- The roster does not split. A soldier is promoted, buried and remembered, but
  the squad is still one herd — no Snake/Eagle/Panther.
- Trees no longer sway. The treeline is one baked mass now, and per-instance wind
  was a property of there being one sprite per tree; the trade was worth it, but
  the map is stiller than it was.
- A mission's par is one number per mission, not per difficulty: clearing it on
  Elite and on Rookie compete for the same "brought home" record.
- No squad splitting (Snake/Eagle/Panther).
- No vehicles or turrets.
- The player has no bazooka — grenades are the only explosive you carry.
- Enemies manage range but do not seek cover.
- Grenades cannot be cooked or bounced — they fly to the cursor and detonate.
- Missions can still be played in any order. `Theatre.locked` remains unwired,
  and deliberately so — see [the meta-game](todo/002.md) for why ribbons were
  preferred to locks.
