/**
 * Fixed-size ring buffer of numbers (the last few seconds of a signal). Preallocated, no
 * allocations on push. Used for the noise level at rest and by calibration.
 */
export function createSlidingWindowBuffer(capacity) {
  const data = [];
  for (let i = 0; i < capacity; i++) {
    data.push(0);
  }
  let start = 0;
  let size = 0;

  return {
    push: function (x) {
      if (size < capacity) {
        data[(start + size) % capacity] = x;
        size++;
      } else {
        data[start] = x;
        start = (start + 1) % capacity;
      }
    },
    size: function () {
      return size;
    },
    /** i = 0 is the oldest value. */
    get: function (i) {
      return data[(start + i) % capacity];
    },
    clear: function () {
      start = 0;
      size = 0;
    },
    /** Standard deviation of the stored values (0 when fewer than 2). */
    std: function () {
      if (size < 2) {
        return 0;
      }
      let sum = 0;
      for (let i = 0; i < size; i++) {
        sum += data[(start + i) % capacity];
      }
      const mean = sum / size;
      let sq = 0;
      for (let i = 0; i < size; i++) {
        const d = data[(start + i) % capacity] - mean;
        sq += d * d;
      }
      return Math.sqrt(sq / size);
    }
  };
}

/** Median of an array of numbers (copy sorted; for calibration, not per sample). */
export function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
