/**
 * In-app icon assets (designer masters in assets-src/icons, exported by tools/export_icons.py).
 * Lite <image> draws bitmaps at native size, so each on-screen size has its own file.
 *
 * ICON_HISTORY: the History Icon master has not been delivered yet. Until then `null`
 * means "render the neutral RepPulse placeholder (dark rounded square with '—')".
 * Never substitute emoji or third-party icons.
 */
const ROOT = '/common/icons/';

export const IconSize = Object.freeze({ LIST: 28, HOME: 64, HERO: 96 });

export const ICON_SQUAT = Object.freeze({
  28: ROOT + 'squat_icon_28.png',
  64: ROOT + 'squat_icon_64.png',
  96: ROOT + 'squat_icon_96.png'
});

export const ICON_PUSH_UP = Object.freeze({
  28: ROOT + 'pushup_icon_28.png',
  64: ROOT + 'pushup_icon_64.png',
  96: ROOT + 'pushup_icon_96.png'
});

export const ICON_HISTORY = null;

export const ICON_APP = Object.freeze({
  48: ROOT + 'reppulse_app_icon_48.png',
  104: ROOT + 'reppulse_app_icon_104.png'
});

/** Returns the asset path, or null when the asset is missing (caller shows the placeholder). */
export function iconPath(icon, size, logger) {
  const path = icon ? icon[size] : null;
  if (!path && logger) {
    logger.missingAsset('icon@' + size);
  }
  return path || null;
}
