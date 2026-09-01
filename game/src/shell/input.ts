import { CONFIG } from '../config.js';
import { Aim, RETICLE_LIFT_CSS } from './aim.js';
import { PointerTracker } from './pointer.js';
import { settings } from '../ui/settings.js';
import type { Camera } from '../render/camera.js';
import type { Gesture } from './pointer.js';
import type { Layout } from '../ui/layout.js';
import type { Vec2 } from '../types.js';
import type { World } from '../sim/world.js';

/**
 * Intent, from whatever the player happens to be holding.
 *
 * The original's scheme was five mouse-button chords and two keys, which is
 * fine until the device has neither. Everything here is now expressed as a
 * semantic command that three separate sources can raise -- the canvas, the
 * action bar, and the keyboard -- so the simulation never learns what kind of
 * hardware produced an order:
 *
 *   tap / left click          order the herd somewhere, or onto an enemy
 *   drag / middle-drag        pan the view
 *   pinch / +/- keys          zoom (the wheel is deliberately not one: a
 *                             scroll meant for the page kept re-zooming the
 *                             game, so zoom is only ever an intentional act)
 *   FIRE button / hold right  open fire toward a point or a heading
 *   GRENADE button / G / L+R  aim and throw
 *
 * Discrete actions are queued and drained by the simulation, so a tap is never
 * lost between frames and never applied twice. Continuous state -- where the
 * squad is aiming -- lives in `Aim`, which the renderer also reads.
 */

export type Command =
  | { type: 'order'; world: Vec2; queue: boolean }
  | { type: 'grenade' }
  | { type: 'recentre' }
  | { type: 'select'; soldier: number | 'all' }
  | { type: 'restart' }
  | { type: 'exit' };

/** How far a pinch has to spread before it is worth a whole zoom step. */
const PINCH_STEP = 1.35;

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
  /** True while the cursor is over the canvas -- gates edge scrolling. */
  inside = false;
  /** Where the squad is pointing. Read by the simulation and the renderer. */
  readonly aim = new Aim();

  /** Raised by Esc and the PAUSE button; owned by the shell, not the mission. */
  onPause: (() => void) | null = null;
  /** Raised by pinch and the +/- keys. The shell re-derives the layout from it. */
  onZoom: ((delta: number, focal: Vec2) => void) | null = null;

  private readonly tracker: PointerTracker;
  private readonly queue: Command[] = [];
  private readonly detach: Array<() => void> = [];

  private rightDown = false;
  private panning = false;
  /** Accumulated drag, in screen pixels, drained by `consumePan`. */
  private panDelta: Vec2 = { x: 0, y: 0 };
  private keyPan: Vec2 = { x: 0, y: 0 };
  private pinchAnchor = 1;

  /**
   * The world point the player last asked to throw at, before clamping. Kept
   * raw so the reticle can be re-resolved every step against a squad that is
   * still moving.
   */
  private rawAim: Vec2 | null = null;
  /** A left-while-right throw is waiting to be resolved and stood down. */
  private chorded = false;
  /** A chord was begun on the press and is waiting for the left release. */
  private chordArmed = false;
  /**
   * Drops the next order, once.
   *
   * The press that dismisses the briefing must not also be the first order of
   * the mission: it was aimed at a panel, not at the map behind it. The gesture
   * layer cannot know that, so the shell says so.
   */
  /** Heading from the FIRE thumbstick, or null when aiming with a cursor. */
  private stickDir: Vec2 | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly layout: Layout,
  ) {
    this.tracker = new PointerTracker(canvas, (g) => this.onGesture(g));
    this.on(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.on(window, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
    this.on(window, 'blur', () => this.releaseAll());
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn, { passive: false });
    this.detach.push(() => target.removeEventListener(type, fn));
  }

  dispose(): void {
    this.tracker.dispose();
    for (const off of this.detach) off();
    this.detach.length = 0;
  }

  /** Runs once, inside the first pointerdown, so iOS will start the audio. */
  onFirstPress(fn: () => void): void {
    this.tracker.onFirstPress(fn);
  }

  /** Extra world-pixel slack around a tap target, from the current zoom. */
  get slack(): number { return this.layout.clickSlack; }

  /** True while the squad should be firing manually. */
  get firing(): boolean { return this.aim.mode === 'fire'; }

  // ------------------------------------------------------------- the canvas

  private onGesture(g: Gesture): void {
    switch (g.k) {
      case 'enter': this.inside = true; return;
      case 'leave': this.inside = false; return;
      case 'cancel': this.releaseAll(); return;
      case 'down': return this.onDown(g.at, g.kind, g.button);
      case 'move': return this.onMove(g.at, g.kind, g.held);
      case 'up': return this.onUp(g.button);
      case 'tap': return this.onTap(g.at, g.kind, g.button);
      case 'longpress': return this.onLongPress(g.at);
      case 'dragstart':
        // A drag on the map pans it. This is what replaces edge-scrolling on a
        // device with no cursor to put near an edge -- and it is why a tap and
        // a drag have to mean different things.
        if (!this.aim.arming && (g.kind !== 'mouse' || g.button === 1)) this.panning = true;
        return;
      case 'drag': return this.onDrag(g.at, g.delta, g.kind);
      case 'dragend': this.panning = false; return;
      case 'pinch': return this.onPinch(g.centre, g.scale);
    }
  }

  private onDown(at: Vec2, kind: 'mouse' | 'touch' | 'pen', button: number): void {
    this.layout.observePointer(kind);
    this.screen.x = at.x;
    this.screen.y = at.y;

    if (kind === 'mouse' && button === 2) {
      this.rightDown = true;
      this.aim.mode = 'fire';
      this.stickDir = null;
      return;
    }

    /*
     * The chord is committed here, on the press, not judged later on the release.
     *
     * It used to be recognised only as a *tap* — left down and up inside twelve
     * pixels of travel. But aiming a grenade means moving the mouse to aim it,
     * so any throw the player took a moment over was silently discarded as a
     * drag; and releasing right before left dropped it too. Both did nothing at
     * all, which is why it felt random rather than wrong.
     */
    if (kind === 'mouse' && button === 0 && this.rightDown) {
      this.chordArmed = true;
      return;
    }
    // While the grenade is armed, the canvas belongs to the reticle: a press
    // places it rather than ordering the squad anywhere.
    if (this.aim.arming) this.placeReticle(at, kind);
  }

  private onMove(at: Vec2, kind: 'mouse' | 'touch' | 'pen', held: boolean): void {
    this.screen.x = at.x;
    this.screen.y = at.y;
    if (this.aim.arming && (held || kind === 'mouse')) this.placeReticle(at, kind);
  }

  private onUp(button: number): void {
    if (button === 2) {
      this.rightDown = false;
      if (this.aim.mode === 'fire' && !this.stickDir) this.aim.idle();
      return;
    }
    // Releasing over the map is the throw. A tap produces this too, so a quick
    // dab and a considered drag both end the same way.
    if (this.aim.arming && this.aim.placed) {
      this.queue.push({ type: 'grenade' });
      this.aim.idle();
      this.rawAim = null;
      return;
    }

    // A chord begun on the press lands on the release, wherever the hand ended
    // up and whichever button was let go first.
    if (button === 0 && this.chordArmed) {
      this.chordArmed = false;
      this.throwAtCursor();
    }
  }

  private onTap(at: Vec2, kind: 'mouse' | 'touch' | 'pen', button: number): void {
    // Middle click throws, on its own, with no chord to hold. Middle *drag*
    // still pans, because a drag never becomes a tap.
    if (button === 1) {
      if (kind === 'mouse') this.throwAtCursor(this.toWorldPoint(at, kind));
      return;
    }
    if (button !== 0) return;
    // The throw was already queued by the release; a tap must not also order.
    if (this.aim.arming) return;
    // The chord landed on the release; this tap must not also order the squad.
    if (kind === 'mouse' && this.rightDown) return;
    this.queue.push({ type: 'order', world: this.toWorldPoint(at, kind, 0), queue: false });
  }

  private onLongPress(at: Vec2): void {
    // Appending a waypoint instead of replacing the order. Ice missions ask for
    // short moves, and a slippery surface is a bad place to need fast taps.
    if (this.aim.arming || settings().rules !== 'modern') return;
    this.queue.push({ type: 'order', world: this.toWorldPoint(at, 'touch', 0), queue: true });
  }

  private onDrag(at: Vec2, delta: Vec2, kind: 'mouse' | 'touch' | 'pen'): void {
    if (this.aim.arming) {
      this.placeReticle(at, kind);
      return;
    }
    if (!this.panning) return;
    this.panDelta.x -= delta.x;
    this.panDelta.y -= delta.y;
  }

  private onPinch(centre: Vec2, scale: number): void {
    const ratio = scale / this.pinchAnchor;
    if (ratio > PINCH_STEP) {
      this.pinchAnchor = scale;
      this.onZoom?.(1, centre);
    } else if (ratio < 1 / PINCH_STEP) {
      this.pinchAnchor = scale;
      this.onZoom?.(-1, centre);
    }
  }

  /**
   * Records where the reticle is being asked to go.
   *
   * On touch the point is lifted well above the finger, because the one place
   * a thumb cannot look at is directly underneath itself. This offset is the
   * single detail that decides whether aiming a grenade on a phone works.
   */
  private placeReticle(at: Vec2, kind: 'mouse' | 'touch' | 'pen'): void {
    this.rawAim = this.toWorldPoint(at, kind);
    this.aim.placed = true;
  }

  private toWorldPoint(at: Vec2, kind: 'mouse' | 'touch' | 'pen', lift = RETICLE_LIFT_CSS): Vec2 {
    const zoom = this.camera?.zoom ?? this.layout.state.deviceZoom;
    const rise = kind === 'mouse' ? 0 : (lift * this.layout.state.dpr) / zoom;
    return {
      x: at.x / zoom + (this.camera?.offsetX ?? 0),
      y: at.y / zoom + (this.camera?.offsetY ?? 0) - rise,
    };
  }

  /** Set once per step so gesture handlers can convert to world coordinates. */
  private camera: Camera | null = null;

  // ------------------------------------------------------- the action bar

  /** FIRE pressed. Aim follows the cursor until a heading arrives. */
  fireDown(): void {
    this.aim.mode = 'fire';
    this.stickDir = null;
  }

  /** The FIRE thumbstick moved. `null` means the thumb is back at centre. */
  fireVector(dir: Vec2 | null): void {
    this.stickDir = dir && Math.hypot(dir.x, dir.y) > 0.001 ? dir : null;
  }

  fireUp(): void {
    this.stickDir = null;
    if (this.aim.mode === 'fire' && !this.rightDown) this.aim.idle();
  }

  /** GRENADE pressed: arm, or cancel if it was already armed. */
  toggleGrenade(): void {
    if (this.aim.arming) {
      this.cancelGrenade();
      return;
    }
    this.aim.mode = 'grenade';
    this.aim.placed = false;
    this.rawAim = null;
  }

  cancelGrenade(): void {
    this.aim.idle();
    this.rawAim = null;
  }

  /**
   * Throws at wherever the cursor is, borrowing the reticle for one step:
   * `syncAim` resolves it against the live world, the throw reads it, and then
   * it stands back down. Shared by the chord and by middle click.
   */
  private throwAtCursor(at?: Vec2): void {
    // `this.world` is the cursor as of the last step, which is what the chord
    // wants; middle click passes the exact point it was clicked at instead.
    this.rawAim = at ?? { ...this.world };
    this.aim.mode = 'grenade';
    this.aim.placed = true;
    this.chorded = true;
    this.queue.push({ type: 'grenade' });
  }

  recentre(): void { this.queue.push({ type: 'recentre' }); }
  select(soldier: number | 'all'): void { this.queue.push({ type: 'select', soldier }); }
  restart(): void { this.queue.push({ type: 'restart' }); }
  exit(): void { this.queue.push({ type: 'exit' }); }

  // ------------------------------------------------------------- keyboard

  private onKeyDown(e: KeyboardEvent): void {
    // Never steal a key from a focused control; the sheets are real buttons.
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case 'r': case 'R':
        this.queue.push({ type: 'restart' });
        return;
      case 'Escape':
        if (this.aim.arming) { this.cancelGrenade(); return; }
        this.onPause?.();
        return;
      case ' ':
        e.preventDefault();
        this.queue.push({ type: 'recentre' });
        return;
      case 'g': case 'G':
        this.toggleGrenade();
        return;
      case '+': case '=':
        this.onZoom?.(1, { ...this.screen });
        return;
      case '-': case '_':
        this.onZoom?.(-1, { ...this.screen });
        return;
      case 'ArrowLeft': this.keyPan.x = -1; return;
      case 'ArrowRight': this.keyPan.x = 1; return;
      case 'ArrowUp': this.keyPan.y = -1; return;
      case 'ArrowDown': this.keyPan.y = 1; return;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.keyPan.x = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.keyPan.y = 0;
  }

  /** A dragged-out release, a lost focus or a cancelled touch clears held state. */
  private releaseAll(): void {
    this.rightDown = false;
    this.chordArmed = false;
    this.panning = false;
    this.stickDir = null;
    this.keyPan.x = 0;
    this.keyPan.y = 0;
    if (this.aim.mode === 'fire') this.aim.idle();
  }

  // ------------------------------------------------------------ per step

  /** Refreshes the world-space cursor. Call once per step, before draining. */
  syncWorld(camera: Camera): void {
    this.camera = camera;
    const w = camera.screenToWorld(this.screen.x, this.screen.y);
    this.world.x = w.x;
    this.world.y = w.y;
  }

  /**
   * Re-resolves the aim against a world that has moved since the last frame.
   *
   * The reticle is recomputed rather than remembered, so a grenade held while
   * the squad walks stays clamped to a range the thrower can actually manage.
   */
  syncAim(world: World): void {
    if (this.aim.mode === 'grenade') {
      if (this.rawAim) this.aim.resolveGrenade(world, this.rawAim);
      else if (!this.aim.placed) this.aim.armGrenade(world);
      // The chord aims and throws in one instant. `handleCommands` runs after
      // this, so the throw still reads the point and the thrower resolved just
      // above -- but the reticle is stood down now, or the next left click
      // would be another grenade rather than an order.
      if (this.chorded) {
        this.chorded = false;
        this.rawAim = null;
        this.aim.mode = this.rightDown ? 'fire' : 'idle';
        this.aim.placed = false;
      }
    } else if (this.aim.mode === 'fire') {
      if (this.stickDir) this.aim.fireAlong(world, this.stickDir);
      else this.aim.fireAt(this.world);
    }
  }

  drain(): Command[] {
    const out = this.queue.slice();
    this.queue.length = 0;
    return out;
  }

  /** Drag pan since the last call, converted to world pixels. */
  consumePan(zoom: number): Vec2 {
    const out = { x: this.panDelta.x / zoom, y: this.panDelta.y / zoom };
    this.panDelta.x = 0;
    this.panDelta.y = 0;
    return out;
  }

  /**
   * Edge-scroll and arrow-key velocity in world pixels per second.
   *
   * Edge scrolling is mouse-only by necessity: it needs a cursor that can hover
   * without pressing, and a finger cannot hover. Touch pans by dragging instead.
   */
  edgeScroll(dt: number): Vec2 {
    let x = this.keyPan.x;
    let y = this.keyPan.y;

    if (!this.layout.state.touch && this.inside && !this.panning && !this.aim.arming) {
      const scale = this.layout.state.dpr;
      const m = CONFIG.camera.edgeMargin * scale;
      const w = this.canvas.width;
      const h = this.canvas.height;
      if (this.screen.x < m) x = -(1 - this.screen.x / m);
      else if (this.screen.x > w - m) x = 1 - (w - this.screen.x) / m;
      if (this.screen.y < m) y = -(1 - this.screen.y / m);
      else if (this.screen.y > h - m) y = 1 - (h - this.screen.y) / m;
    }

    if (x === 0 && y === 0) return { x: 0, y: 0 };
    return { x: x * CONFIG.camera.edgeSpeed * dt, y: y * CONFIG.camera.edgeSpeed * dt };
  }
}
