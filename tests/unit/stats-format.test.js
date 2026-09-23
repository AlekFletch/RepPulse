import {
  setRepTotal, cadence, findBestSet, weightedConfidence, computeSessionTotals
} from '../../entry/src/main/js/default/common/domain/stats.js';
import {
  stepFor, normalizeDuration, incrementDuration, decrementDuration
} from '../../entry/src/main/js/default/common/domain/durationSteps.js';
import { formatDuration, roundCadence, fill } from '../../entry/src/main/js/default/common/util/format.js';
import { toAsciiJson, safeParse } from '../../entry/src/main/js/default/common/util/json.js';
import { extend, clamp, indexWhere, isInteger } from '../../entry/src/main/js/default/common/util/obj.js';
import { generateId } from '../../entry/src/main/js/default/common/util/id.js';

const set = (n, auto, manual, active, conf) =>
  ({ setNumber: n, autoReps: auto, manualAdjustment: manual, activeDurationSec: active, avgConfidence: conf });

describe('stats (spec 4.2)', () => {
  test('repTotal = auto + manual, never negative', () => {
    expect(setRepTotal(set(1, 10, 2, 30))).toBe(12);
    expect(setRepTotal(set(1, 1, -3, 30))).toBe(0);
  });

  test('cadence = reps / activeSec * 60', () => {
    expect(cadence(12, 30)).toBe(24);
    expect(cadence(5, 0)).toBeUndefined();
  });

  test('best set = most reps, first wins a tie', () => {
    expect(findBestSet([set(1, 10, 0, 30), set(2, 12, 0, 30), set(3, 12, 0, 30)]).setNumber).toBe(2);
    expect(findBestSet([])).toBeNull();
  });

  test('confidence weighted by auto reps, sets without data ignored', () => {
    expect(weightedConfidence([set(1, 10, 0, 1, 0.9), set(2, 30, 0, 1, 0.5), set(3, 5, 0, 1)])).toBeCloseTo(0.6);
    expect(weightedConfidence([set(1, 0, 3, 1)])).toBeUndefined();
  });

  test('session totals', () => {
    const session = {
      startedAt: 1_000_000,
      finishedAt: 1_000_000 + 300_000,
      restDurationSec: 120,
      sets: [set(1, 20, 0, 60, 0.8), set(2, 18, 2, 60, 0.9), set(3, 15, -1, 50, 0.7)]
    };
    const t = computeSessionTotals(session);
    expect(t.totalReps).toBe(54);
    expect(t.totalAutoReps).toBe(53);
    expect(t.totalManualAdjustment).toBe(1);
    expect(t.activeDurationSec).toBe(170);
    expect(t.restDurationSec).toBe(120);
    expect(t.workoutDurationSec).toBe(300);
    expect(t.averageCadence).toBeCloseTo(54 / 170 * 60);
    expect(t.bestSetNumber).toBe(1);
  });
});

describe('duration picker steps (spec 2.4)', () => {
  const MIN = 10;
  const MAX = 3600;

  test('step: 10 s below 2 min, 30 s for 2–10 min, 60 s above', () => {
    expect(stepFor(10)).toBe(10);
    expect(stepFor(110)).toBe(10);
    expect(stepFor(120)).toBe(30);
    expect(stepFor(570)).toBe(30);
    expect(stepFor(600)).toBe(60);
  });

  test('walking up the whole range hits the expected grid', () => {
    const values = [MIN];
    while (values[values.length - 1] < MAX) {
      values.push(incrementDuration(values[values.length - 1], MIN, MAX));
    }
    expect(values.slice(0, 13)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150]);
    expect(values).toContain(600);
    expect(values).toContain(660);
    expect(values[values.length - 1]).toBe(3600);
    // walking down returns the same grid
    const down = [MAX];
    while (down[down.length - 1] > MIN) {
      down.push(decrementDuration(down[down.length - 1], MIN, MAX));
    }
    expect(down.slice().reverse()).toEqual(values);
  });

  test('normalizeDuration snaps and clamps', () => {
    expect(normalizeDuration(3, MIN, MAX)).toBe(10);
    expect(normalizeDuration(115, MIN, MAX)).toBe(120);
    expect(normalizeDuration(140, MIN, MAX)).toBe(150);
    expect(normalizeDuration(9999, MIN, MAX)).toBe(3600);
    expect(incrementDuration(600, 10, 600)).toBe(600);
  });
});

describe('format / util', () => {
  test('formatDuration MM:SS and H:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(27)).toBe('00:27');
    expect(formatDuration(599.9)).toBe('09:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(-5)).toBe('00:00');
  });

  test('roundCadence', () => {
    expect(roundCadence(23.6)).toBe(24);
    expect(roundCadence(undefined)).toBe(0);
    expect(roundCadence(NaN)).toBe(0);
  });

  test('fill placeholders', () => {
    expect(fill('Подход {current} из {total}', { current: 2, total: 5 })).toBe('Подход 2 из 5');
    expect(fill('{missing} x', {})).toBe('{missing} x');
  });

  test('toAsciiJson escapes non-ASCII and round-trips', () => {
    const value = { name: 'Приседания — тест', n: 5 };
    const text = toAsciiJson(value);
    expect(/^[\x00-\x7e]*$/.test(text)).toBe(true);
    expect(JSON.parse(text)).toEqual(value);
    expect(safeParse('{bad', 'fallback')).toBe('fallback');
  });

  test('obj helpers', () => {
    expect(extend({ a: 1 }, { b: 2 }, null, { a: 3 })).toEqual({ a: 3, b: 2 });
    expect(clamp(5, 0, 3)).toBe(3);
    expect(indexWhere([1, 5, 9], (v) => v > 4)).toBe(1);
    expect(isInteger(2)).toBe(true);
    expect(isInteger(2.5)).toBe(false);
  });

  test('generateId is unique', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) {
      ids.add(generateId(1_700_000_000_000));
    }
    expect(ids.size).toBe(500);
  });
});
