/*
 * Wave missions open empty.
 *
 * "If it's a wave type of map troops shouldn't spawn until the first wave
 * starts... this is the same for ALL wave type maps, check them all." It was
 * fixed for Last Stand and for Last Stand only; six others were still opening
 * with ten men standing on them, which is the exact thing the brief had asked
 * in as many words not to happen. A rule that has to be remembered once per map
 * is a rule that will be forgotten, so this is the reminder.
 *
 * Checked here rather than in a browser because it is a property of the map
 * files: a `waves:` header and a standing garrison contradict each other on
 * paper, and catching it on paper costs nothing and needs no server.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DATA = fileURLToPath(new URL('../../data/', import.meta.url));

let run = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  run++;
  if (ok) console.log(`  ok   ${name}`);
  else { fails.push(name); console.log(`  FAIL ${name} ${detail}`); }
};

const files = (await readdir(DATA)).filter((f) => f.endsWith('.map'));
const waveMaps = [];
for (const f of files) {
  const src = await readFile(join(DATA, f), 'utf8');
  const split = src.split(/^---\r?$/m);
  const head = split[0];
  if (!/^waves:/m.test(head)) continue;
  const body = split.slice(1).join('---');
  // E rifleman, S sniper, B bazookateer, C officer -- every man a map can place
  // on the ground before the mission starts.
  const standing = (body.match(/[ESBC]/g) ?? []).length;
  waveMaps.push({ id: f.slice(0, -4), standing, waves: /^waves: (.*)$/m.exec(head)[1].trim() });
}

check('there are wave missions to check at all', waveMaps.length > 0, `${waveMaps.length} found`);
for (const m of waveMaps) {
  check(`${m.id} (waves ${m.waves}) opens with nobody on the field`,
    m.standing === 0, `${m.standing} men placed`);
}

// A hold mission must outlast its own wave schedule -- on every difficulty.
// The sink declared four waves and a 45s hold, and on veteran a squad that
// reached the zone early won before wave four had even spawned: a schedule
// the player was promised and never shown. Paper math, worst case: first
// wave lands at CONFIG.wave.lead, later ones every
// interval * (1 - pace + pace * spawnInterval), and the slowest schedule is
// the largest spawnInterval lever. Ten seconds of margin so the last wave is
// met, not glimpsed.
const configSrc = await readFile(
  fileURLToPath(new URL('../src/sim/../config.ts', import.meta.url)), 'utf8');
const difficultySrc = await readFile(
  fileURLToPath(new URL('../src/sim/difficulty.ts', import.meta.url)), 'utf8');
const lead = Number(/lead:\s*([\d.]+)/.exec(configSrc)?.[1]);
const pace = Number(/pace:\s*([\d.]+)/.exec(configSrc)?.[1]);
const slowest = Math.max(
  ...[...difficultySrc.matchAll(/spawnInterval:\s*([\d.]+)/g)].map((m) => Number(m[1])));
check('the wave schedule constants were found on paper',
  Number.isFinite(lead) && Number.isFinite(pace) && Number.isFinite(slowest),
  `lead=${lead} pace=${pace} slowest=${slowest}`);
for (const f of files) {
  const src = await readFile(join(DATA, f), 'utf8');
  const head = src.split(/^---\r?$/m)[0];
  if (!/^objective: hold$/m.test(head) || !/^waves:/m.test(head)) continue;
  const duration = Number(/^duration:\s*(\d+)/m.exec(head)?.[1] ?? 90);
  const spec = /^waves:\s*(\d+)(?:@(\d+))?/m.exec(head);
  const count = Number(spec[1]);
  const interval = Number(spec[2] ?? 22);
  const lastWave = lead + (count - 1) * interval * (1 - pace + pace * slowest);
  check(`${f.slice(0, -4)} holds long enough to meet all ${count} waves`,
    duration >= lastWave + 10,
    `last wave ~${lastWave.toFixed(1)}s, hold ${duration}s`);
}

// And the other half of the same rule: the proximity trickle is off while a
// schedule is running, or the gaps that make waves legible as waves fill in.
const buildings = await readFile(
  fileURLToPath(new URL('../src/sim/buildings.ts', import.meta.url)), 'utf8');
check('the proximity trickle stands down on a wave map',
  /if \(world\.map\.waves\) continue;/.test(buildings));

assert.ok(run > 0);
console.log(`\n  ${run} wave checks run`);
if (fails.length) {
  console.log(`  ${fails.length} failed`);
  process.exit(1);
}
console.log('  all passed');
