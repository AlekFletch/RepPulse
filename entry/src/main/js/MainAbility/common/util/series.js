/**
 * Runs callback-style steps one after another: each step is fn(next) and calls next(err).
 * done(err) fires after the last step or on the first error. No Promise on lite JS.
 */
export function series(steps, done) {
  let index = 0;
  function next(err) {
    if (err || index >= steps.length) {
      done(err || null);
      return;
    }
    const step = steps[index];
    index++;
    step(next);
  }
  next(null);
}
