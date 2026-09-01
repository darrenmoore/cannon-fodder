# 024 -- pause into the left menu; widen it; redesign the pause sheet

> pause button to be in left menu
> - remove the setting menu, because settings it in the pause menu
> - make the left menu about 1/2 wider
> - also make the left menu text a bit bigger, like 1/3rd bigger
>
> in pause menu
> - redesign the buttons
> - put resume middle bigger, as a primary button
> - remove mission list
> - so it'll be resume, restart, settings

## Findings

- The pause button is currently a floating 58x58 action plate at the top of
  the viewport (`ui/controls.ts:40-53`), NOT in the sidebar. The sidebar's
  tool row (`ui/hud.ts:122-137`) holds exactly three buttons: exit, restart,
  gear(settings).
- Settings is its own sheet (`ui/sheet.ts:124-208`: zoom, effects, music),
  reachable from the gear and from the pause sheet -- so "settings is in the
  pause menu" is already half-true; the ask is to remove the *direct* gear
  route.
- The pause sheet (`main.ts:361-373`) is Resume / Settings / Restart
  mission / Mission list -- equal-weight rows on the sprite-framed sheet.
- Sidebar width is `--sidebar-w: 188px` (`style.css:25`); its text runs on a
  local ladder of 10px body / 20px heading (`style.css:318-323`).

## Classification

New work, precisely specified.

## Plan (one sitting)

1. Sidebar: add a Pause tool (`hud-tools` gains `t-pause`, wired to the same
   `onPause`), drop the gear (settings lives inside pause), keep exit +
   restart... note restart then exists in both places -- keep it in both,
   the sidebar one has a confirm. Retire the floating `.controls-top` pause
   (keep `⊕ Centre`, which is the bar's other job). Esc still pauses.
2. Width & type: `--sidebar-w: 188px -> 282px`; local ladder 10px -> 13px,
   20px -> 26px. Check the three layouts -- `compact` and `stacked`
   (`style.css:1042, 1114`) reflow the panel, so eyeball all three.
3. Pause sheet: Resume as the large centred primary (tone good, `sk-btn-hot`
   skin), Restart and Settings smaller either side/below; Mission list row
   removed (exit from the sidebar remains the way out). Keys: Enter resume,
   R restart, Esc resume.
4. `/grill` the paused screen -- this is chrome judged against the plotted
   style, not taste.

## Done when

- Pause is a sidebar tool; no gear tool; no floating pause plate; Esc works.
- Sidebar is ~282px with ~13px body text at `wide`, and `compact`/`stacked`
  layouts unbroken (screenshots of all three).
- Pause sheet shows exactly Resume (primary, largest, centre), Restart,
  Settings; mission list gone from it, but leaving the mission still
  possible via the sidebar exit.
