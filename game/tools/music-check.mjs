/**
 * Does the music actually start for somebody arriving for the first time?
 *
 * This exists because two bugs that made the game silent survived every check
 * we had, for the dullest possible reason: nothing ever asked whether the music
 * was playing. The screenshots cannot hear it and the headless simulation has
 * no audio at all.
 *
 * The first: a browser that has not been clicked refuses to play audible media,
 * so the speaker in the corner drew its "click me" face -- and clicking it
 * switched the music *off*, because it was wired as a plain toggle and the
 * music was already "on". The one control that could have started the music was
 * the one that guaranteed it stayed silent.
 *
 * The second: `preloadMusic` called `el.load()` on the same element `apply()`
 * was playing. `load()` aborts playback and resets the element, so on any
 * browser that *would* have allowed autoplay -- a returning player with enough
 * Chrome media engagement on the origin -- the game started its own music and
 * then stopped it a moment later.
 *
 * It walks both routes a player has into the music: the invitation under the
 * menu, and the speaker in the corner. Each gets its own fresh page, because
 * once the music is playing neither has anything left to prove.
 *
 * **On autoplay generally:** there is no way to make sound happen before a
 * gesture. Chrome allows audible autoplay only where the origin has built up
 * enough Media Engagement, which a first visit and every incognito window by
 * definition have not. That is not a bug to be fixed; it is the reason the
 * speaker has a third state and the invitation exists at all.
 *
 *   node tools/music-check.mjs            # against localhost:5199
 *   node tools/music-check.mjs --port 5210
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const at = args.indexOf('--port');
const PORT = at === -1 ? '5199' : args[at + 1];
const BASE = `http://localhost:${PORT}`;

let passed = 0;
const failures = [];
const errors = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};

const browser = await chromium.launch({
  // Explicit, though Playwright's Chromium already blocks audible autoplay
  // without a gesture. Stated rather than relied upon: the whole value of this
  // file is that it tests the state a first-time visitor is actually in.
  args: ['--autoplay-policy=document-user-activation-required'],
});

/** A page that has never been clicked, with the front screen up. */
async function fresh() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.getElementById('front')?.hidden, { timeout: 30000 });
  await page.waitForTimeout(2500);
  return page;
}

const look = (page) => page.evaluate(() => {
  const t = document.getElementById('music-toggle');
  const a = document.querySelector('audio');
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem('cf.settings') || '{}').music;
  } catch {
    saved = undefined;
  }
  return {
    cls: t?.className ?? null,
    cta: !!document.querySelector('.fx-cta'),
    playing: a ? !a.paused : false,
    saved,
  };
});

// --- route one: the invitation under the menu, which is what a player meets
const viaCta = await fresh();
const offered = await look(viaCta);
check('a first visit offers to start the music',
  offered.cta && !offered.playing, JSON.stringify(offered));
check('...and the speaker agrees that it is blocked',
  (offered.cls ?? '').includes('blocked'), String(offered.cls));

await viaCta.locator('.fx-cta').click();
await viaCta.waitForTimeout(1500);
const accepted = await look(viaCta);
check('accepting it starts the music', accepted.playing, JSON.stringify(accepted));
check('...and the offer takes itself away', !accepted.cta, JSON.stringify(accepted));
check('...without switching the music setting off', accepted.saved !== false,
  `saved music = ${accepted.saved}`);
await viaCta.close();

// --- route two: the speaker, which is the control that used to mute it
const viaSpeaker = await fresh();
await viaSpeaker.locator('#music-toggle').click();
await viaSpeaker.waitForTimeout(1500);
const started = await look(viaSpeaker);
check('clicking the blocked speaker starts the music rather than muting it',
  started.playing && started.saved !== false, JSON.stringify(started));
check('...and withdraws the offer, since there is nothing left to offer',
  !started.cta, JSON.stringify(started));

await viaSpeaker.locator('#music-toggle').click();
await viaSpeaker.waitForTimeout(800);
const off = await look(viaSpeaker);
check('clicking it again still mutes, as a toggle should',
  !off.playing && off.saved === false, JSON.stringify(off));
await viaSpeaker.close();

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();

console.log(failures.length === 0
  ? `\n  ${passed} music checks passed\n`
  : `\n  ${failures.length} failed: ${failures.join(', ')}\n`);
process.exit(failures.length === 0 ? 0 : 1);
