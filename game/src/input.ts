import { CONFIG } from './config.js';
import type { Camera } from './camera.js';
import type { Vec2 } from './types.js';

/**
 * Mouse and keyboard, in the shape the original used:
 *   left click        -- order the herd somewhere (or onto an enemy)
 *   hold right        -- open fire toward the cursor
 *   left while right  -- lob a grenade at the cursor
 *   middle drag       -- pan the view
 *   mouse at an edge  -- scroll the view
 *
 * Discrete actions are queued and drained by the simulation, so a click is
 * never lost between frames and never applied twice.
 */

export type Command =
  | { type: 'order'; world: Vec2 }
  | { type: 'grenade'; world: Vec2 }
  | { type: 'restart' }
  | { type: 'exit' };

export class Input {
  /**
   * Cursor relative to the canvas, in *device* pixels -- the same unit the
   * camera works in. The canvas is sized in device pixels but laid out in CSS
   * pixels, so mixing the two puts every click in the wrong place on a
   * high-DPI display.
   */
  screen: Vec2 = { x: 0, y: 0 };
  /** Cursor in world pixels; refreshed every step from the camera. */
  world: Vec2 = { x: 0, y: 0 };
  /** True while the right button is held: soldiers fire toward the cursor. */
  firing = false;
  /** True while the cursor is over the canvas -- gates edge scrolling. */
  inside = false;

  private readonly queue: Command[] = [];
  private rightDown = false;
  private panning = false;
  private panLast: Vec2 = { x: 0, y: 0 };
  /** Accumulated middle-drag, in screen pixels, drained by `consumePan`. */
  private panDelta: Vec2 = { x: 0, y: 0 };
  private readonly detach: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.on(canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(canvas, 'mousedown', (e) => this.onDown(e as MouseEvent));
    this.on(window, 'mouseup', (e) => this.onUp(e as MouseEvent));
    this.on(window, 'mousemove', (e) => this.onMove(e as MouseEvent));
    this.on(canvas, 'mouseenter', () => { this.inside = true; });
    this.on(canvas, 'mouseleave', () => { this.inside = false; });
    // A dragged-out release still has to clear the held state.
    this.on(window, 'blur', () => { this.firing = false; this.rightDown = false; this.panning = false; });
    this.on(window, 'keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'r' || key === 'R' || key === ' ' || key === 'Enter') {
        this.queue.push({ type: 'restart' });
      } else if (key === 'Escape') {
        this.queue.push({ type: 'exit' });
      }
    });
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.detach.push(() => target.removeEventListener(type, fn));
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }

  private onDown(e: MouseEvent): void {
    this.updateScreen(e);
    if (e.button === 1) {
      this.panning = true;
      this.panLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      this.rightDown = true;
      this.firing = true;
      return;
    }
    if (e.button === 0) {
      // Left while right is held is the grenade gesture, not a move order.
      this.queue.push({ type: this.rightDown ? 'grenade' : 'order', world: { ...this.world } });
    }
  }

  private onUp(e: MouseEvent): void {
    if (e.button === 1) this.panning = false;
    if (e.button === 2) { this.rightDown = false; this.firing = false; }
  }

  private onMove(e: MouseEvent): void {
    this.updateScreen(e);
    if (this.panning) {
      const scale = this.scale;
      this.panDelta.x -= (e.clientX - this.panLast.x) * scale;
      this.panDelta.y -= (e.clientY - this.panLast.y) * scale;
      this.panLast = { x: e.clientX, y: e.clientY };
    }
  }

  /** CSS pixels to device pixels, as the canvas is currently laid out. */
  private get scale(): number {
    const width = this.canvas.clientWidth;
    return width > 0 ? this.canvas.width / width : 1;
  }

  private updateScreen(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const scale = this.scale;
    this.screen.x = (e.clientX - r.left) * scale;
    this.screen.y = (e.clientY - r.top) * scale;
  }

  /** Refreshes the world-space cursor. Call once per step, before draining. */
  syncWorld(camera: Camera): void {
    const w = camera.screenToWorld(this.screen.x, this.screen.y);
    this.world.x = w.x;
    this.world.y = w.y;
  }

  drain(): Command[] {
    const out = this.queue.slice();
    this.queue.length = 0;
    return out;
  }

  /** Middle-drag pan since the last call, converted to world pixels. */
  consumePan(zoom: number): Vec2 {
    const out = { x: this.panDelta.x / zoom, y: this.panDelta.y / zoom };
    this.panDelta.x = 0;
    this.panDelta.y = 0;
    return out;
  }

  /** Edge-scroll velocity in world pixels per second. */
  edgeScroll(dt: number): Vec2 {
    if (!this.inside || this.panning) return { x: 0, y: 0 };
    const scale = this.scale;
    const m = CONFIG.camera.edgeMargin * scale;
    const w = this.canvas.width;
    const h = this.canvas.height;
    let x = 0;
    let y = 0;
    if (this.screen.x < m) x = -(1 - this.screen.x / m);
    else if (this.screen.x > w - m) x = 1 - (w - this.screen.x) / m;
    if (this.screen.y < m) y = -(1 - this.screen.y / m);
    else if (this.screen.y > h - m) y = 1 - (h - this.screen.y) / m;
    return { x: x * CONFIG.camera.edgeSpeed * dt, y: y * CONFIG.camera.edgeSpeed * dt };
  }
}
