import { bindKeys, button, fill, heading, segmented } from './ui.js';
import { onSettingsChange, settings, updateSettings } from './settings.js';
import type { Handedness, Resolution, Rules } from './settings.js';

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
    for (const a of actions) {
      list.appendChild(button(a.label, {
        tone: a.tone,
        hint: a.hint,
        key: a.key,
        onClick: () => { dismiss(); a.onPick(); },
      }));
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

    const onOff = [{ id: 'on' as const, label: 'On' }, { id: 'off' as const, label: 'Off' }];
    const bool = (v: boolean): 'on' | 'off' => (v ? 'on' : 'off');

    rows.appendChild(heading('view'));
    // Five steps rather than three. The automatic answer is a judgement about
    // a screen it cannot see being used, and two of those judgements have
    // already been wrong; the player wanting something else is the normal case,
    // not an edge one, so the range is wide enough to actually reach it.
    row('Zoom', 'How much ground fits on screen. Pinch, or use the mouse wheel.',
      [
        { id: '-2' as const, label: 'Widest' },
        { id: '-1' as const, label: 'Wider' },
        { id: '0' as const, label: 'Auto' },
        { id: '1' as const, label: 'Closer' },
        { id: '2' as const, label: 'Closest' },
      ],
      String(settings().zoomBias) as '-2' | '-1' | '0' | '1' | '2',
      (v) => { updateSettings({ zoomBias: Number(v) }); onLayoutChange(); });

    row('Resolution', 'Half is kinder to an older phone.',
      [{ id: 'full' as const, label: 'Full' }, { id: 'half' as const, label: 'Half' }],
      settings().resolution,
      (v: Resolution) => { updateSettings({ resolution: v }); onLayoutChange(); });

    row('Crisp pixels', 'Hard sprite edges on a fractional-density screen.',
      onOff, bool(settings().crisp),
      (v) => { updateSettings({ crisp: v === 'on' }); onLayoutChange(); });

    rows.appendChild(heading('controls'));
    row('Handedness', 'Which thumb the action bar sits under.',
      [{ id: 'right' as const, label: 'Right' }, { id: 'left' as const, label: 'Left' }],
      settings().handedness,
      (v: Handedness) => { updateSettings({ handedness: v }); onLayoutChange(); });

    row('Haptics', 'A tick on a throw and on a casualty.',
      onOff, bool(settings().haptics),
      (v) => updateSettings({ haptics: v === 'on' }));

    rows.appendChild(heading('sound'));
    row('Effects', 'Gunfire and explosions.', onOff, bool(settings().sound),
      (v) => updateSettings({ sound: v === 'on' }));
    row('Music', 'On the front screen only.', onOff, bool(settings().music),
      (v) => updateSettings({ music: v === 'on' }));

    rows.appendChild(heading('rules'));
    row('Ruleset', 'Modern adds what 1993 did not have.',
      [{ id: 'classic' as const, label: 'Classic' }, { id: 'modern' as const, label: 'Modern' }],
      settings().rules,
      (v: Rules) => updateSettings({ rules: v }));

    const note = document.createElement('p');
    note.className = 'sheet-note';
    note.textContent = settings().rules === 'modern'
      ? 'Modern: long-press the ground to queue a waypoint.'
      : 'Classic is the 1993 game. Modern layers on conveniences it never had.';
    const stopWatching = onSettingsChange((s) => {
      note.textContent = s.rules === 'modern'
        ? 'Modern: long-press the ground to queue a waypoint.'
        : 'Classic is the 1993 game. Modern layers on conveniences it never had.';
    });

    body.append(rows, note);

    const actions = document.createElement('div');
    actions.className = 'sheet-actions';
    actions.appendChild(button('Done', {
      tone: 'good', key: 'Enter',
      onClick: () => { stopWatching(); dismiss(); },
    }));
    body.appendChild(actions);
    return body;
  });
}
