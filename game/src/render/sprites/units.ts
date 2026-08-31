/**
 * Men: the living figure in eight facings and four walk frames, the facing
 * lookup that indexes them, and the corpse left behind.
 *
 * Why a soldier is drawn the way he is -- lit helmet, near-black body, nothing
 * symmetrical -- is in docs/design.md under "The men".
 */

import { addOutline, hashRnd, makeCanvas, px, rect } from './paint.js';
import type { Palette, Sprite } from './paint.js';

const SOLDIER_W = 13;
const SOLDIER_H = 15;
/** Where the sprite sits relative to the actor position (its feet). */
export const SOLDIER_ANCHOR = { x: 6, y: 12 };

export const FACINGS = 8;
/** How many differently-kitted men each unit type is baked in. */
export const UNIT_VARIANTS = 4;
export const WALK_FRAMES = 4;

/**
 * One soldier, seen from a high three-quarter angle.
 *
 * `facing` is 0..7 clockwise from south (toward the viewer), matching
 * `facingIndex`. `frame` drives the leg swing. `weapon` picks the silhouette:
 * a rifle stub, a long sniper barrel, or a fat launcher tube. `variant` is the
 * man himself — see below.
 *
 * The construction matters more than the palette here. Three rules, all taken
 * off the original, and all of them things the first version of this function
 * broke:
 *
 * **Light comes from straight above.** So the sprite is a bright dome of helmet
 * over a hot little face over a near-black body. A figure shaded evenly in its
 * uniform colour reads as a toy; the value range inside these thirteen pixels
 * is nearly the whole palette.
 *
 * **Nothing is symmetrical.** Stacked rectangles with matching shoulders look
 * machined. Kit hangs off one side, the shoulders differ, and the helmet's
 * highlight sits off-centre.
 *
 * **Detail is scattered pixels, not shading.** What you actually read at this
 * size is a handful of contrasting flecks — webbing, a pouch, a strap — against
 * the dark mass. Smooth bands across the torso read as nothing at all.
 */
export function bakeSoldier(
  pal: Palette, facing: number, frame: number,
  weapon: 'rifle' | 'long' | 'tube' | 'none', variant = 0,
): Sprite {
  const { c, g } = makeCanvas(SOLDIER_W, SOLDIER_H);
  const angle = (facing / FACINGS) * Math.PI * 2 + Math.PI / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const cx = 6;

  // The man's own kit layout. Stable per variant, so a given soldier looks the
  // same from every angle and in every frame, and six of them in a squad are
  // six different men rather than one man stamped six times.
  const rnd = hashRnd(9173 + variant * 2749);
  const kitSide = variant % 2 === 0 ? 1 : -1;
  const spots = Array.from({ length: 3 }, () => ({
    x: cx - 2 + ((rnd() * 5) | 0),
    y: 8 + ((rnd() * 4) | 0),
    alt: rnd() < 0.34,
  }));

  const facingAway = dy < -0.3;
  const sideways = Math.abs(dy) <= 0.3;

  // --- legs, first, so the body overlaps them
  //
  // Short, thick and barely separated. There is no room at this size for legs
  // that read as legs, and trying gives you two thin dark spikes under the
  // torso -- which, with a shadow behind them, is a spider. What is wanted is a
  // base the figure stands on, with just enough asymmetry between the two to
  // carry the walk cycle.
  const swing = [0, 1, 0, -1][frame];
  rect(g, cx - 2, 11, 2, 2 + Math.max(0, swing), pal.body);
  rect(g, cx + 1, 11, 2, 2 + Math.max(0, -swing), pal.body);
  rect(g, cx - 2, 12 + Math.max(0, swing), 2, 1, pal.boots);
  rect(g, cx + 1, 12 + Math.max(0, -swing), 2, 1, pal.boots);

  // --- body: a dark mass, wider at the shoulders, and not the same on both
  //     sides. The right shoulder carries the weapon and sits a pixel higher.
  // Shoulders as one solid block that tapers into the waist, not as a torso
  // with a one-pixel column stuck on either side -- those columns read as thin
  // arms, and thin arms on a 13px sprite read as legs on a spider.
  rect(g, cx - 3, 7, 7, 2, pal.body);
  rect(g, cx - 2, 9, 5, 3, pal.body);
  // The right shoulder carries the weapon and sits a pixel proud of the left.
  px(g, cx + 3, 9, pal.body);
  // A single lifted edge along the top of the shoulders: the only place light
  // reaches the body at all.
  rect(g, cx - 3, 7, 5, 1, pal.bodyLight);
  px(g, cx + 2, 7, pal.bodyLight);

  // Kit. Scattered, asymmetric, and biased to the side this man carries it on.
  for (const s of spots) {
    px(g, s.x, s.y, s.alt ? pal.kitAlt : pal.kit);
  }
  // A strap running diagonally across the chest, and a pouch on the hip.
  if (!facingAway) {
    px(g, cx - kitSide, 8, pal.kit);
    px(g, cx - kitSide * 2, 9, pal.kit);
    px(g, cx + kitSide, 11, pal.kit);
  }
  px(g, cx + kitSide * 2, 10, pal.kitAlt);
  // A bedroll or pack on his back, visible when he is walking away from you.
  if (facingAway) {
    rect(g, cx - 2, 8, 4, 3, pal.bodyLight);
    px(g, cx - 2, 8, pal.kitAlt);
    px(g, cx + 1, 10, pal.kitAlt);
  }

  // --- weapon, projecting from the chest along the facing
  if (weapon !== 'none') {
    const reach = weapon === 'long' ? 5.4 : weapon === 'tube' ? 4.2 : 3.2;
    const gx = cx + dx * reach;
    const gy = 7 + dy * (reach * 0.8);
    px(g, cx + dx * 1.8, 7 + dy * 1.4, pal.gun);
    px(g, gx, gy, pal.gun);
    px(g, gx + dx * 1.4, gy + dy * 1.4, pal.gun);
    if (weapon === 'long') px(g, gx + dx * 2.6, gy + dy * 2.6, pal.gun);
    if (weapon === 'tube') {
      px(g, gx - dy, gy + dx, pal.gun);
      px(g, gx + dx * 1.4 - dy, gy + dy * 1.4 + dx, pal.gun);
    }
  }

  // --- head: a dome, brightest at the crown, with the brim in its own shadow
  //
  // Five pixels across, not seven. A helmet as wide as the shoulders turns the
  // figure into a mushroom and leaves no room for a face under it — and the
  // face, small as it is, is most of what says which way he is looking.
  rect(g, cx - 1, 1, 3, 1, pal.helmet);
  rect(g, cx - 2, 2, 5, 1, pal.helmet);
  rect(g, cx - 2, 3, 5, 1, pal.helmetDark);
  // The crown catches the light: two or three pixels, off-centre, and the
  // brightest thing on the sprite.
  px(g, cx - 1, 1, pal.helmetLight);
  px(g, cx, 1, pal.helmetLight);
  px(g, cx - 2, 2, pal.helmetLight);
  // A dent, so no two helmets in a squad are quite the same shape.
  if (variant % 4 === 1) px(g, cx + 2, 2, pal.helmetDark);
  if (variant % 4 === 2) px(g, cx - 1, 2, pal.helmetLight);
  if (variant % 4 === 3) px(g, cx + 1, 1, pal.helmetLight);

  // --- face, only where there is something to see
  if (!facingAway) {
    if (sideways) {
      // Side-on: a cheek and jaw on the leading edge, and one eye.
      const sd = Math.sign(dx) || 1;
      rect(g, cx, 4, 3 * sd > 0 ? 2 : 2, 3, pal.face);
      px(g, cx + sd, 4, pal.face);
      px(g, cx + sd * 2, 5, pal.face);
      px(g, cx, 4, pal.faceDark);
      px(g, cx + sd, 5, pal.outline);
      px(g, cx + sd, 6, pal.faceDark);
    } else {
      // Three rows of it. The face is the largest warm area on the sprite in
      // the original, and leading with a big helmet instead turns the figure
      // into a mushroom with a chin.
      rect(g, cx - 1, 4, 3, 3, pal.face);
      px(g, cx - 2, 5, pal.faceDark);
      px(g, cx + 2, 5, pal.faceDark);
      // Two eyes. At thirteen pixels wide these are two dark dots, and they do
      // more work than everything below the collar put together.
      px(g, cx - 1, 5, pal.outline);
      px(g, cx + 1, 5, pal.outline);
      px(g, cx, 6, pal.faceDark);
    }
  } else {
    // The back of the head: helmet all the way down, and the collar under it.
    rect(g, cx - 2, 4, 5, 2, pal.helmetDark);
    px(g, cx, 6, pal.helmetDark);
  }

  addOutline(c, pal.outline);
  return c;
}

/** 0..7 clockwise from south. Matches the layout used by `bakeSoldier`. */
export function facingIndex(angle: number): number {
  const a = angle - Math.PI / 2;
  const i = Math.round((a / (Math.PI * 2)) * FACINGS);
  return ((i % FACINGS) + FACINGS) % FACINGS;
}


/**
 * Face-down corpse, burnt into the decal layer where someone fell.
 *
 * Sprawled, not laid out. A tidy symmetrical body reads as a sleeping figure;
 * what makes this one read as a casualty is that the limbs went where they fell
 * and the helmet has come off and rolled clear.
 */
export function bakeCorpse(pal: Palette): Sprite {
  const { c, g } = makeCanvas(15, 12);
  // Torso, twisted a little off the vertical.
  rect(g, 4, 5, 6, 4, pal.body);
  px(g, 10, 5, pal.body);
  px(g, 3, 8, pal.body);
  // Arms thrown out, one further than the other.
  rect(g, 1, 6, 3, 1, pal.body);
  rect(g, 10, 7, 2, 1, pal.body);
  px(g, 12, 8, pal.body);
  // Legs, uneven.
  rect(g, 5, 9, 1, 2, pal.body);
  rect(g, 8, 9, 1, 1, pal.body);
  px(g, 5, 11, pal.boots);
  px(g, 9, 10, pal.boots);
  // Kit still on him, and the helmet a couple of pixels away from his head.
  px(g, 6, 6, pal.kit);
  px(g, 8, 7, pal.kitAlt);
  rect(g, 5, 3, 3, 2, pal.helmetDark);
  px(g, 9, 2, pal.helmet);
  px(g, 10, 2, pal.helmetDark);
  addOutline(c, pal.outline);
  return c;
}
