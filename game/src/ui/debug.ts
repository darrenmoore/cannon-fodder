import { makeEnemy } from '../sim/world.js';
import { EnemyKind, Phase } from '../types.js';
import type { World } from '../sim/world.js';

/**
 * The dev panel, and the only place a debug switch is allowed to live.
 *
 * The brief asked for debug controls "not to litter the code", and that is the
 * whole design constraint here. Almost everything this panel does, it does by
 * reaching into the world it is handed — spawning a man, ending a phase, taking
 * the fog down — so the simulation needs no knowledge of it at all. Exactly one
 * switch could not be done that way, `invulnerable`, and it costs `combat.ts` a
 * single line guarded by `__DEV__`.
 *
 * The whole module is behind `__DEV__`, which esbuild folds to `false` in a
 * production build, so this file and everything it imports is dropped from the
 * bundle rather than merely hidden. Dev-only means absent.
 */

/**
 * Read by the simulation. One object, one import, one line at each call site.
 *
 * `paused` freezes the simulation without freezing the *draw*, which is what
 * makes a moment photographable: the capture harness pauses, advances an exact
 * number of steps by hand, and gets the same frame every run. Wall-clock
 * timing cannot do that -- an explosion three frames in is three frames in, not
 * "about fifty milliseconds".
 */
export const debug = {
  invulnerable: false,
  paused: false,
};

const el = (tag: string, cls: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * Builds the panel and returns its teardown.
 *
 * `getWorld` rather than a world: the panel outlives any single mission, and a
 * restart replaces the world object underneath it.
 */
export function mountDebugPanel(getWorld: () => World | null): () => void {
  const root = el('div', 'debug-panel');
  root.appendChild(el('span', 'debug-title', 'DEV'));

  const button = (label: string, onClick: (w: World) => void, toggle = false): HTMLElement => {
    const b = el('button', 'debug-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      const w = getWorld();
      if (!w) return;
      onClick(w);
      if (toggle) b.classList.toggle('on');
    });
    root.appendChild(b);
    return b;
  };

  button('invuln', () => {
    debug.invulnerable = !debug.invulnerable;
  }, true);

  button('freeze', () => {
    debug.paused = !debug.paused;
  }, true);

  button('+rifle', (w) => spawnNearSquad(w, EnemyKind.Rifle));
  button('+sniper', (w) => spawnNearSquad(w, EnemyKind.Sniper));
  button('+bazooka', (w) => spawnNearSquad(w, EnemyKind.Bazooka));

  button('grenades', (w) => { w.grenadesHeld += 5; });

  button('fog', (w) => {
    // The renderer keys fog off `levers.vision`, so the switch is a value, not
    // a flag threaded through the render path.
    const stashed = (w as { debugVision?: number }).debugVision;
    if (w.levers.vision > 0) {
      (w as { debugVision?: number }).debugVision = w.levers.vision;
      w.levers.vision = 0;
    } else if (stashed) {
      w.levers.vision = stashed;
    }
  }, true);

  button('win', (w) => { w.phase = Phase.Won; w.phaseTime = 0; });
  button('lose', (w) => { w.phase = Phase.Lost; w.phaseTime = 0; });

  button('kill all', (w) => {
    for (const e of w.enemies) {
      if (!e.alive) continue;
      e.alive = false;
      e.deathTime = 0;
      w.kills++;
    }
  });

  document.body.appendChild(root);
  return () => root.remove();
}

/** Drops a fresh enemy just outside the squad, where it can be watched. */
function spawnNearSquad(world: World, kind: EnemyKind): void {
  const alive = world.soldiers.filter((s) => s.alive);
  if (alive.length === 0) return;
  const at = {
    x: alive[0].pos.x + 60 + Math.random() * 20,
    y: alive[0].pos.y - 20 + Math.random() * 40,
  };
  // `world` is the id counter: it carries `nextId`, which is all makeEnemy wants.
  world.enemies.push(makeEnemy(world, at, kind, null, world.levers));
}
