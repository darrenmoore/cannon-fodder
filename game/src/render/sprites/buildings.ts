/**
 * Structures, each baked in its states of repair. Damage is drawn rather than
 * tinted: holes through the thatch, a wall caving in, then an ash-grey wreck.
 * A levelled building has to read as levelled from across the map.
 */

import { TENT_RAMP, addOutline, hashRnd, makeCanvas, px, rect } from './paint.js';
import type { Sprite } from './paint.js';

/**
 * A grass hut, in three states of repair. Damage is drawn, not just tinted:
 * holes punched through the thatch, then a wall caving in, then a wreck. A
 * levelled hut has to read as levelled from across the map.
 */
/**
 * The village hut.
 *
 * The reference's hut is not a cottage. It is a round mud-walled drum under an
 * enormous circular thatch roof, seen from almost directly above, so what you
 * actually see is a disc of burnt-orange straw with a smoke hole punched in the
 * middle and a sliver of wall and a black doorway peeking out beneath its
 * southern rim. A pitched roof and a gable end is the wrong building entirely,
 * and reads as a European farmhouse dropped into a jungle.
 */
export function bakeHut(stage: number): Sprite {
  const { c, g } = makeCanvas(36, 36);
  const rnd = hashRnd(97 + stage * 31);

  const CX = 18, CY = 15;      // centre of the roof disc
  const RX = 17, RY = 14;      // its radii

  if (stage >= 3) {
    // Wrecked.
    //
    // The whole point of this sprite is to say "dealt with" from across the map,
    // and drawn in burnt browns it said "still a hut, but scruffier" -- the same
    // family of colour as the thatch it used to be. Ash is grey, so the wreck
    // goes grey: a pale bed of it where the roof came down, charcoal beams
    // through it, and only a few embers left with any warmth in them.
    for (let i = 0; i < 110; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 16;
      px(g, CX + Math.cos(a) * r, 24 + Math.sin(a) * r * 0.6,
        rnd() < 0.5 ? '#4a4a48' : rnd() < 0.6 ? '#63635f' : '#2e2e2c');
    }
    // The collapsed roof, as a mound of ash where the dome used to sit.
    for (let y = -7; y <= 6; y++) {
      for (let x = -13; x <= 13; x++) {
        if ((x * x) / 169 + (y * y) / 49 > 1) continue;
        if (rnd() < 0.24) continue;
        const lit = -(x * 0.4 + y * 0.8) / 10;
        px(g, CX + x, CY + y + 6,
          lit > 0.4 ? '#8e8e88' : lit > 0.05 ? '#6e6e68' : rnd() < 0.3 ? '#3a3a38' : '#4e4e4a');
      }
    }
    // A broken ring of wall, gapped where it fell in. Scorched, not burnt away.
    for (let a = 0; a < Math.PI * 2; a += 0.09) {
      const x = CX + Math.cos(a) * 12;
      const y = 24 + Math.sin(a) * 6;
      if (rnd() < 0.22) continue;
      const h = 3 + ((rnd() * 4) | 0);
      rect(g, x, y - h, 1, h, rnd() < 0.5 ? '#5e5a50' : '#43403a');
      px(g, x, y - h, '#26241f');
    }
    // Charred roof beams laid through the ash, and a handful of embers.
    for (let i = 0; i < 15; i++) px(g, 9 + i, 25 - ((i * 0.5) | 0), '#1c1a16');
    for (let i = 0; i < 11; i++) px(g, 25 - i, 22 + ((i * 0.4) | 0), '#141310');
    for (let i = 0; i < 7; i++) {
      px(g, 8 + rnd() * 20, 20 + rnd() * 8, rnd() < 0.5 ? '#8a3410' : '#5c2008');
    }
    addOutline(c, '#141310');
    return c;
  }

  // --- the wall drum, drawn first so the roof overhangs it
  //
  // It wants to be a real proportion of the sprite. Almost all roof and a grey
  // sliver of wall reads as a disc lying on the ground; the reference is closer
  // to sixty-forty, and the wall is what makes the hut a building you can walk
  // round rather than a plate.
  for (let y = 20; y < 33; y++) {
    const k = (y - 20) / 12;
    const half = Math.round(13 - k * 2.5);
    for (let x = CX - half; x <= CX + half; x++) {
      // Mud and stone, lit from the upper left like everything else, and
      // greened where the wall meets the ground.
      const across = (x - CX) / half;
      const lit = -across * 0.55 + (1 - k) * 0.45;
      const n = (x * 7 + y * 13) % 5;
      let colour = lit > 0.42 ? '#8d8a70' : lit > 0.05 ? '#75705c' : lit > -0.3 ? '#5d5847' : '#453f32';
      if (n === 0) colour = '#4e4a3a';
      if (k > 0.82) colour = '#332f26';
      px(g, x, y, colour);
    }
  }
  // (The doorway is cut *after* the roof, below -- drawn here first, the dome
  // and its fringe buried all but three rows of it, which is how the hut spent
  // a batch reading as nothing but roof. 200-qa 008.)

  // --- the thatch dome
  //
  // Lit hard from the upper left, cream through rust to maroon on the far side.
  // A flat disc with radial spokes from a centred hole is a cinnamon bun; what
  // makes it a roof is that the tone follows a sphere.
  for (let y = -RY; y <= RY; y++) {
    for (let x = -RX; x <= RX; x++) {
      const e = (x * x) / (RX * RX) + (y * y) / (RY * RY);
      if (e > 1) continue;

      // Surface normal of a dome, dotted with a light up and to the left.
      const nx = x / RX, ny = y / RY;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = (-nx * 0.55 - ny * 0.7 + nz * 0.45);

      // Straw laid in courses running down the slope, so the surface has grain
      // without the spokes converging on a single point.
      const a = Math.atan2(y * 1.25, x);
      const course = Math.sin(a * 17 + e * 9) * 0.5 + 0.5;
      const shade2 = lit + (course - 0.5) * 0.22 + (rnd() - 0.5) * 0.1;

      let colour: string;
      if (shade2 > 0.62) colour = '#ffbd5a';
      else if (shade2 > 0.42) colour = '#e79034';
      else if (shade2 > 0.24) colour = '#c4631f';
      else if (shade2 > 0.06) colour = '#a03d12';
      else if (shade2 > -0.12) colour = '#7b1c07';
      else colour = '#511003';
      px(g, CX + x, CY + y, colour);
    }
  }
  // The smoke hole sits up on the lit slope, not dead centre.
  for (let y = -2; y <= 1; y++) {
    for (let x = -2; x <= 2; x++) {
      if ((x * x) / 4 + (y * y) / 2.2 > 1) continue;
      px(g, CX + x - 2, CY + y - 4, '#1a0d03');
    }
  }
  px(g, CX - 4, CY - 6, '#ffbd5a');
  px(g, CX - 3, CY - 6, '#ffbd5a');

  // The thatch fringe: 1-3px teeth of straw overhanging the wall, with leaf
  // specks caught in it. This is the edge that stops the roof reading as a
  // stamped shape, so it is drawn per column rather than as an outline.
  for (let x = -RX; x <= RX; x++) {
    const k = x / RX;
    const drop = Math.round(Math.sqrt(Math.max(0, 1 - k * k)) * RY);
    if (drop <= 0) continue;
    const teeth = 1 + ((rnd() * 3) | 0);
    for (let s = 0; s < teeth; s++) {
      const y = CY + drop + s;
      px(g, CX + x, y, s === teeth - 1 ? '#3a0c02' : rnd() < 0.4 ? '#7b1c07' : '#511003');
    }
    if (rnd() < 0.14) px(g, CX + x, CY + drop + teeth, '#404000');
  }

  // Vegetation creeping up the wall, which is what roots the hut in the ground.
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI;
    const x = CX + Math.cos(a) * 13;
    const y = 27 + Math.sin(a) * 4;
    rect(g, x, y - 1 - ((rnd() * 3) | 0), 1, 2 + ((rnd() * 2) | 0), rnd() < 0.5 ? '#404000' : '#565608');
  }

  /*
   * The doorway, cut into everything above it. Drawn last so the dome, the
   * fringe and the creepers cannot bury it -- the arch reads as a recess
   * under the eave, which is what a door in a thatched dome actually is. The
   * lit lintel row is the cut edge of the straw catching the light; without
   * it the arch is a black hole floating on the roof.
   */
  for (let y = 0; y < 12; y++) {
    const arch = y < 3 ? 2 + y : 4;
    for (let x = -arch; x <= arch; x++) px(g, CX - 1 + x, 21 + y, '#0b0803');
  }
  for (let x = -3; x <= 3; x++) px(g, CX - 1 + x, 20, '#ffbd5a');
  px(g, CX - 5, 21, '#e79034');
  px(g, CX + 3, 21, '#a03d12');
  // A few straw ends drooping over the opening, so the cut stays thatch.
  for (const x of [-3, 0, 2]) px(g, CX - 1 + x, 21, '#7b1c07');

  if (stage >= 1) {
    // Scarred: the thatch torn open in patches, and pocks in the wall.
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.3 + rnd() * 0.6;
      px(g, CX + Math.cos(a) * RX * r, CY + Math.sin(a) * RY * r, rnd() < 0.5 ? '#3a1605' : '#512008');
    }
    for (let i = 0; i < 14; i++) px(g, CX - 12 + rnd() * 24, 23 + rnd() * 8, '#332d20');
  }

  if (stage >= 2) {
    // Barely standing: a hole clean through the roof, and the wall breached.
    for (let i = 0; i < 46; i++) {
      const a = 2.1 + rnd() * 1.5;
      const r = 0.2 + rnd() * 0.62;
      px(g, CX + Math.cos(a) * RX * r, CY + Math.sin(a) * RY * r, rnd() < 0.55 ? '#180d04' : '#2e1707');
    }
    rect(g, CX - 12, 24, 5, 7, '#100c05');
    for (let i = 0; i < 22; i++) px(g, CX - 14 + rnd() * 28, 29 + rnd() * 4, rnd() < 0.5 ? '#4a4436' : '#61594a');
  }

  return c;
}

/**
 * The arctic cabin.
 *
 * A thatched mud hut in a snowfield is a mission brief nobody wrote. The
 * reference's arctic buildings are squat log cabins: horizontal timber courses,
 * a snow-laden roof pitched toward the viewer, a black doorway, and a drift
 * banked against the windward wall.
 */
export function bakeCabin(stage: number): Sprite {
  const { c, g } = makeCanvas(38, 34);
  const rnd = hashRnd(1471 + stage * 53);

  if (stage >= 3) {
    // Burnt out: a bed of ash where the cabin stood, four charred corner posts
    // still up, and snow already starting to take it back.
    for (let y = 16; y < 30; y++) {
      for (let x = 5; x < 33; x++) {
        if (rnd() < 0.2) continue;
        const lit = -((x - 19) * 0.3 + (y - 23) * 0.8) / 9;
        px(g, x, y, lit > 0.35 ? '#7e8288' : lit > 0 ? '#5e6266' : rnd() < 0.3 ? '#2a2c2e' : '#42464a');
      }
    }
    for (let i = 0; i < 60; i++) {
      px(g, 5 + rnd() * 28, 17 + rnd() * 13, rnd() < 0.5 ? '#1a1a1c' : '#33373a');
    }
    for (const x of [7, 12, 24, 30]) {
      const h = 5 + ((rnd() * 6) | 0);
      rect(g, x, 28 - h, 2, h, rnd() < 0.5 ? '#2a2624' : '#171514');
      px(g, x, 28 - h, '#d2e6ee');
    }
    // Snow drifting back over the cold edges of it.
    for (let i = 0; i < 26; i++) px(g, 5 + rnd() * 28, 26 + rnd() * 5, '#a8c2ce');
    for (let i = 0; i < 5; i++) px(g, 9 + rnd() * 20, 19 + rnd() * 8, '#7a2c0c');
    addOutline(c, '#0a0d10');
    return c;
  }

  // Walls: horizontal log courses, each with a lit top edge and a dark seam.
  for (let y = 14; y < 30; y++) {
    const course = ((y - 14) / 3) | 0;
    for (let x = 5; x < 33; x++) {
      const lit = x < 17;
      let colour = (y - 14) % 3 === 0 ? '#3a2a18'
        : lit ? '#7a5630' : '#5c4022';
      if ((x * 5 + course * 11) % 7 === 0) colour = '#4a3420';
      px(g, x, y, colour);
    }
  }
  // The end grain of the logs, poking past the corners.
  for (let y = 14; y < 30; y += 3) {
    px(g, 4, y + 1, '#8a6438');
    px(g, 33, y + 1, '#5c4022');
  }

  // Roof: pitched toward the viewer, with a deep load of snow on it.
  for (let y = 0; y < 15; y++) {
    const inset = Math.round((14 - y) * 0.55);
    for (let x = 2 + inset; x < 36 - inset; x++) {
      // Snow on top, shingle showing along the eave where it has slid off.
      const snow = y < 10 - (rnd() < 0.2 ? 1 : 0);
      px(g, x, y, snow
        ? (y < 4 ? '#f2fbfd' : y < 7 ? '#dcf0f6' : '#c2dde8')
        : (x % 4 === 0 ? '#2e2418' : '#483722'));
    }
  }
  // Icicles hanging off the eave. (No ridge stripe: a pure-white row at y=0
  // ran wider than the roof and read as a stray scanline -- the snow ramp is
  // the ridge.)
  for (let x = 3; x < 35; x++) {
    if (rnd() > 0.24) continue;
    const len = 1 + ((rnd() * 3) | 0);
    for (let s = 0; s < len; s++) px(g, x, 15 + s, s === len - 1 ? '#a8ccdc' : '#dceef6');
  }

  // Doorway, and a drift banked against the wall beside it.
  rect(g, 17, 21, 6, 9, '#080a0c');
  rect(g, 16, 21, 1, 9, '#3a2a18');
  rect(g, 23, 21, 1, 9, '#3a2a18');
  for (let x = 3; x < 35; x++) {
    const drift = Math.round(3 + Math.sin(x * 0.4) * 1.6 + rnd() * 1.5);
    for (let s = 0; s < drift; s++) px(g, x, 30 - s, s > drift - 2 ? '#b4d2de' : '#dcf0f6');
  }

  if (stage >= 1) {
    for (let i = 0; i < 24; i++) px(g, 6 + rnd() * 26, 15 + rnd() * 14, rnd() < 0.5 ? '#33240f' : '#241a10');
    for (let i = 0; i < 12; i++) px(g, 8 + rnd() * 20, 2 + rnd() * 9, '#7a8c96');
  }
  if (stage >= 2) {
    rect(g, 7, 18, 6, 8, '#080a0c');
    for (let i = 0; i < 30; i++) px(g, 4 + rnd() * 30, 3 + rnd() * 24, rnd() < 0.5 ? '#1c1610' : '#2e2418');
    for (let i = 0; i < 16; i++) px(g, 5 + rnd() * 28, 28 + rnd() * 4, '#8fa8b4');
  }

  addOutline(c, '#0a0d10');
  return c;
}

/**
 * The outpost: the one building on the map that is *yours*.
 *
 * It borrowed the factory sprite to begin with, which was wrong twice over. The
 * factory is 52x54 against a hut's 36, so it loomed over a two-tile footprint;
 * and it is a chimney, windows and flat industrial concrete, which says
 * "somewhere things are made" when the job is to say "somewhere men are dug
 * in". A player told to defend it read it as another thing to level.
 *
 * So: sandbags, not walls. A low bunker of stacked bags with a firing slit and
 * a timber roof, at the same scale as the buildings it stands among, with the
 * squad's own green on a flag over it -- which is the fastest way a top-down
 * sprite can say whose it is, and the reason the original's own tents read as
 * friendly at a glance.
 */
export function bakeOutpost(stage: number): Sprite {
  const { c, g } = makeCanvas(38, 34);
  const rnd = hashRnd(2207 + stage * 37);

  if (stage >= 3) {
    // Overrun: the bags burst and spilled, the roof gone, the flag down. Ash
    // grey like every other wreck in the game, so "dealt with" reads the same
    // whatever it used to be.
    for (let y = 20; y < 31; y++) {
      for (let x = 4; x < 34; x++) {
        if (rnd() < 0.28) continue;
        const lit = -((x - 19) * 0.3 + (y - 26) * 0.8) / 9;
        px(g, x, y, lit > 0.35 ? '#8e8e88' : lit > 0 ? '#6e6e68' : rnd() < 0.3 ? '#3a3a38' : '#4e4e4a');
      }
    }
    // Spilled sand from the burst bags, and charred timbers through it.
    for (let i = 0; i < 40; i++) px(g, 5 + rnd() * 28, 22 + rnd() * 8, rnd() < 0.5 ? '#8a7f52' : '#6d6440');
    for (let i = 0; i < 14; i++) px(g, 8 + i, 27 - ((i * 0.3) | 0), '#1c1a16');
    for (let i = 0; i < 10; i++) px(g, 26 - i, 24 + ((i * 0.4) | 0), '#141310');
    for (let i = 0; i < 6; i++) px(g, 10 + rnd() * 18, 23 + rnd() * 6, rnd() < 0.5 ? '#8a3410' : '#5c2008');
    addOutline(c, '#141310');
    return c;
  }

  /*
   * Silhouette first.
   *
   * The first attempt was a rectangle of bags under a rectangle of timber, and
   * it read as a crate. Every other building in this game is recognisable by
   * its outline alone -- the hut is a disc, the cabin a pitch -- so this one
   * steps *outward* as it comes down: a narrow corrugated roof, a bag wall
   * wider than it, and a spilled apron of bags wider still. Low, splayed and
   * dug in, which is the shape of a thing meant to be held.
   */

  // --- the bag courses, each row a little wider than the one above it
  for (let row = 0; row < 5; row++) {
    const y = 17 + row * 3;
    const spread = row;                       // steps out as it descends
    const x0 = 6 - spread;
    const x1 = 32 + spread;
    const offset = (row % 2) * 2;
    for (let x = x0 + offset; x < x1; x += 4) {
      const tone = (x * 3 + row * 7) % 3;
      const body = tone === 0 ? '#6d6440' : tone === 1 ? '#7a7148' : '#5e5636';
      rect(g, x, y, 4, 3, body);
      rect(g, x, y, 4, 1, '#8a7f52');         // each bag lit along its top
      px(g, x + 3, y + 2, '#4e4830');         // the seam between two bags
    }
  }

  // --- corrugated roof, narrower than the wall so the bags read beneath it
  for (let y = 9; y < 17; y++) {
    const inset = Math.round((16 - y) * 0.35);
    for (let x = 9 + inset; x < 29 - inset; x++) {
      // Grooves, not grain: alternating columns is what says corrugated iron,
      // and it is the one surface that reads the same on snow and on jungle.
      const groove = x % 3 === 0;
      px(g, x, y, y < 11 ? (groove ? '#6a7076' : '#878e94')
        : groove ? '#3c4248' : y < 14 ? '#5a6066' : '#4a5056');
    }
  }
  for (let x = 9; x < 29; x++) px(g, x, 9, '#9aa2a8');       // lit ridge
  for (let x = 8; x < 30; x += 2) px(g, x, 16, '#20242a');   // eave shadow

  // --- the firing slit, which is what makes it a position and not a shed
  rect(g, 14, 19, 10, 3, '#0a0c08');
  rect(g, 14, 19, 10, 1, '#2e2c20');

  // --- sandbags spilled around the base, breaking the footprint's straight line
  for (let i = 0; i < 14; i++) {
    const x = 3 + ((rnd() * 32) | 0);
    const y = 29 + ((rnd() * 2) | 0);
    rect(g, x, y, 3, 2, rnd() < 0.5 ? '#6d6440' : '#5e5636');
    px(g, x, y, '#8a7f52');
  }

  // --- the flag: the squad's green, on the only building that is theirs
  rect(g, 30, 1, 1, 10, '#2e2a1e');
  if (stage < 2) {
    // A pennant rather than a rectangle -- it reads as cloth at seven pixels.
    rect(g, 31, 2, 6, 3, '#4a6a2a');
    rect(g, 31, 2, 6, 1, '#6d9a4a');
    px(g, 36, 5, '#4a6a2a');
    px(g, 35, 5, '#3a5220');
  }

  if (stage >= 1) {
    // Bags burst open, spilling sand down the wall.
    for (let i = 0; i < 18; i++) px(g, 6 + rnd() * 26, 18 + rnd() * 13, rnd() < 0.5 ? '#4e4830' : '#3a3626');
    for (let i = 0; i < 10; i++) px(g, 8 + rnd() * 22, 28 + rnd() * 3, '#8a7f52');
  }
  if (stage >= 2) {
    // Roof holed through, and the flag shot away.
    rect(g, 8, 11, 7, 5, '#100e08');
    for (let i = 0; i < 26; i++) px(g, 4 + rnd() * 30, 10 + rnd() * 20, rnd() < 0.5 ? '#1c1610' : '#2e2418');
  }

  addOutline(c, '#0f120c');
  return c;
}

/** A concrete blockhouse: the objective on demolition maps. */
export function bakeFactory(stage: number): Sprite {
  const { c, g } = makeCanvas(52, 54);
  const rnd = hashRnd(613 + stage * 47);

  if (stage >= 3) {
    // Wrecked: the shell has gone, leaving broken walls and a slab of roof.
    // Debris first, structure over the top, so the ruin keeps its silhouette.
    for (let i = 0; i < 110; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 24;
      px(g, 26 + Math.cos(a) * r, 46 + Math.sin(a) * r * 0.4, rnd() < 0.5 ? '#20221f' : '#2e312d');
    }
    for (let i = 0; i < 60; i++) px(g, 3 + rnd() * 46, 36 + rnd() * 14, rnd() < 0.5 ? '#26282b' : '#41444a');

    // Broken wall, taller and more varied so it reads as a gutted building.
    for (let x = 5; x < 47; x++) {
      const h = 9 + ((x * 13) % 15);
      rect(g, x, 48 - h, 1, h, x % 3 === 0 ? '#54565a' : '#65676c');
      px(g, x, 48 - h, '#33353a');
    }
    // Blown-out doorway and a window that survived.
    rect(g, 20, 34, 11, 14, '#1a1c1f');
    rect(g, 8, 32, 6, 6, '#20313d');
    rect(g, 8, 32, 6, 1, '#2d4553');
    rect(g, 4, 46, 44, 3, '#3e4044');

    // A tilted slab of the fallen roof leaning against the wall.
    for (let i = 0; i < 24; i++) {
      const y = 30 + Math.floor(i * 0.45);
      rect(g, 26 + i * 0.8, y, 2, 4, i % 3 === 0 ? '#4e5054' : '#5f6165');
    }
    // Twisted reinforcing bars poking out of the top.
    for (const bx of [11, 24, 36, 44]) {
      for (let i = 0; i < 7; i++) px(g, bx + Math.round(Math.sin(i * 0.9) * 2), 30 - i, '#7d6a44');
    }
    addOutline(c, '#17181b');
    return c;
  }

  /*
   * Redrawn for 200-qa 006. The old intact stages were three flat rects of
   * grey with a mechanical x%3 stripe and four identical windows -- no
   * dither, no light, no grain, and bakeOutpost's own header mocked it. The
   * new read is the sawtooth roof: from this game's high oblique it is the
   * one silhouette that says "factory" without a label, three north-lit
   * slopes each dropping to a dark south face, glass glinting on the slopes.
   */

  // Cast shadow, hard, down and right -- the same move as the bunker's.
  rect(g, 8, 49, 42, 3, '#232522');

  // --- the sawtooth roof, y=4..30: three teeth of 9 rows (6 lit, 3 face),
  // trapezoid-inset at the top so the block reads as standing, edges ragged
  // by a pixel so nothing is ruler-straight.
  for (let y = 4; y < 31; y++) {
    const inset = Math.max(0, Math.round((30 - y) * 0.28));
    const jitL = (rnd() < 0.3 ? 1 : 0);
    const jitR = (rnd() < 0.3 ? 1 : 0);
    const phase = (y - 4) % 9;
    for (let x = 4 + inset + jitL; x <= 47 - inset - jitR; x++) {
      let colour: string;
      if (phase < 6) {
        // The lit slope, brightest at its top edge, dithering darker down.
        const k = phase + (((x * 7 + y * 13) % 3 === 0) ? 1 : 0);
        colour = k < 2 ? '#8a8c92' : k < 4 ? '#7c7e84' : '#6d6f74';
        if (rnd() < 0.07) colour = '#63656b';
      } else {
        // The south face of the tooth: near-vertical, in shadow.
        colour = phase === 6 ? '#3a3c40' : '#43454a';
      }
      px(g, x, y, colour);
    }
    // North-light glass: a broken run of panes along each slope's second row.
    if (phase === 2) {
      for (let x = 8 + inset; x < 44 - inset; x++) {
        if ((x * 31 + y * 7) % 5 < 2) px(g, x, y, rnd() < 0.3 ? '#2d4553' : '#20313d');
      }
    }
  }

  // --- the south wall, dithered concrete, lit falling off to the right.
  for (let y = 31; y < 48; y++) {
    for (let x = 4; x <= 47; x++) {
      const lit = -(x - 4) / 60 + (47 - y) / 40;
      const n = (x * 7 + y * 13) % 5;
      let colour = lit > 0.24 ? '#7c7e84' : lit > 0.06 ? '#6d6f74' : '#5e6066';
      if (n === 0) colour = '#63656b';
      if (y > 45) colour = '#4a4c50';
      px(g, x, y, colour);
    }
  }

  // Windows, unevenly placed and unevenly sized, each with a sooty streak
  // bleeding down the concrete beneath its sill.
  const windows: Array<[number, number, number, number]> = [[8, 34, 5, 6], [30, 35, 4, 5], [40, 33, 5, 6]];
  for (const [wx, wy, ww, wh] of windows) {
    rect(g, wx, wy, ww, wh, '#20313d');
    rect(g, wx, wy, ww, 1, '#2d4553');
    for (let i = 0; i < ww; i++) {
      if (rnd() < 0.5) rect(g, wx + i, wy + wh, 1, 1 + ((rnd() * 3) | 0), '#4a4c50');
    }
  }

  // The roller door, off-centre, slatted, with a lit rail and worn sill.
  rect(g, 16, 33, 12, 15, '#2a2c30');
  rect(g, 16, 33, 12, 1, '#84868c');
  for (let y = 36; y < 47; y += 3) rect(g, 16, y, 12, 1, '#232529');
  rect(g, 15, 33, 1, 15, '#3a3c40');
  rect(g, 28, 33, 1, 15, '#3a3c40');
  for (let i = 0; i < 6; i++) px(g, 16 + rnd() * 12, 47, '#54565a');

  // The chimney, NE corner: lit west edge, shaded east, a soot-black mouth
  // and stain streaks where the smoke has run down it.
  rect(g, 40, 0, 6, 14, '#5a5c60');
  rect(g, 40, 0, 1, 14, '#6c6e73');
  rect(g, 45, 0, 1, 14, '#43454a');
  rect(g, 39, 0, 8, 2, '#6c6e73');
  rect(g, 40, 0, 6, 1, '#1c1e20');
  for (const sx of [41, 44]) rect(g, sx, 2, 1, 2 + ((rnd() * 3) | 0), '#3a3c40');

  if (stage >= 1) {
    // Scarred: one window shattered dark, pocks across roof and wall.
    rect(g, 30, 35, 4, 5, '#161d23');
    for (let i = 0; i < 40; i++) px(g, 5 + rnd() * 42, 6 + rnd() * 40, rnd() < 0.5 ? '#5a5c60' : '#4a4c50');
  }

  if (stage >= 2) {
    // Barely standing: a breach through the wall, a tooth holed, chimney down.
    rect(g, 6, 32, 9, 15, '#1e2023');
    for (let i = 0; i < 22; i++) px(g, 5 + rnd() * 12, 31 + rnd() * 16, '#33353a');
    rect(g, 28, 8, 10, 6, '#1a1c1f');
    g.clearRect(40, 0, 7, 10);
    // The chimney lying across the roof where it fell.
    for (let i = 0; i < 10; i++) rect(g, 33 + i, 10 + Math.floor(i * 0.3), 1, 3, '#4e5054');
    for (let i = 0; i < 50; i++) px(g, 4 + rnd() * 44, 6 + rnd() * 40, rnd() < 0.5 ? '#26282b' : '#44464a');
  }

  addOutline(c, '#17181b');
  return c;
}

/**
 * MASH tent: where rescued hostages are delivered, and what a `reach` mission
 * often ends at -- so it is stared at while a whole squad walks to it.
 *
 * Redrawn for 200-qa 009. The first tent was one linear triangle in two
 * eye-picked tones with a vertical stripe every fifth column: no lit slope,
 * no grain, no shadow, nothing breaking the silhouette -- flat by every rule
 * in docs/style.md at once. This one follows the vocabulary: NW light (west
 * slope lit, east shaded, dither seam on the ridge line), three tones from
 * the `tent` ramp in paint.ts, a hard cast shadow down-right, guy ropes as
 * deliberate staircases, and a sagging ridge so no edge is ruler-straight.
 */
export function bakeTent(): Sprite {
  const { c, g } = makeCanvas(30, 26);
  const rnd = hashRnd(53);
  const P = TENT_RAMP;

  // Cast shadow first, hard-edged, down and right -- the same move that
  // roots the bunker. Without it the tent floats.
  rect(g, 5, 23, 24, 2, '#26261f');

  // The canvas. Apex at top, and the ridge line sags a pixel over mid-span
  // the way loaded canvas actually hangs.
  for (let y = 0; y < 18; y++) {
    const sag = y < 2 ? 1 : 0;
    const half = Math.round(((y + sag) / 17) * 13);
    for (let x = 15 - half; x <= 14 + half; x++) {
      const west = x < 15;
      // A dither seam where the two slopes meet, not a hard split.
      const seam = Math.abs(x - 14.5) < 1.6 && (x + y) % 2 === 0;
      let colour = seam ? P.canvas : west ? P.canvasLit : P.canvasShade;
      // Grain: single pixels of the middle tone, never a pattern.
      if (rnd() < 0.09) colour = P.canvas;
      // The lit edge itself: the western hem catches the sun.
      if (x === 15 - half && west) colour = P.canvasLit;
      if (x === 14 + half && !west) colour = P.outline;
      px(g, x, y + 6, colour);
    }
  }

  // Guy ropes: deliberate staircases from mid-slope to stakes in the ground.
  for (const side of [-1, 1] as const) {
    let x = 15 + side * 8;
    let y = 16;
    for (let s = 0; s < 4; s++) {
      px(g, x, y, P.rope);
      x += side;
      if (s % 2 === 1) continue;
      y += 1;
    }
    px(g, x, y + 1, P.rope);
    px(g, x, y + 2, '#26261f'); // the stake
  }

  // The doorway: flap tied back, black interior, lit jamb on the west side.
  rect(g, 12, 17, 6, 7, P.interior);
  rect(g, 11, 17, 1, 7, P.canvasLit);
  rect(g, 18, 17, 1, 7, P.canvasShade);

  // The red cross rides a canvas patch so it reads at map zoom. Red is
  // damage everywhere else in the game; this is the one standing exception,
  // inherited -- it is how the extraction has always been marked.
  rect(g, 12, 9, 6, 6, P.patch);
  rect(g, 13, 11, 4, 2, P.cross);
  rect(g, 14, 10, 2, 4, P.cross);

  addOutline(c, P.outline);
  return c;
}

/**
 * The bunker: a thing to hold, that nothing in the game can take away.
 *
 * Hold the Junction asked the player to stand in a circle drawn on open road.
 * Ground with nothing on it is not a position, it is a coordinate, and standing
 * on a coordinate for seventy-five seconds is an instruction rather than a
 * fight. So the zone gets an object under it -- and the object has to be one
 * the player can see is permanent, or defending it becomes another demolition
 * puzzle with the answer hidden.
 *
 * Which is why this is concrete and not sandbags. The outpost next door is made
 * of bags and timber and it *can* be levelled; a player who has learnt that
 * needs the difference to be visible in the silhouette before he learns it
 * again the hard way. Squat, square-shouldered, half-sunk, with a black slit
 * across the front: the outline says poured, not stacked.
 *
 * One sprite, no damage stages, because there is no damage. That is the whole
 * point of it and it is also why it is cheap.
 */
export function bakeBunker(): Sprite {
  const { c, g } = makeCanvas(34, 30);
  const rnd = hashRnd(9137);

  // Cast shadow first, hard-edged: the block sits *on* the ground, not in it.
  rect(g, 5, 22, 26, 5, '#26261f');

  // The body. Wider at the base than the top, so it reads as poured concrete
  // with a batter rather than as a box.
  for (let y = 6; y < 24; y++) {
    const inset = y < 10 ? 4 : y < 16 ? 2 : 1;
    for (let x = 2 + inset; x < 32 - inset; x++) {
      // Vertical shading only -- a top-down block lit from the north-west, done
      // in three flat tones and a dither seam rather than a ramp.
      const lit = (y - 6) / 18;
      let tone = lit < 0.28 ? '#8a8d80' : lit < 0.62 ? '#6e7167' : '#54574e';
      if (rnd() < 0.09) tone = lit < 0.45 ? '#7c7f73' : '#494c44';
      px(g, x, y, tone);
    }
  }

  // Poured-in-place seams: two horizontal lines where the shuttering met.
  for (let x = 4; x < 30; x++) {
    if (rnd() < 0.2) continue;
    px(g, x, 12, '#5f6259');
    px(g, x, 18, '#4d5047');
  }

  // The firing slit. Black, unlit, and the one thing on the sprite that is not
  // grey -- it is what stops the block reading as a rock.
  rect(g, 9, 14, 16, 3, '#101208');
  rect(g, 9, 13, 16, 1, '#3d4038');
  // A lip of shadow under the slit, so it reads as recessed rather than painted.
  for (let x = 9; x < 25; x++) px(g, x, 17, '#31342c');

  // Roof lip along the top edge, catching the light.
  for (let x = 7; x < 27; x++) px(g, x, 6, '#9ba093');

  // Sandbags banked against the near corners: somebody has been living in it.
  for (let i = 0; i < 5; i++) {
    rect(g, 3 + i * 2, 21 - (i % 2), 3, 2, i % 2 ? '#8a7f52' : '#7a7047');
    rect(g, 26 - i * 2, 21 - (i % 2), 3, 2, i % 2 ? '#7a7047' : '#8a7f52');
  }

  // Weathering: damp streaks down the face, never a gradient.
  for (let i = 0; i < 22; i++) {
    const x = 4 + ((rnd() * 26) | 0);
    const y = 8 + ((rnd() * 12) | 0);
    px(g, x, y, rnd() < 0.5 ? '#61645a' : '#787c70');
  }

  addOutline(c, '#141310');
  return c;
}
