/**
 * The confirmation: one component for every "are you sure" in the game.
 *
 * Asked for by name, and overdue by the spec's own account -- the only
 * question-shaped thing this game had was the pause sheet, which is a list of
 * actions rather than a question, so every "are you sure" so far was either
 * skipped or improvised. This is the standard one: a title, a body that can be
 * styled (it takes an element, not just a string), and whichever buttons the
 * caller declares, each with its own variant and label.
 *
 * It resolves with the value of the button pressed. `dismiss`, when given,
 * is what Escape and a backdrop click mean -- typically the cancel button's
 * value. When it is omitted the question is modal in the strict sense: one of
 * the buttons must be chosen, and the only ways out are on them.
 *
 * The world holds still while one is up. `confirmOpen()` is exported for the
 * same gate `sheetOpen()` sits in: a dialog asking "restart?" over a live
 * firefight would cost the player the squad while they read it.
 */

import { installSkin } from './skin.js';

export interface ConfirmButton {
  label: string;
  /** What the promise resolves with when this button is pressed. */
  value: string;
  /**
   * `primary` wears the lit gold plate and takes first focus; `normal` the
   * resting brass. One primary per dialog reads as the suggestion; two reads
   * as a shrug.
   */
  variant?: 'primary' | 'normal';
}

export interface ConfirmOptions {
  title: string;
  /** A string for the plain case; an element when the caller wants markup. */
  body?: string | HTMLElement;
  buttons: ConfirmButton[];
  /** Resolved on Escape or a backdrop click. Omit to force a button press. */
  dismiss?: string;
}

let openCount = 0;

/** True while any confirmation is up. Sits in the same gates as `sheetOpen`. */
export const confirmOpen = (): boolean => openCount > 0;

export function confirm(opts: ConfirmOptions): Promise<string> {
  // The chrome the dialog wears is baked sprites; a confirm raised before the
  // front ever ran (dev flows straight into a mission) would otherwise arrive
  // unskinned. Safe to call twice by design.
  installSkin();

  return new Promise((resolve) => {
    openCount++;

    const layer = document.createElement('div');
    layer.className = 'confirm-layer';

    const card = document.createElement('div');
    card.className = 'confirm-card';
    layer.appendChild(card);

    const h = document.createElement('div');
    h.className = 'confirm-title';
    h.textContent = opts.title;
    card.appendChild(h);

    if (opts.body !== undefined) {
      const b = document.createElement('div');
      b.className = 'confirm-body';
      if (typeof opts.body === 'string') b.textContent = opts.body;
      else b.appendChild(opts.body);
      card.appendChild(b);
    }

    const row = document.createElement('div');
    row.className = 'confirm-actions';
    card.appendChild(row);

    const done = (value: string): void => {
      openCount--;
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      resolve(value);
    };

    let first: HTMLButtonElement | null = null;
    let primary: HTMLButtonElement | null = null;
    for (const spec of opts.buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = spec.variant === 'primary' ? 'fx-btn confirm-btn primary' : 'fx-btn confirm-btn';
      b.appendChild(Object.assign(document.createElement('span'), {
        className: 'fx-btn-label', textContent: spec.label,
      }));
      b.addEventListener('click', () => done(spec.value));
      first ??= b;
      if (spec.variant === 'primary') primary ??= b;
      row.appendChild(b);
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && opts.dismiss !== undefined) {
        e.stopPropagation();
        done(opts.dismiss);
      }
    };
    // Capture phase, so Escape means "close this question" before it can mean
    // "open the pause sheet" to the listener underneath.
    document.addEventListener('keydown', onKey, true);

    layer.addEventListener('pointerdown', (e) => {
      if (e.target === layer && opts.dismiss !== undefined) done(opts.dismiss);
    });

    document.body.appendChild(layer);
    (primary ?? first)?.focus();
  });
}
