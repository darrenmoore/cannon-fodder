import { CONFIG } from '../config.js';
import { Arena } from './arena.js';
import { Fog } from '../render/fog.js';
import { createWorld } from './world.js';
import { stepWorld } from './step.js';
import { Faction } from '../types.js';
import { settings } from '../ui/settings.js';
import type { Camera } from '../render/camera.js';
import type { GameMap } from './map.js';
import type { Input } from '../shell/input.js';
import type { Vec2 } from '../types.js';
import type { World } from './world.js';

/**
 * A battle with nobody playing it.
 *
 * `Game`'s sibling, deliberately not its subclass. A mission is orders, an aim,
 * grenades, a briefing, an objective and an end; this has none of those, and
 * inheriting them in order to switch them all off would leave the switches
 * lying around for somebody to turn back on. What the two genuinely share is
 * the ordered pass over a world, and that lives in `step.ts` where both can
 * call it.
 *
 * It is also the shape the intro backdrop wants: run a world, draw it, take no
 * input at all. That is `Input`'s `sealed` mode and one flag away from here.
 */
export class ArenaGame {
  readonly world: World;
  readonly arena: Arena;
  /** Set when the viewer asks to leave. */
  exitRequested = false;

  /** Seconds since the viewer last drove the camera, for the drift. */
  private idle = 0;

  constructor(
    private readonly map: GameMap,
    readonly camera: Camera,
    readonly input: Input,
    private readonly onClearDecals: () => void,
    /**
     * Hold the camera still whatever the viewer's preference says.
     *
     * The backdrop sets this. `settings().arenaLockCamera` is a *taste* -- how
     * somebody who walked into the arena likes to watch it -- and the backdrop
     * is not a matter of taste: text sits on it, and a background that chases
     * the fighting reads as the menu sliding about.
     */
    private readonly alwaysLocked = false,
  ) {
    this.world = this.newWorld();
    this.arena = new Arena(this.world);
    const front = this.arena.front() ?? this.centre();
    this.camera.centreOn(front, this.map);
  }

  private newWorld(): World {
    /*
     * Veteran, always.
     *
     * The rung is fixed rather than offered because it is not a difficulty
     * here -- there is nobody for it to be difficult *for*. It is the setting
     * at which the AI hunts, flanks and reacts sharply enough to be worth
     * watching, and the arena doctrines multiply into it from there.
     */
    const world = createWorld(this.map, 'veteran');
    this.onClearDecals();

    /*
     * No fog, whatever the levers say.
     *
     * Fog is drawn from what the *squad* can see (`fog.step` takes
     * `world.soldiers`), and there is no squad -- so an arena inheriting a
     * mission's fog would black out the entire map and render a fight nobody
     * could see. The arena doctrines already set `vision: 0`; this is the belt
     * to that pair of braces, because the failure is total rather than subtle.
     */
    world.fog = new Fog(this.map, 0);
    return world;
  }

  private centre(): Vec2 {
    return { x: this.map.pixelWidth / 2, y: this.map.pixelHeight / 2 };
  }

  step(dt: number): void {
    this.moveCamera(dt);
    // No squad: `stepSoldiers` is not called at all, and no objective is
    // resolved -- there is nothing here that can be won or lost.
    stepWorld(this.world, dt, null);
    this.arena.step(dt);

    for (const cmd of this.input.drain()) {
      // `spectator` has already dropped everything that would reach the
      // simulation; what survives is the way out and the camera.
      if (cmd.type === 'exit') this.exitRequested = true;
      if (cmd.type === 'recentre') this.camera.release();
    }
  }

  /**
   * The camera follows the fighting.
   *
   * Handed the hottest cell of the influence map, which is exactly what the
   * commanders are already computing to decide where to send men -- so the view
   * goes where the battle goes for free. A deliberate few seconds of grace
   * after any manual pan, or a viewer trying to look at something would be
   * dragged off it.
   */
  private moveCamera(dt: number): void {
    /*
     * Locked: the middle of the map, and nothing moves it.
     *
     * The drains still happen -- `consumePan` and the shake bank both
     * accumulate whether or not anybody reads them, and a lock that let them
     * pile up would lurch the moment it was switched off. The shake is dropped
     * rather than applied, because a still frame that jolts on every explosion
     * is not a locked camera.
     */
    if (this.alwaysLocked || settings().arenaLockCamera) {
      this.input.consumePan(this.camera.zoom);
      this.input.edgeScroll(dt);
      this.world.shake = 0;
      this.camera.lookAt(this.centre(), this.map);
      this.camera.update(dt, null, this.map);
      return;
    }

    const pan = this.input.consumePan(this.camera.zoom);
    const edge = this.input.edgeScroll(dt);
    if (pan.x !== 0 || pan.y !== 0 || edge.x !== 0 || edge.y !== 0) this.idle = 0;
    else this.idle += dt;
    this.camera.pan(pan.x + edge.x, pan.y + edge.y, this.map);

    if (this.world.shake > 0) {
      this.camera.addShake(this.world.shake);
      this.world.shake = 0;
    }

    const focus = this.idle > CONFIG.arena.driftAfter
      ? this.arena.front() ?? this.centre()
      : null;
    this.camera.update(dt, focus, this.map);
  }

  /** Live men and losses per side, for the readout. */
  readout(): { green: number; red: number; greenLost: number; redLost: number } {
    return {
      green: this.arena.standing(Faction.Player),
      red: this.arena.standing(Faction.Enemy),
      greenLost: this.arena.losses[0],
      redLost: this.arena.losses[1],
    };
  }
}
