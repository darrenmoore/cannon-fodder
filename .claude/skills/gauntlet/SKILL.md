---
name: gauntlet
description: Run the build-and-critique loop against a visual reference. Fixes objective, metric and boundary first, then builds, captures real pixels, and hands them to a critic with no memory of having built them.
argument-hint: [what to work on, e.g. "the phase-complete moment" or "explosions"]
disable-model-invocation: true
allowed-tools: Bash(npm run *) Bash(node *) Bash(git status *) Bash(git diff *) Bash(git stash *) Bash(git checkout *) Read Write Edit Glob Grep Agent
---

## The method

Three things are fixed **before the first round** and are not renegotiated when
a round turns out to be hard. That discipline is the whole method; everything
else is bookkeeping.

| | |
|---|---|
| **Objective** | What must become true. Concrete, and pinned to a reference image, not to an adjective. |
| **Metric** | What proves an attempt improved. Real pixels from the real game, judged by someone who did not build them. |
| **Boundary** | What may change, what must not regress, and when to stop. |

[docs/loop.md](../../../docs/loop.md) is the record of the first run of this
against `docs/original-images/map/`. Read it before starting — not for the
conclusions, but for the failure it documents.

## The failure this loop is prone to

From that run, in its own words: **a metric that can lie will eventually be
believed.** The capture tool was wrong twice, and both times it produced a
*confident false critique* — a critic reporting with pixel counts that a mission
contained no water, when it contains 630 tiles of it.

So round zero is never a critique. Round zero is proving the capture shows what
it claims to show. If you cannot capture the thing the objective is about — a
banner that flies up, an explosion three frames in, a name plate at 4x — then
**building that capture is the first round**, and no judgement is accepted until
a human has looked at one frame of it and agreed it is the right frame.

## Running it

### 1. Fix the three elements, in writing

Write them into `docs/loop.md` under a new run heading before any code changes.
If the objective cannot be stated without the word "better", it is not an
objective yet. Name the reference file explicitly.

Default boundary unless the user says otherwise:

- **May change:** `game/src/**`, `game/public/**`, `game/tools/**`, `data/**`, `docs/**`
- **Must not regress:** `npm run check`, a clean capture with zero page errors,
  any mission's completability, the one-character-per-tile map contract
- **Stop when:** the critic reports no improvement for a round, the ranked gap
  list is exhausted, or the attempt budget is spent

Ask the user for an attempt budget if they have not given one. Six rounds is a
reasonable default; say what you expect it to cost.

### 2. Rank the gaps

Order by **how much of the screen each one governs**, which is the only honest
ordering when the objective is "looks like the reference". Ground before
foliage, foliage before icons. Write the list down; work the top item only.

### 3. Each round

1. **Build** the single largest gap. One gap per round.
2. **Verify**: `npm run check`, then a capture. A round that fails either is not
   a round — fix it and recapture before judging.
3. **Critique** with a *fresh* subagent, one per round, via the Agent tool.
   It must be given the capture and the reference and no history of the build.
   Never critique your own work in this context: you know what you intended, and
   you will see it whether or not it is there.
4. **Keep or revert.** If the critic does not call it an improvement, revert it
   — `git checkout --` the files you touched — and record why. A round that made
   things worse and stayed is how a loop drifts.
5. **Record** the verdict and the next gap in `docs/loop.md` as you go, not at
   the end.

### The critic prompt

Give the subagent the images and this shape. Do not tell it what you changed,
what you intended, or which image is yours — it must not be able to be polite.

```
Here are two images. One is the reference and one is an attempt at it.
[reference] [capture]

1. Which is the reference? (If you cannot tell, say so — that is the goal.)
2. What is the single largest difference, by how much of the frame it governs?
3. Is [capture] closer to or further from [reference] than [previous capture]?

Judge the pixels. Do not speculate about the code, and do not soften it.
```

Ask for **one** ranked gap, not a list of everything wrong. A critic given room
to list ten things will list ten things, and the loop will chase the cheapest.

### 4. Finish

A last pass over the whole artifact for consistency — rounds fix things one at a
time and can leave a frame that is individually correct and collectively odd.

Then **stop and report**. Do not commit: the run is reviewed as one diff, by the
user, with `/commit` afterwards. Say plainly which rounds were kept, which were
reverted and why, and what the ranked list still has on it.

## Boundaries that are not negotiable

- **Nothing is committed by this skill**, and nothing is pushed.
- **The user's dev server on port 5199 is never killed.** Capture on another
  port (`PORT=5210`).
- If a round would need a change outside the stated boundary, stop and ask. That
  is the escalation trigger, and quietly widening the boundary is the way an
  overnight run becomes a morning of reverting.
