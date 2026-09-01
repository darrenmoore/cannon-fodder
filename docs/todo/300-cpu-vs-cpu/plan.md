# 300 -- CPU vs CPU

A screen you can walk into where two AI sides fight over one small forest map,
with nobody playing. Version one is a spectator: you watch, you scroll, that is
all.

It is a prototype for the attract world 101 already promised -- *"when they
click on level select, the background still keeps animating, cpu vs cpu"* --
but it is written as a thing of its own, because the same machinery is what a
skirmish mode, an allied AI squad or a three-way fight would all be built on.

---

## Part 1 -- High-level plan

### What already exists, and what does not

The engine is closer to this than it looks. Everything below was read before
this plan was written; the file and line references are what each claim rests
on.

**Free, no change needed:**

| | |
|---|---|
| Bullets, blasts, wounds, corpses | `sim/combat.ts` is already faction-generic -- a round hits any actor whose `faction` differs from its own (`combat.ts:176`), and blast damage tests the same way. |
| Sprites for a second side | The renderer picks the sprite set from `a.faction` alone (`render/render.ts:932`): `Faction.Player` draws the green squad sprite, `Faction.Enemy` the blue one. A green-team unit therefore already draws green with no new art. |
| The interesting AI | `sim/enemies.ts` is a full state machine with hunters, rushers, flankers, grenadiers, alerts, glances, investigation and repathing. That is the thing that makes a firefight worth watching, and it is written once. |
| Group movement | `buildFlowField` / `flowTarget` (`sim/pathfind.ts`) and `formationSlots` / `assignSlots` (`sim/steering.ts`) already do "one destination, many units, spread out on arrival". |
| Aggression as data | `sim/difficulty.ts` is fifteen independent levers, and `doctrine` multiplies into them per map. There is no AI to rewrite to make them charge -- there is a table to fill in. |
| A camera with no owner | `Camera.update` takes `focus: Vec2 or null` and behaves correctly with null (`render/camera.ts:80`). Panning and edge-scroll are input-side and mission-independent. |
| Fog off | `new Fog(map, 0)` fills both masks with 1 and short-circuits every query (`render/fog.ts:41`). A spectator sees the whole map for free. |

**What is missing:**

1. **The AI only ever fights the player squad.** `nearestVisibleSoldier` scans
   `world.soldiers` (`enemies.ts:275`), and the grenade target search does the
   same (`enemies.ts:553`). Three call sites.
2. **Buildings only produce one side's men.** `stepBuildings` spawns
   `Faction.Enemy` riflemen, gated on a *player soldier* standing within
   `spawnAggroRange` (`buildings.ts:63`). A `Building` has a `role`, but no
   owner.
3. **Nothing decides what a group of AI units should do.** An enemy with no
   target idles, fidgets, or besieges a `protect` building. There is no notion
   of "form up, then go and take that hut".
4. **`Game` is welded to `Input`.** It reads orders, aim, grenades and the
   pause key. A spectator has none of those, and the eventual attract world has
   no input at all.
5. **No entry point that is not a mission.** The shell is menu, mission, menu.

### The shape of the answer

> **One AI, two sides.** Rather than teach the player squad to play itself, make
> the existing enemy AI faction-blind and run *both* arena sides through it.

Both sides are `Enemy` objects. The green side simply carries
`faction: Faction.Player`, which is enough to make combat treat it as hostile to
the blue side and enough to make the renderer draw it green. There is no second
AI, no second sprite set, and no second set of tuning to keep in step.

The player squad (`Soldier`, `troops.ts`, the herd and its one flow field) is
not involved in the arena at all and is not changed by it.

### Making it not boring

The failure the brief names -- *one spawns, fights, one spawns a few moments
later* -- is a pacing failure, and it has a standard answer in RTS AI. Three
existing algorithms, in order of how much they buy:

1. **Rally point with a commit threshold.** Every unit walks from its hut to a
   muster point behind the line and waits. Nothing attacks alone. When four have
   gathered -- or twelve seconds pass, whichever first -- that group is committed
   as a squad and marches. This alone converts a trickle into waves, and it is
   about thirty lines.
2. **Influence map** (Tozour, *AI Game Programming Wisdom*) for choosing *where*
   a committed squad goes. A coarse grid, one cell per four tiles, with each
   living unit stamping a linear falloff of strength. Two derived fields:
   `influence = green - blue` and `tension = green + blue`. A squad is sent to
   the highest-tension cell inside its own reach -- the **front** -- unless the
   front is quiet, in which case it is sent at the nearest enemy hut.
   This is the single highest-value item in the plan and the reason it will look
   good: it concentrates the fighting into one moving front line instead of
   scattering it into a dozen unrelated duels.
3. **Flow field per squad**, not per unit. Already in the codebase, already what
   it is for. Cheap, and it makes a squad of six move as a body down a path
   rather than as six pathfinders sharing an idea.

4. **Territory-driven reinforcement**, which was missing from the first draft
   and turns out to be the one that matters most. Two identical sides on a
   symmetric map with indestructible huts produce a *stalemate*: the front parks
   on the centre chokes and grinds there forever. Every firefight looks good and
   the battle has no shape. So a side's spawn rate scales with the fraction of
   the influence grid it holds -- win a push, reinforce faster, push further,
   over-extend, get rolled back by the other side's shorter lines. A tide
   instead of a wall, for about ten lines on a grid that already exists.
   Clamped hard at both ends, because an unbounded feedback loop wipes one side
   in ninety seconds, which is the opposite failure and just as dull.

On contact, the commander lets go entirely and the existing state machine takes
over -- engage, flank, rush, alert the neighbours. That is the part already
tuned, and it should not be reimplemented.

Everything else about pacing is numbers: how fast the huts produce, how many a
side may have alive at once, how big a committed squad is. Those go in `CONFIG`
where they can be turned without touching code.

**The two sides should also not fight the same way.** One doctrine each rather
than one shared -- one weighted to rushing and numbers, the other to flanking
and hunting -- so you can tell them apart by how they move rather than only by
colour, and so the tuning has somewhere to go when one side always wins.

### Making it look good

The composition is the map's job, and it is mostly one decision: **a treeline
down the middle with three gaps in it.** Chokes are what make a battle read from
a distance -- units funnel, they meet in known places, the fight has a shape.
An open field produces a shapeless smear. Beyond that:

- The camera **drifts slowly toward the hottest cell of the influence map** when
  the viewer is not panning. It is one line, it is free from the influence map,
  and it
  is exactly what attract mode will need later.
- Fog off, so the whole board reads.
- Both sides in *uniform* colours -- `camo` forced to 0, because a camo trooper
  is deliberately hard to see and the whole point here is to be watched.
- The battlefield accumulates: decals, blood, scorch, hut damage stages, smoking
  ruins. All of that already happens; it just needs the fight to stay in one
  place long enough for it to build up, which is what the influence map buys.
  It also has to *stop* accumulating -- the decal layer is stamped forever and
  cleared only when a world is built, so an endless battle ends up fought over
  solid blood. It is capped for the arena alone; a mission's permanent
  battlefield is deliberate and stays.
- **Something to explode.** Rifle fire between two coloured lines is flat. The
  arena raises `grenadiers` well above the mission default, puts explosive
  barrels in the chokes, and gives each side one sniper on a flank. All three
  already exist; the first draft left them out for a purity that was not worth
  anything.

### Version one, and what it is not

**Is:** a map, a screen, two AI sides, spawning, mustering, advancing, fighting,
a spectator camera you can scroll, a thin readout of who is winning.

**Is not:** an ending, a winner, a score, a restart flow, the attract-mode
compositing behind the front screen, betting on a side, taking control of a
side, or three-way fights. Every one of those becomes cheap once this exists,
which is the point of building it this way -- but none of them are in it.

**You cannot touch it, and that is a stated switch rather than an omission.**
`Input` gains a mode: `play` is a mission, `spectator` is this -- the camera is
yours and nothing reaches the simulation -- and `sealed` is the backdrop, where
even the camera is not yours. Version one uses `spectator`; `sealed` is written
at the same time because it is one line in the same switch and because an intro
screen whose buttons fight the battlefield for the pointer is much cheaper to
design out than to find.

> **Decisions are locked.** The four questions in [questions.md](questions.md)
> are answered, and [technical.md](technical.md) is the instruction set built on
> them. Where this document and technical.md differ, technical.md is right.

---

## Part 2 -- The work

Moved out. [technical.md](technical.md) is the instruction set: fifteen items in
execution order, what each one touches, and the proof each one owes. It also
carries two things this document originally got wrong and a review pass caught --
that an endless mode leaks corpses and decals, and that two identical sides
produce a stalemate.

[progress.md](progress.md) is the ledger. One item, one commit.

### What this opens up

Stated because the brief asked for it, and because it is the argument for doing
001 properly rather than special-casing:

- **The attract world.** `ArenaGame` with input disabled and a fixed camera,
  drawn behind the front screen. That is 101's item 5, and after this it is
  compositing work rather than simulation work.
- **An allied AI squad** in a real mission -- a second friendly group that is not
  the player's herd -- is a commander with one squad and no huts.
- **Three-way fights, or a neutral side**, once `Faction` is an enum with a
  third member rather than a boolean in disguise. 001 is the change that makes
  that a data change.
- **Skirmish mode**: this, with a win condition and the player commanding one
  side.
