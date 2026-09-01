# Progress -- 201-qa

One line per issue. Mark **in progress** before touching one; mark **done**
with the commit hash when it lands. One issue, one commit, via `/commit`.

Two briefs feed this directory. The mapping from paragraph to issue:

- `brief.md` paragraphs 1-8 --> issues 001-010. Paragraph 5 produced **two**
  issues, 005 and 006, because it explicitly asks for the F key "as a
  different spec doc". Paragraph 6 is issue **007**; it briefly had a second
  file, 008, while the character half was blocked on Q1, and 008 is now a
  tombstone pointing back at 007.
- `brief-2.md` paragraphs 1-8 --> issues 011-018, one to one.

| # | issue | status | commit |
|---|---|---|---|
| 001 | [mine-depth-sort](001-mine-depth-sort.md) | open | |
| 002 | [favicon](002-favicon.md) | open | |
| 003 | [music-on-first-visit](003-music-on-first-visit.md) | done -- already true, no work | |
| 004 | [imbf-footer](004-imbf-footer.md) | open | |
| 005 | [briefing-screen](005-briefing-screen.md) | open -- second sitting waits on 006 | |
| 006 | [mac-fire-key](006-mac-fire-key.md) | open | |
| 007 | [comms-panel](007-comms-panel.md) | open -- Q1 answered; sitting 1 can start, 2 waits on 005 + 006 | |
| 008 | [merged-into-007](008-merged-into-007.md) | done -- merged, no work | |
| 009 | [no-autopause-over-a-dialog](009-no-autopause-over-a-dialog.md) | done | |
| 010 | [hiding-in-cover](010-hiding-in-cover.md) | open -- Q2 answered | |
| 011 | [end-of-mission-stats](011-end-of-mission-stats.md) | open | |
| 012 | [shell-casings](012-shell-casings.md) | open | |
| 013 | [wading-sfx](013-wading-sfx.md) | open | |
| 014 | [wounded-scream](014-wounded-scream.md) | open | |
| 015 | [wave-klaxon](015-wave-klaxon.md) | open | |
| 016 | [collapse-rumble](016-collapse-rumble.md) | open | |
| 017 | [theme-ambience-beds](017-theme-ambience-beds.md) | done -- already built, no work | |
| 018 | [ui-clicks](018-ui-clicks.md) | open | |

## Suggested order

`009` and `006` first -- both are a handful of lines and both fix something a
player hits today. Then `001`, `002`, `004`, `018`, which are each under an
hour. Then the sound batch `013`, `014`, `015`, `016` and `012`, which share
one file and one way of working. Then `011`. Then the chain
`005` --> `007`, which is the largest run of work here -- 007 alone is four
sittings. `010` sits
outside all of it and can be picked up at any point.

## Log

- **2026-09-01** -- both briefs broken down: 18 issues, 2 questions filed,
  every claim checked against the code. What the check turned up:

  - **The landmine is not a z-index bug.** Mines are drawn in the
    "on top of the world" pass, *after* the depth sort, along with crates and
    supplies. (001)
  - **The favicon already exists.** `public/icon.svg` is a plotted helmet;
    `index.html` simply has no `<link rel="icon">`. (002)
  - **Music on a first visit** is on by default and starts on the first click
    -- browser autoplay policy, already handled, already labelled by the
    speaker's third state. No work. (003)
  - **`ui/pixelface.ts` is not a face.** It is the chrome typeface, built and
    verified and *not wired in*. Nothing in the game draws a portrait. (007)
  - **The F-key brief is accurate line by line**, and misses one thing:
    `fireUp()` consults `rightDown` only, so without a matching key flag,
    releasing the right mouse button kills a fire that F is still holding.
    (006)
  - **Tall grass claims a mechanic the code does not have.** `walkLine`
    returns visible the moment it reaches the target's tile, before testing
    it -- so standing *in* grass hides nobody. `undergrowth` is 52% tall
    grass and was designed around the mechanic that was never implemented.
    (010)
  - **Auto-pause has one missing clause.** `openPause` guards on the sheet
    and the confirm but not on the result panel or the briefing, neither of
    which is either -- so tabbing away on a win stacks Paused over it. And
    the world is already frozen on those screens, so it pauses nothing. (009)
  - **Theme ambience beds are already built** -- per-theme voices, a
    canopy-distance drive for rustle/insects/birds, and the arctic whistle.
    `brief-2` describes the module as it was before themes. No work. (017)
  - **Shots fired is not counted anywhere**, and "time vs your best" is
    destroyed before the end panel reads it: `recordMission` writes the new
    record and `main.ts` re-assigns `hud.record` to it, so on a personal best
    the panel would compare the run against itself. (011)
  - **`fx.step` picks its physics off `maxLife > 2`** -- an undeclared
    heuristic that makes any long-lived particle float upward like smoke.
    A shell casing lasting "a few seconds" hits it exactly. (012)
  - **Nothing in `ui/` makes a sound.** Every audio call site in the codebase
    is in `sim/`. (018)

- **2026-09-01, later** -- Q1 and Q2 answered, and nothing is blocked any
  more. Q1: the blustering officer, played in Sean Lock's register -- the
  officer supplies the situation, Lock supplies the flat delivery, and the
  four draft lines are pinned in 007 as the `/speakers` skill's examples. No
  name was picked, so `Major Trumper` is the working one. Q2: both grass and
  deep water conceal, at about a third of notice range, floored at three
  tiles, and symmetric -- an enemy in cover is hidden from the player's fog
  on the same terms. 010 now has a real two-sitting plan, the second sitting
  being the balance pass over `undergrowth` and the three stealth maps. One
  thing left deliberately open inside that decision, to be settled by playing
  rather than by asking: whether concealment should require standing still.

- **2026-09-01, later still** -- 007 and 008 merged back into one issue on the
  owner's ask, now [the comms panel](007-comms-panel.md). Two things settled
  with it. **The name**: the strip is the *channel*, and who is on it is a
  separate thing -- panel, **speaker**, **transmission** -- so a second
  character later is a table entry rather than a change to the panel, and
  nothing in `ui/comms.ts` may name Trumper. **The talking sound**: a blip per
  character while the text types, in the Zelda / Animal Crossing manner --
  every second or third character, silent on spaces and punctuation, pitch
  jittered by the existing `vary()`, and the pitch belongs to the *speaker*,
  which is what makes the next character free. 007 is four sittings and will
  land as four commits, all tagged `201-qa 007`; the panel and the tutorial
  copy are shippable without any face or voice at all.
