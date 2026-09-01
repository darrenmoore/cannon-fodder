# Map format

Missions are plain ASCII text in [`data/`](../data), served raw by the dev server
at `/api/maps/<id>` and parsed by [`map.ts`](../game/src/sim/map.ts). Most are
produced by [the generator](#generating-levels), but they are ordinary text
files — edit one in any editor and reload the page.

This file is the contract. If you are writing a mission by hand — or you are a
model that has been handed this file and asked for one — everything you need is
here, and [designing a mission](#designing-a-mission) at the end is the part
worth reading twice.

## File shape

```
name: Chicken Run
theme: jungle
objective: eliminate
doctrine: garrison
order: 1
mechanic: basics
brief: Move as a herd, use the treeline, and let them come to you.
tile: 16
---
..TT..~~~~.....TTT......
..T..."""""".h...........
.....==~~==....c........
....E.~~~~.....E...T....
..P.P.~~~~..............
```

A block of `key: value` header lines, a `---` separator, then the art.
**Everything after the separator is map art** — `#` is the rock tile, so it
cannot double as a comment marker.

### Header keys

Two different readers consume the header, and it is worth knowing which is
which. [`parseMap`](../game/src/sim/map.ts) reads what the *mission* needs;
`summarise` in [`server.js`](../game/server.js) reads what the *level select*
needs, without parsing the grid. A key read by only one of them is still
perfectly valid — it is simply ignored by the other.

| Key | Meaning | Default | Read by |
|---|---|---|---|
| `name` | Shown in the HUD and on the level select | `Unnamed` | both |
| `theme` | `jungle`, `desert` or `arctic` — recolours terrain and picks the tree species | `jungle` | both |
| `objective` | See [Objectives](#objectives) | `eliminate` | both |
| `doctrine` | The garrison's standing orders. See [Doctrine](#doctrine) | `garrison` | both |
| `nokill` | `true` loses the mission at the first body. See [Modifiers](#modifiers) | `false` | both |
| `timelimit` | Seconds before the mission is lost. See [Modifiers](#modifiers) | none | both |
| `gated` | `true` when the only route runs through a building you must level. See [Modifiers](#modifiers) | `false` | mission |
| `grenades` | Grenades the squad starts with, overriding the difficulty's number. `0` is a real answer; omit it to take the difficulty's | difficulty's | mission |
| `brief` | One line shown on the menu and in the opening banner | — | both |
| `mechanic` | Short label for the new idea this mission introduces | — | both |
| `duration` | Seconds to hold out, for `survive`; seconds to stand in the zone, for `hold` | `90` | mission |
| `waves` | `5@22` — five waves, twenty-two seconds apart. See [Waves](#waves) | none | mission |
| `squad` | How many men this mission fields, clamped down to the `P` markers | every `P` | mission |
| `tile` | Tile edge in world pixels. Nothing ships at anything but 16 | `16` | mission |
| `order` | Position on the level select | `999` | menu |
| `dev` | `true` keeps it out of a real player's mission list | `false` | menu |

Unknown themes, objectives and doctrines fall back to `jungle` / `eliminate` /
`garrison` rather than failing, so a typo costs you a mission's flavour, not the
build. A malformed `waves:` is treated as no waves, for the same reason.

`squad:` only ever clamps **downward**. A map with six `P` markers and
`squad: 1` fields one man; a map with two `P` markers and `squad: 6` fields two,
and `npm run check` will fail it for not fielding what it declared.

## Legend

The legend lives in [`tiles.ts`](../game/src/sim/tiles.ts), not in the map file,
so the art stays pure.

One character is all a tile ever carries. Everything the renderer needs beyond
that — which contiguous mass a tile belongs to, how deep inside it, how far it is
from the nearest water or treeline — is **derived** at load time by
[`terrain.ts`](../game/src/render/terrain.ts) and never authored. That is
deliberate: it is what lets a mission stay a text file you can edit in any editor
while still being drawn as organic terrain rather than as a grid of squares. See
["Terrain as shape"](design.md#terrain-as-shape).

### Terrain

Movement, sight and shots are three separate flags. That is what lets tall grass
hide you without stopping bullets, and deep water stop you without blocking your
line of fire — and those two inversions are where most of this game's tactics
come from.

| Char | Tile | Blocks move | Blocks sight | Blocks shots | Notes |
|:---:|---|:---:|:---:|:---:|---|
| `.` | Grass | | | | Open ground |
| `,` | Sand | | | | Banks and paths |
| `_` | Road | | | | **18% faster** to march along |
| `T` | Tree | yes | yes | yes | Cover. Sways in the wind |
| `#` | Rock | yes | yes | yes | Cover |
| `h` | Hut | yes | yes | yes | **Destructible**, and spawns troopers. 2x2 blocks |
| `F` | Factory | yes | yes | yes | As above, much tougher. 3x3+ |
| `O` | **Outpost** | yes | yes | yes | **Yours.** Spawns nobody; the mission is lost if it falls |
| `U` | **Bunker** | yes | yes | yes | **Yours, and permanent.** Nothing in the game can level it — what a `hold` zone stands on |
| `+` | Fence | yes | | yes | Waist-high: stops movement and bullets, **not sight** |
| `~` | Water | | | | **Wade**: 45% speed, and you cannot fire |
| `W` | Deep water | walkers | | | **Swim**: 34% speed, cannot fire, and shots cross it freely |
| `=` | Bridge | | | | The fast crossing |
| `"` | Tall grass | | **yes** | | Walk-through cover. Hides you; bullets pass straight through |
| `%` | Quicksand | | | | 24% speed and you cannot fire. Effectively a trap |
| `i` | Ice | | | | Slippery: acceleration drops to 16%, so you slide through turns |
| `:` | Rubble | | | | What a levelled building leaves behind. 80% speed |
| `A` | Tent | | | | Delivery point for hostages, and an extraction zone |

**Deep water is the one tile whose "blocks move" answer is "it depends."** It is
`solid` to everything that *decides* — spawn placement, patrol picking, hostage
movement, formation slots, the completability flood fill — so reinforcements
never appear in the river and hostages never walk into the sea. A soldier
steered into it on purpose swims across anyway, slowly, unable to fire. Treat it
as a wall when placing things and as a costly route when designing them.

### Entity markers

These spawn something and **leave the ground they were standing on** -- a crate
in a sand field leaves sand, a soldier on a road leaves road. Only where nothing
walkable is nearby does a marker fall back to grass.

That matters more than it sounds. Every marker used to stamp grass, which on a
desert or arctic map punched one hard-edged green square into the sand per
entity, and there were forty-five of them on Minefield alone. Hazards are never
inherited -- a spawn beside a bog does not end up in the bog -- and neither is a
tent, since a tent registers as an extraction zone.

| Char | Spawns |
|:---:|---|
| `P` | A soldier of the player squad |
| `E` | A rifleman — 88px range, 132px aggro. The only enemy that leaves its post |
| `S` | A **sniper** — 190px range, 210px aggro, deadly accurate, holds its post |
| `B` | A **bazookateer** — 128px range, slow explosive rounds that will kill a clustered squad |
| `c` | A pickup crate (3 grenades; detonates if shot) |
| `o` | An explosive barrel — no pickup, just a large blast |
| `*` | A mine — invisible until something steps on it |
| `p` | A patrol node — enemies spawned nearby walk a beat instead of holding ground. Nodes within **12 tiles** of each other chain into an ordered **route** the enemy marches end to end and back — a fixed, learnable march. A lone node keeps the random beat |
| `H` | A hostage |
| `k` | A **supply box** — the objective of a `collect` mission. Not an ammo crate |
| `C` | The enemy **officer** — the target of an `assassinate` mission. One per map |
| `X` | An extraction zone |

Those ranges are in world pixels; at the shipped 16px tile, a rifleman notices
you from about **8 tiles** away, a bazookateer from **9**, and a sniper from
**13**. Keep those three numbers in your head — every stealth or approach
decision on a map is really a statement about them.

One of them is enforced: **no enemy (`E`, `S`, `B`, `C`) may start within 12
tiles of any squad spawn (`P`)** — just past a veteran rifleman's notice
radius, so the squad always gets a beat to move before anything opens fire.
`npm run check` fails a map that breaks it, and the generator's placer sheds
a garrison outward from a hub that sits too near the spawn. Close openings
are fine; an opening the player cannot survive by reacting is not.

Any other character is a parse error naming the offending coordinates, so typos
fail loudly rather than rendering as a hole in the world.

## Rules and conveniences

- **Rows may be ragged.** The map is as wide as its longest row; short rows are
  padded with grass. You do not have to count columns.
- **Off-map is solid.** Reads outside the grid return Tree, so the world is
  implicitly walled in — though a border of `T` or `#` still looks better.
- **Buildings are grouped automatically.** Any contiguous run of `h`, `F` or `O`
  becomes one building with its own HP and reinforcement timer. 2x2 is the size
  the hut sprite is drawn for. A building's *role* comes from its character:
  `h`/`F` are the enemy's and produce troopers, `O` is yours and produces
  nobody.
- **Tents are delivery points.** Each contiguous block of `A` registers as an
  extraction zone, so a rescue or extraction map only has to draw the tent —
  `X` is for zones without one.
- **Patrol assignment is by proximity.** An enemy within about 1.6x
  `CONFIG.enemy.patrolRadius` of a `p` adopts it as home and patrols.
- **Levelled buildings become walkable rubble.** The shape of the map changes
  permanently mid-mission. `map.pristine` is what restores it on restart.
- **Make it completable.** `npm run check` flood-fills from the squad spawn and
  fails if the objective cannot be reached.

## Objectives

| Objective | Won when | Needs |
|---|---|---|
| `eliminate` | Every enemy is dead | At least one enemy |
| `demolish` | Every building is levelled | At least one `h`/`F` |
| `rescue` | Every hostage reaches a tent | `H` markers and a tent |
| `reach` | Every surviving soldier is in an extraction zone | `X` or a tent |
| `survive` | The clock runs out | `duration` |
| `covert` | The squad reaches extraction **having killed nobody** | `X` or a tent, and somebody to avoid |
| `hold` | The zone has been occupied for `duration` seconds | `X` or a tent, and a `duration` |
| `collect` | Every supply box has been walked over | At least one `k` |
| `assassinate` | The enemy officer is dead | Exactly one `C` |

Losing is universal: no soldiers left, no mission. Three objectives add a
failure of their own:

- `rescue` fails the instant a hostage dies — including to your own fire.
- `covert` fails the instant the kill count passes zero. It is counted, not
  hooked, so a man killed by a mine, by a barrel, or by his own side's grenade
  compromises the approach exactly as a deliberate shot does. Firing is allowed;
  a body is not.
- **Any** map containing an `O` outpost is lost if the outpost falls, whatever
  its objective says.

`covert` is **an alias**, not an objective of its own: the parser unfolds it
into `objective: reach` plus `nokill: true` and nothing downstream ever sees the
word. Writing it out longhand is identical, and lets you put the same rule on a
different objective. See [Modifiers](#modifiers).

## Modifiers

A modifier is a rule layered on top of an objective rather than fused into it.
There is one so far.

| Modifier | Effect |
|---|---|
| `nokill: true` | The mission is lost the moment the kill count leaves zero |
| `timelimit: 180` | The mission is lost when the clock runs out |
| `gated: true` | The completability check may route through a building the squad can level |

`nokill` is counted, not hooked, so a man killed by a mine, by a barrel, or by
your own grenade compromises the approach exactly as a deliberate shot does.
Firing is allowed; a body is not.

It rides on any objective, which is the whole reason it exists as a modifier.
`objective: rescue` with `nokill: true` is "recover the prisoners without
killing anybody" — a mission the old fused `covert` objective had no way to
express, because the only spelling available would have been a `covert-rescue`
objective, and then a `covert-collect` one, and so on for every pairing.

**A no-kill map has a spatial rule attached**, enforced by `npm run check`:
every objective entity — the extraction zone, each hostage, the tent — must sit
outside every sentry's aggro radius, and must be reachable by a route that never
enters one. A no-kill rescue with a rifleman standing beside the hostage is not
a hard mission, it is an unwinnable one, and it fails the build.

## Doctrine

`doctrine:` is the garrison's standing orders, multiplied into the difficulty
levers ([`difficulty.ts`](../game/src/sim/difficulty.ts)) on top of whatever
difficulty the player picked. The same mission at the same difficulty plays
differently under each.

| Doctrine | They... |
|---|---|
| `garrison` | Dig in. Hold what they have and make you come to them |
| `patrol` | Rove. Contact spreads quickly once the first shot goes off |
| `hunters` | Abandon their posts to find you. Standing still is not an option |
| `ambush` | Stay quiet until you are close, then fast and accurate |
| `swarm` | Come in numbers, close and careless, and trade lives to reach you |

Doctrine is the cheapest way to make two maps of the same shape feel unrelated.
Reach for it before you reach for more enemies.

## Waves

`waves: 5@22` — five waves, twenty-two seconds apart. A bare `waves: 3` takes
the default interval.

The men come out of the **standing** garrison buildings, so this is a schedule,
not a headcount: what a wave is worth depends on how many huts the player has
left standing. That is the whole design of it — levelling a hut is how the
player makes the next wave smaller, which turns a defensive mission into a
question of when to push out.

A map with no `waves:` header has a garrison that merely reacts to being walked
into.

## Designing a mission

Everything above is what the parser accepts. This is what makes a mission worth
playing, and it is the part that neither the tests nor the type checker can tell
you that you got wrong.

### Read the shipped maps first

Each one exists to teach exactly one idea. Before writing a new mission, find
the two nearest to your idea in `data/` and read them — the density, the amount
of open ground, and the ratio of cover to killing field are all things this
format cannot express in a rule but which those files demonstrate.

| Mission | Size | Objective | The one idea |
|---|---|---|---|
| Chicken Run | 88x56 | eliminate | The basics: move as a herd, use the treeline |
| River Run | 64x88 | eliminate | Deep water; bridges are chokepoints somebody is watching |
| The Long Road | 220x44 | reach | Extraction, and a march long enough to lose men on |
| Undergrowth | 96x68 | eliminate | Sight and shots are different things. Snipers own the open ground |
| Minefield | 92x64 | demolish | Mines, and barrels to blow a lane through them with |
| Village | 96x76 | demolish | Buildings that keep producing troopers until you level them |
| Ice Station | 100x64 | rescue | Escorting people who die easily, on footing you cannot trust |
| Last Stand | 76x76 | survive | Holding a position, with waves out of huts you can level |
| Lone Wolf | 84x52 | reach | One man. No herd to hide in |
| Softly Softly | 104x56 | covert | Getting out the far side without a body |
| Four Bridges | 108x70 | demolish | A canal somebody dug, and which crossing you pick |
| The Walled Town | 104x72 | assassinate | Streets with sightlines, and one man to find in them |
| Not a Sound | 108x58 | rescue + nokill | A rescue where firing is allowed and a body is not |
| Through the Wall | 96x64 | collect + gated | The only way through is a building you level first |
| Test Range | 66x30 | eliminate | Dev only. One of everything, for looking at |
| Shooting Range | 54x34 | eliminate | Dev only. Nothing but targets and no cover to blame |

Those are the hand-written ones, and they are the ones worth reading. The
missions numbered from twenty up are grown from
[the layout grammar](#the-layout-grammar) and are better understood by reading
the layout than the file.

### Scale

Campaign maps run **64 to 220 tiles wide and 44 to 88 tall**. The camera shows
roughly 20x12 tiles at the framing the missions are built for, and up to about
36x22 on a large desktop — so even the smallest shipped mission is several
screens of ground, and a 40x20 map is not a small mission, it is one screen with
nowhere to go.

Pick the size from the shape of the idea, not from how much you want to type: a
march wants 200 wide and thin, a siege wants square, a river crossing wants tall
so the river runs across your path.

### Density

Two rules, both of which exist because breaking them is invisible in the source
and obvious on screen.

**No marooned single tiles.** One tile of grass inside a field of sand is a
hard-edged 16px square that the eye finds instantly, and no amount of edge
warping disguises it. The generator runs a majority filter (`smooth()`) after
every builder for exactly this reason. **A hand-written map does not get that
pass** — you have to not create them. Give every patch of anything at least a
three-tile-wide core.

**Do not draw a rectangular border.** A frame of uniform thickness is precisely
what a player notices: every mission ending in a ruler-straight inner line. The
world is walled in implicitly (off-map reads return Tree), so the border is
there to look like landscape, not to hold the player in. Vary its depth as you
go down the edge, push a headland inland here, thin it to a few trunks there,
and bite a clearing back into it somewhere else.

### Reachability

An organically shaped treeline will eventually seal off a pocket, and an
`eliminate` mission with one enemy inside that pocket is unwinnable. `npm run
check` flood-fills from the squad spawn and fails the build if the objective
cannot be reached, so this is caught rather than shipped — but it is caught
*after* you have drawn the map, so it is cheaper to keep routes obviously open
as you go.

Remember that deep water is a wall to the flood fill even though a soldier can
swim it. Do not rely on swimming as the only way to reach something.

### Think in puzzles

Most of this game's interesting decisions come from mechanics that are already
in the simulation and which almost no shipped mission is built around. None of
them is discoverable from the legend, so they are listed here:

- **Rubble opens routes.** A levelled building becomes walkable ground. A map
  whose only way through is a hut you must bring down first is a puzzle that
  costs no new mechanics — but see the warning below.
- **A fence blocks bullets, not sight.** You can watch a man you cannot shoot,
  and he can watch you. Nothing has ever been built on this.
- **Tall grass is the exact inverse.** Bullets pass through; sight does not. Two
  kinds of cover that fail in opposite directions, on one map, is a mission.
- **Deep water is a route you pay for.** Slow, and you cannot fire while in it.
  Crossing under observation is a real decision.
- **Quicksand is a trap you can see coming**, which makes it a shape to herd
  somebody around rather than a hazard to sprinkle.
- **Ice ruins steering**, so it turns a corridor into something you overshoot.
- **A gunshot draws a garrison to where the round landed**, not to the shooter.
  Shoot a tree on the far side and walk past. No mission uses this yet.
- **Barrels chain.** A line of them is a fuse.

> **A demolition-gated route must declare itself.** The completability fill
> treats every building as solid, and has to — otherwise an objective
> *accidentally* sealed behind a hut would start passing the gate. A map built
> around the puzzle says `gated: true`, and is then judged by a second fill that
> treats huts and factories as doors. The outpost is never a door: it is the
> squad's own, and the mission is lost if it falls. A map that needs the second
> fill without declaring it still fails, so the puzzle can never arrive by
> accident.

### What cannot go together

Some combinations are not hard, they are impossible or incoherent. The general
rule behind all of them: **a constraint and an obligation must not contradict.**
"Kill nobody" and "kill everybody" is the obvious case, but "kill nobody" and
"walk past a sniper" is the same mistake wearing different clothes.

**Rejected at load.** These throw when the map is parsed, naming both halves,
rather than falling back to something you did not ask for. The list is
`CONTRADICTIONS` in [`map.ts`](../game/src/sim/map.ts) and this table is meant
to be the same list.

| Combination | Why not |
|---|---|
| `nokill` with `eliminate` | The objective cannot be met without the kill that fails it |
| `nokill` with `assassinate` | The objective *is* a kill |
| `nokill` with `waves` | Reinforcements walk into the route the approach depends on being empty |
| `timelimit` with `survive` | The mission already has a clock, and the two run opposite ways |

**Rejected by `npm run check`.** Coherent to declare, but provably unplayable on
the map as drawn.

| Combination | Why not |
|---|---|
| `nokill` with a sentry over the objective | Every hostage, tent and extraction zone has to sit outside every aggro radius, with a route to it that stays outside too. See [Modifiers](#modifiers) |
| Any objective walled off from the spawn | The completability flood fill will not reach it |

**On you, and on whoever reviews the map.** Nothing checks these, and all of
them have shipped as bad missions in some game or other.

| Combination | Why not |
|---|---|
| `nokill` with snipers | A sniper notices you from 13 tiles, and the validator's clearance is eight. Softly Softly deliberately has none: the lane it is built around is 11 tiles wide, which defeats a rifleman and a bazookateer and would be a shooting gallery to a sniper |
| `nokill` with `demolish` | Legal, and fine if the huts are empty — a hut with a sentry beside it is one you cannot bring down quietly, and nothing will tell you so |
| `survive` with a short `duration` and no cover | Not a mission, a countdown |
| `demolish` with no explosives anywhere | Rifle rounds do 1 damage to 60+ HP. Without crates or barrels within reach it is not a mission, it is a chore |
| `eliminate` on a very large map | The last two enemies become a search, not a fight. Prefer `reach` or `demolish` past about 100x70 |

### Before you call it done

1. `npm run check` — compiles, and every map in `data/` parses, spawns nothing
   inside solid terrain, and has a completable objective. It reads **every**
   `.map` file, not just generated ones, so a hand-written mission is held to
   exactly the same standard.
2. Load it in the browser and look at it. The tests cannot see a map that is
   ugly, and they cannot see one that is boring.
3. Play it to the end. Completable and winnable are different claims — the first
   is about topology and the second is about whether six men with one hit point
   each can actually do it.

## Generating levels

[`game/tools/generate-levels.mjs`](../game/tools/generate-levels.mjs) writes
every mission from a campaign table at the bottom of the file:

```bash
npm run levels                              # write data/*.map
node tools/generate-levels.mjs --check      # validate without writing
node tools/generate-levels.mjs river-run    # regenerate one mission
```

Each entry names a size, a theme, an objective, a doctrine, a seed, and the one
new idea the mission is built around; a matching builder function lays out the
terrain and places what that objective needs. Everything is seeded, so the same
table always produces the same maps — **change a seed to reroll one level**
without disturbing the others.

A row can also pin garrisoned spots the layout would not have chosen —
`camps: [{ at: [0.16, 0.82], guards: 5, barrels: 2, huts: 0 }]`, placed by
map fraction with a two-node patrol beat of its own — for when a layout
leaves a corner bare and rerolling would lose a map somebody likes. Camps are
skipped on `waves:` maps, whose fields must open empty.

**A generated map is overwritten on the next `npm run levels`.** Hand edits to
any file with an entry in `CAMPAIGN` are lost. A hand-written mission must use
an id that appears nowhere in that table.

The generator has terrain primitives worth reusing when adding a mission:
`river()` (meandering, optionally deep, with bridges at given positions),
`road()`, `forest()`, `scatter()`, `dunes()`, `verge()`, `blob()`, `clearing()`
and `building()`, plus a `Placer` that hands out spaced open tiles for entities.

`river()` takes a `wobble`, and `wobble: 0` gives a dead-straight channel — which
is how you build a canal, a dam or anything else that is supposed to look made
rather than grown. Everything else in the toolbox is deliberately organic.

Two grid methods are worth knowing about:

- **`frame(tile, {min, max})`** walls the world in with landscape rather than
  with a rectangle. `border()` draws a frame of uniform thickness, and a frame
  of uniform thickness is exactly what you notice — every mission ends in a
  ruler-straight inner line. `frame()` walks the thickness per edge, then throws
  copses inland off the treeline and bites clearings back into it. `min` is
  honoured everywhere, so the world stays sealed however the walk wanders.
- **`smooth(passes)`** is a majority filter over soft ground. Blob painting
  leaves stragglers — a single tile of grass marooned in sand — which are
  invisible in the source and read on screen as a hard-edged square that no
  amount of edge warping disguises. It runs on every mission after the builder.

### The layout grammar

Twenty of the shipped missions are a *row in a table* rather than a function,
which is what the grammar exists for: the twelve original builders each laid out
terrain, dressed it and populated it all at once, and every one of them came out
the same shape because every terrain primitive places blobs at random positions.
Nothing in that toolbox could produce a silhouette.

So it is three passes instead of one:

- **A layout** decides the skeleton only -- where the impassable mass is, where
  the routes are, where the chokepoints are -- and returns the anchors a mission
  needs: a spawn, a far end, and the places worth fighting over. It knows
  nothing about objectives.
- **Dressing** adds the theme's foliage and hazards, and never changes what is
  passable.
- **Population** puts down what the objective requires, reading those anchors.
  It never invents a position, which is what keeps a mission's contents
  agreeing with its shape.

Ten layouts: `gauntlet`, `island`, `ringSiege`, `delta`, `canyon`, `coast`,
`crossroads`, `spiral`, `ridgeline`, `causeway`. A campaign row names one, plus
a theme, an objective, a doctrine and a seed.

The twelve original builders are deliberately untouched by any of this. They are
the shipped campaign and they are tuned; the grammar is for new maps.

**A failing seed is rerolled**, deterministically, up to thirty-two times, and
the build reports which seed a mission finally used. A mission that took thirty
seeds is telling you its layout and its objective do not fit each other.

### Man-made primitives

Everything organic has a hard-edged counterpart, for the things that are built
rather than grown: `wall()`, `compound()` (a walled yard with gates),
`streets()` (a road grid with buildings inset into the blocks), `trench()` (a
walkable floor with a raised lip either side) and `pier()`.

`smooth()` only ever rewrites soft ground into other soft ground, so none of
these can be rounded off by the finishing pass.

The `Placer` also takes `confineTo(x, y)`, which restricts later placement to
what the squad can actually walk to. An organically shaped treeline will
eventually seal off a pocket, and an `eliminate` mission with one enemy inside it
is unwinnable.

Every generated map is validated before it is written — squad size, spawns on
walkable ground, and a flood fill proving the objective is reachable. A mission
that fails is reported and **not** written.

## Adding a mission

Either write `data/level9.map` by hand — the [`/map`](../.claude/skills/map/SKILL.md)
skill does exactly this and follows the rules above — or add an entry to
`CAMPAIGN` plus a builder in `BUILDERS` and run `npm run levels`. Either way it
appears on the level select automatically: the server lists everything in
`data/` and sorts by the `order:` header.

## The shipped campaign

Thirty-two missions. The first fourteen are hand-written builders and set
pieces; everything from twenty up is [grown from a layout](#the-layout-grammar).

| # | Mission | Size | Theme | Objective | Doctrine | New idea |
|---|---|---|---|---|---|---|
| 01 | Chicken Run | 88x56 | jungle | eliminate | garrison | The basics |
| 02 | River Run | 64x88 **tall** | jungle | eliminate | garrison | Deep water; bridges are chokepoints |
| 03 | The Long Road | 220x44 **long** | desert | reach | ambush | Extraction, and a long march |
| 04 | Undergrowth | 96x68 | jungle | eliminate | patrol | Tall grass, and snipers on the open ground |
| 05 | Minefield | 92x64 | desert | demolish | garrison | Mines, and barrels to clear a lane |
| 06 | Village | 96x76 | jungle | demolish | hunters | Buildings that keep producing troopers |
| 07 | Ice Station | 100x64 | arctic | rescue | patrol | Hostages, and ice that ruins your footing |
| 08 | Last Stand | 76x76 | arctic | survive | swarm | Holding a position, with waves out of the huts |
| 09 | Lone Wolf | 84x52 | jungle | reach | patrol | One man, and no squad to hide behind |
| 10 | Softly Softly | 104x56 | jungle | covert | garrison | Getting out without killing anybody |
| 11 | Four Bridges | 108x70 | jungle | demolish | garrison | A cut somebody dug, and four crossings |
| 12 | The Walled Town | 104x72 | desert | assassinate | patrol | Streets, and one man in them |
| 13 | Not a Sound | 108x58 | jungle | rescue + `nokill` | garrison | A rescue nobody hears |
| 14 | Through the Wall | 96x64 | desert | collect + `gated` | garrison | The door is a building |
| 20 | Dry Run | 168x52 | desert | reach | ambush | A corridor with shoulders |
| 21 | No Way Off | 96x86 | jungle | eliminate | garrison | Nowhere to fall back to |
| 22 | Cold Keep | 88x88 | arctic | survive | swarm | A wall with four gates |
| 23 | Braided Water | 104x82 | jungle | collect | patrol | Channels and crossings |
| 24 | The Narrows | 152x58 | desert | reach + `timelimit` | ambush | A clock, and no room |
| 25 | Landing Ground | 124x72 | jungle | demolish | hunters | Piers and open shore |
| 26 | Hold the Junction | 104x88 | desert | hold | garrison | Ground, measured in seconds |
| 27 | The Coil | 90x90 | arctic | assassinate | patrol | Three rings, three gaps |
| 28 | The Spine | 112x78 | arctic | eliminate | hunters | A ridge with three passes |
| 29 | Stepping Stones | 144x60 | jungle | rescue | garrison | Islands, one at a time |
| 30 | The Long White | 150x54 | arctic | hold | swarm | Holding a corridor |
| 31 | White Cut | 138x56 | arctic | survive | swarm | Nowhere to spread out |
| 32 | Salt Flats | 108x80 | desert | eliminate | patrol | Water where there should be none |
| 33 | Cold Shore | 128x70 | arctic | reach | ambush | Open ground beside deep water |
| 34 | The Drum | 92x92 | jungle | demolish | hunters | A compound to get into |
| 35 | Market Day | 108x86 | jungle | collect | ambush | A town with sightlines |
| 98 | Shooting Range | 54x34 | jungle | eliminate | garrison | Dev only. Nothing but targets |
| 99 | Test Range | 66x30 | jungle | eliminate | garrison | Dev only. One of everything |
