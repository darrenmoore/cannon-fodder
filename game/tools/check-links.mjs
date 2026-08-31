/**
 * Relative link check for the prose.
 *
 * Every markdown file here links into the source, and the 003 reorganisation
 * moved seventeen of those targets into `sim/`, `render/`, `ui/` and `shell/`
 * without anyone noticing -- the docs kept describing the right code at the
 * wrong address for two briefs running. Nothing failed, because nothing checks
 * prose.
 *
 * So this does. It walks every markdown file in the repo that is not inside
 * `node_modules`, pulls the relative targets out of it, and resolves each one
 * against the file that carries it. HTTP links are somebody else's problem;
 * bare anchors are checked against the headings of their own file, since a
 * `#terrain-as-shape` that no longer exists is the same class of rot.
 *
 *   node tools/check-links.mjs
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'public']);

/** Every .md file in the repo, depth first. */
async function markdownFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await markdownFiles(full)));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * GitHub's heading slug: lowercase, punctuation dropped, spaces to hyphens.
 *
 * One space becomes one hyphen -- runs are *not* collapsed, which matters here
 * because this project's headings are full of em dashes. "Batch H — presentation"
 * loses the dash and keeps the two spaces around it, so the anchor is
 * `batch-h--presentation` with a double hyphen. Collapsing them reports every
 * such link as broken.
 */
const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-');

const headingsOf = (src) =>
  new Set(
    src
      .split('\n')
      .filter((l) => /^#{1,6}\s/.test(l))
      .map((l) => slug(l.replace(/^#{1,6}\s+/, ''))),
  );

// Markdown inline links. Deliberately not a full parser: `[text](target)` with
// no nested brackets in the target is every link this repo actually writes.
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const files = await markdownFiles(ROOT);
const problems = [];
let checked = 0;

for (const file of files) {
  const src = await readFile(file, 'utf8');
  const here = dirname(file);
  const own = headingsOf(src);

  for (const m of src.matchAll(LINK)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith('//')) continue;

    // A bare anchor points inside this same file.
    if (target.startsWith('#')) {
      checked++;
      if (!own.has(target.slice(1))) {
        problems.push(`${relative(ROOT, file)} -> ${target} (no such heading here)`);
      }
      continue;
    }

    const [path, anchor] = target.split('#');
    if (!path) continue;
    checked++;
    const full = resolve(here, decodeURIComponent(path));
    let info = null;
    try {
      info = await stat(full);
    } catch {
      problems.push(`${relative(ROOT, file)} -> ${target}`);
      continue;
    }
    // A line anchor (#L42) is a GitHub convention, not a heading; only check
    // heading anchors, and only into markdown we can read.
    if (anchor && !/^L\d+(-L\d+)?$/.test(anchor) && info.isFile() && full.endsWith('.md')) {
      const other = headingsOf(await readFile(full, 'utf8'));
      if (!other.has(anchor)) problems.push(`${relative(ROOT, file)} -> ${target} (no such heading)`);
    }
  }
}

if (problems.length) {
  console.error(`\n  ${problems.length} broken link${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.error(`    ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`  ok   ${checked} links across ${files.length} markdown files\n`);
