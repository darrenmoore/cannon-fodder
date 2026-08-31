---
name: release
description: Ship main to production on Render. Refuses a dirty tree, runs the checks, pushes, then waits until the deployed URL is serving the exact commit before claiming it is live.
argument-hint: [--force-dirty | --no-wait]
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(git rev-parse *) Bash(git push *) Bash(git fetch *) Bash(npm run *) Bash(npm ci *) Bash(node *) Bash(curl *)
---

## Preflight

Branch: !`git branch --show-current`  ·  HEAD: !`git rev-parse --short HEAD`

Working tree (empty means clean):

```!
git status --porcelain
```

Unpushed commits:

```!
git log --oneline @{u}..HEAD 2>&1 || echo "(no upstream set)"
```

Deploy target: `RENDER_URL` = !`node -e "console.log(process.env.RENDER_URL||'NOT SET')"`
· Render API key: !`node -e "console.log(process.env.RENDER_API_KEY?'present':'not set')"`

## What you need to be able to do this

Read this section before doing anything else, and if a required piece is
missing, stop and tell the user exactly what to set and where.

**Required — the deploy target.** `RENDER_URL` must be the service's public URL,
like `https://cannon-fodder.onrender.com`. Set it in `.claude/settings.local.json`
(gitignored, personal to this machine):

```json
{ "env": { "RENDER_URL": "https://cannon-fodder.onrender.com" } }
```

The user gets it from the Render dashboard, at the top of the service page. If
it is not set, ask for it rather than guessing a hostname — a URL that 404s and
a service that has not deployed yet are indistinguishable from here.

**Required — push rights.** `git push` to `darrenmoore/cannon-fodder`. The `gh`
CLI is already authenticated on this machine, so this works today. Render
auto-deploys `main` on push; nothing else triggers the deploy.

**Not required, but it makes failures legible.** `RENDER_API_KEY` and
`RENDER_SERVICE_ID` let the verifier read deploy status and say *why* a build
failed instead of only that it timed out. Same file:

```json
{ "env": {
    "RENDER_URL": "https://cannon-fodder.onrender.com",
    "RENDER_API_KEY": "rnd_...",
    "RENDER_SERVICE_ID": "srv-..."
} }
```

The key comes from Render → Account Settings → API Keys; the service ID is the
`srv-...` in the dashboard URL. **Without them the release still works and the
verdict is still certain** — the proof of liveness does not come from Render's
API. It comes from the deployed process naming its own commit, which is the next
section.

## How "live" is established

Do not treat a Render deploy status of `live`, a green dashboard, or a `200` from
the URL as proof. None of them distinguish the new build from the old instance
still happily serving the previous commit.

The proof is `GET /api/version` on the deployed service. Render injects
`RENDER_GIT_COMMIT` at runtime and [`game/server.js`](../../../game/server.js)
echoes it back, so the running process identifies itself. The release is live
when, and only when, that endpoint returns the commit you just pushed **and**
the service still serves the game (`/` returns 200 and `/api/maps` returns all
eight missions).

`scripts/verify-live.mjs` does exactly that and nothing else. Run it; do not
reimplement its logic inline or substitute your own judgement for its exit code.

## Your task

Work through these in order. **Stop at the first failure** and report it — a
half-done release is worse than one that did not start.

### 1. Clean tree, right branch

The branch must be `main` and `git status --porcelain` above must be empty.

- Dirty tree → **stop**. Show what is uncommitted and tell the user to run
  `/commit` first. Do not commit it yourself; other sessions edit this tree and
  what is sitting there may not be finished. Override only if the user passed
  `--force-dirty`, and if they did, say clearly in your final report that
  uncommitted work was left behind and is **not** in the release.
- Not on `main` → **stop**. Render only deploys `main`; pushing anything else
  ships nothing.
- Nothing unpushed and the live URL already serves HEAD → say so and stop.
  There is nothing to release.

### 2. Tests must pass

From `game/`, run both and require both to succeed:

```
npm run check    # tsc --noEmit, level validation, map tests
npm run build    # the production esbuild bundle
```

`npm run check` is the test suite. `npm run build` matters because Render runs
it during deploy — a bundle that fails here fails there, ten minutes later and
with worse logs.

If either fails: **stop, do not push**, and report the actual output. Do not fix
the failure as part of the release unless the user asks; a release command that
silently edits code is a bad surprise.

`npm run playtest` drives a real browser and is slower and flakier. Run it only
if the user asks, and never let it block the release on its own.

### 3. Push

```
git push origin main
```

Then capture the pushed SHA: `git rev-parse HEAD`. This is what you will verify
against. Render's auto-deploy picks it up within a few seconds.

### 4. Wait for it to actually be live

```
node .claude/skills/release/scripts/verify-live.mjs --url "$RENDER_URL" --commit "$(git rev-parse HEAD)"
```

It polls until the deployed commit matches, and exits:

- **0** — that commit is serving the game at that URL. This is the only thing
  that licenses you to say the release is live.
- **1** — timed out, or the deploy failed. The output says which. With a Render
  API key it also names the deploy status and reason.

Free-plan builds take a few minutes; the default 900s budget is deliberate.
Let it run rather than polling by hand. If the user passed `--no-wait`, skip
this step — and then you must **not** say it is live, only that it was pushed
and is building.

A `404` from `/api/version` means the currently-live build predates that
endpoint. That is expected exactly once, on the first release after this skill
was added: the push you just made is what introduces it. Give it one more
deploy cycle before treating it as a real failure.

### 5. Report

Only after exit 0, tell the user it is live, and include:

- the short SHA and subject line now in production
- the URL, and that `/` and `/api/maps` were confirmed serving
- how long the deploy took

If it failed, say what failed and at which step, give the real output, and state
plainly that the previous version is still the one serving. Do not soften a
timeout into "should be live shortly" — if you did not see the commit answer,
you do not know that.
