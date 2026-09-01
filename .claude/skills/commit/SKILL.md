---
name: commit
description: Review the working tree and commit it in this repo's voice. Stages deliberately rather than sweeping everything up, because more than one agent session edits this tree at a time.
argument-hint: [what to commit, or a message hint]
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(git add *) Bash(git commit *) Bash(git rev-parse *) Bash(git show *) Bash(git restore *)
---

## The tree right now

Branch: !`git branch --show-current`

```!
git status --short
```

Changes by file:

```!
git diff --stat HEAD
```

Recent history, for voice and format:

```!
git log --format='%n--- %h%n%B' -3
```

## Your task

Commit the work described above. `$ARGUMENTS` narrows what to commit or hints at
the message; with no arguments, commit what is there.

### Stage deliberately

**Do not run `git add -A` without first accounting for every path it would
stage.** More than one Claude session works in this repository at once, so the
tree routinely holds changes that are not yours. Sweeping them into your commit
attributes someone else's half-finished work to your message and can commit code
that was mid-edit.

So: read the status above and decide, per path, whether it belongs to the change
you are committing. Then stage those paths by name. If you see work you do not
recognise and the user has not told you to include it, leave it alone and say so
at the end — do not commit it, and do not revert it either.

One trap that has already bitten: **`git mv` stages the rename, not your later
edits to the moved file.** A session that moves files and then rewrites their
contents (link fixes, say) will commit the renames with *stale* content unless
it re-adds the paths — and the tell is a rename shown as `(100%)` similarity
that should not be. Check `git status` again after any batch of edits that
followed a move.

Two things about this repo in particular:

- **`data/*.map` are generated.** `game/tools/generate-levels.mjs` writes them.
  A change to the generator and the maps it regenerates are one change and
  belong in one commit. Regenerated maps arriving alone, with no generator diff,
  means someone ran `npm run levels` — ask before committing that on its own.
- **`game/public/bundle.js` is build output** and is gitignored. If it ever
  shows up staged, something is wrong with `.gitignore` — stop and say so rather
  than committing it.

### Before you commit

- Skim the actual diff of what you staged (`git diff --cached`), not just the
  file names. You are about to put your name on it.
- Look for anything that should not be in a public repository: keys, tokens,
  `.env` files, absolute paths from this machine, real credentials in fixtures.
  This repo is public. If you find something, stop and tell the user.
- If the change touches `game/src/`, run `npm run check` from `game/` first
  (`tsc --noEmit`, level validation, map tests). A commit that does not
  typecheck will fail `/release` later, so it is cheaper to find out now. If it
  fails, report the failure and do not commit.

### The message

Match the voice of the log above. This repo writes prose, not conventional-commit
prefixes: a short subject line in the imperative, then a blank line, then a
paragraph or two on **why** the change was made and what it trades away. The
codebase comments explain reasoning rather than restating the code, and the
commit messages do the same.

- Subject under ~70 characters, no trailing period, no `feat:`/`chore:` prefix.
- The body is where the value is. Say what problem this solves and what you
  chose against. Skip it only for genuinely trivial changes.
- Do not list the files you changed — the diff already does that.
- End with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Write the message with a heredoc (`git commit -F -`) so the body keeps its line
breaks.

### Afterwards

Report the short SHA and subject, and say plainly whether anything was left
uncommitted and why. **Do not push** — that is `/release`'s job, and it runs
tests and verifies the deploy before it does.

If there was nothing to commit, just say so.
