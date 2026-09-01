import { musicBlocked, onMusicChange, resumeMusic } from '../shell/music.js';

/**
 * The button that asks for the click the browser is holding out for.
 *
 * Chrome will not play audible media until somebody has interacted with the
 * page, and no amount of code gets round that: a first visit and every
 * incognito window are silent by design. The speaker in the corner has always
 * *said* so, but a small icon changing shape is a hint, and the owner's report
 * was the honest reading of it -- the music simply did not start, and the one
 * thing that looked clickable turned it off.
 *
 * So the requirement becomes an invitation. Rather than a warning that
 * something is wrong, it is an offer of something good, in the game's own
 * voice, sitting under the two real menu buttons.
 *
 * Three things about it are deliberate:
 *
 *   **It is styled to lose.** PLAY NOW is what this screen is for. This is not
 *   a third menu option and must not read as one, so it wears no plate -- it is
 *   a line of text with a speaker on it, quieter than everything above it.
 *
 *   **It only exists while it is needed.** Mounted only when the music is
 *   genuinely blocked, and it removes itself the moment music starts -- whether
 *   that was this button, the speaker, or any other click on the page, since
 *   *any* gesture satisfies the browser. A button offering to start music that
 *   is already playing is worse than no button.
 *
 *   **It goes out with a bang rather than vanishing.** The click is the whole
 *   interaction, and an element that simply disappears reads as a page glitch.
 *   The pop is short, stepped rather than smooth, and it is the only thing on
 *   screen at that moment.
 */

const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path class="cone" d="M4 9.5h3.6L12 5.4v13.2L7.6 14.5H4z"/>'
  + '<path class="wave" d="M15.4 9.3a4 4 0 0 1 0 5.4"/>'
  + '<path class="wave" d="M18.1 6.7a7.6 7.6 0 0 1 0 10.6"/></svg>';

/**
 * Mounts the invitation into `parent` if the music needs a hand, and keeps it
 * honest. Returns the teardown.
 */
export function mountMusicPrompt(parent: HTMLElement): () => void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fx-cta';
  btn.innerHTML = `${NOTE}<span>Play some awesome music</span>`;
  btn.title = 'The browser will not start music on its own. This is the click it wants.';

  let gone = false;
  /** Takes the button away for good, with or without the flourish. */
  const retire = (withEffect: boolean): void => {
    if (gone) return;
    gone = true;
    if (!withEffect) { btn.remove(); return; }
    btn.disabled = true;
    btn.classList.add('going');
    // `animationend` is the honest signal, but a browser that never fires it --
    // reduced motion, a backgrounded tab -- must not leave the button sitting
    // there for ever.
    btn.addEventListener('animationend', () => btn.remove(), { once: true });
    window.setTimeout(() => btn.remove(), 700);
  };

  btn.addEventListener('click', () => {
    // This click *is* the gesture, so the retry happens from inside the handler
    // where the browser will honour it.
    resumeMusic();
    retire(true);
  });

  // Any other gesture starts the music too, and then this has nothing to offer.
  const unsub = onMusicChange(() => { if (!musicBlocked()) retire(false); });

  if (!musicBlocked()) {
    unsub();
    return () => {};
  }
  parent.appendChild(btn);

  return () => {
    unsub();
    btn.remove();
  };
}
