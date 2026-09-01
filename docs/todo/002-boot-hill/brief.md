# 002 — make losing someone cost something

[001](../001-original-look/brief.md) closed the visual gap and ended with the honest note that the
largest remaining one was not visual:

> A Boot Hill: names are reissued every mission, so losing a soldier still costs
> nothing. That remains the largest gap from the original, and it is not a
> visual one.

This is that. The brief was "make it addictive, think like Rory Sutherland", and
the Sutherland reading of Cannon Fodder is that its hold on people was never
mechanical. Everyone dies in one hit on both sides; that is a rule, not a hook.
What people remember is that the pixels had names and that the hill got taller.
That is a placebo — an entirely cosmetic layer generating entirely real grief —
and this prototype had the simulation and none of it.

So almost nothing here is new simulation. It records what already happened,
names it, and shows it back.

## Done

- **Boot Hill** — [`boothill.ts`](../../../game/src/ui/boothill.ts). A cross per man
  lost, laid out deterministically from the name so a grave stays where you left
  it. Reachable from the mission select and from the end-of-mission panel. It
  has no gameplay effect at all, which is the point of it.
- **The roster persists** — [`campaign.ts`](../../../game/src/sim/campaign.ts). One
  record under one key. It is the only module in the game permitted to remember
  anything, so the whole meta-game can be reasoned about, tested and wiped in
  one place.
- **A name is never reissued.** Once JOOLS is on the hill no later recruit is
  called JOOLS. This is the single most important rule in the file — a reissued
  name is exactly what was turning casualties back into counters.
- **Promotions** — `Soldier.rank` had been declared, documented and read by
  nothing at all since it was written. It now means what its comment always
  claimed: missions survived. Rank buys a real edge in the firing solution
  (`veteranEdge` in [`troops.ts`](../../../game/src/sim/troops.ts)), tuned by
  `CONFIG.veteran`, interpolated across the ladder rather than stepped.
- **Ribbons** — difficulty stopped being a preference and became a record. Four
  slots on every mission card, lit for each difficulty cleared.
- **Your own par** — best brought home and fastest clear, on the card and live
  in the sidebar during play. No leaderboard and no server: one self-referential
  number, so a finished mission stays an open loop.
- **The one name** — the player may rename one soldier, once, for the whole war.
- **21 headless assertions** over the campaign
  ([`test/campaign.test.mjs`](../../../game/test/campaign.test.mjs), wired into
  `npm run check`) and 12 more through a real browser in `npm run playtest`.

## The decisions worth arguing with

**Only a win is written.** Losing costs you the mission and nothing else — no
graves, no lost promotions. Dread is what makes a player careful; confiscating
an evening's progress is what makes them stop. The anticipation does the work,
so the punishment does not have to. The end panel says so out loud, because a
player who *thinks* a retry is expensive plays as though it is.

**Rank is a real edge, not a label.** A rank that only changed a plate would
make the sidebar prettier. A rank that changes the odds makes *who do I send
across the open ground* a question — a veteran's better chances against a
veteran's worse loss. That is the whole game in one click.

**One rename, not six.** Scarcity is what turns an act into a ceremony. Rename
everyone and it is a settings screen; rename one man and it is a decision you
remember making when that name turns up on the hill.

**Ribbons rather than locks.** `Theatre.locked` was built for this and is still
unwired, deliberately. A locked thing you cannot see is not a goal. Four ribbon
slots with two of them dark, on a card you are already looking at, is.

## Not done

- **The after-action map** — where each man fell, and the route walked. The
  decal layer already holds the corpse positions and the shot harness already
  frames a whole map, so this is mostly assembly. It is the best remaining
  idea: it turns a loss from a frustration into a lesson.
- **Dispatches** — an occasional, unpredictable citation for one soldier.
  Wants per-soldier kill attribution, which is the only real plumbing left.
- **Phased missions** — the original's missions ran 2–3 phases deep with no menu
  between them, so the natural quit point kept receding.
- **Hit-stop, hit flash, and audio that falls off with distance.** A shot across
  a 220-tile map is still exactly as loud as one beside you.

## Blocked, and not by this work

`npm run check` and the back half of `npm run playtest` fail on a **separate,
unfinished responsive/touch refactor** — `layout.ts`, `settings.ts`,
`pointer.ts`, `aim.ts` and a rewritten `input.ts`, none of which
[`main.ts`](../../../game/src/main.ts) or [`game.ts`](../../../game/src/sim/game.ts) were
updated for. At runtime `this.layout` is undefined inside `Input`, which throws
every frame and takes the HUD down with it.

It was already failing before this work started, and finishing it means deciding
what the new `select` and `recentre` commands should *do* — squad splitting is a
design question, not a wiring one. Left alone on purpose.

Outstanding there: `config.camera.zoom` has to become
`{ targetWorldW, targetWorldH, min, max }`; `main.ts` has to build a `Layout`
and hand it to `Input`; `game.ts` has to handle the new `Command` union.
