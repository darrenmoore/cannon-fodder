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

**Build first.** `node build.mjs` — the served bundle is whatever was last
built, so a source change you have not built is a change you are not testing.

**Look at the capture.** Every screenshot, with your own eyes, before drawing a
conclusion from it. A capture that framed the wrong thing has produced
confident, detailed and wrong findings here more than once.

## Driving it

`window.game` is the live handle: `world`, `camera`, `input`, and the systems
underneath. `window.__atlas` is every baked sprite.

```js
// Enter a mission the way a player does, then dismiss the briefing.
await page.evaluate(() => document.querySelector('#menu-list button[data-id="village"]').click());
await page.waitForFunction(() => !!window.game);
await page.keyboard.press('Escape');          // the briefing waits to be dismissed

// Stage what you want to see. The camera follows the squad, so move the squad.
await page.evaluate(() => {
  const w = window.game.world;
  const b = w.buildings[0];
  w.soldiers.forEach((s, i) => { s.pos.x = b.centre.x - 30 + i * 8; s.pos.y = b.centre.y + 40; });
});
```

Prefer the real path over poking state where there is one — a grenade thrown
with the mouse tests the input layer too, and that is where the bug was. Poke
state only to *stage* a situation, not to fake the thing under test.

Clean up after yourself: delete throwaway scripts, stop your own server.

## The test level

Batch I of [004-spec.md](../../../docs/todo/004-spec.md) adds a dev-only mission
with every enemy, terrain, building state and hazard on one small map, plus
debug switches. When it lands, this skill launches that by default and the
staging above stops being necessary. Until then, stage what you need in a real
mission.
