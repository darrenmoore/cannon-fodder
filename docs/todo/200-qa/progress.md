# Progress -- 200-qa

One line per issue. Mark **in progress** before touching one; mark **done**
with the commit hash when it lands. One issue, one commit, via `/commit`.

| # | issue | status | commit |
|---|---|---|---|
| 001 | [sink-no-spawn](001-sink-no-spawn.md) | done | 9c841c6 |
| 002 | [mud-render](002-mud-render.md) | done | (see log) |
| 003 | [veteran-balance](003-veteran-balance.md) | done | 98ec576 |
| 004 | [house-circle](004-house-circle.md) | done | 7365517 |
| 005 | [idle-face-mouse](005-idle-face-mouse.md) | done | 28e117b |
| 006 | [factory-sprite](006-factory-sprite.md) | done | (see log) |
| 007 | [cabin-white-line](007-cabin-white-line.md) | done | fd329dd |
| 008 | [hut-door](008-hut-door.md) | done | 3d5c150 |
| 009 | [tent-sprite](009-tent-sprite.md) | done | 6e0b891 |
| 010 | [spawn-distance](010-spawn-distance.md) | done | f30507e |
| 011 | [cold-keep-note](011-cold-keep-note.md) | done -- no work, noted | |
| 012 | [narrows-harder](012-narrows-harder.md) | done | (see log) |
| 013 | [timer-clarity](013-timer-clarity.md) | done | d043054 |
| 014 | [landing-ground-start](014-landing-ground-start.md) | done -- via 010 | f30507e |
| 015 | [veteran-fire-range](015-veteran-fire-range.md) | done | 92b72ca |
| 016 | [patrols](016-patrols.md) | done | 66babf6 |
| 017 | [through-the-wall](017-through-the-wall.md) | done | (see log) |
| 018 | [not-a-sound-variant](018-not-a-sound-variant.md) | done | (see log) |
| 019 | [narrows-forest](019-narrows-forest.md) | open | |
| 020 | [swim-for-it](020-swim-for-it.md) | done | 3032db4 |
| 021 | [sink-waves](021-sink-waves.md) | done | e04472d |
| 022 | [dust-devils](022-dust-devils.md) | done | (see log) |
| 023 | [grenade-pickups](023-grenade-pickups.md) | done | e553ec2 |
| 024 | [pause-left-menu](024-pause-left-menu.md) | done | a4c5298 |
| 025 | [guide-arrow](025-guide-arrow.md) | done | 989cc08 |
| 026 | [win-fail-screens](026-win-fail-screens.md) | done | 03db76a |

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
- **2026-09-01, evening** -- eight more landed: patrol routes (016) with
  not-a-sound as the showcase, swim-for-it's north bank (020), pause into
  the sidebar (024), the guide arrow (025), the extraction ring's gold
  (004), the hut door (008), the tent redraw (009), and the end panel with
  replay-at-any-difficulty (026). Left: mud material (002), factory
  redesign (006), and the four map-design sittings (012, 017, 018, 019,
  022 -- 022 wants a veteran re-judge first, the garrison just doubled).
