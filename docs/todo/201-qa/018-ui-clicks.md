# 018 -- the buttons are silent

> UI clicks. The plotted buttons are silent. One dry click (the order blip
> re-pitched) on press, nothing on hover.

## Findings

Confirmed by grepping every call site of every emitter in `shell/audio.ts`:

| emitter | called from |
|---|---|
| `sfxOrder` | `sim/troops.ts:73, 91, 111` |
| `sfxPickup` | `sim/hostages.ts:27, 38`, `sim/pickups.ts:24, 47` |
| `sfxDenied` | `sim/game.ts:225, 231` |
| `sfxWin` / `sfxLose` | `sim/game.ts` |
| `unlockAudio` | `main.ts:119` |

**Every single one is called from `sim/`.** Nothing in `ui/` makes a sound.
So `ui/front.ts`'s PLAY NOW, the level cards, the difficulty buttons, the
pause sheet, the settings screen, Boot Hill, the result panel's Replay and
Next -- all silent, on every press.

`sfxOrder` (`audio.ts:173`) is
`burst({ duration: 0.045, gain: 0.16, freq: 2400, q: 3 })` -- 45ms, narrow,
bright. Re-pitched down and slightly quieter is exactly the dry click the
brief asks for, and it will read as the same instrument as the order blip,
which is the point.

**Three things to get right.**

1. **One place, not thirty.** Buttons are built in at least five places:
   `front.ts`'s `button()` helper (`front.ts:66-71`), `ui/sheet.ts`,
   `ui/confirm.ts`, `ui/hud.ts`'s result `button()`, `ui/boothill.ts` and
   `ui/musictoggle.ts`. Wiring the sound per site guarantees the set drifts.
   The right hook is **one delegated `pointerdown` listener on `document`**
   matching `button, .fx-btn, .fx-card` -- one listener, catches every plotted
   control including ones not written yet.
2. **The audio context needs a gesture, and a click is one.**
   `main.ts:119` already unlocks on `input.onFirstPress`, but that is the
   *game's* input, which is not running on the front end. So the very first
   button press on the menu may be the gesture that unlocks the context, and
   `burst()` calls `ensure()` itself -- meaning the first click may be silent
   while the context spins up. Acceptable; worth knowing before someone files
   it as a bug.
3. **Not on hover, and not on disabled.** The brief says nothing on hover.
   Also nothing on a `disabled` button and nothing on the music toggle's own
   press beyond the click (it already has visible feedback).

## Classification

**New work.** The smallest item in either brief.

## Plan

One sitting, twenty minutes.

1. `audio.ts`: `sfxClick()` --
   `burst({ duration: 0.035, gain: 0.11, freq: 1500, q: 4 })`. Dry, lower and
   quieter than `sfxOrder`, so a menu does not sound like giving orders.
2. `ui/skin.ts` or a small `ui/clicks.ts`: one delegated `pointerdown`
   listener installed at boot, matching the plotted control selectors,
   skipping `[disabled]` and `[aria-disabled="true"]`, calling `sfxClick()`.
3. Verify it does not double-fire on a control that is both a `button` and
   carries `.fx-btn`.
4. `settings().sound` already gates `burst`, so the Effects toggle covers it
   for free -- but check the settings screen's own toggle, where clicking
   "sound off" should be the last click you hear, not the first silent one.

## Done when

- Every button on the front end, the pause sheet, the settings screen, Boot
  Hill and the result panel clicks when pressed. Walked through in a playtest.
- Hovering makes no sound.
- A disabled level card makes no sound.
- Effects off silences all of it.
- No emitter call was added to any individual button site -- `git diff` shows
  one listener.
- `npm run check` passes.
