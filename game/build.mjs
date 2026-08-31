// Bundles src/main.ts -> public/bundle.js. With --watch it also boots the server.
import * as esbuild from 'esbuild';

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

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  await import('./server.js');
} else {
  await esbuild.build(options);
}
