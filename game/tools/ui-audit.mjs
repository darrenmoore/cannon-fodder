/**
 * The responsive contract, asserted.
 *
 * `docs/responsive.md` states three numbers -- no interactive element under
 * 44x44 CSS pixels, no readable text under 12px, no horizontal overflow -- and
 * a promise that the visible field of view stays comparable across devices.
 * None of that survives six months of edits unless something fails when it is
 * broken, so this walks every screen at every breakpoint and checks them.
 *
 * It is deliberately a *measurement* harness rather than a screenshot one:
 * screenshots tell you something changed, and this tells you what rule it
 * broke. `tools/responsive.mjs` does the pictures.
 *
 *   node tools/ui-audit.mjs            # needs the server running
 *   node tools/ui-audit.mjs --verbose  # list every finding, not just a count
 */
import { chromium } from 'playwright';

const BASE = process.env.CF_URL ?? `http://localhost:${process.env.PORT ?? 5199}`;
const VERBOSE = process.argv.includes('--verbose');

/** The floors. Not suggestions -- these are what the audit exists to defend. */
const MIN_TAP = 44;
/**
 * The type floor belongs to the finger, not to the width.
 *
 * A tablet in landscape is laid out "wide" -- it has the room for a sidebar and
 * should have one -- but it is still operated with a thumb, so it gets the
 * touch floor. A desktop keeps the denser scale the game was designed in; 10px of
 * mission metadata a mouse pointer can rest on is not the same problem.
 */
const MIN_FONT_TOUCH = 12;
const MIN_FONT_POINTER = 10;

/**
 * The field of view each orientation has to deliver.
 *
 * Minimums, not a band. A 2560px desktop showing 790x480 world pixels is not a
 * bug, it is what a large monitor has always done here; what would be a bug is
 * a device seeing *less* ground than the missions were built against, because
 * a sniper reaching 190 world pixels from outside the frame is a fairness
 * problem rather than a cosmetic one. Portrait gets its own, lower bar: 195
 * world pixels across is all a phone held upright can offer, which is why the
 * off-screen indicators exist and why the layout nudges you to rotate.
 */
const FOV = {
  landscape: { minW: 300, minH: 170 },
  portrait: { minW: 175, minH: 250 },
  /** Only to catch a runaway; nothing sensible reaches it. */
  maxW: 900,
};

/**
 * Eight viewports in both orientations. Chosen to straddle every breakpoint the
 * stylesheet has, plus the two extremes -- the smallest phone still sold and a
 * 1440p desktop -- because a layout that works at 390 and 1280 and nowhere in
 * between is not responsive, it is two designs.
 */
const VIEWPORTS = [
  { name: 'phone-sm-portrait', width: 360, height: 640, touch: true, layout: 'stacked' },
  { name: 'phone-sm-landscape', width: 640, height: 360, touch: true, layout: 'compact' },
  { name: 'phone-portrait', width: 390, height: 844, touch: true, layout: 'stacked' },
  { name: 'phone-landscape', width: 844, height: 390, touch: true, layout: 'compact' },
  { name: 'phablet-landscape', width: 896, height: 414, touch: true, layout: 'compact' },
  { name: 'tablet-portrait', width: 768, height: 1024, touch: true, layout: 'stacked' },
  { name: 'tablet-landscape', width: 1024, height: 768, touch: true, layout: 'wide' },
  { name: 'laptop', width: 1280, height: 800, touch: false, layout: 'wide' },
  { name: 'desktop', width: 1920, height: 1080, touch: false, layout: 'wide' },
  { name: 'desktop-2k', width: 2560, height: 1440, touch: false, layout: 'wide' },
];

const failures = [];
const fail = (where, msg) => {
  failures.push(`${where}: ${msg}`);
  if (VERBOSE) console.log(`  FAIL ${where}: ${msg}`);
};

/**
 * Measures everything visible on whatever screen is currently up.
 *
 * Runs in the page rather than over the CDP protocol because the questions are
 * about computed style and laid-out boxes, which is a thing the page already
 * knows and a harness would have to reconstruct.
 */
const AUDIT = (minFont) => {
  const out = { small: [], tiny: [], overflow: [], layout: document.documentElement.dataset.layout };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const name = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    const text = (el.textContent ?? '').trim().slice(0, 22);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };

  // Tap targets. Everything a player is expected to hit.
  for (const el of document.querySelectorAll('button, [role="button"], a[href], input')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      out.small.push({ el: name(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // Type. Anything with its own text, ignoring pure containers -- a wrapper
  // inheriting a small size it never renders is not a legibility problem.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minFont) out.tiny.push({ el: name(el), size: Math.round(size * 10) / 10 });
  }

  // Horizontal overflow: the one thing a phone cannot scroll its way out of,
  // because the body does not scroll at all in this game.
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    out.overflow.push({ el: 'document', scroll: doc.scrollWidth, client: doc.clientWidth });
  }
  for (const el of document.querySelectorAll('#menu, #hill, #sheet, #stage, .sheet-card')) {
    if (!visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.overflow.push({ el: name(el), scroll: el.scrollWidth, client: el.clientWidth });
    }
  }
  return out;
};

const report = (where, audit, minFont) => {
  for (const s of audit.small) fail(where, `tap target ${s.el} is ${s.w}x${s.h}, under ${MIN_TAP}`);
  for (const t of audit.tiny) fail(where, `text ${t.el} is ${t.size}px, under ${minFont}`);
  for (const o of audit.overflow) fail(where, `${o.el} overflows: ${o.scroll} > ${o.client}`);
};

async function run() {
  const browser = await chromium.launch();
  let checked = 0;

  for (const vp of VIEWPORTS) {
    const minFont = vp.touch ? MIN_FONT_TOUCH : MIN_FONT_POINTER;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      // `hasTouch` is what makes `(pointer: coarse)` match, which is what
      // layout.ts reads -- so this is the whole of the touch simulation.
      hasTouch: vp.touch,
      isMobile: false,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#menu:not([hidden])', { timeout: 15000 });

    // The layout mode is the contract everything else hangs off; if it is wrong
    // every other finding on this viewport is noise.
    const mode = await page.evaluate(() => document.documentElement.dataset.layout);
    if (vp.layout && mode !== vp.layout) {
      fail(`${vp.name}/menu`, `layout is "${mode}", expected "${vp.layout}"`);
    }

    report(`${vp.name}/menu`, await page.evaluate(AUDIT, minFont), minFont);
    checked++;

    // Into a mission, which is where the action bar and the HUD live.
    await page.evaluate(() => {
      document.querySelector('#menu-list button[data-id]')?.click();
    });
    await page.waitForFunction(() => window.game?.world, null, { timeout: 15000 });
    await page.waitForTimeout(2600); // let the briefing clear itself

    report(`${vp.name}/mission`, await page.evaluate(AUDIT, minFont), minFont);
    checked++;

    // The field of view. The reason `layout.ts` derives zoom from the viewport
    // rather than pinning it: a constant device-pixel zoom gave a retina laptop
    // half the ground of a non-retina one.
    const fov = await page.evaluate(() => {
      const c = document.getElementById('screen');
      const g = window.game;
      return { w: c.width / g.camera.zoom, h: c.height / g.camera.zoom, zoom: g.camera.zoom };
    });
    const w = Math.round(fov.w);
    const h = Math.round(fov.h);
    const want = vp.height > vp.width ? FOV.portrait : FOV.landscape;
    if (w < want.minW || h < want.minH || w > FOV.maxW) {
      fail(`${vp.name}/fov`, `sees ${w}x${h} world px, wanted at least `
        + `${want.minW}x${want.minH} and at most ${FOV.maxW} wide`);
    }
    if (!VERBOSE) process.stdout.write('.');
    else console.log(`  ${vp.name}: ${mode}, zoom ${fov.zoom}, sees ${w}x${h} world px`);

    // The pause sheet: a phone's only route to restart, settings and the list.
    await page.evaluate(() => window.game?.input.onPause?.());
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 5000 });
    report(`${vp.name}/pause`, await page.evaluate(AUDIT, minFont), minFont);
    checked++;

    if (errors.length) fail(`${vp.name}`, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  await browser.close();
  if (!VERBOSE) process.stdout.write('\n');

  console.log(`ui-audit: ${checked} screens across ${VIEWPORTS.length} viewports`);
  if (failures.length === 0) {
    console.log('ui-audit: OK -- no target under 44px, no text under 12px, no overflow');
    return;
  }
  console.error(`\nui-audit: ${failures.length} failures`);
  // Collapsed: one selector breaking at ten viewports is one bug, not ten.
  const seen = new Map();
  for (const f of failures) {
    const key = f.replace(/^[^:]+/, '').replace(/\d+/g, 'N');
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key) <= 2) console.error(`  ${f}`);
  }
  for (const [key, n] of seen) if (n > 2) console.error(`  ... and ${n - 2} more like${key}`);
  process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
