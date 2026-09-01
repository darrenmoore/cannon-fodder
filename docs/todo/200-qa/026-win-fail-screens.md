# 026 -- mission win/fail: our chrome, and a replay-with-difficulty flow

> mission fail / win
> - need to align with our style using sprites and buttons
> - need to give the option for the player if they want to replay..
>     - then they can choose the difficulty level
>     - so i think they choose replay and then it shows them the difficulties
>     - and it makes it clear what they just did it on
>     - take ideas from the level select screen
>     - otherwise some players might not realise there are options for difficulty

## Findings

- The result panel (`ui/hud.ts:294-420`) is **plain CSS**: `.result` is a
  linear-gradient box with blurred box-shadow (`style.css:436-446`), and its
  buttons fall through to the base CSS bevel -- the `.sheet-actions` /
  `.confirm-card` sprite-frame skin rules don't match it. Every other modal
  (sheets, confirms, fx buttons, hud tools) already wears the plotted
  chrome (`--sk-frame`/`--sk-btn`, `ui/skin.ts:86-91`).
- **Replay cannot change difficulty**: `onRetry` (`main.ts:287-306`) calls
  `game.restart()`, and difficulty is fixed at Game construction
  (`sim/game.ts:50,63`). The panel doesn't even *display* the difficulty
  played -- only the sidebar chip does.
- The reference pattern already exists: level select's `offerMission`
  (`ui/front.ts:191-237`) opens a sprite-framed `confirm()` with one button
  per difficulty on one line, the current one marked `primary`.

## Classification

Half broken-cause-found (the skin rules just don't reach `.result`), half
new work (the replay flow).

## Plan (one sitting, two commits)

1. **Chrome**: give `.result` the `--sk-frame` border-image and its buttons
   the `--sk-btn` treatment (mirror `.confirm-card`/`.sheet-actions` rules);
   show the difficulty just played as a chip in the panel header.
2. **Replay flow**: Replay/Try again opens the same difficulty row the level
   select uses (reuse `offerMission`'s button-building or extract a shared
   helper in `front.ts`), current difficulty primary and labelled as what
   was just played; picking one relaunches via the `play(info, difficulty)`
   path rather than `game.restart()` so the choice takes effect. Enter
   still = next mission on a win; R opens the replay row.

`/grill` the win screen against `docs/original-images/elements/` if a
reference exists; it is exactly the kind of screen 101 already gauntleted.

## Done when

- Win and fail panels wear the sprite frame and sprite buttons, and state
  the difficulty just played (screenshot both).
- Choosing Replay shows the difficulty row (current one primary); picking a
  different one restarts the mission at that difficulty (playtest-verified
  via `window.game`).
- `npm run check` passes.
