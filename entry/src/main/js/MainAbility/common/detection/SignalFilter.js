/**
 * Small per-sample filters. Everything is O(1) and allocation-free: the detector runs ~45 times
 * a second on the watch's JerryScript with a ~100 KB heap.
 */

/** Gain of a first-order low-pass for an irregular step: y += gain · (x − y). */
export function lowPassGain(dtS, tauS) {
  return dtS / (tauS + dtS);
}

/**
 * Median of the last 3 values: removes single-sample spikes (a tap on the watch, a glitch)
 * at the cost of one sample of delay.
 */
export function createMedian3() {
  let a = 0;
  let b = 0;
  let count = 0;
  return {
    push: function (x) {
      let out = x;
      if (count >= 2) {
        out = Math.max(Math.min(a, b), Math.min(Math.max(a, b), x));
      }
      a = b;
      b = x;
      count++;
      return out;
    },
    reset: function () {
      count = 0;
    }
  };
}
