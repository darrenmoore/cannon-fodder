---
name: playtest
description: Launch the real game in a browser and drive it — enter a mission, poke live state, capture a moment. For checking a change the tests and screenshots cannot see.
argument-hint: [what to check, e.g. "the grenade chord" or "a hut collapsing"]
allowed-tools: Bash(npm run *) Bash(node *) Bash(netstat *) Read Write Edit Glob Grep
---

`npm run check` proves it compiles and every mission is winnable. `tools/shoot.mjs`
proves it renders. `tools/playtest.mjs` proves the shell still plays. None of
them can see a grenade chord that silently stops throwing, a building that has
never once shown damage, or a death that reads as being crushed rather than
shot — all of which shipped in this repo behind green checks.

This is for those. It drives the real game and looks.

## Rules that are not optional

**Port 5199 belongs to the user.** He keeps `npm run dev` running there and
plays while you work. Never kill what is listening on it — a force-kill is
indistinguishable from a crash and nothing brings it back. Serve your own on
`PORT=5210 node server.js`, and kill only what you started.

**Build first — but check whether it already happened.** The served bundle is
whatever was last built, so an unbuilt change is a change you are not testing.
If the user's `npm run dev` watch is running it rebuilds on every save — check
`public/bundle.js`'s mtime against your edit before building yourself. Prefer
that: `node build.mjs` **deletes `public/sprites.html`**, which the user's dev
session is serving, and only the next `npm run dev` restart brings it back.

**Look at the capture.** Every screenshot, with your own eyes, before drawing a
conclusion from it. A capture that framed the wrong thing has produced
confident, detailed and wrong findings here more than once.

## Driving it

`window.game` is the live handle: `world`, `camera`, `input`, and the systems
underneath. `window.__atlas` is every baked sprite.

```js
// A fresh browser profile has almost everything locked. Seed the campaign
// save BEFORE the first goto and every mission opens.
const ids = (await (await fetch('http://localhost:5210/api/maps')).json()).map((m) => m.id);
await page.addInitScript((ids) => {
  const records = {};
  for (const id of ids) records[id] = { bestHome: 6, bestTime: 120, clears: ['rookie'] };
  localStorage.setItem('cf.campaign', JSON.stringify({
    v: 1, squad: [], fallen: [], records, issued: 0, renameUsed: false,
  }));
}, ids);

// Enter a mission the way a player does. The live screen is showFront
// (ui/front.ts) -- the old `#menu-list` selector is dead code. Theatre tab,
// then card, then the difficulty dialog, then dismiss the briefing.
await page.evaluate(() => { [...document.querySelectorAll('.fx-group')].find((b) => b.textContent.includes('DESERT'))?.click(); });
await page.evaluate(() => { [...document.querySelectorAll('.fx-card')].find((c) => c.textContent.includes('THE SINK'))?.click(); });
await page.evaluate(() => { [...document.querySelectorAll('.confirm-btn')].find((b) => /VETERAN/i.test(b.textContent))?.click(); });
await page.waitForFunction(() => !!window.game);
await page.keyboard.press('Escape');          // the briefing waits to be dismissed

// Stage what you want to see. The camera follows the squad, so move the squad
// -- and set `prev` too, or the interpolated draw smears the teleport.
await page.evaluate(() => {
  const w = window.game.world;
  const b = w.buildings[0];
  w.soldiers.forEach((s, i) => {
    s.pos.x = b.centre.x - 30 + i * 8; s.pos.y = b.centre.y + 40;
    s.prev.x = s.pos.x; s.prev.y = s.pos.y;
  });
});
```

Under `npm run dev` a **debug panel** sits bottom-right in-mission
(`.debug-btn`: invuln, freeze, +rifle, +sniper, +bazooka, grenades, fog, win,
lose, kill all). `win` is the fastest route to the end-of-mission panel; none
of them prove a mission is *winnable*, only that a state is reachable.

Prefer the real path over poking state where there is one — a grenade thrown
with the mouse tests the input layer too, and that is where the bug was. Poke
state only to *stage* a situation, not to fake the thing under test.

Clean up after yourself: delete throwaway scripts, stop your own server.

## The test level

Batch I of [the 004 spec](../../../docs/todo/004-enemy-ai/spec.md) adds a dev-only mission
with every enemy, terrain, building state and hazard on one small map, plus
debug switches. When it lands, this skill launches that by default and the
staging above stops being necessary. Until then, stage what you need in a real
mission.
