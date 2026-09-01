/**
 * The speaker: the one control that follows the player between screens.
 *
 * It was born inside the old mission list and died with it -- `showMenu` built
 * the button, `showMenu` stopped being called, and the game silently lost its
 * only music switch. Lifting it out is the fix rather than rebuilding it on the
 * new front, because the pause sheet or the settings screen will want the same
 * button eventually, and two speakers drawn separately is how the game ends up
 * with two music switches that disagree.
 *
 * Everything about its behaviour is inherited from the menu version, including
 * the part that matters: **on, off, and on-but-blocked are three states.** A
 * browser sitting on the autoplay permission produces a button that is "on"
 * with no sound, and a player looking at that is owed a reason, not a switch
 * that looks broken.
 */

import { musicOn, musicSource, onMusicChange, syncMusic } from '../shell/music.js';
import { updateSettings } from './settings.js';

const SPEAKER_BODY = '<path class="cone" d="M4 9.5h3.6L12 5.4v13.2L7.6 14.5H4z"/>';
const SPEAKER_ON = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER_BODY}`
  + '<path class="wave" d="M15.4 9.3a4 4 0 0 1 0 5.4"/>'
  + '<path class="wave" d="M18.1 6.7a7.6 7.6 0 0 1 0 10.6"/></svg>';
const SPEAKER_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER_BODY}`
  + '<path class="slash" d="M15.6 9.6l5 4.8"/><path class="slash" d="M20.6 9.6l-5 4.8"/></svg>';

/** Flips the music. Exposed so a keyboard shortcut can be the same action. */
export function flipMusic(): void {
  updateSettings({ music: !musicOn() });
  syncMusic();
}

/**
 * Mounts the speaker into `parent` and keeps it truthful until unmounted.
 * Returns the teardown, which removes the button and the listener with it.
 */
export function mountMusicToggle(parent: HTMLElement): () => void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'music-toggle';

  const render = (): void => {
    const on = musicOn();
    const blocked = on && musicSource() === 'none';
    toggle.classList.toggle('on', on && !blocked);
    toggle.classList.toggle('blocked', blocked);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.title = !on
      ? 'Music off  (M)'
      : blocked ? 'Click anywhere to start the music  (M)'
      : musicSource() === 'synth' ? 'Music on — house march  (M)'
      : 'Music on  (M)';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.innerHTML = on ? SPEAKER_ON : SPEAKER_OFF;
  };

  toggle.addEventListener('click', flipMusic);
  const unsub = onMusicChange(render);
  render();
  parent.appendChild(toggle);

  return () => {
    unsub();
    toggle.remove();
  };
}
