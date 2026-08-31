import type { Vec2 } from '../types.js';

/**
 * Pointer Events, recognised into gestures.
 *
 * This module knows nothing about the game -- it turns a stream of
 * pointerdown/move/up into taps, drags, long presses and pinches, in device
 * pixels relative to the canvas, which is the unit the camera works in.
 *
 * Three details are load-bearing. `pointercancel` must reset everything: on iOS
 * a system edge gesture cancels a pointer mid-drag, and a missed reset leaves
 * the camera panning forever. A second touch has to retract any drag the first
 * one started, or the pinch fights the pan for the whole gesture. And a mouse
 * is *one pointer with three buttons*, so presses are tracked per button --
 * see `trackKey`.
 */

export type PointerKind = 'mouse' | 'touch' | 'pen';

export type Gesture =
  | { k: 'down'; at: Vec2; kind: PointerKind; button: number }
  | { k: 'move'; at: Vec2; kind: PointerKind; held: boolean }
  | { k: 'up'; at: Vec2; kind: PointerKind; button: number }
  | { k: 'tap'; at: Vec2; kind: PointerKind; button: number }
  | { k: 'longpress'; at: Vec2; kind: PointerKind }
  | { k: 'dragstart'; at: Vec2; kind: PointerKind; button: number }
  | { k: 'drag'; at: Vec2; delta: Vec2; kind: PointerKind; button: number }
  | { k: 'dragend'; at: Vec2; kind: PointerKind; button: number }
  | { k: 'pinch'; centre: Vec2; scale: number }
  | { k: 'enter' }
  | { k: 'leave' }
  | { k: 'cancel' };

/** A tap is short and still. Anything longer or further is a drag. */
const TAP_MS = 260;
/** Travel budget in CSS pixels. Generous, because a thumb rolls as it lifts. */
const TAP_SLOP = 12;
const LONGPRESS_MS = 420;

interface Track {
  id: number;
  kind: PointerKind;
  button: number;
  /** Device pixels, canvas-relative. */
  at: Vec2;
  start: Vec2;
  /** CSS pixels, for thresholds -- a slop in device pixels is a moving target. */
  startCss: Vec2;
  lastCss: Vec2;
  startedAt: number;
  dragging: boolean;
  /** Cleared as soon as the gesture is disqualified from being a tap. */
  tappable: boolean;
  longPressTimer: number;
}

/**
 * One press, identified by pointer *and* button.
 *
 * Every button of a mouse shares a single `pointerId`, so keying by the id
 * alone made a second press evict the first: right-hold-then-left-click -- the
 * grenade chord -- threw away the right button's track, which then swallowed
 * its release and left the squad firing at nothing.
 */
const trackKey = (id: number, button: number): number => id * 16 + Math.max(0, button);

/** `button` index to its bit in `buttons`: left, middle, right, back, forward. */
const BUTTON_MASK = [1, 4, 2, 8, 16];

export class PointerTracker {
  private readonly active = new Map<number, Track>();
  private readonly detach: Array<() => void> = [];
  /** Distance between the two pinch fingers when the pinch began, in CSS px. */
  private pinchStart = 0;
  private pinching = false;
  /** Fires once, on the first press of any kind, for the audio unlock. */
  private firstPress: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly emit: (g: Gesture) => void,
  ) {
    const c = canvas;
    this.on(c, 'contextmenu', (e) => e.preventDefault());
    this.on(c, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.on(window, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.on(window, 'pointerup', (e) => this.onUp(e as PointerEvent, false));
    this.on(window, 'pointercancel', (e) => this.onUp(e as PointerEvent, true));
    this.on(c, 'pointerenter', () => this.emit({ k: 'enter' }));
    this.on(c, 'pointerleave', () => this.emit({ k: 'leave' }));
    this.on(window, 'blur', () => this.reset());
    // iOS pinches the *page* unless the gesture events are refused outright;
    // `user-scalable=no` has been ignored by Safari since iOS 10.
    this.on(c, 'gesturestart', (e) => e.preventDefault());
    this.on(c, 'gesturechange', (e) => e.preventDefault());
    // A dropped file over the canvas would navigate the page away mid-mission.
    this.on(c, 'dragover', (e) => e.preventDefault());
  }

  /** Runs once, inside the very first pointerdown, so audio may start on iOS. */
  onFirstPress(fn: () => void): void {
    this.firstPress = fn;
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void): void {
    // Non-passive: the canvas handlers have to be able to preventDefault.
    target.addEventListener(type, fn, { passive: false });
    this.detach.push(() => target.removeEventListener(type, fn));
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
    this.active.clear();
  }

  /** CSS pixels to device pixels, as the canvas is currently laid out. */
  private get scale(): number {
    const w = this.canvas.clientWidth;
    return w > 0 ? this.canvas.width / w : 1;
  }

  private point(e: PointerEvent): { device: Vec2; css: Vec2 } {
    const r = this.canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const s = this.scale;
    return { device: { x: cx * s, y: cy * s }, css: { x: cx, y: cy } };
  }

  private kindOf(e: PointerEvent): PointerKind {
    return e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
  }

  private onDown(e: PointerEvent): void {
    if (this.firstPress) {
      const fn = this.firstPress;
      this.firstPress = null;
      fn();
    }

    const { device, css } = this.point(e);
    const kind = this.kindOf(e);
    // Middle-click otherwise starts the browser's autoscroll, and a right-click
    // drag on the canvas otherwise selects the page.
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort; the window-level listeners cover the gap.
    }

    const track: Track = {
      id: e.pointerId, kind, button: e.button,
      at: { ...device }, start: { ...device },
      startCss: { ...css }, lastCss: { ...css },
      startedAt: performance.now(),
      dragging: false, tappable: true, longPressTimer: 0,
    };

    if (kind !== 'mouse') {
      track.longPressTimer = window.setTimeout(() => {
        const t = this.active.get(trackKey(e.pointerId, e.button));
        if (!t || t.dragging || !t.tappable) return;
        t.tappable = false;
        this.emit({ k: 'longpress', at: { ...t.at }, kind: t.kind });
      }, LONGPRESS_MS);
    }

    this.active.set(trackKey(e.pointerId, e.button), track);
    this.emit({ k: 'down', at: { ...device }, kind, button: e.button });

    // Two fingers down is a pinch, and it retracts whatever the first one was
    // doing -- otherwise the pan fights the zoom for the whole gesture.
    if (this.active.size === 2) this.beginPinch();
  }

  /** Every button currently held on one pointer, oldest press first. */
  private tracksFor(id: number): Track[] {
    const out: Track[] = [];
    for (const t of this.active.values()) if (t.id === id) out.push(t);
    return out;
  }

  private touchPair(): Track[] | null {
    const touches = [...this.active.values()].filter((t) => t.kind !== 'mouse');
    return touches.length === 2 ? touches : null;
  }

  private beginPinch(): void {
    const pair = this.touchPair();
    if (!pair) return;
    this.pinching = true;
    this.pinchStart = Math.hypot(
      pair[0].lastCss.x - pair[1].lastCss.x,
      pair[0].lastCss.y - pair[1].lastCss.y,
    ) || 1;
    for (const t of pair) {
      t.tappable = false;
      window.clearTimeout(t.longPressTimer);
      if (t.dragging) {
        t.dragging = false;
        this.emit({ k: 'dragend', at: { ...t.at }, kind: t.kind, button: t.button });
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const { device, css } = this.point(e);
    const kind = this.kindOf(e);

    // A mouse is one pointer with several buttons, and only the *first* press
    // is a pointerdown: pressing or releasing another while one is held comes
    // through as a pointermove whose `button` names the one that changed. That
    // is the whole of the grenade chord -- right held, left clicked -- so it is
    // routed back into the press handlers here, guarded so a move that merely
    // restates a button we already agree about falls through to being a move.
    if (kind === 'mouse' && e.button !== -1) {
      const key = trackKey(e.pointerId, e.button);
      const down = (e.buttons & (BUTTON_MASK[e.button] ?? 0)) !== 0;
      if (down && !this.active.has(key)) return this.onDown(e);
      if (!down && this.active.has(key)) return this.onUp(e, false);
    }

    const tracks = this.tracksFor(e.pointerId);

    if (tracks.length === 0) {
      // Hover. Mouse only, and the only thing edge-scrolling has to go on.
      this.emit({ k: 'move', at: device, kind, held: false });
      return;
    }

    // The first button pressed owns the drag; the rest only ride along.
    const track = tracks[0];
    const delta = { x: device.x - track.at.x, y: device.y - track.at.y };
    for (const t of tracks) {
      t.at = { ...device };
      t.lastCss = css;
    }

    if (this.pinching) {
      const pair = this.touchPair();
      if (pair) {
        const d = Math.hypot(
          pair[0].lastCss.x - pair[1].lastCss.x,
          pair[0].lastCss.y - pair[1].lastCss.y,
        );
        this.emit({
          k: 'pinch',
          centre: {
            x: (pair[0].at.x + pair[1].at.x) / 2,
            y: (pair[0].at.y + pair[1].at.y) / 2,
          },
          scale: d / this.pinchStart,
        });
      }
      return;
    }

    this.emit({ k: 'move', at: device, kind, held: true });

    // A press that has travelled is no longer a tap, whichever button it is --
    // but only the owning press drags, or a two-button chord would pan twice
    // for every move.
    for (const t of tracks) {
      const travel = Math.hypot(css.x - t.startCss.x, css.y - t.startCss.y);
      if (travel <= TAP_SLOP) continue;
      t.tappable = false;
      window.clearTimeout(t.longPressTimer);
      if (t !== track) continue;
      if (!t.dragging) {
        t.dragging = true;
        this.emit({ k: 'dragstart', at: { ...t.start }, kind, button: t.button });
      }
    }
    if (track.dragging) this.emit({ k: 'drag', at: { ...device }, delta, kind, button: track.button });
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    // A cancel carries no button of its own, so it takes the whole pointer --
    // every button still held on it -- with it.
    const dropped = cancelled ? this.tracksFor(e.pointerId) : [];
    const track = cancelled ? null : this.active.get(trackKey(e.pointerId, e.button)) ?? null;
    for (const t of dropped) this.active.delete(trackKey(t.id, t.button));
    if (track) this.active.delete(trackKey(e.pointerId, e.button));

    if (this.active.size < 2) {
      const wasPinching = this.pinching;
      this.pinching = false;
      // Lifting one finger of a pinch must not hand the survivor a pan: the
      // remaining contact is mid-gesture and its start point is stale.
      if (wasPinching) for (const t of this.active.values()) t.tappable = false;
    }

    if (cancelled) {
      if (dropped.length === 0) return;
      for (const t of dropped) {
        window.clearTimeout(t.longPressTimer);
        if (t.dragging) this.emit({ k: 'dragend', at: { ...t.at }, kind: t.kind, button: t.button });
      }
      this.emit({ k: 'cancel' });
      return;
    }

    if (!track) return;
    window.clearTimeout(track.longPressTimer);

    const { device, css } = this.point(e);
    this.emit({ k: 'up', at: device, kind: track.kind, button: e.button });

    if (track.dragging) {
      this.emit({ k: 'dragend', at: device, kind: track.kind, button: track.button });
      return;
    }

    const held = performance.now() - track.startedAt;
    const travel = Math.hypot(css.x - track.startCss.x, css.y - track.startCss.y);
    // A mouse click is a tap however long the button was held: only a finger
    // has to prove it was not resting on the glass.
    const quick = track.kind === 'mouse' || held <= TAP_MS;
    if (track.tappable && quick && travel <= TAP_SLOP) {
      this.emit({ k: 'tap', at: device, kind: track.kind, button: track.button });
    }
  }

  /** Drops every in-flight gesture. Used on blur, and when the game tears down. */
  reset(): void {
    for (const t of this.active.values()) {
      window.clearTimeout(t.longPressTimer);
      if (t.dragging) this.emit({ k: 'dragend', at: { ...t.at }, kind: t.kind, button: t.button });
    }
    this.active.clear();
    this.pinching = false;
    this.emit({ k: 'cancel' });
  }
}
