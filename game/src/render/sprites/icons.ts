/**
 * Small objects and badges: what you pick up, what blows up, what a floating
 * label puts beside its text, and the flash at the end of a barrel.
 */

import { PALETTES, addOutline, makeCanvas, px, rect } from './paint.js';
import type { Sprite } from './paint.js';

/** Ammo crate. Shoot it and it takes the neighbourhood with it. */
export function bakeCrate(): Sprite {
  const { c, g } = makeCanvas(12, 12);
  rect(g, 1, 2, 10, 9, '#9a6f34');
  rect(g, 1, 2, 10, 2, '#b98a45');
  rect(g, 1, 9, 10, 2, '#7a561f');
  for (let i = 0; i < 8; i++) {
    px(g, 2 + i, 3 + i, '#6a4a1c');
    px(g, 9 - i, 3 + i, '#6a4a1c');
  }
  rect(g, 4, 0, 4, 2, '#c8b23c');
  addOutline(c, '#2a1c0a');
  return c;
}

/**
 * A supply box: the objective of a `collect` mission.
 *
 * Deliberately not a recolour of the ammo crate. The two sit on the same map
 * and do opposite things -- one is a reward that also happens to be a bomb, the
 * other is the thing you came for and ends the mission if it goes up -- so they
 * have to be told apart in a glance at twelve pixels, by silhouette before
 * colour. The crate is tall, brown and X-braced; this is a squat olive case,
 * wider than it is high, with a lid seam and a stencil band across it.
 */
export function bakeSupply(): Sprite {
  const { c, g } = makeCanvas(14, 11);
  rect(g, 1, 3, 12, 7, '#4d5a34');
  rect(g, 1, 3, 12, 2, '#63723f');   // lid, catching the light
  rect(g, 1, 8, 12, 2, '#3a4527');   // shadowed foot
  rect(g, 1, 5, 12, 1, '#2e3720');   // the seam the lid opens on
  // Stencil band: the one high-contrast mark, and the thing the eye finds.
  rect(g, 4, 6, 6, 2, '#d8d2b4');
  px(g, 6, 6, '#4d5a34');
  px(g, 7, 7, '#4d5a34');
  // Carry handles, one each end, which is what makes it read as a case.
  rect(g, 0, 5, 1, 2, '#2e3720');
  rect(g, 13, 5, 1, 2, '#2e3720');
  addOutline(c, '#161a0e');
  return c;
}

/** Fuel barrel: scenery explosive, no pickup. */
export function bakeBarrel(): Sprite {
  const { c, g } = makeCanvas(12, 14);
  rect(g, 2, 2, 8, 11, '#8a3a2c');
  rect(g, 2, 2, 3, 11, '#a54838');
  rect(g, 8, 2, 2, 11, '#6b2a20');
  rect(g, 2, 5, 8, 1, '#5c241b');
  rect(g, 2, 9, 8, 1, '#5c241b');
  rect(g, 3, 1, 6, 2, '#c2543f');
  rect(g, 4, 6, 4, 3, '#e0c03a');
  addOutline(c, '#2a1109');
  return c;
}

/**
 * A mine, buried, with only its lid showing.
 *
 * Two failures to sit between. Invisible, a minefield plays exactly like open
 * ground and kills you with information you could not have had. Loud -- which
 * is what a lit top face and a red pressure plate made it -- and the map reads
 * as a board game with the hazards printed on it, so crossing one stops being
 * tense and becomes clerical.
 *
 * What is left is the smallest thing that survives a scan: a dark disc barely
 * proud of the ground with one dull glint on its lit edge. It is findable when
 * you look and easy to walk into when you are busy, which is the whole point of
 * a mine. No red -- red is the loudest thing that can appear on sand.
 */
export function bakeMine(): Sprite {
  const { c, g } = makeCanvas(8, 6);
  // The lid, sunk almost flush. Dark enough to read on sand and snow, but
  // close enough in value to jungle ground that it does not shout there.
  rect(g, 2, 2, 4, 2, '#33372e');
  rect(g, 1, 3, 6, 1, '#33372e');
  // One dull highlight along the lit edge -- the only thing that catches the
  // eye, and only when the eye is looking.
  rect(g, 3, 1, 2, 1, '#5a6152');
  // A hint of the trigger, dark on dark.
  px(g, 4, 2, '#1d2019');
  addOutline(c, '#191c15');
  return c;
}

/**
 * The badge on a pickup label: a grenade, small enough to sit beside 5px text.
 * Deliberately not the crate sprite -- the crate is what you walked into, and
 * the label is about what you walked away with.
 */
export function bakeGrenadeIcon(): Sprite {
  const { c, g } = makeCanvas(8, 9);
  rect(g, 3, 1, 2, 1, '#8a9370');
  px(g, 5, 2, '#8a9370');
  rect(g, 2, 3, 4, 4, '#3f4a35');
  rect(g, 2, 3, 4, 1, '#57633f');
  px(g, 3, 4, '#c9d4b8');
  addOutline(c, '#161c10');
  return c;
}

/** The badge on a rescue label: a civilian, waving. */
export function bakeHostageIcon(): Sprite {
  const { c, g } = makeCanvas(8, 9);
  rect(g, 3, 1, 2, 2, PALETTES.hostage.face);
  rect(g, 2, 3, 4, 3, PALETTES.hostage.kit);
  px(g, 1, 2, PALETTES.hostage.kit);
  px(g, 6, 3, PALETTES.hostage.kit);
  rect(g, 2, 6, 1, 2, PALETTES.hostage.body);
  rect(g, 5, 6, 1, 2, PALETTES.hostage.body);
  addOutline(c, PALETTES.hostage.outline);
  return c;
}


export function bakeMuzzleFlash(): Sprite {
  const { c, g } = makeCanvas(7, 7);
  px(g, 3, 3, '#fffbe0');
  for (const [x, y] of [[2, 3], [4, 3], [3, 2], [3, 4]]) px(g, x, y, '#ffe27a');
  for (const [x, y] of [[1, 3], [5, 3], [3, 1], [3, 5], [2, 2], [4, 4], [2, 4], [4, 2]]) px(g, x, y, '#ff9b2e');
  return c;
}
