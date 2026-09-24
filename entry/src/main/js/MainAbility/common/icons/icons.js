/**
 * In-app icon assets (designer masters in assets-src/icons, exported by tools/export_icons.py).
 * Lite <image> draws bitmaps at native size, so each on-screen size has its own file.
 *
 * A missing asset (`null` / no file for a size) means "render the neutral RepPulse placeholder
 * (dark rounded square with '—')". Never substitute emoji or third-party icons.
 */
const ROOT = '/common/icons/';

/**
 * Every bitmap ships twice in the HAP (PNG + converted .bin, ~3x the pixels), and the whole
 * package goes to the watch over Bluetooth, so only the sizes the screens use are exported.
 */
export const IconSize = Object.freeze({ LIST: 28, HOME: 64 });

export const ICON_SQUAT = Object.freeze({
  28: ROOT + 'squat_icon_28.png',
  64: ROOT + 'squat_icon_64.png'
});

export const ICON_PUSH_UP = Object.freeze({
  28: ROOT + 'pushup_icon_28.png',
  64: ROOT + 'pushup_icon_64.png'
});

export const ICON_HISTORY = Object.freeze({
  28: ROOT + 'history_icon_28.png',
  64: ROOT + 'history_icon_64.png'
});

export const ICON_APP = Object.freeze({
  48: ROOT + 'reppulse_app_icon_48.png'
});

/** Returns the asset path, or null when the asset is missing (caller shows the placeholder). */
export function iconPath(icon, size, logger) {
  const path = icon ? icon[size] : null;
  if (!path && logger) {
    logger.missingAsset('icon@' + size);
  }
  return path || null;
}
