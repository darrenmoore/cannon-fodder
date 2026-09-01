# 006 -- hold-F to fire, so a Mac has a fire button at all

> ..and see this, you need to get this working... as a different spec doc.
> Mac-friendly fire key + platform-aware controls text
>
> Bind hold-F to fire in game/src/shell/input.ts. On keydown for f/F call
> fireDown(), on keyup call fireUp() (both already exist at input.ts:280-292,
> used by the on-screen FIRE button). Guard e.repeat so key auto-repeat
> doesn't re-trigger, respect the existing focused-control guard, and make sure
> releaseAll() clears the held state on blur -- a fire that survives Cmd+Tab is
> a bug. F must compose with the existing G grenade flow the same way the
> on-screen buttons do (hold F, tap G should behave like the current
> right-hold + grenade).
>
> [...] Verify with the real game, not just npm run check: drive it in
> Playwright (window.game), assert F down opens fire mode and F up ends it,
> and that G still throws while F is held.
>
> Out of scope: WASD movement, rebindable keys, any change to the mouse scheme.

The controls text half of that brief is issue **005**.

## Findings

**Every line of the brief's diagnosis checks out**, which is rare enough to
say plainly.

- `fireDown()` and `fireUp()` are at `input.ts:279-292`, exactly as stated,
  and are called today only by the on-screen FIRE button in `ui/controls.ts`.
- `onKeyDown` (`input.ts:332-363`) has no `f` case. `R`, `Escape`, `Space`,
  `G`, `+`/`-` and the four arrows are the whole keyboard.
- The focused-control guard is `input.ts:334-336` -- it bails on a focused
  `<input>` or `<textarea>`. Real, and F must sit behind it.
- `releaseAll()` (`input.ts:372-381`) already ends fire mode
  (`if (this.aim.mode === 'fire') this.aim.idle()`), and it is already wired
  to `window` `blur` at `input.ts:102`. **So Cmd+Tab is handled the moment F
  routes through the same state.**
- `e.repeat` is guarded nowhere in the file. Auto-repeat on F would re-enter
  `fireDown()` fifty times a second, and each call does
  `this.stickDir = null` -- so a player firing on a thumbstick heading would
  have that heading wiped every repeat. The brief's guard is not cosmetic.

**One thing the brief does not mention, and it is the real trap.**
`fireUp()` reads:

```ts
fireUp(): void {
  this.stickDir = null;
  if (this.aim.mode === 'fire' && !this.rightDown) this.aim.idle();
}
```

`rightDown` is the right *mouse* button. There is no symmetric flag for the
key, so with F bound naively:

- hold right button, tap F, release F --> `rightDown` is true, so fire
  correctly survives. Good.
- hold F, press and release the right button --> the right-button release path
  calls `fireUp()`, `rightDown` is now false, and **fire stops while F is
  still held down**. Then releasing F does nothing, and the player is left
  holding a dead key.

So this needs a `fireKeyDown` flag beside `rightDown`, both consulted by
`fireUp()`, and both cleared by `releaseAll()`. That is the whole of the fix
beyond the two `case` labels.

**The grenade chord.** `G` calls `toggleGrenade()` (`input.ts:349`), which
sets `aim.mode = 'grenade'` outright. Holding F sets `aim.mode = 'fire'`.
They share one mode field, so "hold F, tap G" behaves exactly like
"hold right, tap G" today -- the grenade takes the mode, throws, and
`cancelGrenade`/`aim.idle()` returns. Nothing extra is needed for composition;
it needs *testing*, not building. But note the consequence: after the grenade
resolves, aim goes idle even though F is still held. That is already true of
the right button today (same code path), so it is the existing behaviour
rather than a regression -- worth a live check, not a fix, unless the playtest
shows it feels wrong.

**`Ctrl+click`.** The brief's Mac table offers `Ctrl+click-and-hold` as a
second fire route. On macOS, Ctrl+click is synthesised by the OS as a
*right* click (`button: 2`) before the page sees it -- so the existing
right-button path already covers it, and it needs no code, only the wording
in 005. Worth confirming in the playtest on a real Mac if one is available;
in headless Chromium it cannot be reproduced.

## Classification

**New work**, with an accurate diagnosis already written. Small.

## Plan

One sitting.

1. Add `private fireKeyDown = false;` beside `rightDown`.
2. In `onKeyDown`, before the switch or as a case:
   `case 'f': case 'F': if (e.repeat) return; this.fireKeyDown = true;
   this.fireDown(); return;`
3. In `onKeyUp`: `if (e.key === 'f' || e.key === 'F') { this.fireKeyDown =
   false; this.fireUp(); }`
4. Change `fireUp()`'s guard to `!this.rightDown && !this.fireKeyDown`.
5. Clear `fireKeyDown` in `releaseAll()`.
6. `onKeyUp` has no focused-control guard today (it only handles arrows, where
   it does not matter). F does matter -- a key-up that arrives while an input
   is focused must still clear the held state, or a rename field steals the
   release and fire sticks. So: clear the flag unconditionally on key-up, and
   only gate the *down* on the focus guard.

Out of scope, as the brief says: WASD, rebinding, any mouse change.

## Done when

Driven in Playwright against the real game (`/playtest`), not asserted from
the source:

- `keydown F` --> `window.game`'s input aim mode is `fire`; `keyup F` --> it is
  not.
- Holding F, then pressing **and releasing** the right mouse button, leaves
  fire mode on. (The `fireKeyDown` case; this is the one that fails without
  step 4.)
- Holding F and tapping `G` throws a grenade, and the grenade lands where the
  cursor was -- same as right-hold + G.
- Auto-repeat on a held F does not clear a thumbstick heading.
- `window.dispatchEvent(new Event('blur'))` while F is held ends fire mode.
- Focus a Boot Hill rename field, press F: no fire, and the letter reaches the
  field.
- `npm run check` passes.
