/**
 * Build-time flags, substituted by esbuild (see build.mjs).
 *
 * `__DEV__` is true under `npm run dev` and false in a production bundle, where
 * everything guarded by it is removed by dead-code elimination.
 */
declare const __DEV__: boolean;
