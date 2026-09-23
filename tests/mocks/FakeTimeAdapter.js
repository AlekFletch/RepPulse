/**
 * Deterministic TimeAdapter for tests. Timers fire only when advance() / advanceTo() is called,
 * in chronological order (ties in creation order).
 */
export function createFakeTimeAdapter(startMs) {
  let now = typeof startMs === 'number' ? startMs : 1_000_000;
  let nextId = 1;
  let timers = [];

  function add(fn, ms, repeat) {
    const id = nextId++;
    timers.push({ id: id, at: now + Math.max(0, ms), fn: fn, repeat: repeat ? Math.max(1, ms) : 0 });
    return id;
  }

  function remove(id) {
    timers = timers.filter((t) => t.id !== id);
  }

  function advanceTo(target) {
    for (;;) {
      let next = null;
      for (const t of timers) {
        if (t.at <= target && (next === null || t.at < next.at || (t.at === next.at && t.id < next.id))) {
          next = t;
        }
      }
      if (next === null) {
        break;
      }
      now = next.at;
      if (next.repeat) {
        next.at += next.repeat;
      } else {
        remove(next.id);
      }
      next.fn();
    }
    now = target;
  }

  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, false),
    clearTimeout: remove,
    setInterval: (fn, ms) => add(fn, ms, true),
    clearInterval: remove,
    advance: (ms) => advanceTo(now + ms),
    advanceTo: advanceTo,
    pendingTimers: () => timers.length
  };
}
