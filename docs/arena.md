# The arena

Two AI sides fighting over one small forest map, with nobody playing. Built in
[300-cpu-vs-cpu](todo/300-cpu-vs-cpu/); this file is what it *became*, and is
the thing to read before changing it.

It exists twice over. It is a screen you can walk into and watch, and it is the
machinery the intro backdrop will run on — *"when they click on level select,
the background still keeps animating, cpu vs cpu"*
([101's brief](todo/101-ui/brief.md)). Nearly every rule below follows from the
second of those.

**Getting to it.** It is already running: the front screen draws over a live
battle, which is the mode's real job. To see it full-size -- which is what you
want while working on it -- open **`/#arena`**.

**It ships.** None of this is `__DEV__`-gated: the backdrop is part of the live
front end, and the `#arena` fragment goes with it, because the code is in the
bundle either way and gating the fragment would hide something that is already
there rather than save anything. It is unadvertised rather than hidden -- there
was a BATTLE button on the front screen and the owner had it removed once the
backdrop landed, since a front page offering a look at its own wallpaper is a
front page explaining itself. The **map** stays `dev: true`, which is a
different thing: that keeps it out of the player's mission list, where it does
not belong.

---

## The one decision everything else hangs off

> **One AI, two sides.** The green side is *not* the player's squad. It is made
> of ordinary `Enemy` objects that happen to carry `Faction.Player`.

That is enough to make `combat.ts` treat the two sides as hostile to each other
(a round already hits any actor of a different faction, `combat.ts`) and enough
to make the renderer draw them green (the sprite set is chosen from `faction`
alone, `render.ts`). There is no second AI, no second sprite set, and no second
set of tuning to keep in step.

`Soldier`, `troops.ts` and the herd's single flow field are **not involved** and
are not changed by any of this. A mission is untouched.

## The map

One file, [`data/arena-forest.map`](../data/arena-forest.map), 48x34 tiles.
`arena: true` in the header is what every rule below is guarded on.

- **Four huts.** `h` is red's, `G` is green's — a real tile
  (`Tile.HutAllied`), not a rule about which half of the map a building is in.
- **A treeline down the middle with three gaps.** That is the composition.
  Chokes are what make a battle read from a distance; an open field produces a
  shapeless smear.
- **No `P`, no unit markers at all.** Every man comes out of a hut. A placed `E`
  or `S` arms one side only, which is not a fight — the two snipers are posted
  symmetrically from `arena.ts` instead.

## The files

| | |
|---|---|
| [`sim/arena.ts`](../game/src/sim/arena.ts) | `Arena`, `Commander`, `InfluenceMap`. **The only new AI.** |
| [`sim/arena-game.ts`](../game/src/sim/arena-game.ts) | `ArenaGame` — `Game`'s sibling. Owns the world, the camera and the commanders. |
| [`sim/step.ts`](../game/src/sim/step.ts) | `stepWorld`, the ordered pass both a mission and the arena run. |
| [`render/sprites/tint.ts`](../game/src/render/sprites/tint.ts) | Repaints a baked sprite one exact colour for another. How the green roof exists. |
| [`data/arena-forest.map`](../data/arena-forest.map) | The map. |
| [`test/sim.test.mjs`](../game/test/sim.test.mjs) | The headless soak, missions and arena both. |
| [`tools/arena-shot.mjs`](../game/tools/arena-shot.mjs) | Photographs it, through `#arena`. |
| [`main.ts`](../game/src/main.ts) | Owns the backdrop: one world for the life of the page, `startBackdrop` / `stopBackdrop`. |

`ArenaGame` is deliberately **not** a subclass of `Game`. A mission is orders,
an aim, grenades, a briefing, an objective and an end; inheriting all of that in
order to switch it off would leave the switches lying around for somebody to
turn back on. What the two genuinely share is `stepWorld`.

## How a battle works

```
a hut produces a man   ->  MUSTERING   walk to the rally point and wait
four gathered, or 12s  ->  ADVANCING   follow the squad's shared flow field
a foe is acquired      ->  the ordinary enemy state machine owns him;
                           the commander lets go completely
target lost            ->  back into the pool
```

Three old ideas, none of them clever:

1. **Rally, then commit.** Nothing attacks alone. Without this the mode is a
   queue — one man walks out, dies, another follows.
2. **An influence map** (Tozour, *AI Game Programming Wisdom*) decides where a
   committed squad goes: reinforce the front if there is one, otherwise go and
   start one at the nearest enemy hut.
3. **One flow field per squad**, not per man. Eighteen men A*-ing to the same
   cell is what would make this stutter.

The commander never steers a man, never fires, and never overrides one who has a
target. **It decides where a squad walks when it has nothing to shoot at, and
nothing else.** Everything that makes a firefight worth watching — engaging,
flanking, rushing, grenades, shouting for neighbours — is `enemies.ts` and was
already there.

## Rules you will break if you do not know them

Each of these was a real failure, and four of the five were invisible for the
first thirty seconds of a battle. That is the argument for the headless soak.

**The front is `2 * min(green, red)`, not `green + red`.**
`InfluenceMap.contested()`. The obvious reading — how much is happening in a
cell — makes a side's own muster point the hottest cell on the map, so every
squad is sent to reinforce the ground it is already standing on. Both sides do
it. Thirty-six men, five minutes, not a shot fired, about one battle in five.

**Reinforcement feeds the side that is *losing*.** `world.arenaPace`, set in
`arena.ts`. "The winner reinforces faster and over-extends" is positive
feedback and runs away: the winner reaches the loser's huts, kills everything at
the door, holds all the ground, reinforces faster *for* holding it, and stays
there. Measured, losses came out 182 to 186 — dead even — with nineteen men
standing against none. Inverted it is a rubber band, and the front oscillates.
This is unashamedly a game-feel mechanism, not a simulation.

**Arena huts cannot be levelled.** `createWorld` sets `indestructible` on every
building of an arena map. A hut is the only source of men, so a hut that can be
destroyed is a side that can be switched off — and with grenadiers on both sides
that is the normal outcome inside a minute, not a remote possibility.

**A spawn slot is released whoever dies.** `combat.ts`, outside the
`Faction.Enemy` branch. Inside it, it is a one-way ratchet: green fielded
exactly 21 men per battle and then stopped for ever. It reads as a balance
problem and is arithmetic.

**Doorways hide from the *other side*, not from the squad.** `seenByFoe` in
`buildings.ts`. Both sides push to the enemy's huts and shoot what walks out; a
man who spawns in somebody's sights never gets to be part of the battle.

**Nobody is wounded.** `wound()` returns early on `map.arena`. The mission rule
is "the garrison can be wounded, the squad cannot", which carried over becomes
*blue men lie screaming and green men do not* — a visible unfairness in a mode
whose entire content is watching the two of them.

**The dead are reaped and the decals age.** `reap()` in `step.ts`, and
`flushDecals` in `render.ts`. Both are wrong for a mission and necessary for
something with no end. Without reaping, every living man pays for every corpse in
every target search, for ever: 68 actors at ninety seconds, of which 20 were
alive.

## The two sides fight differently, on purpose

`arena-red` and `arena-green` in [`difficulty.ts`](../game/src/sim/difficulty.ts),
resolved per side into `world.sideLevers` — one world has one lever set, and two
sides that fight differently need two. Red comes in numbers and closes; green
goes wide and shoots better. Same rung (Veteran) for both: the asymmetry is the
point, and an asymmetry of *difficulty* would just be one side losing.

Twelve seeded battles average **137 losses to 136**. If you retune, re-run that.

## You cannot touch it

`Input.mode`, and it is a stated switch rather than an omission:

| | |
|---|---|
| `play` | a mission. Everything. |
| `spectator` | the arena. The camera is yours; **nothing** reaches the simulation. |
| `sealed` | a backdrop. Nothing at all, the camera included. |

Gated in [`shell/input.ts`](../game/src/shell/input.ts) at `emit()`, the one door
every command already passes through — not by the arena declining to act on
commands it generates. A screen that merely ignores its own orders still draws a
reticle, still shows a crosshair, and still grows a queue nobody drains.

`sealed` is written and unused. It is what the intro backdrop takes.

**The invariant, asserted in `test/sim.test.mjs`:** `world.orderGoal`,
`world.field` and `world.orderMarker` are written by the order path and by
nothing else, so all three staying null/zero for a whole battle proves nothing
got in.

## The backdrop

The arena's real job. `main.ts` owns one `ArenaGame` for the life of the page
and brings it up behind the front end; the front screen never starts or stops
it, because that screen is shown, hidden and shown again — from boot, from the
end of a mission, from backing out of the level select — and a battle owned by
it would restart on every one of those.

Three things it does differently from the full-size view:

- **`input.mode = 'sealed'`**, not `spectator`. The camera is not the viewer's
  either: every gesture belongs to the menu drawn on top, and a front end whose
  buttons fight the battlefield's edge-scroll for the pointer loses.
- **The camera is locked** by the constructor's `alwaysLocked`, not by the
  user's `arenaLockCamera` preference. That setting is a taste; this is not one.
  Text sits on this, and a background that chases the fighting reads as the menu
  sliding about.
- **`data-mode="backdrop"`** turns `#front`'s opaque background into a vignette
  and collapses the sidebar column. That gradient is the one soft edge in the
  game and it is allowed because it is DOM chrome that never touches the canvas.

**The sharp edge: `Renderer.prepare` is per-map and single-instance.** Terrain,
scenery, the decal canvas and the fog mask are fields on the one renderer, so a
mission and the backdrop cannot both be prepared. The *world* survives a mission
— that is the point — but the bake is redone every time the front end comes
back. It is also why `prepare` must run **before** an `ArenaGame` is
constructed: the constructor clears the decals, and at boot there is no decal
canvas until something has been prepared. Getting that order wrong fails
silently into a front screen with no battle behind it.

Not run on `compact` or `stacked` layouts — a phone's front end is a tight fit
already, and a forty-man simulation drawn behind it buys a small screen nothing.
That is a performance decision rather than a gate, and it is the one line to
change if a phone should have it too.

## Watching options

Two keys, both persisted in `settings.ts` because they are a taste in *how to
watch* — and because the backdrop will want both on permanently, which is then a
stored preference rather than a second code path.

- **`C`** — lock the camera to the middle of the map instead of following the
  fighting.
- **`H`** — hide the two-side readout, leaving nothing but the battlefield.

## Tuning

Every pacing number is in `CONFIG.arena` ([`config.ts`](../game/src/config.ts)),
none in `arena.ts`: squad size, muster timeout, the live cap, retarget interval,
the influence grid, and `paceRange` — the rubber band, clamped tight, because a
strong one is as unwatchable as none.

## Proving a change

```bash
npm run check            # includes a 150-second headless arena soak
ARENA_SECONDS=600 node test/sim.test.mjs
node tools/arena-shot.mjs 120 out.png
LOOK=8,10 node tools/arena-shot.mjs 45 hut.png
```

The headless soak is the important one and costs about eight seconds. It asserts
both sides are still fighting, the huts still stand, the dead do not accumulate,
nobody marches for ever, nothing reached the simulation, and **there is a front
and it moves** — the last of which catches both the stall and the stalemate.

`npm run check` must stay green, and **no mission may play differently**. The
golden numbers in `test/sim.test.mjs` are what prove that: who an enemy
acquires, and how fast a hut produces men.

Anything about how it *looks* goes to `/grill` or `/gauntlet`. Never judge your
own visual work in the session that produced it.
