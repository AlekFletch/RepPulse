import { Timing } from '../domain/limits.js';

const TICK_MS = 250;

/**
 * Rest timer between sets (spec 2.5). Works from an absolute end time, so a late or
 * skipped tick never makes the rest longer.
 *
 * start(durationSec, { onTick(remainingSec), onWarning(remainingSec), onDone() })
 *   onTick     once per displayed second
 *   onWarning  at 3, 2, 1 seconds left (short vibrations before the next set)
 *   onDone     when the time is up; the timer then stops by itself
 */
export function createRestTimerController(time) {
  let endAt = 0;
  let interval = null;
  let callbacks = null;
  let lastTick = -1;
  let lastWarning = -1;
  let running = false;

  function remainingSec() {
    if (!running) {
      return 0;
    }
    return Math.max(0, Math.ceil((endAt - time.now()) / 1000));
  }

  function clear() {
    if (interval !== null) {
      time.clearInterval(interval);
      interval = null;
    }
  }

  function tick() {
    const left = remainingSec();
    if (left !== lastTick) {
      lastTick = left;
      if (left > 0 && left <= Timing.REST_WARNING_SEC && left !== lastWarning) {
        lastWarning = left;
        callbacks.onWarning(left);
      }
      callbacks.onTick(left);
    }
    if (left === 0) {
      running = false;
      clear();
      callbacks.onDone();
    }
  }

  return {
    start: function (durationSec, cbs) {
      clear();
      callbacks = cbs;
      endAt = time.now() + durationSec * 1000;
      lastTick = -1;
      lastWarning = -1;
      running = true;
      interval = time.setInterval(tick, TICK_MS);
      tick();
    },
    /** "+15 сек": moves the end; warnings fire again if the rest left the last 3 seconds. */
    extend: function (sec) {
      if (!running) {
        return;
      }
      endAt += sec * 1000;
      if (remainingSec() > Timing.REST_WARNING_SEC) {
        lastWarning = -1;
      }
      tick();
    },
    stop: function () {
      running = false;
      clear();
    },
    remainingSec: remainingSec,
    isRunning: function () {
      return running;
    }
  };
}
