/**
 * Specimens: the things the gallery cannot find by itself.
 *
 * `buildAtlas()` returns finished canvases, so the gallery can walk it and show
 * everything in it without being told anything. That covers every sprite in the
 * game today, and it will cover every sprite added to the atlas tomorrow --
 * which is the whole point, and the reason this file is usually short.
 *
 * It does not cover a *parametric* drawing. A UI plate is not one sprite; it is
 * `drawPlate(w, h, tone)`, and it has no natural size to be shown at. There is
 * nothing in the atlas to walk, and inventing an entry there would put a single
 * arbitrary width into the game's own data purely so a debug page could see it.
 *
 * So a parametric drawing registers itself here instead, with the sample sizes
 * that are worth looking at. The gallery shows atlas entries and specimens side
 * by side and does not distinguish between them.
 *
 * Register one when the thing you are drawing takes arguments. Otherwise put it
 * in the atlas, where the game can actually use it, and it appears here free.
 */

import { TONE_NAMES, bakeBanner, bakeButton, bakeFrame, bakeLock, bakePlate, bakeStar } from '../render/sprites/plates.js';
import { chromeText } from '../render/chromefont.js';
import type { Sprite } from '../render/sprites/paint.js';

export interface Specimen {
  /**
   * Dotted path, and the fragment that deep-links to it: `ui.plate.brass`
   * is at `/sprites.html#ui.plate.brass`. Dots rather than brackets because a
   * bracket survives a URL bar inconsistently and a dot always does.
   */
  id: string;
  /** Section heading in the rail. Free text; unknown sections sort last. */
  group: string;
  /** One line on what is being shown, e.g. "160x28, 240x28, 420x28". */
  note?: string;
  /**
   * Draws it, once, on demand. Return several canvases to get a row of them --
   * the same shape at three widths, one tone at four states.
   *
   * Called lazily and cached, so an expensive bake costs nothing until the
   * specimen scrolls into view.
   */
  draw(): Sprite | Sprite[];
}

/**
 * The chrome, at the sizes it is actually used.
 *
 * Three widths per tone because that is what the reference sheet shows and what
 * has to be checked -- a plate that resolves at 240 and falls apart at 90 is a
 * plate that will fall apart the first time somebody puts a short label in one.
 * The tones are shown together on purpose: they are four states of one control,
 * and whether "disabled" reads as disabled is a question about the set, not
 * about the iron plate on its own.
 */
export const SPECIMENS: Specimen[] = [
  ...TONE_NAMES.map((tone): Specimen => ({
    id: `ui.plate.${tone}`,
    group: 'ui',
    note: '90, 150 and 240 wide, 26 tall',
    draw: () => [90, 150, 240].map((w) => bakePlate(w, 26, tone)),
  })),
  {
    id: 'ui.plate.tall',
    group: 'ui',
    // A mission row in the level select is a plate with three lines in it, and
    // it is the size at which the fixed 2px rim stops looking like a rim and
    // starts looking like a hairline. Here so that is noticed rather than shipped.
    note: 'a mission row: 240x54, every tone',
    draw: () => TONE_NAMES.map((tone) => bakePlate(240, 54, tone)),
  },
  {
    id: 'ui.plate.square',
    group: 'ui',
    note: 'a group button: 44x44, every tone',
    draw: () => TONE_NAMES.map((tone) => bakePlate(44, 44, tone)),
  },
  {
    id: 'ui.plate.norivets',
    group: 'ui',
    note: 'rivets off -- for a plate too small to carry them',
    draw: () => [60, 100].map((w) => bakePlate(w, 18, 'brass', { rivets: false })),
  },
  {
    id: 'ui.button',
    group: 'ui',
    // All four states side by side, because every one of them is a claim about
    // the others: disabled only means anything beside normal, and active only
    // means anything if it wins at a glance.
    note: 'normal, active, disabled, pressed -- 26 tall, sized to the label',
    draw: () => (['normal', 'active', 'disabled', 'pressed'] as const)
      .map((state) => bakeButton('DEPLOY', { state })),
  },
  {
    id: 'ui.button.row',
    group: 'ui',
    note: 'the labels the game actually uses, at one fixed width',
    draw: () => ['PLAY NOW', 'LEVEL SELECT', 'SETTINGS', 'BOOT HILL']
      .map((label) => bakeButton(label, { w: 120 })),
  },
  {
    id: 'ui.button.sizes',
    group: 'ui',
    note: '18, 26 and 38 tall -- the label steps 1x, 2x, 3x with it',
    draw: () => [18, 26, 38].map((h) => bakeButton('RETRY', { h })),
  },
  {
    id: 'ui.banner',
    group: 'ui',
    note: '260x30 and 180x22 -- a screen heading',
    draw: () => [bakeBanner(260, 30), bakeBanner(180, 22)],
  },
  {
    id: 'ui.banner.bare',
    group: 'ui',
    note: 'no stars, and short: the notch has to survive both',
    draw: () => [bakeBanner(200, 26, { stars: false }), bakeBanner(90, 16, { stars: false })],
  },
  {
    id: 'ui.stars',
    group: 'ui',
    // The level-select row: always three, and the ones not earned are hollow.
    // Shown as the row rather than one at a time, because whether "not earned"
    // reads at a glance is a question about the three together.
    note: 'earned and unearned, 13px and 9px',
    draw: () => [
      bakeStar(13, true), bakeStar(13, true), bakeStar(13, false),
      bakeStar(9, true), bakeStar(9, false),
    ],
  },
  {
    id: 'ui.lock',
    group: 'ui',
    note: 'dim on a locked card, bright in the dialog that explains it',
    draw: () => [bakeLock(false), bakeLock(true)],
  },
  {
    id: 'ui.type.ladder',
    group: 'ui',
    // The whole chrome ladder in one row. Whether a size is legible is not a
    // question about that size -- it is a question about whether it is
    // distinguishable from the one above it, which needs them side by side.
    note: '1x caption, 2x label, 3x heading -- the same 5x7 face the DOM installs',
    draw: () => [
      chromeText('LEVEL SELECT', { scale: 3, fill: '#f6efd8' }),
      chromeText('THE JUNGLE', { scale: 2, fill: '#f0d878' }),
      chromeText('12 MISSIONS   5/12', { scale: 1, fill: '#a8b07c' }),
    ],
  },
  {
    id: 'ui.type.numbers',
    group: 'ui',
    // The mock sets mission numbers large and gold beside a smaller name. No
    // new glyphs: the chrome face has digits, and 3x against the name's 2x is
    // the whole effect.
    note: 'mission numbers at 3x, gold, against the name at 2x',
    draw: () => ['01', '07', '12', '24'].map((n) => chromeText(n, { scale: 3, fill: '#f0c04a' })),
  },
  {
    id: 'ui.frame.wide',
    group: 'ui',
    note: 'the sheet\'s bottom row: 280x64',
    draw: () => bakeFrame(280, 64),
  },
  {
    id: 'ui.frame.panel',
    group: 'ui',
    note: 'a level-select container: 280x150, brass and steel',
    draw: () => [bakeFrame(280, 150), bakeFrame(280, 150, 'steel')],
  },
];
