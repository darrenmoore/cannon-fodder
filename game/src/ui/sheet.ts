import { bindKeys, button, fill, heading, segmented } from './ui.js';
import { settings, updateSettings } from './settings.js';
import type { Handedness } from './settings.js';

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
    row('Zoom', 'How much ground fits on screen.',
      [
        { id: '-2' as const, label: 'Widest' },
        { id: '-1' as const, label: 'Wider' },
        { id: '0' as const, label: 'Auto' },
        { id: '1' as const, label: 'Closer' },
        { id: '2' as const, label: 'Closest' },
      ],
      String(settings().zoomBias) as '-2' | '-1' | '0' | '1' | '2',
      (v) => { updateSettings({ zoomBias: Number(v) }); onLayoutChange(); });

    /*
     * One question, because underneath it always was one.
     *
     * `Resolution` and `Crisp pixels` were two rows, and they multiply into a
     * single number -- the device pixel ratio the canvas is sized at. Nobody
     * outside this file could have known that, and neither row could be
     * answered by a player: "half is kinder to an older phone" is a shrug, and
     * "hard sprite edges on a fractional-density screen" is a sentence about
     * hardware. What a player can answer is how sharp they want it and what
     * they are willing to pay for that.
     */
    row('Picture', 'Sharp on a good screen, Fast on an old one.',
      [
        { id: 'sharp' as const, label: 'Sharp' },
        { id: 'auto' as const, label: 'Auto' },
        { id: 'fast' as const, label: 'Fast' },
      ],
      settings().resolution === 'half' ? 'fast' : settings().crisp ? 'sharp' : 'auto',
      (v) => {
        updateSettings({
          resolution: v === 'fast' ? 'half' : 'full',
          crisp: v === 'sharp',
        });
        onLayoutChange();
      });

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

    /*
     * `volume` has been saved, clamped, persisted and coerced since the day
     * settings existed, and has never once been reachable -- a stored
     * preference with no way to state it. Three steps rather than a slider,
     * because a slider is a control this UI does not otherwise have and a
     * volume nobody can name is the thing that got us here.
     */
    row('Loudness', 'Music and gunfire.',
      [
        { id: 'quiet' as const, label: 'Quiet' },
        { id: 'normal' as const, label: 'Normal' },
        { id: 'loud' as const, label: 'Loud' },
      ],
      settings().volume <= 0.2 ? 'quiet' : settings().volume >= 0.6 ? 'loud' : 'normal',
      (v) => updateSettings({ volume: v === 'quiet' ? 0.15 : v === 'loud' ? 0.75 : 0.35 }));

    rows.appendChild(heading('rules'));
    /*
     * Named after what it does rather than after which era it belongs to.
     *
     * "Ruleset: Classic / Modern" asks the player to know what 1993 had, which
     * is a question about history rather than about the game in front of them.
     * There is exactly one mechanic behind the switch, so the switch is called
     * after it -- and the description says what the control *is*, not when it
     * was invented.
     */
    row('Waypoints', 'Long-press to queue a second move. Off is the 1993 game.',
      onOff, settings().rules === 'modern' ? 'on' : 'off',
      (v) => updateSettings({ rules: v === 'on' ? 'modern' : 'classic' }));

    /*
     * The standing note is gone with the row that needed it. It existed to
     * explain what `Ruleset: Modern` meant, which is a sign the control was
     * named wrong -- a setting that needs a paragraph underneath the list is a
     * setting whose own label is not doing its job.
     */
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
