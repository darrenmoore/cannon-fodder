import { CONFIG } from './config.js';
import type { GameMap } from './map.js';
import type { Vec2 } from './types.js';

/**
 * Follows the squad with a deadzone so it does not twitch every time a soldier
 * shuffles, and clamps to the map so the view never shows the void. Mouse-edge
 * scrolling lets you look ahead before committing the herd to a move.
 */
export class Camera {
  /** Top-left of the view, in world pixels. */
  x = 0;
  y = 0;
  /**
   * World pixels to device pixels. Owned by `layout.ts`, which recomputes it
   * from the viewport; this is only what it is before the first measurement.
   */
  zoom: number = CONFIG.camera.zoom.start;
  /** Viewport size in world pixels (screen pixels / zoom). */
  viewW = 0;
  viewH = 0;

  private shakeAmount = 0;
  private shakeX = 0;
  private shakeY = 0;
  /** Non-zero while the player is edge-scrolling; suspends squad follow. */
  private manualUntil = 0;
  private time = 0;

  resize(screenW: number, screenH: number): void {
    this.viewW = screenW / this.zoom;
    this.viewH = screenH / this.zoom;
  }

  centreOn(p: Vec2, map: GameMap): void {
    this.x = p.x - this.viewW / 2;
    this.y = p.y - this.viewH / 2;
    this.clamp(map);
  }

  /**
   * Centres on a point and stops following the squad until told otherwise.
   *
   * `centreOn` alone is not enough for anything that wants to *look* somewhere:
   * the follow in `update` eases straight back to the squad on the next frame,
   * so a caller that only centres gets the squad's view a moment later. The
   * capture harness learned this the hard way, having reported that a mission
   * had no water in it while pointed at the far end of the map.
   */
  lookAt(p: Vec2, map: GameMap): void {
    this.centreOn(p, map);
    this.manualUntil = Infinity;
  }

  /** Hands the camera back to the squad. */
  release(): void {
    this.manualUntil = this.time;
  }

  /**
   * True while the view has been taken off the squad by hand.
   *
   * The RECENTRE button is mounted from this rather than being permanent
   * furniture: on a phone the action bar is over the battlefield, and a button
   * that is only ever useful for a second and a half should not cost a corner
   * of the map for the rest of the mission.
   */
  get isManual(): boolean { return this.time < this.manualUntil; }

  /** Screen-space pan from edge scrolling or a middle-drag, in world pixels. */
  pan(dx: number, dy: number, map: GameMap): void {
    if (dx === 0 && dy === 0) return;
    this.x += dx;
    this.y += dy;
    this.manualUntil = this.time + 1.6;
    this.clamp(map);
  }

  update(dt: number, focus: Vec2 | null, map: GameMap): void {
    this.time += dt;

    if (focus && this.time >= this.manualUntil) {
      const targetX = focus.x - this.viewW / 2;
      const targetY = focus.y - this.viewH / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > CONFIG.camera.deadzone) {
        // Exponential ease, framerate independent.
        const k = 1 - Math.exp(-CONFIG.camera.follow * dt);
        const pull = (dist - CONFIG.camera.deadzone) / dist;
        this.x += dx * pull * k;
        this.y += dy * pull * k;
      }
    }

    if (this.shakeAmount > 0.05) {
      this.shakeAmount *= Math.exp(-9 * dt);
      this.shakeX = (Math.random() * 2 - 1) * this.shakeAmount;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeAmount;
    } else {
      this.shakeAmount = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    this.clamp(map);
  }

  addShake(amount: number): void {
    this.shakeAmount = Math.min(12, this.shakeAmount + amount);
  }

  /** Keeps the view inside the map; centres on the axis if the map is smaller. */
  private clamp(map: GameMap): void {
    this.x = map.pixelWidth <= this.viewW
      ? (map.pixelWidth - this.viewW) / 2
      : Math.max(0, Math.min(map.pixelWidth - this.viewW, this.x));
    this.y = map.pixelHeight <= this.viewH
      ? (map.pixelHeight - this.viewH) / 2
      : Math.max(0, Math.min(map.pixelHeight - this.viewH, this.y));
  }

  /** World origin in whole screen pixels -- integer, so sprites stay crisp. */
  get offsetX(): number { return Math.round((this.x + this.shakeX) * this.zoom) / this.zoom; }
  get offsetY(): number { return Math.round((this.y + this.shakeY) * this.zoom) / this.zoom; }

  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: sx / this.zoom + this.offsetX, y: sy / this.zoom + this.offsetY };
  }
}
