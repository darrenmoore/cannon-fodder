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
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  await import('./server.js');
} else {
  await esbuild.build(options);
}
