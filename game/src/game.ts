import { CONFIG } from './config.js';
import { sfxLose, sfxWin, unlockAudio } from './audio.js';
import { stepBuildings } from './buildings.js';
import { stepBullets, stepGrenades, throwGrenade } from './combat.js';
import { stepEnemies } from './enemies.js';
import { stepHostages } from './hostages.js';
import { stepMines } from './mines.js';
import { resolvePhase } from './objectives.js';
import { stepPickups } from './pickups.js';
import { resolveOverlaps } from './steering.js';
import { classifyClick, orderAttack, orderDemolish, orderMove, stepSoldiers } from './troops.js';
import { createWorld, livingSoldiers, squadCentre } from './world.js';
import { Faction, Phase } from './types.js';
import type { Camera } from './camera.js';
import type { DifficultyId } from './difficulty.js';
import type { Input } from './input.js';
import type { GameMap } from './map.js';
import type { Renderer } from './render.js';
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

  constructor(
    private readonly map: GameMap,
    readonly camera: Camera,
    private readonly renderer: Renderer,
    readonly input: Input,
    private readonly difficulty: DifficultyId,
  ) {
    this.world = this.newWorld();
  }

  private newWorld(): World {
    const world = createWorld(this.map, this.difficulty);
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
    w.time += dt;
    w.phaseTime += dt;

    this.input.syncWorld(this.camera);
    this.handleCommands();
    this.moveCamera(dt);

    if (w.phase !== Phase.Playing) {
      // The world keeps ticking so blood settles and the last shots land.
      w.fx.step(dt);
      stepBullets(w, dt);
      stepGrenades(w, dt);
      return;
    }

    w.orderMarker = Math.max(0, w.orderMarker - dt);
    w.grenadeCooldown = Math.max(0, w.grenadeCooldown - dt);

    // Rebuilt before the AI runs, so separation queries see this step's layout.
    w.hash.rebuild(w.actors);

    const manualAim = this.input.firing ? this.input.world : null;
    stepSoldiers(w, dt, manualAim);
    stepEnemies(w, dt);

    // Hard no-overlap pass, after everyone has moved and slid along walls.
    resolveOverlaps(w.actors, w.hash, w.map, 2);

    // The squad's trail goes cold, which is what lets you break contact.
    w.lastKnownAge += dt;
    w.fog.step(w.map, w.soldiers, dt);

    stepHostages(w, dt);
    stepBuildings(w, dt);
    stepBullets(w, dt);
    stepGrenades(w, dt);
    stepMines(w, dt);
    stepPickups(w);
    w.fx.step(dt);

    const before = w.phase;
    resolvePhase(w, dt);
    if (w.phase !== before) {
      if (w.phase === Phase.Won) sfxWin();
      else if (w.phase === Phase.Lost) sfxLose();
    }
  }

  private handleCommands(): void {
    const w = this.world;
    for (const cmd of this.input.drain()) {
      unlockAudio();

      if (cmd.type === 'exit') {
        this.exitRequested = true;
        continue;
      }
      if (cmd.type === 'restart') {
        if (w.phase !== Phase.Playing) this.restart();
        continue;
      }
      // Once the mission is decided, the end panel owns the input. Clicking
      // the world should not quietly restart a mission you are still reading.
      if (w.phase !== Phase.Playing) continue;

      if (cmd.type === 'grenade') {
        this.tryGrenade(cmd.world);
        continue;
      }

      // A click on an enemy or a building is an attack order, not a move.
      const hit = classifyClick(w, cmd.world);
      if (hit.kind === 'enemy') orderAttack(w, hit.actor);
      else if (hit.kind === 'building') orderDemolish(w, hit.building);
      else orderMove(w, cmd.world);
    }
  }

  /** Thrown by whichever soldier is nearest the cursor, if any are in range. */
  private tryGrenade(at: { x: number; y: number }): void {
    const w = this.world;
    if (w.grenadesHeld <= 0 || w.grenadeCooldown > 0) return;

    let thrower = null;
    let bestD = Infinity;
    for (const s of livingSoldiers(w)) {
      const d = Math.hypot(s.pos.x - at.x, s.pos.y - at.y);
      if (d < bestD) { bestD = d; thrower = s; }
    }
    // Wading soldiers keep their hands full staying upright.
    if (!thrower || thrower.wading) return;

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
  }
}
