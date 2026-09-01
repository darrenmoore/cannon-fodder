/**
 * The bridge between the plotted chrome and the DOM.
 *
 * Every plate, button, frame, banner, star and padlock in this game is drawn
 * pixel by pixel into an offscreen canvas (`render/sprites/plates.ts`), and the
 * front end is DOM. Those two facts have to meet somewhere, and this is the
 * seam: each piece is baked once at boot and published as a CSS custom property
 * holding a `data:` URL, so a stylesheet can say `border-image: var(--sk-btn)`
 * and get the real drawing.
 *
 * **Why not draw the screens on canvas instead.** Because then every list,
 * every focus ring, every keyboard route and every line of text layout would
 * have to be written again, and none of it would look any different: the plate
 * is the same plate whichever surface it lands on. The trade is one bake at
 * boot and a handful of data URLs against re-implementing the browser.
 *
 * **Why `border-image` and not a background.** A plate is not one size. A
 * button is as wide as its label, a frame is as big as the screen it holds, and
 * a bitmap stretched to fit smears its corners. `border-image` slices the
 * source into nine and stretches only the middles -- the corners land untouched
 * at whatever size the box happens to be, which is the same property the
 * plotted version has and the reason the two agree.
 *
 * The bakes are deliberately small. A 48x34 button carries every pixel of its
 * corners and its rim, and the slice is what does the work; baking it at the
 * size it will be drawn would be a bigger data URL saying the same thing.
 */

import { bakeBanner, bakeButton, bakeFrame, bakeIcon, bakeLock, bakePlate, bakeStar } from '../render/sprites/plates.js';
import { buildAtlas } from '../render/sprites/index.js';
import type { Sprite } from '../render/sprites/paint.js';

/*
 * Source sizes.
 *
 * Bigger than the corner detail needs, on purpose. These are tiled into the
 * DOM with border-image-repeat: round, and the tile is the middle slice -- a
 * 44px patch of dither repeats cleanly where the first attempt, a 28px patch
 * under *stretch*, was interpolated across a thousand pixels and turned the
 * frame field into broad smeared bands. The owner put the gallery beside the
 * screen and called it immediately: the same sprite, drawn 1:1 there and
 * stretched here, was two different games.
 */
const BTN = { w: 64, h: 64 };
const PLATE = { w: 64, h: 64 };
const FRAME = { w: 128, h: 128 };
const BANNER = { w: 160, h: 40 };

/**
 * The slice, in source pixels, that each corner occupies.
 *
 * These are not guesses: the plate's chamfer is 4 and its rim is 3, so
 * everything that makes a corner a corner sits inside 10. The frame has an
 * outer rim, a channel, a ledge and a 5px corner notch, which reaches 16.
 * Slicing tighter cuts a corner in half; slicing wider drags the middle's
 * texture into it and the stretch shows.
 */
const SLICE = { btn: 10, plate: 10, frame: 18, banner: 12 };

const url = (s: Sprite): string => `url("${s.toDataURL('image/png')}")`;

let installed = false;

/**
 * Bakes the chrome and publishes it. Safe to call twice; does nothing the
 * second time, because the sprites are immutable and the properties are set on
 * the document root.
 */
export function installSkin(): void {
  if (installed) return;
  installed = true;

  const set: Record<string, string> = {
    // All `flat: true`: these tile, and a tiled sheen is a horizontal seam.
    // The gallery's specimens keep their sheen because they are drawn at final
    // size; the two are meant to differ in exactly this one respect.
    '--sk-btn': url(bakeButton('', { ...BTN, state: 'normal', flat: true })),
    '--sk-btn-hot': url(bakeButton('', { ...BTN, state: 'active', flat: true })),
    '--sk-btn-off': url(bakeButton('', { ...BTN, state: 'disabled', flat: true })),
    '--sk-btn-down': url(bakeButton('', { ...BTN, state: 'pressed', flat: true })),

    '--sk-plate': url(bakePlate(PLATE.w, PLATE.h, 'brass', { rivets: false, flat: true })),
    '--sk-plate-hot': url(bakePlate(PLATE.w, PLATE.h, 'gold', { rivets: false, flat: true })),
    '--sk-plate-off': url(bakePlate(PLATE.w, PLATE.h, 'iron', { rivets: false, flat: true })),

    '--sk-frame': url(bakeFrame(FRAME.w, FRAME.h, 'brass', true)),
    '--sk-banner': url(bakeBanner(BANNER.w, BANNER.h, { stars: false })),

    '--sk-ic-door': url(bakeIcon('door')),
    '--sk-ic-restart': url(bakeIcon('restart')),
    '--sk-ic-gear': url(bakeIcon('gear')),
    '--sk-ic-pause': url(bakeIcon('pause')),

    '--sk-star-on': url(bakeStar(13, true)),
    '--sk-star-off': url(bakeStar(13, false)),
    '--sk-lock': url(bakeLock(false)),

    // The wordmark is the one piece used at its own size rather than sliced,
    // so it goes in as a background and the element is sized to match.
    '--sk-logo': url(buildAtlas().logo),

    '--sk-slice-btn': String(SLICE.btn),
    '--sk-slice-plate': String(SLICE.plate),
    '--sk-slice-frame': String(SLICE.frame),
    '--sk-slice-banner': String(SLICE.banner),
  };

  const root = document.documentElement;
  for (const [k, v] of Object.entries(set)) root.style.setProperty(k, v);

  // The logo's own pixel size, so the stylesheet can scale it by whole numbers
  // rather than guessing an aspect ratio.
  const logo = buildAtlas().logo;
  root.style.setProperty('--sk-logo-w', `${logo.width}`);
  root.style.setProperty('--sk-logo-h', `${logo.height}`);
}
