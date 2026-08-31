---
name: spec
description: Turn a raw brief in docs/todo/ into a spec: check every claim against the code, mark what is already true, surface the decisions that block, and write acceptance criteria.
argument-hint: [the brief, e.g. 004 or docs/todo/004.md]
allowed-tools: Bash(git log *) Bash(git diff *) Bash(npm run *) Read Write Edit Glob Grep
---

The owner writes briefs as they play — fast, in his own words, one thought per
paragraph. They are the best input this project gets and they are not a plan.
This turns one into a plan.

Done twice by hand ([003-spec.md](../../../docs/todo/003-spec.md),
[004-spec.md](../../../docs/todo/004-spec.md)); both times the checking step
found something that changed the work before any of it started.

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

So for each item: find the code, read it, and write down which of these it is.

| | |
|---|---|
| **Already true** | Say so, and say what the item is therefore really asking for. |
| **Broken, cause found** | Name the cause. A diagnosis in the spec is a fix that is nearly free. |
| **Broken, cause unknown** | Say that too. "Reproduce first" is a legitimate spec item; a guess dressed as a diagnosis is not. |
| **New work** | Spec it. |

## Shape of the output

`docs/todo/<n>-spec.md`, next to the brief it came from, linking to it.

- **Findings first.** What the code already says, before any plan. This is the
  part the owner cannot get from the brief he wrote.
- **Decisions needed.** Only the ones where different answers produce materially
  different work. Recommend one. Ask them with `AskUserQuestion` rather than
  burying them in prose — an unanswered question in a document is a guess
  waiting to happen.
- **Batches.** Grouped so each is separately shippable and separately
  revertable. Say what order, and why that order.
- **Acceptance criteria per item**, written as *"done when"* and phrased so
  someone else could tell whether it passed. "Feels better" is not one.
- **Decisions taken**, recorded in place, so a later session cannot quietly
  re-litigate a call the owner already made.

## Two things to be honest about

**Scale.** If it is more than one sitting, say so and say which batch is one
sitting. A plan that pretends sixteen items is an afternoon produces a commit
nobody can review.

**Anything you will not do.** Licensing, scope you think is wrong, a decision
you would make differently — in the spec, before the work, not in the report
afterwards.

Write the spec. Do not start building it: the owner decides the order, and the
spec is what he decides from.
