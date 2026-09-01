# 010 -- no way off: enemies start on top of us; make it a rule

> no way off
> starts with the enemy RIGHT next to us
> we need a rule in the map stuff so there is a distance so at least we can get out of the way quickly and not all die instantly. it's ok if they are close but this is too close!
> check all other maps and also fix this
> and fix the map skill and builder

## Findings

- **No Way Off is as bad as it felt.** The nearest `E` stands **3.6 tiles**
  from a squad `P`, inside veteran garrison aggro (11.3t) *and* inside rifle
  fire range (6.2t) before anyone moves; 3 riflemen + 1 sniper are inside
  aggro at t=0. Landing Ground ([014](014-landing-ground-start.md)) is 6.0
  tiles -- and its closest post is `enemySpawns[0]`, the first anchor the
  veteran `extraEnemies` loop doubles, so veteran can put a second man ~3.6
  tiles out.
- **There is no rule.** `generate-levels.mjs` `validate()` (`:2305-2419`)
  and `test/map.test.mjs` check squad count, legality, reachability, and an
  8-tile clearance for `nokill` maps only. Nothing compares `P` to enemy
  positions on ordinary maps. `docs/map-format.md` gives aggro radii as
  guidance only; the `/map` skill says nothing about distance.
- The hand builders that thought about it chose **11-12 tiles** (softly
  softly `clearOf(x, y, 11)` "a rifleman's aggro radius is 132px";
  not-a-sound "Twelve tiles, not eight").

## Classification

New work (a validator rule) + broken maps found.

**Decision (Q3, answered 2026-09-01): option 1** -- 12 tiles minimum, every
map, enforced by the checks.

## Plan (one sitting)

1. Add the rule to `validate()` in `generate-levels.mjs` AND to
   `test/map.test.mjs` (hand-written maps like the sink bypass the
   generator, so the test is the real gate): every `E`/`S`/`B`/`C` at least
   N tiles from every `P`.
2. Run it, list every failing map, fix them: generated maps via the
   placement grammar (enemy hubs must respect the squad spawn), hand maps by
   moving the offending markers. `npm run levels` + `npm run check`.
3. Document the rule in `docs/map-format.md` (with the aggro table it
   already carries) and in `.claude/skills/map/SKILL.md`'s checklist.

## Done when

- `npm run check` fails if any map places an enemy closer than the Q3
  distance to a squad spawn, and currently passes on all fifty maps.
- No Way Off's opening survives standing still for 3 seconds on veteran
  (playtest) -- close pressure is fine, instant contact is not.
- map-format.md and the /map skill both state the rule.
