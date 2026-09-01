# Progress -- 300-cpu-vs-cpu

One line per item. Mark **in progress** before touching one; mark **done** with
the commit hash when it lands. One item, one commit, via `/commit`.

Unlike a QA batch, these are **ordered** -- see the dependency note at the
bottom. [technical.md](technical.md) is the instruction set; this is the ledger.

| # | item | status | commit |
|---|---|---|---|
| -- | [regression net](technical.md#before-anything-else-the-regression-net) -- `test/support/sim.mjs`, `test/sim.test.mjs` | done | |
| 000 | [extract the step order](technical.md#000----extract-the-step-order) | done | |
| 001 | [faction-blind AI](technical.md#001----make-the-ai-faction-blind) | done | |
| 002 | [sprite tint interface](technical.md#002----a-sprite-tint-interface) | done | |
| 003 | [building ownership](technical.md#003----buildings-that-belong-to-somebody) | done | |
| 004 | [the map](technical.md#004----the-map) | done | |
| 005 | [arena doctrine](technical.md#005----arena-doctrine) | done | |
| 006 | [commanders + influence map](technical.md#006----the-commanders) | done | |
| 007 | [screen, routing, input modes](technical.md#007----the-screen) | done | |
| 008 | [reap the dead](technical.md#008----reap-the-dead-required) | done | |
| 009 | [cap the decal layer](technical.md#009----cap-the-decal-layer-required) | done | |
| 010 | [header, wounding, counts, audio](technical.md#010----small-gaps) | done | |
| 011 | [territory drives reinforcement](technical.md#011----territory-drives-reinforcement-the-important-one) | done | |
| 012 | [a doctrine per side](technical.md#012----the-two-sides-should-not-fight-the-same-way) | done | |
| 013 | [grenadiers, barrels, snipers](technical.md#013----give-it-something-to-explode) | done | |
| 014 | [proof](technical.md#014----proof-runs-last) | done | |

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
- **2026-09-01** -- regression net built and wired into `npm run check`, which
  now runs in 9.3s. Six checks: the 52-mission soak, three on target
  acquisition, two on hut reinforcement. Golden numbers **measured** rather than
  read off `CONFIG`, and two things the spec had wrong were found in the
  measuring: `spawnAggroRange` is 260px, not the 190 written in technical.md;
  and an exact hut output is only stable when the squad is placed inside the
  hut's range but outside a rifleman's, at tile 19 -- otherwise the count
  measures the firefight (killed troopers free their slot) rather than the hut.
  Notice range is asserted as two probes either side of the radius rather than
  as the radius, which drifts a tile with idle wander.
- **2026-09-01** -- soak finding, reported not fixed: **an idle squad is wiped
  inside ten seconds on five missions at Veteran** -- Landing Ground and The
  Quarry (4.5 of 6 dead), The Drum (3.0), No Way Off (2.8), The Crevasse (1.5).
  The other 46 lose nobody. Plausibly deliberate for a hot LZ, but it is a
  cluster and the owner should see it. The soak prints the list rather than
  failing on it.
- **2026-09-01** -- **the whole batch built and running.** `npm run check` is
  green in about thirteen seconds, including a 150-second headless arena soak;
  `npm run build` drops the arena entirely (BATTLE, `arena-forest` and
  `InfluenceMap` are all absent from the production bundle, via a dynamic import
  behind `__DEV__`, the same pattern the debug panel uses).

  Five real bugs turned up in the building, and four of them were invisible for
  the first thirty seconds of a battle:

  1. **The reinforcement slot was released only for `Faction.Enemy`**
     (`combat.ts`). Harmless while every hut in the game produced for one side;
     with two sides it is a one-way ratchet, so green fielded exactly 21 men per
     battle and was then wiped at the same minute every time. It read as a
     balance problem and was arithmetic.
  2. **Grenadiers levelled the enemy's huts**, which with indestructible
     buildings unimplemented meant one side was switched off inside a minute and
     twenty men then wandered an empty map for as long as the page was open.
  3. **The influence map's "front" was the sum of both sides.** A side's own
     muster point is therefore the hottest cell on the map, so every squad was
     sent to reinforce the ground it was already standing on. Thirty-six men,
     five minutes, not a shot fired -- about one battle in five. The front is
     now `2 * min(green, red)`: zero where only one side is present, largest
     where they are mixed. That *is* a front line.
  4. **Territory-driven reinforcement was pointed the wrong way.** The plan
     argued that the side winning ground should reinforce faster and thereby
     over-extend. It is positive feedback and it runs away: measured, losses
     came out 182 to 186 -- almost exactly even -- while one side had nineteen
     men standing and the other had none, because the winner camped the loser's
     doorways. Inverted, it is a rubber band and the front oscillates. Mean
     losses across twelve seeded battles are now 137 to 136.
  5. **Hiding the sidebar left the canvas its old width** (`#stage` is a grid;
     the track stays even when its content is `display: none`), so the first
     capture drew the battle into a strip with black beside it.

  Two smaller ones found by looking at the pictures: the guide and threat arrows
  ringed the screen pointing at men nobody was playing, and spawn doorways were
  not hidden from the *other side*, only from the squad -- so the losing side
  was shot at its own doors.
- **2026-09-01** -- deviations from the plan worth recording. `spawnAggroRange`
  is 260px, not the 190 the plan claimed. Item 012's "a doctrine per side"
  needed `world.sideLevers`, which the plan did not anticipate -- one world has
  one lever set, and two sides that fight differently need two. Item 013's
  snipers are posted from `arena.ts` rather than placed on the map, because
  every unit marker in the map format spawns for the garrison and two `S` would
  have armed one side only.
- **2026-09-01** -- three follow-ups on the owner's ask, and one of them reaches
  the whole game.

  **Bodies now go away.** `CONFIG.fx.decalLife` is 30 seconds with an 8-second
  tail, for every mission as well as the arena -- previously blood, bodies and
  scorch were permanent, which is what the original does and what `fx.ts` said
  in as many words. The layer is one map-sized canvas so a single mark cannot be
  lifted off it: the renderer keeps a history and, on a half-second sweep, clears
  and re-stamps the survivors. **The fade is a dither, not alpha** -- there is no
  alpha in this renderer, so a body thins out along an ordered 4x4 Bayer mask,
  and corpse sprites are pre-worn at three levels and cached rather than being
  punched through the shared layer (which would take chunks out of whatever was
  stamped underneath). This supersedes the arena-only decal budget, which is
  gone.

  **`C` locks the camera** to the middle of the map and drops the shake; **`H`
  hides the readout.** Both persist in `settings.ts`, because they are a taste
  in how to watch and because the intro backdrop will want both on permanently
  -- a stored preference rather than a second code path. The bar names the two
  keys, and takes the note away with itself.
- **2026-09-01** -- written up for the next agent: [docs/arena.md](../../arena.md)
  is the contract, and `/arena` is the skill that loads it. The six rules in it
  each cost a real failure and four were invisible in the first thirty seconds
  of a battle, which is the argument for the headless soak in one line.
  [310-qa/intro-implementation.md](../310-qa/intro-implementation.md) covers
  turning this into the front end's backdrop -- the switches (`sealed`, not
  `spectator`), the one sharp edge (`Renderer.prepare` is per-map and
  single-instance), and four questions for the owner.
