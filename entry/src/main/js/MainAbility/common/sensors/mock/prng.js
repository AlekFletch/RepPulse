/** 32-bit integer multiply without relying on ES2015 Math.imul (not guaranteed on lite JS). */
function imul(a, b) {
  const aHi = (a >>> 16) & 0xffff;
  const aLo = a & 0xffff;
  const bHi = (b >>> 16) & 0xffff;
  const bLo = b & 0xffff;
  return ((aLo * bLo) + (((aHi * bLo + aLo * bHi) << 16) >>> 0)) | 0;
}

/** Deterministic PRNG (mulberry32) so synthetic scenarios are reproducible in tests. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  let spareGaussian = null;

  function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = imul(t ^ (t >>> 15), t | 1);
    t ^= t + imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next: next,
    /** Uniform in [min, max). */
    uniform: function (min, max) {
      return min + (max - min) * next();
    },
    /** Normal distribution (Box–Muller). */
    gaussian: function (mean, sigma) {
      if (spareGaussian !== null) {
        const v = spareGaussian;
        spareGaussian = null;
        return mean + sigma * v;
      }
      let u = 0;
      while (u === 0) {
        u = next();
      }
      const w = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spareGaussian = r * Math.sin(2 * Math.PI * w);
      return mean + sigma * r * Math.cos(2 * Math.PI * w);
    }
  };
}
