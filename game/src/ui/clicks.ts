/**
 * The click under every button in the chrome.
 *
 * ## Why one listener rather than one call per button
 *
 * Buttons are built in at least six places -- `front.ts`'s `button()`,
 * `sheet.ts`, `confirm.ts`, `hud.ts`'s result panel, `boothill.ts` and
 * `musictoggle.ts` -- and more will be built. Wiring a sound into each of them
 * guarantees the set drifts: the seventh place to make a button is silent, and
 * nobody notices for a month because silence is not a symptom you can see.
 *
 * So this is one delegated listener on the document, matching the element
 * rather than the call site. A control written tomorrow makes the sound
 * without anybody remembering to ask for it, which is the only version of this
 * that stays true.
 *
 * ## What it deliberately does not cover
 *
 * **Hover.** The owner asked for press only, and a menu that ticks as the
 * cursor crosses it is a different, worse game.
 *
 * **Disabled controls.** A locked mission card is a press that does nothing;
 * answering it with the same click as a press that worked is a small lie.
 *
 * **The in-mission action bar** (`#controls`). Those plates are orders, not
 * chrome: FIRE and GRENADE already speak through the simulation -- `sfxOrder`
 * when a throw lands, `sfxDenied` when the pouch is empty -- and a UI click
 * layered on top would either double the denial or promise something happened
 * when it did not.
 *
 * ## `pointerdown`, not `click`
 *
 * The sound belongs to the press, not to the release, and `click` on a control
 * that opens a modal can arrive after the modal has taken focus. `pointerdown`
 * is also a gesture, which is what lets `burst()` build the AudioContext on the
 * very first press of a fresh page -- the game's own unlock (`input.onFirstPress`)
 * only fires inside a mission, so before this the context often did not exist
 * until the player had already left the front end.
 */

import { sfxClick } from '../shell/audio.js';

/** Everything that counts as a button to a player, however it was built. */
const CONTROL = 'button, [role="button"], .fx-btn, .fx-card, .fx-group';

let installed = false;

/** Installs the delegated press sound. Safe to call twice. */
export function installClicks(): void {
  if (installed) return;
  installed = true;

  document.addEventListener('pointerdown', (e) => {
    // Secondary and middle presses are not "pressing a button" in any sense
    // the player means; on a control they are usually a context menu.
    if (e.button !== 0) return;

    const target = e.target;
    if (!(target instanceof Element)) return;
    const control = target.closest(CONTROL);
    if (!control) return;

    // The action bar's plates are the simulation's, not the chrome's.
    if (control.closest('#controls')) return;

    if (control.matches(':disabled, [disabled], [aria-disabled="true"]')) return;

    sfxClick();
  }, { capture: true, passive: true });
}
