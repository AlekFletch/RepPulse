import { HapticMode } from '../platform/HapticsAdapter.js';

const STRONG = [HapticMode.LONG, HapticMode.LONG];

/**
 * Workout vibration cues (spec 1.5) over HapticsAdapter. The platform only has 'short' and
 * 'long' (confirmed on Watch Fit 4 Pro), so the "strong" signal is two long pulses.
 *
 * options: { vibrationEnabled, vibrationOnRep } — everything is silent when vibration is off;
 * the per-rep pulse additionally needs vibrationOnRep.
 */
export function createHapticFeedbackController(haptics, options) {
  const enabled = options.vibrationEnabled !== false;
  const onRep = enabled && options.vibrationOnRep === true;

  function play(mode) {
    if (enabled) {
      haptics.vibrate(mode);
    }
  }

  return {
    workoutStart: function () {
      play(HapticMode.LONG);
    },
    rep: function () {
      if (onRep) {
        haptics.vibrate(HapticMode.SHORT);
      }
    },
    setComplete: function () {
      play(HapticMode.LONG);
    },
    restWarning: function () {
      play(HapticMode.SHORT);
    },
    restEnd: function () {
      play(HapticMode.LONG);
    },
    workoutComplete: function () {
      if (enabled) {
        haptics.sequence(STRONG);
      }
    },
    cancel: function () {
      haptics.cancelPending();
    }
  };
}
