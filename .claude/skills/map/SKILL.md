---
name: map
description: Write one new mission by hand as a data/*.map file — from an idea rather than a seed. Reads the map format, studies the nearest shipped missions, checks the idea is coherent before drawing, and proves the result both compiles and can be won.
argument-hint: [the idea, e.g. "a dam with four bridges" or "no-kill hostage rescue"]
allowed-tools: Bash(npm run *) Bash(node *) Bash(netstat *) Read Write Edit Glob Grep
---

`generate-levels.mjs` makes missions from a seed. This makes one from an idea.

The two are not rivals — they fail differently. The generator cannot be
surprised, so it never produces a shape nobody thought of; a hand-written map
can be anything at all, and is therefore free to be unplayable in ways a seeded
one cannot. Everything below exists to catch that.

**[docs/map-format.md](../../../docs/map-format.md) is the contract.** Read it
first, in full, every time — not from memory, and not the summary in this file.
It is kept true by a test, so it is worth more than anything you remember about
this repo.

## The order

### 1. Read the format

The whole file. The parts that catch people are near the end:
["Designing a mission"](../../../docs/map-format.md#designing-a-mission) —
scale, density, reachability, the puzzle levers nothing is built around, and the
table of combinations that do not work.

### 2. Read the neighbours

Find the two or three shipped missions nearest to the idea and read the actual
`.map` files, not just the table describing them. The format cannot express
density, the ratio of cover to killing field, or how much open ground a firefight
needs — those are only learnable by looking at a mission that works.

A map that passes every check and still feels wrong is nearly always one written
without doing this.

### 3. Say what the mission is, before drawing anything

Write down, and show the owner:

- **The one idea.** What does this mission teach or ask that no shipped mission
  does? "A jungle map with some huts" is not an idea. "The only crate is on the
  far side of a sniper's field of fire" is.
- **Objective, doctrine, size and theme**, and why each.
- **Why the combination is coherent**, checked against
  ["What cannot go together"](../../../docs/map-format.md#what-cannot-go-together).

If the idea as given is contradictory — kill everybody without killing anybody,
a covert map watched by snipers, a demolition map with nothing explosive on it —
**say so and stop.** Name the rule it breaks and offer the nearest coherent
mission. Do not quietly build something adjacent and hope it passes; the checks
will let a coherent-but-pointless map through, and then it is shipped.

### 4. Draw it

Plain ASCII, one character per tile. Ragged rows are fine — the parser pads.

The two things that are invisible in a text editor and obvious on screen:

- **No marooned single tiles.** A hand-written map gets no `smooth()` pass. Give
  every patch a three-tile core.
- **No rectangular border.** Vary the treeline's depth as it runs down the edge.

Pick an id that appears nowhere in `CAMPAIGN` in `generate-levels.mjs`, and
**never add an entry there.** A hand-written map with a generator entry is a map
that gets silently overwritten by the next `npm run levels`.

### 5. Prove it three ways

Each proves something the other two cannot. All three are required.

```bash
npm run check     # parses, spawns are legal, the objective is reachable
```

Among what it enforces: **no enemy starts within 12 tiles of a squad spawn**
(see map-format.md). Place your garrison against that rule from the start
rather than discovering it in red — close is fine, adjacent is a wiped squad.

Two placement tools worth designing with, both from 200-qa:

- **Patrol routes**: `p` nodes within 12 tiles of each other chain into an
  ordered march the enemy walks end to end and back — fixed, timeable, the
  thing a stealth or approach map is built around. Three nodes nine tiles
  apart is the proven recipe; a lone node is only a random beat.
- **`camps`** (generated missions only): a campaign-table row can pin a
  garrisoned spot by map fraction — `camps: [{ at: [0.16, 0.82], guards: 5,
  barrels: 2, huts: 0 }]` — for when a layout leaves a corner bare. It
  comes with its own two-node beat and is skipped on wave maps.

`npm run check` reads *every* `.map` in `data/`, so a hand-written mission is
held to exactly the same standard as a generated one. Read the failure, fix it,
run it again. Do not move on from a red check.

Then **look at it**: run the game and load the mission. The tests cannot see a
map that is ugly, and they cannot see one that is boring.

Then **play it to the end** — `/playtest` drives the real game. Completable and
winnable are different claims: the first is about topology, the second is about
whether six men with one hit point each can actually do it. A map that has never
been finished has not been finished.

## The standing rules this inherits

- **Port 5199 belongs to the owner.** Never kill what is listening there. Run
  your own server on another port (`PORT=5210 node server.js`) and point
  harnesses at it; kill only what you started.
- **Do not critique your own map in the session that drew it.** You know what
  you intended and you will see it whether or not it reached the screen. That is
  `/grill`'s job, and it judges in a subagent with no history.
- **`data/*.map` is generated for anything in `CAMPAIGN`.** See step 4.

## Done when

The mission passes `npm run check`, has been won at least once under
`/playtest`, and the owner has been told in one paragraph what it is for — the
one idea, and the decision it puts in front of the player.
