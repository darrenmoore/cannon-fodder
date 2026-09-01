# 004 -- IMBF Games credit on the home screen

> on home screen
> at bottom
> put "IMBF Games" and link to https://inselnova.com/imbf/

## Findings

The home screen is `#front` (`ui/front.ts`, markup in
`public/index.html`). It has two panes under one logo: `#intro` (PLAY NOW /
LEVEL SELECT) and `#select` (the mission list). There is **no footer element
of any kind on the intro pane**.

The nearest thing that exists:

- `#select-foot` -- inside the select frame, and explicitly emptied at
  `front.ts:321` (`textContent = ''`). It belongs to the mission list, sits
  inside the plotted frame, and is not visible on the intro pane at all.
- `.menu-foot` / `#menu-foot` -- `public/style.css:529` and the `#menu`
  markup. That is the **old** menu, which `showMenu` no longer builds; it is
  dead chrome kept alive only by the stylesheet.

So this is new markup: a footer on `#front-inner`, below both panes, visible
on the intro and on the select.

Two house constraints that decide how it looks:

- The chrome typeface is `pixelface.ts`, built at boot -- but **not wired in**
  (its own docblock says so). So the footer inherits the same DOM font
  everything else does, and must use the existing `--ink-faint` /
  `--fs-sm` / `--track-tight` tokens rather than inventing a size.
- Every clickable thing on this screen wears a plotted plate via
  `ui/skin.ts`. A credit line is not a button and should **not** wear one --
  a plate here would read as a fourth action. Plain text, faint, with the
  name as the only link.

An outbound link is the first one in the game. It needs `target="_blank"` and
`rel="noopener noreferrer"`, and it must not be reachable by the keyboard
route that focuses the first button on pane change (`front.ts:150`) in a way
that traps a player -- tab order after the actions is fine.

## Classification

**New work.** Small.

## Plan

One sitting, half an hour.

1. Add `<p id="front-foot">` to `#front-inner` in `index.html`, after
   `#select`.
2. Content: `IMBF Games` as an `<a href="https://inselnova.com/imbf/"
   target="_blank" rel="noopener noreferrer">`.
3. Style in `style.css` beside the other `#front` rules: `--ink-faint`,
   `--fs-sm`, centred, with a hover that lifts to `--ink-dim`. No underline
   by default -- underline on hover and on focus-visible.
4. Check it survives the mobile pane (`#front-mobile`) and the small-screen
   width query, and that it does not collide with `#music-toggle`, which is
   mounted onto the same root (`front.ts:333`).

## Done when

- "IMBF Games" is visible at the bottom of the home screen on the intro pane
  and on the level select, in a screenshot of each.
- Clicking it opens `https://inselnova.com/imbf/` in a new tab.
- It is keyboard-reachable and shows a focus ring.
- It does not overlap the speaker button at any window width down to the
  mobile breakpoint.
