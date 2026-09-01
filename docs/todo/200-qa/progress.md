# Progress -- 200-qa

One line per issue. Mark **in progress** before touching one; mark **done**
with the commit hash when it lands. One issue, one commit, via `/commit`.

| # | issue | status | commit |
|---|---|---|---|
| 001 | [sink-no-spawn](001-sink-no-spawn.md) | done | 9c841c6 |
| 002 | [mud-render](002-mud-render.md) | open | |
| 003 | [veteran-balance](003-veteran-balance.md) | done | 98ec576 |
| 004 | [house-circle](004-house-circle.md) | open | |
| 005 | [idle-face-mouse](005-idle-face-mouse.md) | done | 28e117b |
| 006 | [factory-sprite](006-factory-sprite.md) | open | |
| 007 | [cabin-white-line](007-cabin-white-line.md) | done | fd329dd |
| 008 | [hut-door](008-hut-door.md) | open | |
| 009 | [tent-sprite](009-tent-sprite.md) | open | |
| 010 | [spawn-distance](010-spawn-distance.md) | done | f30507e |
| 011 | [cold-keep-note](011-cold-keep-note.md) | done -- no work, noted | |
| 012 | [narrows-harder](012-narrows-harder.md) | open | |
| 013 | [timer-clarity](013-timer-clarity.md) | done | d043054 |
| 014 | [landing-ground-start](014-landing-ground-start.md) | done -- via 010 | f30507e |
| 015 | [veteran-fire-range](015-veteran-fire-range.md) | done | 92b72ca |
| 016 | [patrols](016-patrols.md) | done | (see log) |
| 017 | [through-the-wall](017-through-the-wall.md) | open (after 010, 016) | |
| 018 | [not-a-sound-variant](018-not-a-sound-variant.md) | open (after 010, 016) | |
| 019 | [narrows-forest](019-narrows-forest.md) | open | |
| 020 | [swim-for-it](020-swim-for-it.md) | done | (see log) |
| 021 | [sink-waves](021-sink-waves.md) | done | e04472d |
| 022 | [dust-devils](022-dust-devils.md) | open -- re-judge difficulty first, 003 landed | |
| 023 | [grenade-pickups](023-grenade-pickups.md) | done | e553ec2 |
| 024 | [pause-left-menu](024-pause-left-menu.md) | done | (see log) |
| 025 | [guide-arrow](025-guide-arrow.md) | open | |
| 026 | [win-fail-screens](026-win-fail-screens.md) | open | |

## Log

- **2026-09-01** -- brief broken down: 26 issues, 3 questions filed, all
  claims checked against the code (5 research passes). Notable: "factor" =
  the factory sprite; the bridge pickups are inert `k` boxes on a demolish
  mission; veteran adds only +2 men to dry run; no start-distance rule
  exists anywhere; the sink's hold clock pauses silently.
- **2026-09-01, later** -- Q1-Q3 answered (1/1/1) and eleven issues landed:
  005, 007, 013, 015, 021, 023 first, then 001, 003, 010/014 once the
  answers came. The 12-tile rule found sixteen maps in breach and is now
  enforced in the placer, the validator and the test; the balance levers
  verified live at 13/20/26 rifles on dry run. Still open: the visual
  redesigns (002, 004, 006, 008, 009, 025), patrols 016 and the maps that
  want it (017, 018), map work 012/019/020/022, and the two UI jobs
  (024, 026).
