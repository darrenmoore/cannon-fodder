import { bindKeys, button, fill, segmented, slider } from './ui.js';
import { settings, updateSettings } from './settings.js';

/**
 * The modal sheet: pause, and settings.
 *
 * A phone has no Esc key, so "back to the mission list" needed somewhere to
 * live, and once there is a pause there is somewhere for the preferences to go
 * too. It is one primitive rather than two panels because a second modal is how
 * a UI kit starts to drift.
 *
 * It scrolls inside `dvh` rather than growing past the viewport, which is the
 * difference between a settings list that works on a 390x844 phone and one
 * whose last two rows are unreachable.
 */

export interface SheetAction {
  label: string;
  hint?: string;
  tone?: 'default' | 'warn' | 'good';
  key?: string;
  /** Rendered large and full-width; the rest share a row beneath it. */
  primary?: boolean;
  onPick(): void;
}

const host = (): HTMLElement => document.getElementById('sheet') as HTMLElement;

let close: (() => void) | null = null;

/** True while a sheet is up. The mission underneath uses this to hold still. */
export const sheetOpen = (): boolean => close !== null;

export function closeSheet(): void {
  close?.();
}

/**
 * Opens a sheet built by `render`, and resolves when it is dismissed.
 *
 * `render` is handed the dismisser rather than reaching for `closeSheet`, so a
 * sheet can only ever close itself and never something that opened over it.
 */
function open(render: (dismiss: () => void) => HTMLElement, onClose?: () => void): void {
  closeSheet();
  const root = host();

  const card = document.createElement('div');
  card.className = 'sheet-card';

  const dismiss = (): void => {
    unbind();
    root.hidden = true;
    root.textContent = '';
    close = null;
    onClose?.();
  };

  card.appendChild(render(dismiss));
  fill(root, card);
  root.hidden = false;

  // A tap on the backdrop dismisses; a tap inside must not. Checking the target
  // is the whole of it -- a stopPropagation on the card would also swallow the
  // key bindings.
  const onBackdrop = (e: Event): void => { if (e.target === root) dismiss(); };
  root.addEventListener('pointerdown', onBackdrop);

  const unbindKeys = bindKeys(root);
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  };
  window.addEventListener('keydown', onEsc, true);

  const unbind = (): void => {
    root.removeEventListener('pointerdown', onBackdrop);
    window.removeEventListener('keydown', onEsc, true);
    unbindKeys();
  };

  close = dismiss;
  // Focus the first control, so a keyboard player is not left tabbing in from
  // the top of the document to reach a modal that is already up.
  card.querySelector('button')?.focus();
}

/** A titled list of full-width choices. The shape both sheets take. */
export function showSheet(title: string, sub: string | null, actions: SheetAction[]): void {
  open((dismiss) => {
    const body = document.createElement('div');
    body.className = 'sheet-body';
    body.appendChild(Object.assign(document.createElement('div'), {
      className: 'sheet-title', textContent: title,
    }));
    if (sub) {
      body.appendChild(Object.assign(document.createElement('div'), {
        className: 'sheet-sub', textContent: sub,
      }));
    }
    const list = document.createElement('div');
    list.className = 'sheet-actions';
    // Primaries stand full-width; everything else shares one row under them,
    // so the sheet reads as "the thing you came for, and the small print".
    let split: HTMLElement | null = null;
    for (const a of actions) {
      const b = button(a.label, {
        tone: a.tone,
        hint: a.hint,
        key: a.key,
        onClick: () => { dismiss(); a.onPick(); },
      });
      if (a.primary) {
        b.classList.add('sheet-primary');
        list.appendChild(b);
      } else {
        if (!split) {
          split = document.createElement('div');
          split.className = 'sheet-split';
          list.appendChild(split);
        }
        split.appendChild(b);
      }
    }
    body.appendChild(list);
    return body;
  });
}

/**
 * The settings sheet.
 *
 * `onLayoutChange` is called for anything the layout has to re-derive -- zoom,
 * resolution, crispness, handedness -- rather than each control reaching for
 * the layout itself, so this file stays a view over `settings.ts` and nothing
 * more.
 */
export function showSettings(onLayoutChange: () => void): void {
  open((dismiss) => {
    const body = document.createElement('div');
    body.className = 'sheet-body';
    body.appendChild(Object.assign(document.createElement('div'), {
      className: 'sheet-title', textContent: 'Settings',
    }));

    const rows = document.createElement('div');
    rows.className = 'sheet-rows';

    /** One labelled row with a segmented control in it. */
    const row = <T extends string>(
      label: string,
      note: string,
      options: Array<{ id: T; label: string }>,
      value: T,
      onChange: (v: T) => void,
    ): void => {
      const r = document.createElement('div');
      r.className = 'sheet-row';
      const text = document.createElement('div');
      text.className = 'sheet-row-text';
      text.appendChild(Object.assign(document.createElement('b'), { textContent: label }));
      text.appendChild(Object.assign(document.createElement('span'), { textContent: note }));
      r.appendChild(text);
      r.appendChild(segmented<T>({ options, value, onChange }).root);
      rows.appendChild(r);
    };

    /** One labelled row with a level bar in it. Dragging is heard live. */
    const barRow = (
      label: string, note: string, value: number, onChange: (v: number) => void,
    ): void => {
      const r = document.createElement('div');
      r.className = 'sheet-row';
      const text = document.createElement('div');
      text.className = 'sheet-row-text';
      text.appendChild(Object.assign(document.createElement('b'), { textContent: label }));
      text.appendChild(Object.assign(document.createElement('span'), { textContent: note }));
      r.appendChild(text);
      r.appendChild(slider({ value, onChange }).root);
      rows.appendChild(r);
    };

    /*
     * Three settings, no section headings. This sheet held nine rows under
     * four headings, which is a preferences dialog, not a pause screen --
     * Picture, Handedness, Haptics and Waypoints keep their saved values and
     * their defaults, they just are not questions the sheet asks any more.
     */

    // Three steps, and none of them called Auto: "Auto" asked the player to
    // know what the layout would have chosen, which is a question about the
    // code. Normal *is* that choice; the other two are one step either side.
    row('Zoom', 'How much ground fits on screen.',
      [
        { id: '-1' as const, label: 'Wide' },
        { id: '0' as const, label: 'Normal' },
        { id: '1' as const, label: 'Close' },
      ],
      settings().zoomBias < 0 ? '-1' : settings().zoomBias > 0 ? '1' : '0',
      (v) => { updateSettings({ zoomBias: Number(v) }); onLayoutChange(); });

    // The bars replace three rows -- Effects on/off, Music on/off, and a
    // three-step Loudness shared between them. A bar at zero *is* off, and
    // the booleans underneath are kept true to that so everything that gates
    // on them still works.
    barRow('Effects', 'Gunfire, explosions and ambience.', settings().volume,
      (v) => updateSettings({ volume: v, sound: v > 0 }));
    barRow('Music', 'On the front screen only.', settings().musicVolume,
      (v) => updateSettings({ musicVolume: v, music: v > 0 }));

    body.append(rows);

    const actions = document.createElement('div');
    actions.className = 'sheet-actions';
    actions.appendChild(button('Done', {
      tone: 'good', key: 'Enter',
      onClick: () => dismiss(),
    }));
    body.appendChild(actions);
    return body;
  });
}
