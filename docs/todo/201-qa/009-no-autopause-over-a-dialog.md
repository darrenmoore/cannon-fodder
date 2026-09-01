# 009 -- do not auto-pause when a dialog is already up

> if it's showing a dialog like mission won / finished
> no need to have the auto pausing feature

## Findings

**Broken, and the cause is one missing clause in one guard.**

`main.ts:409` binds the auto-pause:

```ts
const onHide = (): void => { if (document.hidden) openPause(); };
document.addEventListener('visibilitychange', onHide);
```

and `openPause` (`main.ts:390-404`) guards with:

```ts
if (!game || sheetOpen() || confirmOpen()) return;
```

Those two checks cover the pause sheet and the confirmation dialog. They do
**not** cover the two other things that can own the screen:

- **The end-of-mission panel.** It is not a sheet and not a confirm -- it is
  `#overlay` with `.interactive`, raised by `hud.showResult` (`hud.ts:309`).
  `sheetOpen()` and `confirmOpen()` are both false while it is up. So
  switching tabs on the win panel stacks the Paused sheet on top of it, and
  the player comes back to a pause menu over a result they had not read.
- **The briefing.** Same shape: `hud.briefingUp` (`hud.ts:70`) is checked by
  the *step* loop (`main.ts:230`) and by the ambience (`main.ts:252`), but not
  by `openPause`. Tab away while reading the briefing and you get a pause
  sheet over a title card.

There is a second, quieter half of the same bug: **there is nothing to pause.**
`main.ts:230` already returns before `game.step(dt)` whenever
`sheetOpen() || confirmOpen() || hud.briefingUp`, and the world stops stepping
outright once `world.phase !== Phase.Playing`. So on a result panel the
simulation is already frozen and the pause sheet buys the player nothing --
it is pure noise.

The right condition is "pause only while the mission is actually running":
`game.world.phase === Phase.Playing`, plus the briefing.

## Classification

**Broken, cause found.** Two lines.

## Plan

One sitting, ten minutes.

1. Extend the guard in `openPause`:

```ts
if (!game || sheetOpen() || confirmOpen()) return;
if (hud.briefingUp || game.world.phase !== Phase.Playing) return;
```

   Put it in `openPause` rather than in `onHide`, so the manual routes
   (`input.onPause` from Escape, `hud.onPause` from the sidebar button) get the
   same protection. Escape on the result panel is already caught by the
   panel's own capture-phase key binding (`hud.ts:432-437`), but the sidebar
   pause button is not, and today it does raise a sheet over the win panel.
2. Comment it in the house voice: the sheet exists to stop the world, and on
   these screens the world is already stopped.

## Done when

- With the win panel up, switching to another tab and back leaves the win
  panel alone -- no pause sheet. Driven in Playwright by dispatching
  `visibilitychange` with `document.hidden` stubbed true.
- Same with the fail panel and with the briefing.
- Tabbing away *mid-mission* still pauses, unchanged.
- Clicking the sidebar pause button while the win panel is up does nothing.
- `npm run check` passes.
