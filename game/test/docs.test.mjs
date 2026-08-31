/**
 * Assertions that the map format doc still describes the map format.
 *
 * `docs/map-format.md` is the contract a hand-written mission is authored
 * against, and by 006 it had drifted badly enough to be actively misleading: it
 * was missing an entire tile, an entire objective, four header keys, and it
 * described deep water as impassable a release after it became swimmable. None
 * of that failed anything, because nothing checks prose.
 *
 * So this does. It reads the doc's own tables back out of the markdown and
 * compares them against the code they claim to describe. It is deliberately
 * strict in both directions -- a character the doc omits is rot, and a
 * character the doc invents is worse, because somebody will use it.
 *
 * The bundle is browser-targeted ESM, so the modules are compiled on the fly
 * with esbuild rather than imported directly.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOC = join(ROOT, '..', 'docs', 'map-format.md');

const load = async (...parts) => {
  const built = await esbuild.build({
    entryPoints: [join(ROOT, 'src', ...parts)],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
};

const { LEGEND, MARKERS } = await load('sim', 'tiles.ts');
const { DOCTRINES } = await load('sim', 'difficulty.ts');

const doc = await readFile(DOC, 'utf8');
const mapSrc = await readFile(join(ROOT, 'src', 'sim', 'map.ts'), 'utf8');
const serverSrc = await readFile(join(ROOT, 'server.js'), 'utf8');
const objectivesSrc = await readFile(join(ROOT, 'src', 'sim', 'objectives.ts'), 'utf8');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

/**
 * The rows of the first markdown table under a heading.
 *
 * Scoped to one section rather than run over the whole file, because several
 * tables here have a backticked first column and matching them all together
 * would let the terrain legend pass on the strength of the header-key table.
 */
function tableUnder(heading) {
  const start = doc.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `the doc has no "${heading}" section any more`);
  const rest = doc.slice(start + heading.length + 2);
  const end = rest.search(/\n#{2,4} /);
  const section = end === -1 ? rest : rest.slice(0, end);

  const rows = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    // The header row and the |:---:|---| separator beneath it.
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { rows.length = 0; continue; }
    rows.push(cells);
  }
  return rows;
}

/** First-column values written as `x`, which is how every table here writes them. */
const keysUnder = (heading) =>
  new Set(
    tableUnder(heading)
      .map((cells) => /^`(.+)`$/.exec(cells[0])?.[1])
      .filter((v) => v !== undefined),
  );

const diff = (doc_, code, what) => {
  const missing = [...code].filter((k) => !doc_.has(k));
  const invented = [...doc_].filter((k) => !code.has(k));
  assert.equal(missing.length, 0, `${what} in the code but not in the doc: ${missing.join(' ')}`);
  assert.equal(invented.length, 0, `${what} in the doc but not in the code: ${invented.join(' ')}`);
};

// ------------------------------------------------------------------ legend
check('the terrain table lists every legend character, and no others', () => {
  diff(keysUnder('### Terrain'), new Set(Object.keys(LEGEND)), 'terrain characters');
});

check('the marker table lists every entity marker, and no others', () => {
  diff(keysUnder('### Entity markers'), new Set(Object.keys(MARKERS)), 'entity markers');
});

// ----------------------------------------------------------------- headers
check('the header table lists every key either reader consults', () => {
  // What the mission needs, and what the level select needs. A key read by only
  // one of them is still a real key, so the doc has to carry the union.
  const read = (src) => [...src.matchAll(/\bheader\.([a-z_]+)/g)].map((m) => m[1]);
  const code = new Set([...read(mapSrc), ...read(serverSrc)]);
  assert.ok(code.size >= 10, `expected to find the header reads, found ${code.size}`);
  diff(keysUnder('### Header keys'), code, 'header keys');
});

// -------------------------------------------------------------- objectives
check('the objective table lists every objective the parser accepts', () => {
  const literal = /const OBJECTIVES: ObjectiveKind\[\] = \[([^\]]+)\]/.exec(mapSrc);
  assert.ok(literal, 'could not find the OBJECTIVES list in map.ts');
  const code = new Set([...literal[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
  diff(keysUnder('## Objectives'), code, 'objectives');
});

check('every objective has HUD text behind it', () => {
  // An objective with no OBJECTIVE_TEXT entry falls through to its raw id on
  // the menu and in the opening banner, which looks like a bug and is one.
  const literal = /const OBJECTIVES: ObjectiveKind\[\] = \[([^\]]+)\]/.exec(mapSrc);
  const code = [...literal[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const block = /export const OBJECTIVE_TEXT[^{]*\{([\s\S]*?)\n\};/.exec(objectivesSrc);
  assert.ok(block, 'could not find OBJECTIVE_TEXT in objectives.ts');
  for (const id of code) {
    assert.match(block[1], new RegExp(`\\b${id}:`), `${id} has no OBJECTIVE_TEXT entry`);
  }
});

// ---------------------------------------------------------------- doctrine
check('the doctrine table lists every doctrine', () => {
  diff(keysUnder('## Doctrine'), new Set(Object.keys(DOCTRINES)), 'doctrines');
});

console.log(`\n  ${passed} doc checks passed\n`);
