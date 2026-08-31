#!/usr/bin/env node
// Waits until a specific commit is the one actually answering HTTP at a URL.
//
// The point is certainty. A deploy platform reporting "live" tells you its own
// state machine finished; it does not tell you the old instance stopped serving.
// So the proof here is the deployed process naming its own commit back to us via
// GET /api/version, which Render populates from RENDER_GIT_COMMIT at runtime.
//
//   node verify-live.mjs --url https://x.onrender.com --commit <sha> [--timeout 900]
//
// Exit 0  the URL is serving that exact commit, and / returns 200.
// Exit 1  timed out, or a deploy failed. stderr says which, and why.
//
// RENDER_API_KEY (optional) is used only to explain a failure -- to name the
// deploy status and pull the build log -- never to decide that we are live.

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const url = (arg('url') ?? process.env.RENDER_URL ?? '').replace(/\/+$/, '');
const wantCommit = arg('commit');
const timeoutSec = Number(arg('timeout', '900'));
const serviceId = arg('service', process.env.RENDER_SERVICE_ID);
const apiKey = process.env.RENDER_API_KEY;

if (!url || !wantCommit) {
  console.error('usage: verify-live.mjs --url <https://...> --commit <sha> [--timeout <sec>]');
  process.exit(2);
}

const short = (s) => (s ?? '').slice(0, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`  ${m}`);

async function getJson(u, headers = {}) {
  const res = await fetch(u, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return { ok: false, status: res.status };
  try {
    return { ok: true, status: res.status, body: await res.json() };
  } catch {
    return { ok: false, status: res.status };
  }
}

const api = (p) =>
  getJson(`https://api.render.com/v1${p}`, {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  });

/** The deploy for our commit, if the Render API is reachable. Diagnosis only. */
async function deployFor(commit) {
  if (!apiKey || !serviceId) return null;
  const r = await api(`/services/${serviceId}/deploys?limit=20`);
  if (!r.ok) return null;
  const rows = (r.body ?? []).map((d) => d.deploy ?? d);
  return rows.find((d) => d?.commit?.id?.startsWith(commit.slice(0, 7))) ?? null;
}

// Statuses Render will never move off on its own. Waiting them out is pointless.
const DEAD = new Set([
  'build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated',
]);

async function main() {
  console.log(`\n  Waiting for ${short(wantCommit)} to answer at ${url}`);
  console.log(`  Give up after ${timeoutSec}s.`
    + (apiKey && serviceId ? '  Render API available for diagnosis.' : ''));
  console.log();

  const deadline = Date.now() + timeoutSec * 1000;
  let lastSeen = null;
  let lastStatus = null;

  while (Date.now() < deadline) {
    // 1. Ground truth: ask the running process what it is.
    const v = await getJson(`${url}/api/version`).catch(() => ({ ok: false }));

    if (v.ok && v.body?.commit) {
      if (v.body.commit.startsWith(wantCommit.slice(0, 7))
        || wantCommit.startsWith(v.body.commit.slice(0, 7))) {
        // 2. Serving the right commit. Confirm it serves the actual game too --
        //    a version endpoint can answer from a process that boots and nothing more.
        const root = await fetch(url + '/', { signal: AbortSignal.timeout(20_000) })
          .catch(() => null);
        const maps = await getJson(`${url}/api/maps`).catch(() => ({ ok: false }));

        if (root?.ok && maps.ok && Array.isArray(maps.body) && maps.body.length > 0) {
          console.log(`\n  LIVE  ${short(v.body.commit)} on ${url}`);
          console.log(`        / -> ${root.status}, ${maps.body.length} missions served`);
          console.log(`        instance up since ${v.body.startedAt}\n`);
          process.exit(0);
        }
        log(`${short(v.body.commit)} is up but not serving yet `
          + `(/ ${root?.status ?? 'unreachable'}, maps ${maps.ok ? 'ok' : 'not ready'})`);
      } else if (v.body.commit !== lastSeen) {
        lastSeen = v.body.commit;
        log(`still the previous build (${short(v.body.commit)}) -- deploy in flight`);
      }
    } else if (v.status === 404) {
      console.error(`\n  /api/version returned 404. The live build predates the version`);
      console.error(`  endpoint, so it cannot be identified. Deploy once more and this`);
      console.error(`  check works from then on.\n`);
      process.exit(1);
    }

    // 3. Only now consult the platform, and only to fail fast on a dead deploy.
    const d = await deployFor(wantCommit).catch(() => null);
    if (d && d.status !== lastStatus) {
      lastStatus = d.status;
      log(`render: ${d.status}`);
    }
    if (d && DEAD.has(d.status)) {
      console.error(`\n  DEPLOY FAILED  ${d.status}  (deploy ${d.id})`);
      console.error(`  Logs: ${url.includes('onrender') ? 'https://dashboard.render.com' : ''}`);
      const ev = await api(`/services/${serviceId}/events?limit=5`).catch(() => null);
      if (ev?.ok) {
        for (const row of ev.body ?? []) {
          const e = row.event ?? row;
          if (e?.details?.reason) console.error(`  reason: ${JSON.stringify(e.details.reason)}`);
        }
      }
      process.exit(1);
    }

    await sleep(5000);
  }

  console.error(`\n  TIMED OUT after ${timeoutSec}s.`);
  console.error(`  Last commit seen serving: ${lastSeen ? short(lastSeen) : 'none -- URL never answered'}`);
  console.error(`  Wanted: ${short(wantCommit)}`);
  if (!apiKey) console.error(`  Set RENDER_API_KEY for the deploy status and failure reason.`);
  console.error();
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n  verify-live failed: ${err.message}\n`);
  process.exit(1);
});
