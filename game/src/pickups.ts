import { CONFIG } from './config.js';
import { sfxPickup } from './audio.js';
import type { World } from './world.js';

/**
 * Ammo crates. Walk a soldier over one to stock up on grenades -- or shoot it
 * and take out whatever is standing nearby, which is how the original let you
 * clear a cluster of enemies without spending a man. The detonation path lives
 * in combat.ts; this module only handles collection.
 */
export function stepPickups(world: World): void {
  for (const crate of world.crates) {
    if (!crate.alive) continue;
    for (const s of world.soldiers) {
      if (!s.alive) continue;
      const reach = s.radius + CONFIG.crate.radius;
      if (Math.hypot(s.pos.x - crate.pos.x, s.pos.y - crate.pos.y) > reach) continue;

      crate.alive = false;
      world.grenadesHeld += CONFIG.grenade.perCrate;
      // Say what was taken, at the spot it was taken from. The sidebar counter
      // ticking up is easy to miss with a firefight on; this is not.
      world.fx.sparkle(crate.pos, '#ffd24a');
      world.fx.popup(
        { x: crate.pos.x, y: crate.pos.y - 10 },
        `+${CONFIG.grenade.perCrate} GRENADES`,
        '#ffd24a',
        'grenade',
      );
      sfxPickup();
      break;
    }
  }
}
