# 002 -- a favicon

> we need a fav icon
> make one and make it easily recongisable

## Findings

**The icon already exists and is already drawn to the house rules.**
`game/public/icon.svg` is a 32x32 helmet on the game's own palette, with
`shape-rendering="crispEdges"` and not a single curve -- written for exactly
this and commented as such ("A helmet, which is the one silhouette the
original is remembered by").

What is missing is one line of markup. `game/public/manifest.webmanifest`
lists it under `icons`, so an installed PWA gets it -- but
`game/public/index.html` has **no `<link rel="icon">` at all**. A browser tab
therefore asks for `/favicon.ico`, which `server.js` does not serve, and the
tab shows the generic page glyph. The manifest icon is not a favicon
fallback in any browser.

So the issue is really: *wire the icon that exists into the tab, and check it
still reads at 16px.*

At 16px the current drawing loses a lot -- the dome is 12px wide inside a
28px plate, so scaled to a tab it is roughly six pixels of helmet inside a
frame. "Easily recognisable" is the part that needs work, not the artwork.

## Classification

**Already true, with a gap.** The drawing exists; the link and the small-size
legibility do not.

## Plan

One sitting.

1. Add to `index.html`'s head:
   `<link rel="icon" href="/icon.svg" type="image/svg+xml">` and an
   `apple-touch-icon`. Confirm `server.js` serves `.svg` with the right
   content type (it serves `/icon.svg` today for the manifest, so it should).
2. Redraw for 16px: drop the inner border plate, fill the square with the
   dark ground, and let the helmet occupy the full 32 grid so it survives the
   halving. Keep the same two-tone dome + brim + rim-light.
3. Check it in a real tab at 16px and at 32px, and in a bookmark bar, beside
   other tabs -- a favicon is only judged against its neighbours.

Visual work, so `/pixel-check` before and after. No anti-aliasing: the SVG
must stay whole-pixel `<rect>`s with `crispEdges`.

## Done when

- A tab on `http://localhost:5199/` shows the helmet, not the generic glyph.
- The helmet is identifiable at 16px in a screenshot of the tab strip.
- Still no new asset files: `icon.svg` is markup, not a bitmap, and stays
  the only icon.
