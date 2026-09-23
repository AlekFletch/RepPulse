/**
 * Build-time switches. Lite JS has no process.env, so this file is the single
 * source of truth. `npm run check:release` fails while DEBUG is true.
 */
export const BuildConfig = Object.freeze({
  DEBUG: true,
  APP_VERSION: '1.0.0'
});
