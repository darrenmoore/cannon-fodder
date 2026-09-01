---
name: spec
description: Break a raw brief in docs/todo/ into one file per issue: check every claim against the code, put blocking decisions in questions.md for the owner to answer inline, and track state in progress.md so any session can pick up the work.
argument-hint: [the item, e.g. 200 or docs/todo/200-qa/]
allowed-tools: Bash(git log *) Bash(git diff *) Bash(git mv *) Bash(npm run *) Read Write Edit Glob Grep Agent
---

The owner writes briefs as they play — fast, in his own words, one thought per
paragraph, issues separated by `---`. They are the best input this project gets
and they are not a plan. This turns one into work that can be picked up,
finished, and committed one issue at a time.

It used to produce one long `spec.md` per brief
([003](../../../docs/todo/003-roof-damage/spec.md),
[004](../../../docs/todo/004-enemy-ai/spec.md), 100, 101 — still there, still
valid). The checking step earned its keep every time, but the single long file
had a failure mode: **items in the middle of a long document got skimmed and
silently missed.** So the output is now one file per issue, and a ledger.

## Where things live

Every brief is one directory, `docs/todo/<n>-<slug>/`:

```
docs/todo/200-qa/
  brief.md          the owner's words, verbatim — never edited, only appended
  001-<slug>.md     one file per issue, numbered in brief order
  002-<slug>.md
  ...
  questions.md      decisions only the owner can make, answered inline
  progress.md       the ledger: every issue, its status, its commit
```

A brief may arrive as a loose `docs/todo/<n>.md` file; the first move is
`git mv` into `<n>-<slug>/brief.md`. Captures, measurements, scratch notes worth
keeping go in the same directory, named for the issue they belong to.

## The step that earns this skill

**Check every claim against the code before writing a line of spec.** Briefs are
written from what the game appeared to do, which is the correct thing for them
to be written from and is not the same as what it does.

What that has caught so far:

- "make the wreck grey, I think you tried before" — the wreck *was* grey, and
  had never been drawn: the renderer held a building from a world that had been
  thrown away. No building had ever shown damage.
- "do we have a bazooka guy?" — yes, with his own sprite set.
- "enemies can swim" — they already cross shallow water; what stops everyone is
  deep water.
- "they don't seem to see me" — true, and the cause was three separate levers,
  not the one the brief guessed at.

So for each issue: find the code, read it, and write down which of these it is.

| | |
|---|---|
| **Already true** | Say so, and say what the issue is therefore really asking for. |
| **Broken, cause found** | Name the cause. A diagnosis in the spec is a fix that is nearly free. |
| **Broken, cause unknown** | Say that too. "Reproduce first" is a legitimate spec item; a guess dressed as a diagnosis is not. |
| **New work** | Spec it. |

## One file per issue

Split `brief.md` at each `---`. Every chunk becomes `NNN-<slug>.md`, numbered in
brief order starting at 001 — **including** chunks that turn out to need no work
(pure praise, an observation): those files are two lines and exist so the
numbering never drifts from the brief and nobody re-checks the same chunk.

Each issue file:

- **The owner's words**, quoted verbatim at the top.
- **Findings** — what the code actually says, with `file.ts:line` references.
  This is the part the owner cannot get from the brief he wrote.
- **The classification** from the table above.
- **The plan**, sized honestly. If it is more than one sitting, say which part
  is one sitting.
- **Done when** — phrased so someone else could tell whether it passed. "Feels
  better" is not one.
- If a decision blocks it: `**Blocked on questions.md Q<n>.**` and stop there.
  Do not plan both branches.

## questions.md

Only decisions where different answers produce materially different work — a
question with an obvious answer is a guess you should have made. Each one:

- **Written simply.** Short sentences. No jargon the game itself doesn't use.
  An example wherever one is possible.
- **Numbered options** — 1, 2, 3 — with a recommendation and one line on why.
- **A `>` line underneath** for the owner to type the answer.

```markdown
## Q1 — how close is too close? (issues 010, 014)

On "no way off" the nearest enemy starts 6 tiles from your squad.
You die before you can move. What should the minimum start distance be?

1. 12 tiles — about half a screen. You can always take one step to cover.
2. 16 tiles — a full screen. Nobody is visible at spawn.
3. Per-map: a `minStart` field in the campaign table, defaulting to 12.

Recommend 1 — it fixes every reported map without making ambushes impossible.

>
```

When the owner answers, copy the decision into the issue file under **Decision**
— so a later session cannot quietly re-litigate it — and mark the question
`~~answered~~` with the choice. An unanswered question means that issue is not
worked on. Ever. A guess shipped against an open question is the one way this
system fails.

## progress.md

The ledger. One line per issue, always current:

```markdown
| # | issue | status | commit |
|---|---|---|---|
| 001 | sink-no-spawn | done | a1b2c3d |
| 002 | mud-render | in progress — session 2026-09-01 | |
| 003 | veteran-balance | blocked on Q2 | |
| 004 | house-circle | open | |
```

More than one session works this tree at once. Before touching an issue, mark
it **in progress** here; when it lands, mark it **done** with the commit hash.
An issue someone else marked in progress is not yours to take.

## Working the issues

One issue, one commit. Pick an unblocked issue, mark it in progress, do the
work, verify it — `npm run check` always, plus whichever of the screenshot /
playtest / sprite tools can actually *see* the change — update `progress.md`,
then commit with **`/commit`**, which stages by name because other sessions
edit this tree too. Then the next issue. Never batch three issues into one
commit: the owner controls scope by reverting and reordering commits, and a
batched commit takes that away.

`/commit` is user-invocation-only, so an agent's Skill call will be refused.
When it is, follow the skill's discipline by hand — stage each path by name
after accounting for it, match the log's voice, never `git add -A`, never
push — and know its one recorded trap: `git mv` stages the rename but not
your later edits to the moved file, so re-add those paths or the commit
ships stale content behind a `(100%)` rename.

## Anything you will not do

Licensing, scope you think is wrong, a decision you would make differently —
say it in the issue file, before the work, not in the report afterwards.
