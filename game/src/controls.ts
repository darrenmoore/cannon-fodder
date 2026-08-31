import { action } from './ui.js';
import { haptic, settings } from './settings.js';
import type { ActionButton } from './ui.js';
import type { Input } from './input.js';
import type { Layout } from './layout.js';
import type { World } from './world.js';

/**
 * The action bar: the things you press instead of remembering a chord.
 *
 * Esc and the middle mouse button were the only ways to pause and to hand the
 * camera back to the squad, which is fine until the device has neither. Both
 * are buttons now, with the keyboard shortcut printed underneath on a desktop,
 * because a control that is only documented in a markdown file is not a control.
 *
 * **Firing and grenades are deliberately not here yet.** They were, briefly: a
 * hold-to-fire thumbstick and an armed grenade mode. Both need to be tried with
 * an actual thumb on actual glass before they are worth keeping, and shipping
 * two half-judged controls over the battlefield is worse than shipping none --
 * they occupy the corner a player reaches for and teach the wrong habit. The
 * aiming machinery behind them (`aim.ts`, the reticle in `render.ts`, the
 * commands in `input.ts`) is all still live and still reachable from the mouse
 * and the keyboard; what is missing is only the pair of buttons, and adding
 * them back is a `wire` call and a `dispose`.
 */

export class Controls {
  private readonly root = document.getElementById('controls') as HTMLElement;

  private readonly recentre: ActionButton;
  private readonly pause: ActionButton;
  private readonly detach: Array<() => void> = [];

  private lastRecentre: boolean | null = null;

  constructor(
    private readonly input: Input,
    private readonly layout: Layout,
  ) {
    this.pause = action({ glyph: '‖', label: 'Pause', hint: 'Esc' });
    this.recentre = action({ glyph: '⊕', label: 'Centre', hint: 'Space' });

    const top = document.createElement('div');
    top.className = 'controls-top';
    top.append(this.pause.root);

    const corner = document.createElement('div');
    corner.className = 'controls-cluster';
    corner.append(this.recentre.root);

    this.root.append(top, corner);

    this.on(this.pause.root, 'click', () => this.input.onPause?.());
    this.on(this.recentre.root, 'click', () => {
      this.input.recentre();
      haptic(8);
    });
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn, { passive: false });
    this.detach.push(() => target.removeEventListener(type, fn));
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }

  /**
   * Per-frame refresh. Everything is guarded on having actually changed,
   * because this runs sixty times a second and touching the DOM does not come
   * free at that rate.
   */
  update(world: World | null, manualCamera: boolean): void {
    this.root.hidden = world === null;
    if (!world) return;

    // Mounted only while the camera has been taken off the squad. On a phone
    // the bar sits over the battlefield, and a button that is useful for a
    // second and a half should not cost a corner of the map for the rest of
    // the mission.
    if (manualCamera !== this.lastRecentre) {
      this.lastRecentre = manualCamera;
      this.recentre.root.hidden = !manualCamera;
    }

    this.root.dataset.hand = settings().handedness;
    this.root.dataset.mode = this.layout.state.touch ? 'touch' : 'pointer';
  }
}
