# 006 — spec

The brief is [006.md](brief.md). This is that brief read against the code: what is
already true, what the brief gets wrong, what each item actually costs, and how
anyone can tell when it is done. Four decisions were taken by the owner up front
and are recorded in place.

The brief asks for twenty more maps. The finding that matters is that **the
bottleneck is not the map format, which is in good health — it is that
`generate-levels.mjs` is not a generator.** It is twelve hand-written functions
sharing one skeleton. Most of what follows is fixing that.

The brief's last item turns out to be the most valuable one in it. "It cannot
put map ideas together that won't work" is not a documentation note — it is a
missing concept in the code, and naming it makes `covert` stop being a special
case. See B1.

**All four batches are done**, and the only work left in this document is the
three blind visual judgements — B6, C1 and D1 — which the owner is taking,
because the person who built something cannot be the one to say whether it
reads. Seven things turned out differently from the spec
and are recorded where they happened: the collect objective needed its own type
rather than reusing `Crate` (B5), the officer is cheap but `rooted` like a
sniper (B6), the grammar does not generate `nokill` maps (C1), `shoot.mjs` was
already broken at HEAD *and* was photographing the wrong sidebar (D3), the level
select had to learn about modifiers to state them before you pick a mission
(D3), and the sixteen grammar rows needed exactly one seed reroll between them
(C2), which is the only evidence that reroll does anything. Seventh, and outside
this spec entirely: writing maps on sand exposed that **every entity marker
stamped a grass tile under itself**, which put one hard-edged square per entity
into every desert and arctic map. Markers now inherit the ground they stand on;
isolated tiles across the campaign fell from 113 to 38.

| Batch | Contents | Why here |
|---|---|---|
| **A** | The documentation, and the `/map` skill | One or two sittings, and it unblocks the owner, an outside agent, and every batch after it. |
| **B** | Objective modifiers and four new objectives | The grammar's table names objectives and modifiers; they have to exist before a table can mix them. |
| **C** | The layout grammar, seed rerolling, the demolition fill | The machinery. Nothing ships to a player from this batch. |
| **D** | The twenty maps, and the four set pieces | What all of the above was for. |

Four batches, and **this is not one sitting.** Batch A is one sitting for the
docs and one for the skill. B is roughly one per item. C is the largest single
piece of work in the brief. D is cheap in code and expensive in playtesting.

---

## What the code already says

Eleven claims in the brief were checked against the code. Eight hold, two are
imprecise, and one is wrong in a way that changes the work.

### The brief is right about

**`generate-levels.mjs` is not a generator.** [`BUILDERS`](../../../game/tools/generate-levels.mjs#L456)
is twelve functions keyed by mission id, and [`CAMPAIGN`](../../../game/tools/generate-levels.mjs#L969)
is twelve rows that select one. Every builder runs the same skeleton — `frame`
then `forest`/`scatter`, then `clearing`, `squad`, and scattered entities — and
every terrain primitive places blobs at uniformly random positions. There is no
primitive that produces a *shape*. Twenty more rows in the current table would
genuinely be twenty recolours of one wood.

**The man-made river already works.** Verified by running the shipped `river()`
with `wobble: 0` and four crossings:

```
TTT................=========...............TTT
TTT................,~WWWWW~,...............TTT
TTT................,~WWWWW~,...............TTT
TTTT...............=========................TT
```

A dead-straight deep channel with four evenly spaced two-tile bridges, and
`frame()` and `smooth()` both leave it alone. So hard-edged geometry is not a
limitation of the system; it has simply never been asked for. What is missing is
the *other* man-made primitives — there is no `wall()`, `compound()`,
`streets()`, `trench()` or `pier()`.

**Crates only give grenades.** [`pickups.ts`](../../../game/src/sim/pickups.ts)
sets `crate.alive = false` and adds `CONFIG.grenade.perCrate`. There is no
collect objective and no notion of an objective item.

**The hostage delivery machinery is reusable.**
[`hostages.ts`](../../../game/src/sim/hostages.ts) is free, then follow, then
delivered at a tent, and [`objectives.ts`](../../../game/src/sim/objectives.ts)
reports it as `done/total`. The progress and delivery shape transfers to a
collect objective cleanly. The movement does not — and since the owner chose
collect-on-touch, none of the follow steering is needed. See Decision 2.

**Deep water is swimmable now**, and the doc still says impassable.
[`tiles.ts:95`](../../../game/src/sim/tiles.ts#L95) gives `DeepWater` `swim: true`
with `wade: true` and `speed: 0.34`, and `map.test.mjs` proves a swimmer's route
prices a water tile at four. Nothing in the campaign is built around it.

**The docs have rotted, further than the brief says.** Seventeen links across
[`design.md`](../../design.md) and [`map-format.md`](../../map-format.md) point at
`game/src/<name>.ts` paths that have not existed since the 003 reorganisation.
Only `config.ts` and `loop.ts` still resolve. Two of the seventeen are
*ambiguous* rather than merely moved, and cannot be fixed by search-and-replace:

- `buildings.ts` is now both `sim/buildings.ts` (the model) and
  `render/sprites/buildings.ts` (the sprite). `design.md#L167` means the first.
- `terrain.ts` is now both `render/terrain.ts` (derived shape data) and
  `render/sprites/terrain.ts`. `design.md#L225` and `map-format.md` mean the first.

**Incompatible combinations are real, and one is already hard-coded.** `covert`
is not an objective in its own right — it is `reach` plus a rule. It shares
`reach`'s entire evaluation ([`objectives.ts`](../../../game/src/sim/objectives.ts),
`case 'covert': case 'reach':`) and adds one line to `isFailed`. So the fused
value `covert` is the single point in the design where the brief's insight has
already been half-implemented, badly: as a new objective name rather than as a
modifier that could sit on any objective. B1 is where that gets paid off.

### The brief is imprecise about

**"Quicksand, ice and fence appear once each."** Fence appears twice (the
village compound, the Last Stand wire), ice three times (Ice Station, Last
Stand, the test range), quicksand twice (Minefield, the test range). The
substantive point stands — none of them is ever *the thing a level is about* —
but the counts are wrong and the spec should not repeat them.

**"Assassinate — the original had this."** I could not verify it. Nothing in
[`research.md`](../../research.md) mentions a leader or officer target, and I am
not confident enough in the original's mission list to assert it. Built, it is
our idea, not a restoration. Specced on that basis.

### The brief is wrong about

**"A map whose only route is through a hut costs no new code."** It does not,
and as written it would be rejected by the gate.
[`reachableFrom`](../../../game/test/map.test.mjs#L73) floods using `isSolidAt`
([line 89](../../../game/test/map.test.mjs#L89)), and `Hut`, `Factory` and
`Outpost` are all `solid: true`. The generator's own
[`reachable()`](../../../game/tools/generate-levels.mjs#L208) excludes them by name
in the same way. The demolition *effect* is real —
[`collapse()`](../../../game/src/sim/buildings.ts#L216) does set every tile of a
levelled building to `Rubble` — but any map depending on it fails
`the objective is actually completable` before a player ever sees it. It needs a
second flood fill and a declared map property. See Decision 4 and C3.

### Facts worth having before the work starts

- **Adding an objective touches six lists**, not one: the `ObjectiveKind` union
  and the `OBJECTIVES` array in [`map.ts`](../../../game/src/sim/map.ts), the
  `evaluate` case and `OBJECTIVE_TEXT` in
  [`objectives.ts`](../../../game/src/sim/objectives.ts), the allowed list at
  [`map.test.mjs:229`](../../../game/test/map.test.mjs#L229), and the `need` map at
  [`generate-levels.mjs:1099`](../../../game/tools/generate-levels.mjs#L1099).
  Anything with a fail condition also needs a hook in `isFailed`. The UI is
  loosely coupled — `OBJECTIVE_TEXT` lookups plus two special cases in
  [`hud.ts`](../../../game/src/ui/hud.ts#L198).
- **`npm run check` already validates hand-written maps.**
  [`map.test.mjs:98`](../../../game/test/map.test.mjs#L98) reads *every* `.map` in
  `data/`, not only generated ones. This is what makes the outside-agent
  workflow in A3 and the `/map` skill real rather than aspirational.
- **The covert validator is the model for every spatial rule.** Both
  [`generate-levels.mjs:1132`](../../../game/tools/generate-levels.mjs#L1132) and
  `map.test.mjs` already prove, on the finished grid, that a route to the
  extraction exists that never enters a sentry's aggro radius. The brief's "we
  can't have the enemy standing next to the hostage" is that same check pointed
  at a different entity. The hard part is already written.
- **The generator does not reroll a failing seed.** `main()` reports the problem
  and skips the file. Fine for twelve hand-tuned missions; useless for twenty
  generated ones. See C2.
- **Campaign progress is keyed by mission id** in a `records` map, with no
  unlock chain. Twenty new maps add twenty unplayed entries and break nothing
  saved. The level select groups by theme into three theatres and sorts by
  `order:`, so new maps file themselves.
- **A new enemy kind is small.** `EnemyKind` has three members; a fourth needs a
  twelve-colour palette beside [`paint.ts:78`](../../../game/src/render/sprites/paint.ts#L78),
  a `bakeUnit` line, an atlas field, a stats entry at
  [`world.ts:81`](../../../game/src/sim/world.ts#L81), a spawn array, and a marker.
  Note [`world.ts:183`](../../../game/src/sim/world.ts#L183): everything that is
  not `Rifle` is `rooted`.
- **Twenty more maps quadruples `npm run shots`.**
  [`shoot.mjs`](../../../game/tools/shoot.mjs#L115) iterates `/api/maps` with no
  filter.

---

## Decisions taken

1. **Hybrid authoring.** A layout grammar produces the bulk; roughly four maps
   stay hand-written builders in the existing style, for the shapes a human
   should choose. The grammar does not have to be able to express a set piece.
2. **Collect is collect-on-touch.** Walk a soldier over every objective box and
   the mission is won. No carrying, no dropping, no delivery leg. Chosen
   deliberately over the carried variant.
3. **All four objective items ship**: `collect`, `hold`, a `timelimit:` header,
   and `assassinate` — including the officer sprite and enemy kind.
4. **The rubble puzzle is allowed, and must be declared.** The completability
   gate gains a second fill that treats destructible buildings as passable. A
   map passes if the strict fill reaches the objective, *or* if the demolition
   fill does **and** the map declares itself demolition-gated. A map that only
   passes the second without declaring it fails, so it can never happen by
   accident.

---

## Batch A — the documentation, and the skill — **DONE**

Nothing here changes the game, and everything after it is easier. A1–A3 are one
sitting; A4 is a second.

### A1. Fix the seventeen broken links

`design.md` and `map-format.md` link to pre-003 paths. Repair them, resolving
the two ambiguous names by what the surrounding prose is talking about
(`sim/buildings.ts` at `design.md#L167`, `render/terrain.ts` at `#L225` and in
`map-format.md`).

**Done when** every relative link in `docs/*.md` resolves to a file that exists,
proved by a link check that can be re-run — a short script, not one careful
read. It should cover `docs/` as a whole, so the next reorganisation is caught.

> **Done.** [`check-links.mjs`](../../../game/tools/check-links.mjs), in
> `npm run check`. It found **thirty**, not seventeen — the earlier count came
> from grepping one path shape. It also checks heading anchors, which found two
> more the file-path sweep could not see.

### A2. Bring `map-format.md` up to the code

Missing or wrong, all confirmed against the source:

| Item | Where it really is |
|---|---|
| `covert` objective | Shipped, has a mission, has its own validator |
| `O` — outpost tile | [`tiles.ts:123`](../../../game/src/sim/tiles.ts#L123); `role: 'protect'`, mission lost if it falls |
| `doctrine:` header | Five values in [`difficulty.ts`](../../../game/src/sim/difficulty.ts#L137) |
| `waves: 5@22` header | Parsed and tested |
| `squad:` header | Clamps downward; how Lone Wolf exists |
| `dev:` header | Read by [`server.js`](../../../game/server.js#L64), not by the parser |
| `W` "Impassable" ([line 76](../../map-format.md#L76)) | Swimmable: slow, no firing, shots still cross |
| Campaign table lists 8 | There are twelve |

Plus the three things that would make an outside model get a map wrong, none of
which the doc currently says:

- **Scale.** The worked example is 24x5. Shipped maps are 53 to 220 wide and 30
  to 97 tall. State the range and why — 16px tiles at zoom 3.
- **Density.** No isolated single tiles: say that `smooth()` exists to dissolve
  them and that a hand-written map does not get that pass. Do not draw a uniform
  rectangular border; say what `frame()` does and why a ruler-straight inner
  line is the thing you notice.
- **Reachability.** An organic treeline seals pockets. Say that `npm run check`
  flood-fills and will reject it, so the reader knows the loop exists.

**Done when** a reader who has only this file can name every header key and
every legend character the parser accepts, with no key or character in the code
absent from the doc — checked by a test that compares the doc's tables against
`LEGEND`, `MARKERS` and the header keys `parseMap` reads, and fails when they
drift. That test is what stops this batch being needed a third time.

### A3. A design section: creativity, puzzles, and what cannot combine

New to the doc, and the part the `/map` skill leans on. Three sections.

**Read the existing maps first.** Name them and say what each one is *for* — the
one new idea it exists to teach. A model writing map thirty-three needs to know
that Undergrowth is about sight versus shots and Minefield is about clearing a
lane, or it will write Chicken Run again with different trees.

**Puzzle levers that are in the sim and unused.** State them plainly, because
none is discoverable from the legend: rubble makes a levelled building into a
route; a fence blocks movement and bullets but *not* sight, so you can watch
what you cannot shoot; deep water is crossable by swimming but you cannot fire
while doing it; tall grass is the inverse of a fence; ice ruins steering;
quicksand is a trap you can see; a gunshot draws a garrison to where the round
*landed*, which makes a decoy possible.

**What cannot combine.** The brief's point, and it needs to be a table, not
prose, because a table is what a model checks itself against. The shape of it:

| | Works | Does not |
|---|---|---|
| `nokill` | `reach`, `rescue`, `collect`, `hold` | `eliminate`, `assassinate`, `demolish`* |
| `timelimit` | anything | `survive` (it already has a clock) |
| `waves` | `survive`, `hold`, `demolish` | `covert`/`nokill` — reinforcements walk into your lane |
| `protect` outpost | anything | — |

\* `demolish` is arguable and should be decided when B1 is built: buildings are
not people, and levelling an empty hut kills nobody. Recommendation: allow it,
and let the *spatial* rule below do the work — a hut with a sentry beside it is
a hut you cannot bring down quietly.

And then the rule the brief actually cares about, which is spatial rather than
combinatorial: **on a `nokill` map, every objective entity must be reachable by
a route that never enters a sentry's aggro radius, and must not itself sit
inside one.** A no-kill rescue where a rifleman is standing next to the hostage
is not a hard mission, it is an unwinnable one. This is B2, and it is the covert
validator pointed at hostages and boxes instead of at the extraction zone.

**Done when** the table names every pair the validator actually rejects, and no
pair it does not — the doc and `npm run check` agreeing is the whole point, and
a doc that forbids something the code allows is as bad as the reverse.

### A4. The `/map` skill

`.claude/skills/map/SKILL.md`, checked in like the other seven so it works for
anyone who clones this. It writes one new mission, by hand, as a `data/*.map`
file — the counterpart to the generator, for when a person or a model has an
idea rather than a seed.

What it must do, in order:

1. **Read `docs/map-format.md`** — the whole thing, not from memory. That file
   is the contract and A1–A3 exist to make it worth reading.
2. **Read two or three existing maps** in `data/`, chosen for relevance to the
   idea, so the new one matches the density and scale of what ships.
3. **State the idea before drawing**: the one new thing this mission is about,
   its objective and modifiers, and — checked against the compatibility table —
   why that combination is playable.
4. **Draw it**, then **run `npm run check`**, then fix what it says and run it
   again. The skill is not done at the first green: it also runs the mission in
   `/playtest` and confirms it can actually be won, because completable and
   winnable are not the same claim.
5. **Never touch `CAMPAIGN`.** A hand-written map lives in `data/` and is lost
   the moment somebody runs `npm run levels` if it shares an id with a generated
   one. The skill must say this and pick a non-colliding id.

The skill inherits this project's standing rules rather than restating them: run
your own server on another port, never 5199; and do not critique your own map in
the session that drew it — that is `/grill`'s job.

**Done when** `/map` invoked with a one-line idea produces a map that passes
`npm run check` and is completed under `/playtest`, without the invoker editing
the file by hand; and when invoked with a deliberately contradictory idea ("kill
everyone without killing anyone") it refuses and says which rule in the table it
would break, rather than producing something that compiles.

> **Done, both halves.** Invoked with a real brief it produced four missions --
> Behind the Wire, Throw Your Voice, Swim For It and The Sink -- each built
> around a mechanic the doc lists and nothing shipped uses as its point. All
> four pass `npm run check` and all four were driven to a win. The loop did its
> job on the way: the first draft of Throw Your Voice buried a supply box inside
> a copse, the check said so, and it was moved.
>
> The refusal half was proved separately with a deliberately contradictory map
> (`objective: eliminate` with `nokill: true`), which fails the build naming
> both halves rather than compiling into something unplayable.

---

## Batch B — objectives and modifiers — **DONE**

Five items. Each is independently shippable and revertable. B1 comes first
because it changes the shape the other four are written into.

### B1. Modifiers, and `covert` becomes one of them

Today `covert` is `reach` plus a no-kill rule fused into one objective value.
That is why the brief's "kill nobody and get the hostages" has nowhere to live:
there is no `rescue`-shaped covert, and adding one would mean a `covert-rescue`
value, then a `covert-collect` value, and so on.

Split it. `objective:` stays one value; a `nokill: true` header is a *modifier*
that composes with it. `covert` is kept as an alias for `objective: reach` plus
`nokill: true`, so the shipped mission file and anything that reads it keep
working unchanged.

Then a compatibility table, in code, consulted by the parser and by both
validators: some pairs are contradictions and must be rejected loudly at load,
in the same spirit as an unknown map character. `eliminate` with `nokill` is the
obvious one and it should fail with a message naming both, not fall back to a
default the author did not ask for.

**Done when** Softly Softly is byte-identical after `npm run levels` and plays
exactly as before; `objective: rescue` with `nokill: true` parses, plays, and is
failed by a kill; `objective: eliminate` with `nokill: true` is rejected by
`npm run check` with a message that names the contradiction; and the table in
A3 and the table in code are the same table.

### B2. The spatial rule for `nokill` maps

Generalise the covert validator. On any map with `nokill`, every objective
entity — extraction zone, hostage, objective box, hold zone — must sit outside
every sentry's aggro radius, and must be reachable by a route that never enters
one. Proved on the finished grid in both `generate-levels.mjs` and
`map.test.mjs`, as covert already is.

**Done when** a hand-made `rescue` + `nokill` map with a rifleman placed beside
a hostage fails `npm run check` naming that hostage; the same map with him moved
eight tiles away passes; and Softly Softly still passes unchanged.

### B3. `timelimit:` header

A header, not an objective kind: any mission may declare `timelimit: 180`, and
when the clock runs out the mission is lost. Fails through the shared `isFailed`
hook so it composes with everything. Distinct from `duration:`, which is
`survive`'s win condition — per the A3 table the two are a rejected pair.

**Done when** a `reach` map with `timelimit: 60` is lost at sixty seconds with
the squad alive and short of the zone; the HUD shows a counting-down clock on
any map that declares one; and a map declaring both `timelimit` and `survive` is
rejected rather than silently preferring one.

> **Done**, proved in the running game on The Narrows: lost with six men alive,
> and the panel says the clock ran out rather than claiming a wipe-out. The
> clock was showing but **labelled "hold"**, which is the survive wording and
> the opposite of what a race is asking; it now reads "time left".

### B4. `hold` — hold ground

Stand in a zone for N seconds. Reuses `CONFIG.extraction.radius` for the zone
and the `survive` timer for the count. The distinction from `survive` is that
the clock only runs while somebody is inside it.

**Done when** the HUD reads `hold 0:42` and stops the moment the last soldier
steps out; leaving and returning resumes rather than resets; and the mission is
won when the count reaches the declared duration.

> **Done**, proved on Hold the Junction: the clock runs while the zone is
> occupied, stops on the frame the last man leaves, and holds its count rather
> than resetting.

### B5. `collect` — the boxes

A new marker for an objective box, distinct from `c` so an ammo crate stays an
ammo crate. Walking a soldier within pickup range collects it; won when every
box is collected. Per Decision 2 there is no carrying and no delivery leg.

The box needs its own generated sprite. It must not read as an ammo crate — the
two do different things and will sit on the same map.

**Done when** the HUD reads `3/5 recovered`; a box is collected by contact and
cannot be collected twice; an objective box destroyed by anybody fails the
mission through an `isFailed` hook, exactly as a dead hostage does; and
`npm run check` rejects a `collect` map with no boxes or with one behind a wall.

> **Done**, proved on Through the Wall: walking a man onto a box recovers it and
> the sidebar reads `1/4 recovered`; destroying an uncollected box ends the
> mission on the spot.

> **Decided: no.** A supply box is its own type (`Supply`), not a `Crate`. It
> does not explode and does not give grenades. A blast destroys it and ends the
> mission; a *bullet* does not, because making every stray round a mission-ender
> turns a `collect` map into a mission about not shooting near the objective,
> which is a worse game than one about getting to it. A grenade is a decision,
> and a decision is allowed to cost you.

### B6. `assassinate` — the officer

A fourth `EnemyKind` with its own palette, sprite and marker, and a win
condition of "the officer is dead". Everything else on the map is optional.

The officer is `rooted` by default like the sniper and bazookateer
([`world.ts:183`](../../../game/src/sim/world.ts#L183)). Making him run when the
shooting starts is a better mission and is deliberately *not* in this item.

**Done when** an officer is distinguishable from a rifleman at normal zoom by
someone who was not told what changed — judged by `/grill`, not by whoever drew
him — the mission ends the moment he dies whoever killed him, and `npm run check`
rejects an `assassinate` map with no officer or with two.

> **Half done.** The mission ends the instant he dies (proved on The Coil), and
> the validator holds every `assassinate` map to exactly one officer. **The
> blind judgement of whether he reads as an officer has not been run** — that
> needs `/grill`, and the person who drew him cannot be the one to say.

---

## Batch C — the layout grammar — **DONE**

The largest piece of work in the brief, and the one nothing ships from. Worth
saying plainly: **this batch produces no new map a player can see.** It is
justified entirely by batch D being a table afterwards instead of 1400 lines.

### C1. Layouts as an axis separate from dressing

A `LAYOUTS` table beside `BUILDERS`. A layout lays down the *skeleton* — where
the impassable mass is, where the routes are, where the chokepoints are — and
returns the anchors a mission needs: a spawn, a far end, and the places worth
defending. Dressing (theme foliage, hazard scatter, verges) and population
(objective entities, garrison) become separate passes reading those anchors.

Ten shapes, from the brief: gauntlet, island, ring-siege, delta, canyon, coastal
strip, crossroads town, spiral compound, ridgeline, causeway chain.

Existing primitives — `river`, `road`, `frame`, `smooth`, `blob`, `clearing`,
`building`, `Placer` — are reused unchanged. The twelve existing builders **stay
exactly as they are**: they are the shipped campaign, they are tuned, and
rewriting them into the grammar risks twelve regressions to prove a point about
tidiness.

**Done when** each of the ten layouts, generated at three seeds and rendered, is
identifiable as its own shape by someone shown only the pictures and the list of
ten names — `/grill` or `/gauntlet`, not the author. That is the point of the
batch and the only acceptance test that matters. A grammar whose outputs cannot
be told apart has failed even if it compiles.

> **Built, and not yet judged.** The ten layouts exist and were eyeballed as
> ASCII by the author, which is exactly the check this criterion says does not
> count. **The blind judgement has not been run** — it needs `/grill` or
> `/gauntlet` and is the outstanding item on this batch.
>
> One scope call: **the grammar does not generate `nokill` maps.** Placing a
> garrison that provably cannot see a route needs the lane-first construction
> Softly Softly and Not a Sound use, and folding that into `populate` would have
> made every layout carry it. No-kill missions stay hand-written.

### C2. Seed rerolling

`main()` currently reports a failing seed and skips the file. Wrap generation in
a bounded retry: on validation failure, bump the seed and try again up to a cap,
and report which seed was finally used.

The reroll must be **deterministic** — seed *n* failing must always land on the
same *n+k* — or `npm run levels` stops being reproducible, which is the property
the whole table is built on. The retry count must be *reported*, because a map
that took forty seeds is telling you its layout and objective do not fit.

**Done when** `npm run levels` is byte-identical across two consecutive runs
including rerolled maps; a deliberately impossible spec fails with a clear
message after the cap rather than looping; and the output names the seed each
map actually used.

### C3. The demolition fill

Per Decision 4. A second flood fill treating `Hut` and `Factory` as passable —
**not** `Outpost`, which is the squad's own and must never count as a route
through. A map passes if the strict fill reaches its objective, or if the
demolition fill does and the map declares itself demolition-gated.

This lands in both places that flood-fill, and they must agree: the generator's
[`reachable()`](../../../game/tools/generate-levels.mjs#L208) and the test's
[`reachableFrom()`](../../../game/test/map.test.mjs#L73).

**Done when** a hand-made map whose only route runs through a hut fails
`npm run check` without the header and passes with it; every existing map still
passes unchanged; and the build output names which maps are demolition-gated, so
it is never a silent property.

> **Done**, and the reporting half was missed on the first pass and caught by
> re-reading this criterion: the build was silent about gating. It now tags
> `[demolition-gated]` and `[no-kill]` beside the mission. Through the Wall
> reports four unreachable supply boxes without the header and passes with it.

### C4. Man-made primitives

`wall()`, `compound()` (a walled yard with gates), `streets()` (a road grid with
buildings in the blocks), `trench()`, `pier()`. Five short functions, hard-edged
where everything else is organic. `smooth()` already leaves non-soft terrain
alone, so it should not round their corners off — confirm that rather than
assume it, because a quietly smoothed compound wall is exactly the kind of
failure that is invisible in the source.

**Done when** a generated compound reads as built rather than grown, and
`smooth(2)` provably leaves every wall tile it placed intact.

---

## Batch D — the twenty maps — **DONE**

### D1. Sixteen from the table

Sixteen rows of layout, theme, objective, modifiers, doctrine and seed — spread
so every layout appears at least once, every objective at least twice, and each
theme carries a comparable share.

Each still needs a `name`, a `brief` and a `mechanic` written by a human. The
grammar generates terrain; it does not generate a reason to play a level, and a
mission whose brief is autogenerated will read like one.

**Done when** all sixteen pass `npm run check`, all sixteen are completed at
least once under `npm run playtest`, and no two are mistaken for each other by
someone shown the screenshots cold.

> **Two of three.** All thirty-two pass `npm run check`, and **all twenty new
> missions were driven to a win** in the real game — each objective satisfied on
> that map's own contents, with the right status line at the end. That proves
> the objective is wired to the map; it is not the same as a human playing it
> through. **The blind screenshot comparison has not been run.**

### D2. Four set pieces, hand-written

The maps that should have a shape a person chose. From the brief: the straight
canal with four bridges, and a walled town. The other two are the builder's
choice from the unused levers in A3 — the fence you can see through but not
shoot through, the swimmable channel, the decoy gunshot, or a demolition-gated
route now that C3 makes it legal.

At least one should be a `nokill` map with a non-`reach` objective, because that
is the combination B1 and B2 exist to make possible and it should be proved by a
mission rather than by a test.

**Done when** each of the four is winnable by a route the author can describe in
one sentence, and each uses at least one mechanic no shipped map currently
builds a level around.

### D3. Fold the cost back in

Thirty-two maps roughly quadruples `npm run shots`. Decide whether that tool
grows a filter or simply takes longer, and record the answer. Look at the level
select with all thirty-two present — the number-key shortcut only reaches nine,
which was fine at twelve and is a visible gap at thirty-two.

**Done when** `npm run check` and `npm run shots` both pass over the full set,
and the level select has been looked at with everything in it.

> **Done, and it found two real bugs in the capture tool rather than a cost
> problem.** `shoot.mjs` was already broken at HEAD — verified in a clean
> worktree — because a single Escape stopped returning to the mission list when
> the pause sheet was added, so every run died on its second mission. Nothing
> caught it: `npm run check` does not run this tool.
>
> Worse, it force-hid the briefing overlay instead of dismissing it, which left
> `hud.briefingUp` true, which makes `hud.update()` return early — so every shot
> carried the **previous** mission's name, squad and objective beside the new
> map's terrain. That is exactly the failure [loop.md](../../loop.md) is a record
> of, and it was found by reading a screenshot that looked fine. Both fixed; the
> capture now waits until the panel names the mission it is photographing.
>
> `--only` takes a comma-separated list, which is the filter this item asked
> about. The level select needed a real change: it reads raw headers through
> `summarise`, so a `nokill` rescue advertised only half of what it was asking.
> Modifiers now reach the menu and the card states the rule before you pick it.

---

## Scale, honestly

Batch A is two sittings and worth doing on its own even if nothing else here is
ever built — A4 in particular changes how every future map gets made. Batch B is
roughly one sitting per item, and B1 should not be rushed because four other
items are written into the shape it chooses. Batch C is the real work; C1 alone
is larger than anything in 003 or 004, and it is the batch most likely to feel
like a disappointment, because its output is machinery rather than a level.
Batch D is cheap in code and expensive in playtesting.

If only part of this gets built, **A and B are worth having without C and D.**
C and D are not worth having without A, because the grammar should be written
against a doc that is true.

## What I will not do

- **Rewrite the twelve existing builders into the grammar.** They are the
  shipped campaign and they are tuned. The grammar is for new maps.
- **Claim `assassinate` is a restoration.** It is our idea until somebody
  verifies otherwise, and neither the brief text nor the mission text should
  imply provenance the research does not have.
- **Let `/map` write into `CAMPAIGN`.** Hand-written and generated maps share
  one directory and one validator, and that is fine — but a hand-written map
  that acquires a generator entry is a map that will be silently overwritten.
- **Generate maps before A2 and A3 are done.** A model writing maps against a
  doc describing a five-objective, sixteen-tile game that no longer exists is
  the specific failure this batch order is arranged to prevent.
