/**
 * 3-2-1 countdown before a set (spec 2.3). onTick(n) fires for n = seconds..1 one second
 * apart, onDone() one second after the last tick.
 */
export function createCountdownController(time) {
  let timer = null;

  function cancel() {
    if (timer !== null) {
      time.clearTimeout(timer);
      timer = null;
    }
  }

  return {
    start: function (seconds, onTick, onDone) {
      cancel();
      let n = seconds;
      function step() {
        if (n <= 0) {
          timer = null;
          onDone();
          return;
        }
        const current = n;
        n--;
        timer = time.setTimeout(step, 1000);
        onTick(current);
      }
      step();
    },
    cancel: cancel,
    isRunning: function () {
      return timer !== null;
    }
  };
}
