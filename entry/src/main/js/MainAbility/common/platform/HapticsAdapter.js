import vibrator from '@system.vibrator';

/**
 * HapticsAdapter over @system.vibrator (mode 'long' | 'short', ohos.permission.VIBRATE).
 * The platform exposes no custom durations or patterns, so a sequence is built from
 * several calls spaced by `gapMs`.
 * TODO(device): measure real short/long durations and the minimum safe gap on Watch Fit 4.
 */
export const HapticMode = Object.freeze({ SHORT: 'short', LONG: 'long' });

export const DEFAULT_SEQUENCE_GAP_MS = 350;

export function createHapticsAdapter(time, logger) {
  let pending = [];

  function vibrate(mode) {
    try {
      vibrator.vibrate({
        mode: mode,
        success: function () {},
        fail: function (data, code) {
          if (logger) {
            logger.warn('vibrate failed: ' + code + ' ' + data);
          }
        }
      });
    } catch (e) {
      if (logger) {
        logger.warn('vibrate threw: ' + e);
      }
    }
  }

  return {
    vibrate: vibrate,
    /** Play modes one after another, e.g. ['long', 'long'] for a strong signal. */
    sequence: function (modes, gapMs) {
      const gap = typeof gapMs === 'number' ? gapMs : DEFAULT_SEQUENCE_GAP_MS;
      for (let i = 0; i < modes.length; i++) {
        if (i === 0) {
          vibrate(modes[0]);
        } else {
          const mode = modes[i];
          pending.push(time.setTimeout(function () {
            vibrate(mode);
          }, gap * i));
        }
      }
    },
    cancelPending: function () {
      for (let i = 0; i < pending.length; i++) {
        time.clearTimeout(pending[i]);
      }
      pending = [];
    }
  };
}
