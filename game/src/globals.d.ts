/**
 * Build-time flags, substituted by esbuild (see build.mjs).
 *
 * Read it bare -- `if (__DEV__)` -- and nothing else. esbuild replaces the
 * identifier with a literal, which is what lets it drop the whole branch, the
 * modules it imports and everything they import from a production bundle.
 * Reading it through a helper defeats that: the branch survives, and the debug
 * panel ships to players.
 *
 * index.html defines a `false` global of the same name before the bundle loads,
 * so a bundle built *without* the define -- a watcher started before the flag
 * existed -- degrades to "no dev features" instead of throwing at boot.
 */
declare const __DEV__: boolean;
