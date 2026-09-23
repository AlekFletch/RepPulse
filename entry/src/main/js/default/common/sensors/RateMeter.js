/** Measures the real callback rate from timestamps (EMA of inter-sample intervals). */
export function createRateMeter(alpha) {
  const a = typeof alpha === 'number' ? alpha : 0.05;
  let lastT = null;
  let meanDt = 0;
  let count = 0;
  return {
    push: function (t) {
      if (lastT !== null) {
        const dt = t - lastT;
        if (dt > 0) {
          meanDt = count === 0 ? dt : meanDt + a * (dt - meanDt);
          count++;
        }
      }
      lastT = t;
    },
    getRateHz: function () {
      return count > 0 && meanDt > 0 ? 1000 / meanDt : 0;
    },
    getMeanIntervalMs: function () {
      return meanDt;
    },
    getCount: function () {
      return count;
    },
    reset: function () {
      lastT = null;
      meanDt = 0;
      count = 0;
    }
  };
}
