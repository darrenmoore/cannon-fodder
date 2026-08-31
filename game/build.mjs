// Bundles src/main.ts -> public/bundle.js. With --watch it also boots the server.
import * as esbuild from 'esbuild';
import { copyFile, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/main.ts'],
  outfile: 'public/bundle.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
  /**
   * True only under `--watch`, i.e. `npm run dev`.
   *
   * esbuild substitutes the literal before minifying, so `if (__DEV__)` in a
   * production build becomes `if (false)` and the whole branch -- the test
   * range, the debug panel, everything behind it -- is dropped from the bundle
   * rather than merely hidden. Dev-only has to mean absent, not unreachable.
   */
  define: { __DEV__: JSON.stringify(watch) },
};

/**
 * The sprite gallery: a second entry point, built only under --watch.
 *
 * It is not guarded by `__DEV__` like the debug panel is, because it is not
 * inside the game -- it is its own page, and the way to make a page absent is
 * not to emit it. `npm run build` writes neither the script nor the shell, and
 * both are gitignored, so a deploy from a clean checkout has no /sprites.html
 * to serve and the server 404s it like any other missing file.
 *
 * The shell is copied once at startup rather than watched. Editing
 * src/dev/sprites.html needs a `npm run dev` restart; editing gallery.ts does
 * not, which is the way round that matters.
 */
const gallery = {
  ...options,
  entryPoints: ['src/dev/gallery.ts'],
  outfile: 'public/sprites.js',
  minify: false,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const gctx = await esbuild.context(gallery);
  await gctx.watch();
  await copyFile('src/dev/sprites.html', 'public/sprites.html');
  await import('./server.js');
} else {
  await esbuild.build(options);
  // Clear anything a previous `npm run dev` left behind, so a production build
  // in a working tree matches a production build in a fresh clone.
  await rm('public/sprites.js', { force: true });
  await rm('public/sprites.js.map', { force: true });
  await rm('public/sprites.html', { force: true });
}
