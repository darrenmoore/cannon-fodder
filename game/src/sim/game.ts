import { CONFIG } from '../config.js';
import { sfxDenied, sfxLose, sfxScream, sfxWin } from '../shell/audio.js';
import { throwGrenade } from './combat.js';
import { resolvePhase } from './objectives.js';
import { stepWorld } from './step.js';
import { classifyClick, orderAttack, orderDemolish, orderMove } from './troops.js';
import { createWorld, livingSoldiers, squadCentre } from './world.js';
import { Faction, Phase } from '../types.js';
import type { Camera } from '../render/camera.js';
import type { Deployment } from './campaign.js';
import type { DifficultyId } from './difficulty.js';
import type { Input } from '../shell/input.js';
import type { GameMap } from './map.js';
import type { Renderer } from '../render/render.js';
import type { World } from './world.js';

/**
 * Mission orchestration: turns input into orders, runs the simulation in a
 * fixed order every step, and asks objectives.ts whether the mission is over.
 *
 * The step order matters. Soldiers and enemies both steer and integrate against
 * terrain first; only then does `resolveOverlaps` push apart anyone who ended up
 * sharing space. Doing it the other way round would let a de-overlap push
 * survive into the next frame with a unit standing inside a tree.
 */
export class Game {
  world: World;
  /** Set when the player asks to return to the level select. */
  exitRequested = false;
  /** Set when the player asks for the next mission from the end panel. */
  nextRequested = false;
  /**
   * Fired once, the instant a mission resolves either way. This is where the
   * campaign gets written, so it must stay exactly-once: `resolvePhase` only
   * transitions out of Playing once, and every later step returns early.
   */
  onResolved: ((world: World) => void) | null = null;

  constructor(
    private readonly map: GameMap,
    readonly camera: Camera,
    private readonly renderer: Renderer,
    readonly input: Input,
    private readonly difficulty: DifficultyId,
    /**
     * Asked for the squad on every start *and* every restart, rather than being
     * handed a fixed list. Replaying a mission you have already won deploys the
     * roster as it stands now — promotions kept, casualties still buried — which
     * is the only reading that does not need the campaign to be rewound.
     */
    private readonly roster: () => Deployment[] = () => [],
  ) {
    this.world = this.newWorld();
  }

  private newWorld(): World {
    const world = createWorld(this.map, this.difficulty, this.roster());
    this.renderer.clearDecals();
    const centre = squadCentre(world);
    if (centre) this.camera.centreOn(centre, this.map);
    return world;
  }

  restart(): void {
    this.world = this.newWorld();
  }

  step(dt: number): void {
    const w = this.world;

    this.input.syncWorld(this.camera);
    // The reticle is re-resolved against a squad that has moved since the last
    // frame, so a grenade held while the herd walks stays clamped to a range
    // its thrower can actually manage -- and the throw lands where the player
    // was shown it would.
    this.input.syncAim(w);
    this.handleCommands();
    this.moveCamera(dt);

    const before = w.phase;

    stepWorld(w, dt, {
      // Aimed with a cursor on a mouse and a thumbstick on a phone; the
      // simulation only ever sees the resolved point.
      manualAim: this.input.firing ? this.input.aim.point : null,
      // The cursor's world point, for idle soldiers to watch -- gated on the
      // pointer actually being over the canvas so a parked cursor on another
      // monitor doesn't pin the whole squad's gaze at one stale spot.
      cursor: this.input.inside ? this.input.world : null,
    });

    // Nothing below this line runs once the mission is decided; `stepWorld`
    // has already taken the short path that only settles the blood.
    if (before !== Phase.Playing) return;

    resolvePhase(w, dt);
    if (w.phase !== before) {
      if (w.phase === Phase.Won) {
        sfxWin();
        // They turn and face you. It is the only moment in the game where the
        // squad looks out of the screen instead of at the ground they are
        // crossing, and it costs one line because the simulation stops stepping
        // soldiers the instant the mission resolves -- so nothing overwrites it.
        for (const s of livingSoldiers(w)) {
          s.angle = Math.PI / 2;
          s.vel.x = 0;
          s.vel.y = 0;
        }
      }
      else if (w.phase === Phase.Lost) sfxLose();
      this.onResolved?.(w);
    }
  }

  private handleCommands(): void {
    const w = this.world;
    for (const cmd of this.input.drain()) {
      if (cmd.type === 'exit') {
        this.exitRequested = true;
        continue;
      }
      if (cmd.type === 'restart') {
        if (w.phase !== Phase.Playing) this.restart();
        continue;
      }
      // Framing the squad is about the camera, not the mission, so it still
      // works while the end panel is up and you are reading who died.
      if (cmd.type === 'recentre') {
        this.camera.release();
        continue;
      }

      // Once the mission is decided, the end panel owns the input. Clicking
      // the world should not quietly restart a mission you are still reading.
      if (w.phase !== Phase.Playing) continue;

      if (cmd.type === 'grenade') {
        // The command only says *now*. Where it lands is wherever the reticle
        // has been left, which the player has been steering and the renderer
        // has been drawing -- so the throw goes exactly where it was shown.
        this.tryGrenade(this.input.aim.point);
        continue;
      }

      if (cmd.type === 'select') {
        // Raised by the action bar, and deliberately not acted on: the squad is
        // still a single herd with no per-soldier selection behind it. Dropping
        // it here rather than in `input.ts` keeps the input scheme complete for
        // whenever splitting the squad does land.
        continue;
      }

      // A click on an enemy or a building is an attack order, not a move. The
      // slack comes from the layout, because a finger needs a much bigger
      // target than a cursor to hit a seven-pixel enemy.
      const hit = classifyClick(w, cmd.world, this.input.slack);
      if (hit.kind === 'enemy') orderAttack(w, hit.actor);
      else if (hit.kind === 'building') orderDemolish(w, hit.building);
      else orderMove(w, cmd.world);
    }
  }

  /**
   * Thrown by whichever soldier the reticle picked out.
   *
   * The thrower comes from the aim rather than being chosen again here, because
   * the renderer has been highlighting him for as long as the reticle has been
   * up. Recomputing it would let the throw come from someone the player was
   * never shown -- and the two searches disagree the moment the nearest man is
   * wading, since a soldier holding his rifle clear of the water cannot throw.
   */
  private tryGrenade(at: { x: number; y: number }): void {
    const w = this.world;

    // Say no out loud. Both of these used to be silent, so a throw that never
    // happened was indistinguishable from a throw the input layer had dropped
    // -- which is most of why grenades felt unreliable.
    if (w.grenadesHeld <= 0) {
      const from = squadCentre(w) ?? at;
      w.fx.popup(from, 'no grenades', '#ff6a48');
      sfxDenied();
      return;
    }
    if (w.grenadeCooldown > 0) {
      const from = squadCentre(w) ?? at;
      w.fx.popup(from, 'reloading', '#d8a13c');
      sfxDenied();
      return;
    }

    let thrower = this.input.aim.thrower;
    if (!thrower || !thrower.alive || thrower.wading) {
      thrower = null;
      let bestD = Infinity;
      for (const s of livingSoldiers(w)) {
        if (s.wading) continue;
        const d = Math.hypot(s.pos.x - at.x, s.pos.y - at.y);
        if (d < bestD) { bestD = d; thrower = s; }
      }
    }
    if (!thrower) return;

    w.grenadesHeld--;
    w.grenadeCooldown = CONFIG.grenade.cooldown;
    throwGrenade(w, thrower.pos, at, Faction.Player);
  }

  private moveCamera(dt: number): void {
    const pan = this.input.consumePan(this.camera.zoom);
    const edge = this.input.edgeScroll(dt);
    this.camera.pan(pan.x + edge.x, pan.y + edge.y, this.map);
    // Explosions bank shake on the world; the camera drains it here.
    if (this.world.shake > 0) {
      this.camera.addShake(this.world.shake);
      this.world.shake = 0;
    }
    this.camera.update(dt, squadCentre(this.world), this.map);

    /*
     * The wounded, drained after the camera has moved so the pan is against
     * where the player is actually looking this frame rather than last.
     *
     * Same arrangement as `shake` above: the simulation banks the event, and
     * this layer -- the one that owns the camera -- turns it into something the
     * player hears. Cleared unconditionally, so a mission that runs with the
     * sound off does not accumulate an array all game (201-qa 014).
     */
    if (this.world.screams.length > 0) {
      const halfW = this.camera.viewW / 2;
      const cx = this.camera.x + halfW;
      for (const at of this.world.screams) {
        sfxScream(halfW > 0 ? (at.x - cx) / halfW : 0);
      }
      this.world.screams.length = 0;
    }
  }
}
