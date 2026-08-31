import { CONFIG } from './config.js';
import { explode } from './combat.js';
import type { World } from './world.js';

/**
 * Mines. Invisible until something steps on one, then a short fuse gives you
 * just enough time to notice the flash and run -- which is the whole mechanic:
 * a minefield is a map you have to cross slowly and deliberately.
 *
 * Enemies trigger them too, so herding a patrol across a field is a legitimate
 * way to clear one.
 */
export function stepMines(world: World, dt: number): void {
  for (const mine of world.mines) {
    if (!mine.alive) continue;

    if (mine.fuse < 0) {
      // Dormant: look for anything standing on it.
      for (const a of world.actors) {
        if (!a.alive) continue;
        if (Math.hypot(a.pos.x - mine.pos.x, a.pos.y - mine.pos.y) > CONFIG.mine.triggerRadius) continue;
        mine.fuse = CONFIG.mine.fuse;
        mine.revealed = true;
        break;
      }
      // Hostages are light enough not to set them off, so an escort is not a
      // guaranteed loss the moment it crosses a field.
      continue;
    }

    mine.fuse -= dt;
    if (mine.fuse > 0) continue;
    mine.alive = false;
    explode(world, mine.pos, CONFIG.mine.blastRadius);
  }
}

/** A blast sets off neighbouring mines -- chain them to clear a lane. */
export function primeMinesInBlast(world: World, x: number, y: number, radius: number): void {
  for (const mine of world.mines) {
    if (!mine.alive || mine.fuse >= 0) continue;
    if (Math.hypot(mine.pos.x - x, mine.pos.y - y) > radius) continue;
    mine.revealed = true;
    // Staggered slightly so a chain reads as a ripple rather than one bang.
    mine.fuse = 0.08 + Math.random() * 0.12;
  }
}
