# The arena

Two AI sides fighting over one small forest map, with nobody playing. Built in
[300-cpu-vs-cpu](todo/300-cpu-vs-cpu/); this file is what it *became*, and is
the thing to read before changing it.

It exists twice over. It is a screen you can walk into and watch, and it is the
machinery the intro backdrop will run on — *"when they click on level select,
the background still keeps animating, cpu vs cpu"*
([101's brief](todo/101-ui/brief.md)). Nearly every rule below follows from the
second of those.

**Getting to it:** `npm run dev`, then **BATTLE** on the front screen. The button
is `__DEV__`-only, so it is absent from a production build.

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
| [`tools/arena-shot.mjs`](../game/tools/arena-shot.mjs) | Photographs it. |

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
