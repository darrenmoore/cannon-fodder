---
name: arena
description: Work on the CPU-vs-CPU arena — the two-AI battle mode and the machinery the intro backdrop runs on. Loads the constraints that are not guessable from the code, opens the mode to look at it, and proves a change with the headless soak rather than a screenshot.
argument-hint: [what you want to change, e.g. "make the fights last longer" or "add a third side"]
allowed-tools: Bash(npm run *) Bash(node *) Bash(netstat *) Bash(curl *) Bash(taskkill *) Read Write Edit Glob Grep
---

The arena is two AI sides fighting over one forest map with nobody playing. It
is also the machinery the intro backdrop will run on, and most of its design
follows from that second job rather than the first.

**[docs/arena.md](../../../docs/arena.md) is the contract. Read it in full,
first, every time** — not from memory and not the summary here. It carries six
rules that each cost a real failure to learn, and four of those failures were
invisible for the first thirty seconds of a battle. You will not find them by
looking at the code, and you will not find them by watching it for a minute.

## The order

### 1. Read, before touching anything

- **[docs/arena.md](../../../docs/arena.md)**, all of it.
- The module you are about to change. Every one of them opens with a docblock
  saying why it is the way it is; several of those paragraphs are the record of
  something that was tried and did not work.
- If the change is visual, **[the style skill](../style/SKILL.md)** and
  **`/pixel-check`**. The arena obeys the same visual laws as everything else:
  no alpha, no anti-aliasing, no smooth curves.

### 2. Look at it before you change it

```bash
PORT=5210 node build.mjs --watch     # your own server; 5199 is the owner's
node tools/arena-shot.mjs 120 out.png
```

**Never kill whatever is listening on 5199.** From the owner's side a
force-kill is indistinguishable from the dev server crashing, and it does not
come back. Run your own on another port and kill only what you started.

The mode is entered from the front screen's **BATTLE** button, which is
`__DEV__`-only — so it exists under `npm run dev` and is absent from
`npm run build`. `tools/arena-shot.mjs` walks in through that button, which
makes it a test of the door as well as a camera.

### 3. Establish the baseline *before* editing

```bash
npm run check
node -e "…"    # twelve seeded battles; see docs/arena.md
```

Balance is the thing most easily broken by accident and least visible in a
screenshot. The shipped numbers are **137 losses to 136 across twelve seeded
battles**. If your change moves that, it was a balance change whether you meant
it to be or not.

### 4. Make the change

Two questions to answer out loud before writing anything:

- **Does a mission see this?** Almost everything here is guarded on
  `world.map.arena` for a reason. Reaping the dead, capping the decals,
  suppressing wounds, un-gating the huts — each is *wrong* for a mission and
  necessary for something with no end. If your change is not guarded, say why.
- **Does it belong to the commander or to the man?** `sim/arena.ts` decides
  where a squad walks when it has nothing to shoot at. `sim/enemies.ts` decides
  everything else, and is already tuned. A change to how a firefight *feels*
  almost never belongs in `arena.ts`.

### 5. Prove it

```bash
npm run check                              # includes a 150s headless soak
ARENA_SECONDS=600 node test/sim.test.mjs   # a longer one, by hand
node tools/arena-shot.mjs 150 after.png
```

`npm run check` must be green and **no mission may play differently**. The
golden numbers in `test/sim.test.mjs` are what prove the second half: who an
enemy acquires, and how fast a hut produces men. If one of them moves, that is
not automatically a bug — but it is always a decision, and it must never be made
by accident.

The headless soak is the important tool and it is cheap. The simulation has no
DOM dependency (`test/support/sim.mjs`), so five minutes of battle costs about
eight seconds. **Reach for it before Playwright**, and reach for it before
concluding anything from a screenshot: a stall, a stalemate, a spawn ratchet and
a corpse leak all look like a perfectly good battle at thirty seconds.

### 6. Judge the look somewhere else

`/grill` for one screen, `/gauntlet` for the loop. **Never critique your own
visual work in the session that produced it** — you know what you intended and
you will see it whether or not it reached the screen.

## What not to do

- **Do not make the green side the player's squad.** It is `Enemy` objects
  carrying `Faction.Player`, and that is what lets one AI drive both sides.
  `troops.ts` and the herd are not involved.
- **Do not let the arena reach `resolvePhase`.** There is no objective and
  nothing that can be won or lost. A world with no soldiers has by definition
  lost its squad, so resolving would end it on the first step.
- **Do not give the arena a way in that a player can find**, unless the owner
  has asked for one. It is dev-only until it becomes the backdrop.
- **Do not add a second copy of the step order.** `sim/step.ts` is the one
  ordered pass; both a mission and the arena call it, and two copies would drift
  silently because both would still work.
- **Do not use alpha to fade anything.** Decals thin out along an ordered dither
  because there is no alpha in this renderer. See `flushDecals`.
