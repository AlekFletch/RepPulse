/**
 * TimeAdapter contract:
 *   now() -> ms, setTimeout(fn, ms) -> handle, clearTimeout(handle),
 *   setInterval(fn, ms) -> handle, clearInterval(handle)
 * Controllers and detectors receive it by injection so tests can use a fake clock.
 */
export function createSystemTimeAdapter() {
  return {
    now: function () {
      return Date.now();
    },
    setTimeout: function (fn, ms) {
      return setTimeout(fn, ms);
    },
    clearTimeout: function (handle) {
      clearTimeout(handle);
    },
    setInterval: function (fn, ms) {
      return setInterval(fn, ms);
    },
    clearInterval: function (handle) {
      clearInterval(handle);
    }
  };
}
