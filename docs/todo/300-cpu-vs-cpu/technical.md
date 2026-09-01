# 300 -- CPU vs CPU: the work

> **Built.** Every item below is implemented and `npm run check` is green.
> [progress.md](progress.md) is the ledger and carries the five bugs that turned
> up in the building -- four of which were invisible for the first thirty
> seconds of a battle, which is the argument for the headless soak in one
> paragraph. Two things in this document were **wrong** and are corrected in
> place: `spawnAggroRange` is 260px, not 190; and item 011's feedback loop is
> pointed the opposite way to what is argued here. See the note under it.

Instructions for the agent doing this. Read [plan.md](plan.md) first for *why*;
this file is *what*, in order, with the proof each step owes.

The owner's four decisions are in [questions.md](questions.md) and are settled.
They are not to be reopened:

| | |
|---|---|
| **Map size** | ~48 x 34 tiles. See the note under item 003 -- the answer given was (a). |
| **Hut ownership** | A real tile marker, **not** a midline rule -- and a general sprite tint interface underneath it, because the owner wants tinted variants available to everything, not just huts. |
| **The door** | A `__DEV__`-gated button. It becomes the intro backdrop later. |
| **Destructible huts** | No. The arena runs forever and has no winner. |

---

## The work, in order

Fifteen items (000 to 014). The three headings below group them by *why* they exist, but the
numbers are the execution order and the table is the ledger --
[progress.md](progress.md) tracks which are done.

| # | Item | Why it exists |
|---|---|---|
| -- | [The regression net](#before-anything-else-the-regression-net) | Nothing below is safe to start without it |
| 000 | [Extract the step order](#000----extract-the-step-order) | The mission and the arena must not drift apart |
| 001 | [Faction-blind AI](#001----make-the-ai-faction-blind) | One AI, two sides |
| 002 | [Sprite tint interface](#002----a-sprite-tint-interface) | Owner's ask: tinted variants for any element |
| 003 | [Building ownership](#003----buildings-that-belong-to-somebody) | Huts that produce for either side |
| 004 | [The map](#004----the-map) | The reserved forest arena |
| 005 | [Arena doctrine](#005----arena-doctrine) | Existing levers, pushed up |
| 006 | [Commanders + influence map](#006----the-commanders) | Muster, commit, and find the front |
| 007 | [Screen, routing, input modes](#007----the-screen) | A door, and a promise that you cannot touch it |
| 008 | [Reap the dead](#008----reap-the-dead-required) | **Endless mode.** Corpses are never removed |
| 009 | [Cap the decal layer](#009----cap-the-decal-layer-required) | **Endless mode.** The ground turns solid blood |
| 010 | [Header, wounding, counts, audio](#010----small-gaps) | Four small gaps found on review |
| 011 | [Territory drives reinforcement](#011----territory-drives-reinforcement-the-important-one) | **Without this it is a stalemate, and dull** |
| 012 | [A doctrine per side](#012----the-two-sides-should-not-fight-the-same-way) | So the sides fight differently |
| 013 | [Grenadiers, barrels, snipers](#013----give-it-something-to-explode) | Something to look at |
| 014 | [Proof](#014----proof-runs-last) | check, shoot, one Playwright soak, `/grill` |

**006 and 007 give a working arena. 008 to 010 make it survive being left
running. 011 to 013 make it worth leaving running** -- and nothing should be
judged, or `/grill`ed, before those have landed.

---

## Before anything else: the regression net

The brief's real worry is right. Item 002 changes `stepBuildings`, which every
mission with a hut depends on, and item 001 changes the enemy AI's target
search, which every mission full stop depends on. Playwright is too slow to run
on every change.

**It does not need to be Playwright.** The simulation has no DOM dependency.
This was measured, not assumed:

```
52 maps x 10 sim-seconds, every unit stepped   ->  1.4 seconds, 0 errors
1 map  x 60 sim-seconds                        ->  233 ms
```

...in plain node, from an esbuild in-memory bundle, needing exactly two global
stubs. `test/campaign.test.mjs` already establishes the pattern; this extends it
from the campaign to the whole simulation.

### `test/support/sim.mjs` -- build this first

A helper that bundles the simulation once and hands back its exports.

```js
import * as esbuild from 'esbuild';

// Two stubs, and no more than two.
//   localStorage: campaign.ts and settings.ts read it on import.
//   window:       audio.ts reaches window.AudioContext the first time a gun
//                 fires. An empty object makes ensure() return false, and the
//                 whole sound layer becomes a no-op. Without it, three maps
//                 throw `window is not defined` the moment somebody shoots.
globalThis.localStorage = /* Map-backed stub, copy from campaign.test.mjs */;
globalThis.window = {};

// ONE entry point re-exporting everything, via esbuild's `stdin`. Do not pass
// several entryPoints -- that produces several bundles with duplicated module
// instances, and `createWorld`'s CONFIG stops being the CONFIG the systems read.
const built = await esbuild.build({
  stdin: {
    contents: `
      export { createWorld, makeEnemy, squadCentre } from './src/sim/world.js';
      export { parseMap } from './src/sim/map.js';
      export { stepWorld } from './src/sim/step.js';
      ...
    `,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', target: 'es2022',
  define: { __DEV__: 'false' },
});

export const sim = await import(`data:text/javascript;base64,${...}`);

/** Runs a world forward N seconds at the fixed step. */
export function run(world, seconds) { /* stepWorld in a loop at 1/60 */ }
```

After item 000 lands, `run` is `stepWorld` in a loop -- one call, not the
fourteen the systems currently need spelling out.

### `test/sim.test.mjs` -- the regression suite

Added to `npm run check`, which must stay under about ten seconds in total.

**A. The campaign soak (the actual safety net).** Every map in `data/`, at
Veteran, ten sim-seconds each. Assert per map:

- no throw, and no `NaN` in any actor's `pos`, `vel` or `angle`;
- every actor is inside the map bounds and not inside a solid tile;
- the mission has not resolved in ten seconds (nothing wins or loses instantly);
- `world.actors.length === world.soldiers.length + world.enemies.length` -- the
  invariant item 001 and 002 are most likely to break, because both add units.

**B. Golden numbers, for the two files this batch touches.** These are the tests
that catch a *behavioural* regression rather than a crash.

- **Target acquisition** (guards item 001). On one fixed map, place one enemy
  and two soldiers at fixed coordinates and assert which one it acquires, and
  that it acquires nobody through a tree.

  *Built.* Note the one adjustment: the notice **radius** is not stable to a
  tile -- an idle man drifts around his post, so sweeping for the distance at
  which he first sees you returns 9, 9, then 10. It is asserted instead as two
  probes either side of it (notices at seven tiles, does not at sixteen), which
  is stable at every difficulty and still catches a search that has stopped
  working or now reaches across the map. The two-soldier test runs at Rookie,
  because Veteran's `extraEnemies` lever doubles every placed rifleman and the
  test is about one man's choice.
- **Hut reinforcement** (guards item 003). On a one-hut map, with the squad
  parked inside `spawnAggroRange` and then outside it, assert the count of units
  produced over sixty seconds. This is the proximity gate the arena removes, and
  this test is what proves it was only removed for the arena.

  *Built, and two things this paragraph originally got wrong turned up in the
  building.* `spawnAggroRange` is **260px**, not the 190 first written here.
  And an exact count is only stable if the squad stands **inside the hut's
  260px range but outside a rifleman's 182px notice radius** -- tile 19 on the
  test map. Closer than that and the men who come out get shot, which frees
  their slot (`b.spawned` is decremented on death in `combat.ts`) and lets
  another out, so the number measures the firefight rather than the hut and
  comes back 1, 2, 3 or 4 depending on the dice. At tile 19 it is Rookie 2,
  Veteran 4 -- exactly `maxSpawned` -- on every run. Elite is left unpinned
  because it hunts hard enough to find a lone man even there.
- **Wave schedule.** `test/waves.test.mjs` already covers this; check it still
  passes rather than duplicating it.

**C. Determinism.** `Math.random` is used throughout the simulation, so a
seeded run is not available today and this batch should **not** introduce one --
that is a change to every system, for a benefit this work does not need. Instead
the tests above assert *invariants and bounds*, never exact positions. The one
place an exact number is asserted (B) is a count, which does not drift.

### What still needs Playwright

Only what a browser can answer: that it renders, that the page does not throw,
and that the input layer works. Item 007 has one arena-specific Playwright run,
and it should be run at the end of the batch, not per commit.

---

## The work items

Each is one commit, in this order, with `progress.md` updated as you go.

---

### 000 -- Extract the step order

**Why first:** every later item touches a system inside this block, and the
arena needs the same block minus the squad. Two copies of it would drift.

**Change.** New `src/sim/step.ts`:

```ts
/**
 * The one ordered pass over a world, shared by the mission and the arena.
 * ... carry `Game.step`'s existing docblock about ordering here verbatim; it
 * explains why resolveOverlaps runs after everything has moved, and that
 * reason does not belong to Game.
 */
export function stepWorld(w: World, dt: number, squad: SquadInput | null): void
```

`SquadInput` is `{ manualAim: Vec2 | null; cursor: Vec2 | null }` or null.
When null, `stepSoldiers` is not called at all -- the arena has no soldiers.
Everything else runs exactly as it does now, in exactly the order it does now.

`Game.step` keeps: `input.syncWorld`, `syncAim`, `handleCommands`, `moveCamera`,
the `phase !== Playing` early-out block, and `resolvePhase` with its win
handling. Between them it calls `stepWorld`.

**Files:** `sim/step.ts` (new), `sim/game.ts`.

**Boundary: behaviour-neutral.** No mission may play differently.

**Proof:** build `test/support/sim.mjs` and the **A** soak *before* this change,
record its output, and diff it after. `npm run check`. One `/playtest` of
Chicken Run.

---

### 001 -- Make the AI faction-blind

**Change.**

1. `types.ts`: `Enemy.faction: Faction` (was `Faction.Enemy`). Add
   `squad: number` to `Enemy` -- `-1` means "not in an arena squad", which is
   every enemy in every mission.
2. `types.ts`: `EnemyState.Advance = 5`.
3. `world.ts`: `makeEnemy(counter, pos, kind, home, levers, spawnedBy = -1,
   faction = Faction.Enemy)`. The default keeps all six existing call sites
   correct without edits.
4. `enemies.ts`: rename `nearestVisibleSoldier` to `nearestVisibleFoe` and scan
   `world.actors` for `a.alive && a.faction !== e.faction`. **This is identical
   in mission mode** -- the only non-`Enemy` actors in a mission are the
   soldiers, which is the list it scanned before. Say so in the comment.
5. `enemies.ts:550`: the grenade cluster search gets the same treatment.
6. `enemies.ts`: `raiseAlarm` and `raiseNotice` are left alone. They iterate
   every unit in `world.enemies` regardless of faction, which is correct -- a
   gunshot is heard by whoever is near it -- and in a mission every unit in that
   list is `Faction.Enemy`, so nothing moves.
7. `combat.ts:240` (`wound`) and `:272`: both branch on
   `actor.faction === Faction.Enemy`. **Leave them.** Wounding, the kill count
   and the corpse palette are all mission concepts. In the arena a green unit
   dies outright rather than being wounded, which is a difference nobody will
   see and not worth a refactor.

**Do not rename `world.enemies`.** It becomes "the AI-driven units". Renaming
reaches the renderer, the HUD, `objectives.ts` and the debug panel for no
behavioural gain.

**Before you start:** `grep -rn "world.enemies\|w.enemies\|\.enemies" src/` and
satisfy yourself about every reader. The known ones are the renderer's draw list
and fog cull (`render.ts:469`, already faction-tested), `classifyClick`
(mission input only), `objectives.ts` (never called by the arena) and the debug
panel.

**Files:** `types.ts`, `sim/world.ts`, `sim/enemies.ts`.

**Proof:** the **B** target-acquisition golden test must produce the same
numbers before and after. Soak **A**. `npm run check`.

---

### 002 -- A sprite tint interface

The owner asked for this explicitly: *"make tints flexible across sprites, can
be useful for making variants of elements, so make a standard interface for
this"*. It is worth doing properly because the game bakes every sprite in code
and has **no anti-aliasing and no alpha** -- which means every pixel in an atlas
sprite is exactly one of a small set of literal colours, and an exact-match
colour substitution is therefore **lossless and total**. That is a trick only
this codebase's rules make safe, and it is much lower risk than
re-parameterising two hundred lines of hand-tuned hex literals.

**Change.** New `src/render/sprites/tint.ts`:

```ts
/** An exact-match colour substitution over a baked sprite. */
export type Recolour = Record<string, string>;

/**
 * Re-bakes a sprite with some of its colours swapped.
 *
 * Safe only because of the no-alpha, no-anti-aliasing rule: every pixel is
 * exactly one palette colour, so an exact match catches all of them and misses
 * none. A blurred edge would leave halos of the old colour behind.
 */
export function recolour(src: Sprite, map: Recolour): Sprite;

/**
 * The named part of a sprite that a variant may repaint, and the ramp it is
 * painted with. `{ roof: 'red' }` rather than six hex codes at the call site.
 */
export type Ramp = readonly [dark: string, mid: string, light: string];
export const RAMPS: Record<string, Ramp>;      // 'thatch', 'red', 'slate', ...
export function variant(src: Sprite, parts: Record<string, RampName>): Sprite;
```

For `variant` to work, the bakers must **declare** which literals belong to
which part instead of inlining them. That is a mechanical extraction inside
`sprites/buildings.ts`: replace each hex literal with a reference to a named
ramp constant. It changes no pixel, and that is testable -- bake before, bake
after, compare the canvases pixel for pixel.

**Scope discipline:** do this for the **hut only** in this batch. The interface
is general; converting the factory, the outpost, the tent and the trees is
follow-up work and does not belong in 300.

**Files:** `render/sprites/tint.ts` (new), `render/sprites/buildings.ts`,
`render/sprites/index.ts` (a `hutAllied` entry, baked as
`variant(hut[i], { roof: 'red' })` for each of the four stages).

**Proof:** the sprite gallery walks the atlas object, so `hutAllied` appears at
[/sprites.html](http://localhost:5199/sprites.html) with no gallery change --
look at all four stages there. Plus a node test asserting the pre-extraction and
post-extraction hut bakes are pixel-identical. Then `/pixel-check` on
`tint.ts` before it is called anything but done.

---

### 003 -- Buildings that belong to somebody

**Change.**

1. `tiles.ts`: `Tile.HutAllied = 18`, character **`G`**, with the same flags as
   `Tile.Hut` (solid, blocks sight, blocks shots).
2. `render/terrain.ts:56`: add it beside `Tile.Hut` in the `Material.Ground`
   case.
3. `sim/map.ts:385`: include it in `findBuildings`' tile test. At `:411` it
   yields `kind: 'hut'` and `role: 'spawner'` like any other hut -- the *kind*
   is what it looks like, the *owner* is who it belongs to, and those are two
   different questions.
4. `types.ts`: `Building.owner: Faction`, and `BuildingSpec.owner` beside it.
   `h`/`F` are `Faction.Enemy`; `G` is `Faction.Player`; `O`/`U` are
   `Faction.Player` (they are the squad's, and always were -- this only writes
   down what `role: 'protect'` already implied).
5. `render/render.ts`: `buildingSet` picks `atlas.hutAllied` when
   `b.owner === Faction.Player && b.kind === 'hut'`.
6. `sim/buildings.ts`: `stepBuildings` spawns `makeEnemy(..., b.owner)` rather
   than always an enemy, and calls the owner's commander instead of setting
   `Investigate` directly. **Keep the proximity gate exactly as it is for
   missions** -- guard the arena's exemption on `world.map.arena`, not on the
   building's owner, so the reason it is skipped is legible.
7. `docs/map-format.md`: `G` in the legend table and in the buildings note.

**Files:** `sim/tiles.ts`, `sim/map.ts`, `types.ts`, `sim/buildings.ts`,
`render/terrain.ts`, `render/render.ts`, `docs/map-format.md`.

**Proof:** the **B** hut-reinforcement golden test is the whole point of this
item -- it must produce the same counts before and after, because no shipped map
contains a `G`. Soak **A**. `test/docs.test.mjs` checks the legend against
`tiles.ts`, so it will fail until the doc is updated; that is the test working.

---

### 004 -- The map

`data/arena-forest.map`. Written by hand -- use **`/map`**, which reads the
format and proves the result. Not generated: `tools/generate-levels.mjs` builds
from the campaign table and would delete it on the next `npm run levels`. Add it
to that tool's keep-list.

```
name: The Clearing
theme: jungle
objective: eliminate
doctrine: arena
arena: true
order: 999
dev: true
tile: 16
```

- **48 x 34 tiles = 768 x 544 world pixels.**

  *A note on the size, because the answer and the message disagreed.* The file
  answer was **(a)**, "a little bigger than a screen"; the covering message said
  "fits on screen". The real numbers settle it: a desktop viewport is about
  **430 x 270 world pixels** (`config.ts`, `idealWorldW/H`), so a map that
  genuinely fits on one screen is 26 x 16 tiles -- far too small for four huts
  and a battle between them. 48 x 34 is about 1.8 screens wide and 2 tall: the
  fight is usually inside one screen, the ground is not, and there is somewhere
  to scroll to, which the original brief also asked for. **If the owner meant
  the smaller thing, this is one file and one constant to change.**
- **Four huts.** Two `G` west, two `h` east, set back from the middle and
  vertically offset from each other so the lanes are not mirror images.
- **A treeline down the centre with three gaps** -- a wide one at the middle and
  two narrow ones near the top and bottom edges. These gaps are the composition;
  everything about how this looks comes from them.
- Copses in each half for flankers, a clearing at the centre, a solid tree
  border.
- **No `P` markers, no water, no mines, no crates, no hostages, no extraction.**

**Validators.** `test/map.test.mjs` flood-fills for completability and enforces
the twelve-tile clearance between `P` and enemy spawns. An arena map has neither
a squad nor an objective, so it must be **excluded** rather than made to comply:
one `if (map.arena) continue;` in the mission checks, plus an arena-specific
check of its own -- every hut of each side can reach every hut of the other.

**Grouping.** `dev: true` already routes a map to the menu's `TEST_THEATRE` and
drops it from a production build (`ui/menu.ts:122`, `:149`), so the brief's
"can we have a new group just for this" is already answered yes. It is used here
only to keep the map out of the campaign; the arena is not entered from the
mission list.

---

### 005 -- Arena doctrine

One row in `DOCTRINES` (`sim/difficulty.ts:158`) and one in `DoctrineId`:

```ts
arena: {
  id: 'arena', name: 'Open Battle',
  blurb: 'Two garrisons, no cover to hold, and orders to advance.',
  mod: {
    hunters: 3, hearing: 2.2, aggro: 1.35, rushers: 1.6, flank: 1.2,
    speed: 1.05, spawnInterval: 0.45, maxSpawned: 3, camo: 0, vision: 0,
    extraEnemies: 0,
  },
},
```

`resolveLevers` clamps the fractions to 1, so `hunters: 3` lands on a hard 1.0 --
everybody hunts. `camo: 0` and `vision: 0` are legibility, not difficulty: a
camo trooper is built to be hard to see and this mode exists to be watched. The
arena runs at **Veteran**, as a constant in `arena.ts`, not a menu.

`ui/front.ts` and `ui/menu.ts` read `DOCTRINES` for the mission card, so check
the new row does not appear anywhere a player looks -- the arena map is
`dev: true`, so it should not.

---

### 006 -- The commanders

New `src/sim/arena.ts`. The only genuinely new AI in the batch, and the item
worth spending the time on.

**`class Commander`**, one per faction. Holds its huts, its muster point, its
squads, and a reference to the shared influence map.

```
spawned at a hut   ->  MUSTERING   walk to the muster point and wait
threshold/timeout  ->  ADVANCING   steer along the squad's flow field
foe acquired       ->  the existing state machine owns it; the commander
                       lets go entirely and does not take it back
squad wiped/idle   ->  survivors return to the muster pool
```

**`EnemyState.Advance`**, handled in `stepEnemies` beside `Investigate`: sample
the squad's flow field with `flowTarget`, steer, and fall through to `acquire`
every step so contact interrupts the march. Gate the whole thing on
`e.squad >= 0`, so no mission enemy can ever enter it.

Use a **flow field per squad** (`buildFlowField`), not `findPath` per unit --
eighteen units A*-ing to the same cell every few seconds is the thing that will
make this stutter.

**The influence map** -- `class InfluenceMap` in the same file. One grid for the
arena, rebuilt on a timer at 4Hz. Cell = 4 tiles, so 12 x 9 here. Each living
unit stamps `max(0, 1 - d/R)` with `R` about six tiles, signed by side:

- `tension[c] = green[c] + blue[c]` -- where the fighting is;
- `influence[c] = green[c] - blue[c]` -- who holds the ground.

Target selection when a squad commits, in order:

1. any cell above the tension threshold -> march at the highest-tension cell,
   weighted toward the commander's own side. **Reinforce the front.**
2. otherwise -> march at the nearest standing enemy hut. **Open the fight.**

That rule is what makes the battle a moving front line instead of a scatter, and
it is the reason this will look good.

**`CONFIG.arena`** -- every number in `config.ts`, none in `arena.ts`:

| | |
|---|---|
| `squadSize` | 4 -- commit when this many have mustered |
| `musterTimeout` | 12s -- commit anyway, so a losing side still attacks |
| `maxAlive` | 18 per side -- a hut stops producing at the cap |
| `spawnInterval` | 3.5s per hut |
| `retargetInterval` | 4s -- how often a committed squad re-reads the front |
| `influenceCell` | 4 tiles |
| `influenceRadius` | 6 tiles |
| `tensionThreshold` | tune by eye |

The commander never steers a unit, never fires, and never overrides a unit that
has a target.

---

### 007 -- The screen

New `src/sim/arena-game.ts` and `src/ui/arena-screen.ts`.

`ArenaGame` is `Game`'s **sibling, not its subclass**. It owns a `World`, the
two commanders and the influence map. No orders, no aim, no grenades, no
objectives, no HUD sidebar, no briefing, and **it never calls `resolvePhase`** --
there is no winner. Its `step` is: move the camera, `stepWorld(w, dt, null)`,
tick the commanders. Its `newWorld` calls `createWorld` and then replaces
`world.fog` with `new Fog(map, 0)`.

Huts are indestructible: set `indestructible: true` on every building of an
arena map in `createWorld`, beside the existing wave-spawner rule, and say why
in the comment there.

#### Routing -- how you actually get to it

Two doors, both `__DEV__`-gated. `__DEV__` is `true` only under `npm run dev`
(`build.mjs:24` defines it from the watch flag), so `npm run build` folds it to
`false` and esbuild drops the arena, its screen and its button out of the
production bundle entirely. Absent, not hidden -- the same rule the debug panel
follows.

**1. A button, for finding it.** A third entry in `#intro-actions` on the front
screen, beside PLAY NOW and LEVEL SELECT:

```ts
if (__DEV__) introActions.appendChild(button('BATTLE', '', () => chooseArena()));
```

`showFront` currently resolves with `MenuChoice = { id, difficulty }`. Widen it
to `MenuChoice | { arena: true }` and branch on it in `main.ts`'s `for(;;)`:
if the front resolves to the arena, run `playArena()` instead of `play()`.
It resolves back to the front on ESC or a BACK button. Nothing else in the loop
changes.

**2. `http://localhost:5199/#arena`, for working on it.** This is the one that
matters day to day. Tuning the commanders means reloading dozens of times, and
clicking through the front screen every time is friction that will get the
tuning done badly. Checked once during boot, before the front screen is shown:

```ts
if (__DEV__ && location.hash === '#arena') { await playArena(); }
```

Two details worth getting right, because both are the kind of thing that wastes
an afternoon:

- **Leaving must clear the hash** (`history.replaceState`), or ESC drops you on
  the front screen and the next reload puts you straight back in the arena.
- It runs *after* the atlas bake and the level fetch, like a mission does, so
  the loading screen behaves normally.

**3. The harnesses** point at `#arena` too -- `tools/shoot.mjs` and
`tools/playtest.mjs` both take a URL, so no tool changes are needed beyond the
fragment.

There is no separate HTML page. `/sprites.html` is one because it is a gallery
with no game in it; this is the game, so it is a route through the same shell,
the same canvas and the same loop -- which is also what makes it reusable as the
intro backdrop later.

**On screen:** the battlefield, and a thin bar with each side's live count and
kills. Nothing else -- there is no objective to state.

**Camera:** free, panning and edge-scroll as in a mission. After a few seconds
with no input it eases toward the hottest influence cell. That is the line
attract mode will need.

#### Spectator mode: you may look, and nothing else

The owner's requirement, and it is a *stated* switch rather than something that
falls out of `ArenaGame` happening not to call things. "It happens not to be
wired up" is how the reticle ends up drawn over an attract screen six weeks from
now.

**The switch is one flag on `Input`** -- with two settings, because there are
two screens. `Input` is where every gesture in the game already passes through,
so it is the only place a gate cannot be forgotten by a later caller.

```ts
/**
 * How much of this screen the viewer may touch.
 *
 *   'play'      a mission. Everything.
 *   'spectator' the arena. The camera is yours -- pan, drag, edge-scroll,
 *               zoom -- and nothing reaches the simulation.
 *   'sealed'    a backdrop. Nothing at all: the world runs behind whatever is
 *               in front of it, and every gesture belongs to that instead.
 *
 * Three settings rather than two booleans because they are ordered, and a
 * `spectator && !sealed` pair would let a caller ask for a state that has no
 * meaning. The backdrop is the reason 'sealed' exists now rather than later:
 * an intro screen whose buttons fight the battlefield's edge-scroll for the
 * pointer is the bug, and it is much cheaper to design out than to find.
 */
mode: 'play' | 'spectator' | 'sealed' = 'play';
```

`spectator` drops orders, grenades, selection, restart and the aim at `emit`.
`sealed` additionally drops pan, drag, edge-scroll, zoom and the arrow keys --
`consumePan` and `edgeScroll` return zero, and `ArenaGame` stops asking the
camera to do anything but its own drift.

**Version one uses `spectator`.** `sealed` is one line in the same switch and
should be written now while the reasoning is in front of you, but the backdrop
that consumes it is not in this batch.

Route the ~10 `this.queue.push(...)` sites through one private `emit(cmd)`, and
have it drop everything except `recentre` and `exit` while `spectator` is set.
Also force `aim.idle()` and make `syncAim` and `firing` no-ops.

**What is closed, and how:**

| Leak | Closed by |
|---|---|
| Clicking orders the squad somewhere | `emit` drops `order`; `ArenaGame` never calls `handleCommands` either |
| Right-click / G throws a grenade | `emit` drops `grenade` |
| The aim reticle and crosshair are drawn | `ArenaGame` calls `renderer.draw(w, camera, alpha, dt)` with **no `aim` argument** -- it is optional (`render.ts:410`) and `drawAim` is only reached when it is passed |
| The mouse is a crosshair over the canvas | `#screen { cursor: crosshair }` (`style.css:285`). Set `document.body.dataset.mode = 'spectator'` and add one rule: `[data-mode="spectator"] #screen { cursor: default }` |
| The action bar (FIRE / GRENADE / RECENTRE) sits over the battlefield | `ArenaGame` does not mount `Controls` |
| The command queue grows forever with nobody draining it | `emit` never queues in the first place |
| **Heads turn to follow the mouse** | Closed by construction: only `stepSoldiers` reads the cursor (`troops.ts`, `updateFiring`), the arena has no soldiers, and `stepWorld(w, dt, null)` does not call it. Enemies have never read the cursor. **Assert it anyway** -- see below |

**What stays live:** pan, drag, edge-scroll, zoom, and ESC. ESC leaves the arena
rather than opening the pause sheet -- there is nothing to pause.

**Proof.** One headless invariant over the whole arena soak, and it is a good
one because these three fields are written by *nothing* but the order path:

```js
assert(world.orderGoal === null && world.field === null && world.orderMarker === 0);
```

Then in the Playwright run: click the map, drag across it, press G and R, and
assert that invariant still holds and that no unit changed state.

## Review pass: what the first draft missed

Found by re-reading the spec against the code with one question in mind: *this
mode never ends -- what breaks after twenty minutes that never breaks in a
mission?* Every mission is bounded, so several things that are correct in a
mission are wrong here. Two of these are load-bearing.

### 008 -- Reap the dead (**required**)

**Nothing removes a dead actor from `world.actors` or `world.enemies`.**
`stepDying` stamps a corpse decal and leaves the entry in place
(`combat.ts:220`). In a mission that is right and costs nothing -- fifty units,
and `world.soldiers` must keep its dead for the results panel. In an endless
arena at roughly five deaths every ten seconds, twenty minutes leaves ~600 dead
entries that every system still walks every step.

It is worse than a slow leak because of item 001: `nearestVisibleFoe` scans
`world.actors` where the old `nearestVisibleSoldier` scanned at most six
soldiers. Every living unit paying for every corpse, every step, is an O(n²)
creep that will look like "the arena gets choppy after a while" and be blamed on
the commanders.

**Fix:** once `deathTime` reaches `CONFIG.fx.deathTime` the corpse is already
burnt into the decal layer and the entry carries nothing. Compact
`world.actors` and `world.enemies` on a timer. **Arena only** -- guard on
`world.map.arena`, so no mission's results panel can lose a name.

**Proof:** assert in the Playwright soak that `world.actors.length` is bounded
after five minutes.

### 009 -- Cap the decal layer (**required**)

The decal canvas is map-sized and stamped forever, cleared only by
`clearDecals()` when a world is built (`render.ts:245`). A mission ends; this
does not. Twenty minutes of fighting over three chokepoints leaves the ground
solid blood, which fails the one requirement the owner stated twice.

**Fix:** keep the last N decal records in a ring buffer; on overflow,
`clearDecals()` and re-stamp the survivors. A hard cut with no fade, because
fading means alpha and alpha is not available here -- see the visual laws. The
oldest blood simply stops being there, far from where anyone is looking.
**Arena only**: a mission's battlefield accumulating permanently is a deliberate
property, stated in `fx.ts`.

### 010 -- Small gaps

- **The `arena:` header is never parsed.** Item 004 writes it into the map file
  and items 003, 008 and 009 all branch on `world.map.arena`, but nothing reads
  it. Add `arena: boolean` to `GameMap` and to `parseMap`'s header block.
- **Wounding is asymmetric, and it shows.** `wound()` returns early unless
  `faction === Faction.Enemy` (`combat.ts:249`). The first draft said leave it,
  *"a difference nobody will see"*. That was wrong: blue men would lie screaming
  and green men would not, and a wounded man still blocks, still draws fire and
  still shouts for help. In a symmetric fight that is a visible unfairness.
  **In arena mode nobody is wounded** -- both sides die outright. One guard, and
  it keeps the mission rule exactly as it is.
- **Per-side kill counts.** `world.kills` is a single number meaning "enemies
  the player killed". The spectator bar needs one per side; count them in the
  commanders rather than adding a second meaning to `kills`.
- **Audio policy.** `play()` calls `stopMusic()` and `startAmbience(map)`;
  `playArena` must decide. **Demo: ambience and effects on** -- it is a game
  screen and the guns are half of what makes it worth watching. **Backdrop
  (later): effects off, menu music continues** -- gunfire under a menu is not
  atmosphere, it is a fault report.

---

## Will it look fun and interesting?

The honest answer about the plan as first written: **it would look good for
about sixty seconds and then become wallpaper.** That is worth saying plainly
now rather than discovering it after item 006.

The reason is that the first draft made the two sides *identical* -- same AI,
same doctrine, same spawn rate, near-symmetric map -- and gave neither side any
way to actually gain. With indestructible huts and equal pressure, the front
line parks on the centre chokes and grinds in place forever. Every individual
firefight looks great; the battle has no shape.

Three additions fix it, and none is expensive.

### 011 -- Territory drives reinforcement (**the important one**)

The influence map from item 006 already computes which side holds which ground.
Feed it back into the spawn rate.

**Built, and pointed the other way round.** The argument here was that a side
which wins ground should reinforce faster, push further, over-extend, and be
rolled back -- a tide. It does not do that, because it is positive feedback and
positive feedback runs away. Measured over five minutes: the winning side
reached the loser's huts, killed every man at the door, held all the ground,
reinforced faster *for* holding it, and stayed there. Losses came out 182
against 186 -- almost exactly even -- while one side had nineteen men standing
and the other had none. The combat was fair; the battle was over in ninety
seconds.

**A side that holds *less* reinforces faster.** That is negative feedback and it
behaves the way the paragraph above wanted: pushed back onto its own huts, a
side replaces men faster, the front comes back toward the middle, overshoots,
and goes again. It is a rubber band, unashamedly -- the goal is a battle worth
watching for ten minutes, not a fair simulation of one. Mean losses across
twelve seeded battles are 137 to 136.

Clamp it hard at both ends either way. `CONFIG.arena.paceRange` is 0.72 to 1.35:
a strong rubber band is as unwatchable as none, because nothing that happens on
the field is allowed to matter.

**And the front has to be defined as *contested* ground, not as busy ground.**
The obvious reading of the influence map is `green + blue` -- how much is
happening in a cell. It is wrong, and it produced the mode's worst failure: a
side's own muster point holds eighteen men and is therefore the hottest cell on
the map, so every squad was sent to reinforce the ground it was already standing
on. Both sides did it. Thirty-six men, five minutes, not a shot fired, about one
battle in five. The front is `2 * min(green, blue)`: zero wherever only one side
is present, largest where the two are mixed together.

### 012 -- The two sides should not fight the same way

Give each commander its **own doctrine** rather than both running `arena`. Two
rows instead of one: say `arena-red` with `rushers` and `swarm` weighting, and
`arena-blue` with `flank` and `hunters` weighting. The same fight looks
different from each end, you can tell the sides apart by how they move rather
than only by colour, and it gives the tuning somewhere to go when one side
turns out to always win.

The map should be asymmetric for the same reason -- item 004 already offsets the
huts; push it further and give the two halves different cover.

### 013 -- Give it something to explode

Rifle fire between two green-and-blue lines is visually flat. Three cheap fixes,
all using things that already exist:

- **Raise `grenadiers`** in the arena doctrines. Veteran's base is 0.12; the
  first draft left it there by omission. Explosions are the most watchable thing
  in the game and this mode has no reason to ration them.
- **Barrels (`o`) at the chokes.** The first draft said "no crates, no barrels"
  for purity. Wrong instinct: a barrel is scenery anyone can shoot, and one
  going off in a gap full of men is the best single frame this mode will
  produce.
- **A sniper (`S`) on each side's flank.** One each, holding a post. It gives
  the eye somewhere else to go and puts tracer across the middle distance.

**None of 011 to 013 is required for the demo to run** -- 006 and 007 alone give
a working arena. They are what makes it worth looking at, so they should land
before anyone judges whether the mode is any good, and certainly before
`/grill`.

---

### 014 -- Proof (runs last)

- `npm run check`, including the new `test/sim.test.mjs`.
- `tools/shoot.mjs` on the arena map -- it renders.
- **One Playwright run**, at the end: drive `#arena`, advance five sim-minutes,
  and assert no page error; both sides still have living units; both sides have
  taken casualties; no unit has been in `Advance` for over sixty seconds (the
  wedged-unit tell); the influence map is not empty. That is the same soak
  [101's spec](../101-ui/spec.md) already asks of the attract world.
- **`/grill`** on one frame of a fight in progress. *"It has to look pleasing"*
  is not something the session that built it may judge -- see the house rule on
  critiquing your own visual work.

---

---

## Technical summary: how big is this?

**Mostly small, one medium, one genuinely new.** There is no large refactor in
it, which is the point of the "one AI, two sides" decision -- the alternative
(a third faction, or teaching the player squad to play itself) would have been.

| # | Item | Size | Risk to the existing game | Guarded by |
|---|---|---|---|---|
| -- | Test harness | ~150 lines | none -- test-only | itself |
| 000 | Extract step order | ~60 lines moved | **medium** -- it is every mission's step order | soak A, before/after diff |
| 001 | Faction-blind AI | ~30 lines, 5 sites | **medium** -- every mission's AI | golden target test |
| 002 | Sprite tint interface | ~120 new + mechanical extraction | low -- new code, plus a pixel-identical refactor | pixel-compare test |
| 003 | Building ownership | ~40 lines, 7 files | **medium** -- `stepBuildings` is load-bearing | golden reinforcement test |
| 004 | The map | one data file | none | `/map`, validators |
| 005 | Arena doctrine | ~10 lines | none -- a new table row | -- |
| 006 | Commanders + influence map | **~350 lines, new** | none -- new file, gated on `squad >= 0` | Playwright soak |
| 007 | Screen, routing, input modes | ~230 lines | low -- one branch in `main.ts`, one gate in `Input` | Playwright soak |
| 008 | Reap the dead | ~25 lines | low -- arena-gated | bounded-actors assert |
| 009 | Cap the decal layer | ~40 lines | low -- arena-gated | five-minute soak, by eye |
| 010 | Header, wounding, counts, audio | ~40 lines | low | soak A |
| 011 | Territory drives reinforcement | ~15 lines | none | by eye |
| 012 | A doctrine per side | ~20 lines | none -- table rows | by eye |
| 013 | Grenadiers, barrels, snipers | data only | none | `/grill` |

**Three items carry real regression risk** (000, 001, 003), and all three are
small, mechanical, and covered by a node test that runs the entire campaign in
1.4 seconds. That is the answer to the brief's worry: the risky changes are not
the big ones, and none of them need a browser to check.

**One item is the actual work** -- 006, the commanders and the influence map.
It is new code in a new file that nothing existing calls, so it cannot regress
anything; it can only fail to be fun, which is what the Playwright soak and
`/grill` are for.

**Suggested order of days:** harness + 000 + 001 first and prove nothing moved.
Then 002, 003, 004, 005 in any order -- they are independent. Then 006 and 007
together, because neither is worth looking at without the other. Then 008 to 010,
which are the corrections that make an endless mode survive being left running.
Then 011 to 013, which are what make it worth leaving running -- and only then
`/grill` it, because grilling it before those is grilling something nobody
intends to ship.
