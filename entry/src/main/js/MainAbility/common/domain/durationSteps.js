import { clamp } from '../util/obj.js';

/**
 * Picker step for a duration value (spec 2.4):
 *   < 2 min  -> 10 s,  2–10 min -> 30 s,  > 10 min -> 1 min.
 */
export function stepFor(sec) {
  if (sec < 120) {
    return 10;
  }
  if (sec < 600) {
    return 30;
  }
  return 60;
}

/** Snap an arbitrary value onto the step grid, inside [min, max]. */
export function normalizeDuration(sec, min, max) {
  const value = clamp(Math.round(sec), min, max);
  let step = stepFor(value);
  let snapped = Math.round(value / step) * step;
  // Rounding up can cross into the next band (e.g. 115 -> 120): re-check the step.
  step = stepFor(snapped);
  snapped = Math.round(snapped / step) * step;
  return clamp(snapped, min, max);
}

export function incrementDuration(sec, min, max) {
  const value = normalizeDuration(sec, min, max);
  return clamp(value + stepFor(value), min, max);
}

export function decrementDuration(sec, min, max) {
  const value = normalizeDuration(sec, min, max);
  return clamp(value - stepFor(value - 1), min, max);
}
