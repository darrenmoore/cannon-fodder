# Progress -- 300-cpu-vs-cpu

One line per item. Mark **in progress** before touching one; mark **done** with
the commit hash when it lands. One item, one commit, via `/commit`.

Unlike a QA batch, these are **ordered** -- see the dependency note at the
bottom. [technical.md](technical.md) is the instruction set; this is the ledger.

| # | item | status | commit |
|---|---|---|---|
| -- | [regression net](technical.md#before-anything-else-the-regression-net) -- `test/support/sim.mjs`, `test/sim.test.mjs` | todo | |
| 000 | [extract the step order](technical.md#000----extract-the-step-order) | todo | |
| 001 | [faction-blind AI](technical.md#001----make-the-ai-faction-blind) | todo | |
| 002 | [sprite tint interface](technical.md#002----a-sprite-tint-interface) | todo | |
| 003 | [building ownership](technical.md#003----buildings-that-belong-to-somebody) | todo | |
| 004 | [the map](technical.md#004----the-map) | todo | |
| 005 | [arena doctrine](technical.md#005----arena-doctrine) | todo | |
| 006 | [commanders + influence map](technical.md#006----the-commanders) | todo | |
| 007 | [screen, routing, input modes](technical.md#007----the-screen) | todo | |
| 008 | [reap the dead](technical.md#008----reap-the-dead-required) | todo | |
| 009 | [cap the decal layer](technical.md#009----cap-the-decal-layer-required) | todo | |
| 010 | [header, wounding, counts, audio](technical.md#010----small-gaps) | todo | |
| 011 | [territory drives reinforcement](technical.md#011----territory-drives-reinforcement-the-important-one) | todo | |
| 012 | [a doctrine per side](technical.md#012----the-two-sides-should-not-fight-the-same-way) | todo | |
| 013 | [grenadiers, barrels, snipers](technical.md#013----give-it-something-to-explode) | todo | |
| 014 | [proof](technical.md#014----proof-runs-last) | todo | |

## Order

The regression net first, and **nothing starts before it** -- 000, 001 and 003
are the three items that can quietly break every existing mission, and the whole
point of the net is that they are checked in 1.4 seconds rather than in a
browser.

```
net -- 000 --+-- 001 --+-- 006 -- 007 --+-- 008 -- 009 -- 010 --+-- 011 -- 012 -- 013 -- 014
             +-- 002 --+                                        (endless-mode)  (watchability)
             +-- 003 --+
             +-- 004 --+
             +-- 005 --+
```

- **000** alone, and behaviour-neutral: no mission may play differently after it.
- **001 to 005** are independent of each other.
- **006 + 007** are one sitting -- neither is worth looking at without the other,
  and together they are the first runnable arena.
- **008 to 010** are the corrections that let an endless mode survive being left
  running. Without them it degrades and the ground turns to blood.
- **011 to 013** are what make it worth leaving running. **Do not `/grill` or
  judge the mode before these land** -- without 011 in particular it is a
  stalemate at the centre chokes, and grilling that is grilling something nobody
  intends to ship.

## Log

- **2026-09-01** -- brief broken down against the code before planning. Findings
  that shaped it: `combat.ts` is already faction-generic (`:176`); the renderer
  picks its sprite set from `faction` alone (`render.ts:932`), so a green-team
  unit needs no new art; the AI reads `world.soldiers` in only three places
  (`enemies.ts:275`, `:553`, `:558`). Four owner decisions answered in
  [questions.md](questions.md): 48x34 map, a real `G` tile marker with a general
  sprite tint interface under it, a `__DEV__`-gated door, and indestructible
  huts.
- **2026-09-01** -- measured the regression story rather than assuming it: the
  whole simulation imports and runs in plain node behind two global stubs
  (`localStorage`, `window`). **52 maps x 10 sim-seconds = 1.4s, 0 errors.**
  Playwright is not needed for the risky items.
- **2026-09-01** -- review pass against "this mode never ends". Found two
  required corrections the first draft missed (dead actors are never removed
  from `world.actors`; the decal layer is never capped) and one honest answer
  about the design: two identical sides on a symmetric map produce a stalemate,
  so territory-driven reinforcement (011) is not polish, it is the thing that
  makes the mode watchable. Also corrected an earlier call -- the asymmetric
  `wound()` guard *would* have been visible, and is now handled in 010.
