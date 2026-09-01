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
