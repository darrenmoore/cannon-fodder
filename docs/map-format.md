# Map format

Missions are plain ASCII text in [`data/`](../data), served raw by the dev server
at `/api/maps/<id>` and parsed by [`map.ts`](../game/src/map.ts). Most are
produced by [the generator](#generating-levels), but they are ordinary text
files — edit one in any editor and reload the page.

## File shape

```
name: Chicken Run
theme: jungle
objective: eliminate
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

| Key | Meaning | Default |
|---|---|---|
| `name` | Shown in the HUD and on the level select | `Unnamed` |
| `theme` | `jungle`, `desert` or `arctic` — recolours terrain and picks the tree species | `jungle` |
| `objective` | `eliminate`, `demolish`, `rescue`, `reach`, `survive` | `eliminate` |
| `duration` | Seconds to hold out, for `survive` | `90` |
| `order` | Position on the level select | `999` |
| `mechanic` | Short label for the new idea this mission introduces | — |
| `brief` | One line shown on the menu and in the opening banner | — |
| `tile` | Tile edge in world pixels | `16` |

Unknown themes and objectives fall back to `jungle` / `eliminate` rather than
failing, so a typo costs you a mission's flavour, not the build.

## Legend

The legend lives in [`tiles.ts`](../game/src/tiles.ts), not in the map file, so
the art stays pure.

One character is all a tile ever carries. Everything the renderer needs beyond
that — which contiguous mass a tile belongs to, how deep inside it, how far it is
from the nearest water or treeline — is **derived** at load time by
[`terrain.ts`](../game/src/terrain.ts) and never authored. That is deliberate:
it is what lets a mission stay a text file you can edit in any editor while
still being drawn as organic terrain rather than as a grid of squares. See
["Terrain as shape"](design.md#terrain-as-shape).

### Terrain

Movement, sight and shots are three separate flags. That is what lets tall grass
hide you without stopping bullets, and deep water stop you without blocking your
line of fire.

| Char | Tile | Blocks move | Blocks sight | Blocks shots | Notes |
|:---:|---|:---:|:---:|:---:|---|
| `.` | Grass | | | | Open ground |
| `,` | Sand | | | | Banks and paths |
| `_` | Road | | | | **18% faster** to march along |
| `T` | Tree | yes | yes | yes | Cover. Sways in the wind |
| `#` | Rock | yes | yes | yes | Cover |
| `h` | Hut | yes | yes | yes | **Destructible**, and spawns troopers. 2x2 blocks |
| `F` | Factory | yes | yes | yes | As above, much tougher. 3x3+ |
| `+` | Fence | yes | | yes | Waist-high: stops movement and bullets, not sight |
| `~` | Water | | | | **Wade**: 45% speed, and you cannot fire |
| `W` | Deep water | yes | | | Impassable — but you can shoot across it |
| `=` | Bridge | | | | The fast crossing |
| `"` | Tall grass | | **yes** | | Walk-through cover. Hides you; bullets pass straight through |
| `%` | Quicksand | | | | 24% speed and you cannot fire. Effectively a trap |
| `i` | Ice | | | | Slippery: acceleration drops to 16%, so you slide through turns |
| `:` | Rubble | | | | What a levelled building leaves behind. 80% speed |
| `A` | Tent | | | | Delivery point for hostages, and an extraction zone |

### Entity markers

These spawn something and leave grass behind.

| Char | Spawns |
|:---:|---|
| `P` | A soldier of the player squad |
| `E` | A rifleman |
| `S` | A **sniper** — 190px range, deadly accurate, holds its post |
| `B` | A **bazookateer** — slow explosive rounds that will kill a clustered squad |
| `c` | A pickup crate (3 grenades; detonates if shot) |
| `o` | An explosive barrel — no pickup, just a large blast |
| `*` | A mine — invisible until something steps on it |
| `p` | A patrol node — enemies spawned nearby walk a beat instead of holding ground |
| `H` | A hostage |
| `X` | An extraction zone |

Any other character is a parse error naming the offending coordinates, so typos
fail loudly rather than rendering as a hole in the world.

## Rules and conveniences

- **Rows may be ragged.** The map is as wide as its longest row; short rows are
  padded with grass. You do not have to count columns.
- **Off-map is solid.** Reads outside the grid return Tree, so the world is
  implicitly walled in — though a border of `T` or `#` still looks better.
- **Buildings are grouped automatically.** Any contiguous run of `h` (or `F`)
  becomes one building with its own HP and reinforcement timer. 2x2 is the size
  the hut sprite is drawn for.
- **Tents are delivery points.** Each contiguous block of `A` registers as an
  extraction zone, so a rescue or extraction map only has to draw the tent —
  `X` is for zones without one.
- **Patrol assignment is by proximity.** An enemy within about 1.6x
  `CONFIG.enemy.patrolRadius` of a `p` adopts it as home and patrols.
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

Losing is universal: no soldiers left, no mission. `rescue` additionally fails
the instant a hostage dies — including to your own fire.

## Generating levels

[`game/tools/generate-levels.mjs`](../game/tools/generate-levels.mjs) writes
every mission from a campaign table at the bottom of the file:

```bash
npm run levels                              # write data/*.map
node tools/generate-levels.mjs --check      # validate without writing
node tools/generate-levels.mjs river-run    # regenerate one mission
```

Each entry names a size, a theme, an objective, a seed, and the one new idea the
mission is built around; a matching builder function lays out the terrain and
places what that objective needs. Everything is seeded, so the same table always
produces the same maps — **change a seed to reroll one level** without disturbing
the others.

The generator has terrain primitives worth reusing when adding a mission:
`river()` (meandering, optionally deep, with bridges at given positions),
`road()`, `forest()`, `scatter()`, `dunes()`, `verge()`, `blob()`, `clearing()`
and `building()`, plus a `Placer` that hands out spaced open tiles for entities.

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

The `Placer` also takes `confineTo(x, y)`, which restricts later placement to
what the squad can actually walk to. An organically shaped treeline will
eventually seal off a pocket, and an `eliminate` mission with one enemy inside it
is unwinnable.

Every generated map is validated before it is written — squad size, spawns on
walkable ground, and a flood fill proving the objective is reachable. A mission
that fails is reported and **not** written.

## Adding a mission

Either write `data/level9.map` by hand, or add an entry to `CAMPAIGN` plus a
builder in `BUILDERS` and run `npm run levels`. Either way it appears on the
level select automatically — the server lists everything in `data/` and sorts by
the `order:` header.

## The shipped campaign

| # | Mission | Size | Theme | Objective | New idea |
|---|---|---|---|---|---|
| 1 | Chicken Run | 88x56 | jungle | eliminate | The basics |
| 2 | River Run | 64x88 **tall** | jungle | eliminate | Deep water; bridges are chokepoints |
| 3 | The Long Road | 220x44 **long** | desert | reach | Extraction, and a long march |
| 4 | Undergrowth | 96x68 | jungle | eliminate | Tall grass, and snipers watching the open ground |
| 5 | Minefield | 92x64 | desert | demolish | Mines, and barrels to clear a lane with |
| 6 | Village | 96x76 | jungle | demolish | Buildings that keep producing troopers |
| 7 | Ice Station | 100x64 | arctic | rescue | Hostages, and ice that ruins your footing |
| 8 | Last Stand | 76x76 | arctic | survive | Holding a position under pressure |
