import { Limits } from '../../entry/src/main/js/MainAbility/common/domain/limits.js';
import {
  OFF, stepDuration, stepOptionalDuration, stepSetCount, stepTargetReps, validateSetup, withoutOffGoals
} from '../../entry/src/main/js/MainAbility/common/ui/setupSteps.js';
import { setRows, summaryRows } from '../../entry/src/main/js/MainAbility/common/ui/summaryView.js';
import { fill } from '../../entry/src/main/js/MainAbility/common/util/template.js';
import { formatDateTime } from '../../entry/src/main/js/MainAbility/common/ui/page.js';

describe('setup steppers', () => {
  test('target reps: off <-> 1, steps of 1 / 5 / 10, capped at 500', () => {
    expect(stepTargetReps(OFF, 1)).toBe(1);
    expect(stepTargetReps(1, -1)).toBe(OFF);
    expect(stepTargetReps(OFF, -1)).toBe(OFF);
    expect(stepTargetReps(29, 1)).toBe(30);
    expect(stepTargetReps(30, 1)).toBe(35);
    expect(stepTargetReps(30, -1)).toBe(29);
    expect(stepTargetReps(100, 1)).toBe(110);
    expect(stepTargetReps(100, -1)).toBe(95);
    expect(stepTargetReps(500, 1)).toBe(500);
  });

  test('set count 1..20', () => {
    expect(stepSetCount(1, -1)).toBe(1);
    expect(stepSetCount(20, 1)).toBe(20);
    expect(stepSetCount(3, 1)).toBe(4);
  });

  test('durations follow the 10 s / 30 s / 1 min grid; optional work time switches off', () => {
    const work = Limits.WORK_DURATION_SEC;
    expect(stepDuration(110, 1, Limits.REST_DURATION_SEC)).toBe(120);
    expect(stepDuration(120, 1, Limits.REST_DURATION_SEC)).toBe(150);
    expect(stepDuration(600, 1, Limits.REST_DURATION_SEC)).toBe(600);
    expect(stepOptionalDuration(OFF, 1, work)).toBe(10);
    expect(stepOptionalDuration(10, -1, work)).toBe(OFF);
    expect(stepOptionalDuration(OFF, -1, work)).toBe(OFF);
    expect(stepOptionalDuration(20, -1, work)).toBe(10);
  });

  test('a sets plan needs at least one goal; OFF goals are dropped', () => {
    const base = { exerciseType: 'SQUAT', mode: 'SETS', setCount: 3, restDurationSec: 60 };
    expect(validateSetup(Object.assign({ targetReps: OFF, workDurationSec: OFF }, base))).toEqual(['errSetNeedsGoal']);
    expect(validateSetup(Object.assign({ targetReps: 15, workDurationSec: OFF }, base))).toEqual([]);
    expect(withoutOffGoals(Object.assign({ targetReps: OFF, workDurationSec: 30 }, base)))
      .toEqual(Object.assign({ workDurationSec: 30 }, base));
    expect(validateSetup({ exerciseType: 'PUSH_UP', mode: 'TIMER', workDurationSec: 60 })).toEqual([]);
  });
});

describe('summary rows', () => {
  const tr = (key, params) => fill({
    squats: 'Приседания', modeSets: 'Подходы', cadence: '{value} повт./мин',
    bestSetValue: '№{n} — {reps}', setRow: '{n}. {reps} повт. · {time}'
  }[key] || key, params);
  const session = {
    plan: { exerciseType: 'SQUAT', mode: 'SETS' },
    startedAt: 0,
    finishedAt: 200000,
    restDurationSec: 60,
    sets: [
      { setNumber: 1, autoReps: 10, manualAdjustment: 0, activeDurationSec: 40 },
      { setNumber: 2, autoReps: 11, manualAdjustment: 1, activeDurationSec: 50 }
    ]
  };

  test('totals, rest, pace, best set; manual corrections only in details', () => {
    const rows = summaryRows(session, tr, false);
    const byId = {};
    rows.forEach((r) => { byId[r.id] = r.value; });
    expect(byId).toEqual({
      exercise: 'Приседания', mode: 'Подходы', reps: '22', sets: '2', active: '01:30',
      rest: '01:00', total: '03:20', cadence: '15 повт./мин', best: '№2 — 12'
    });
    expect(summaryRows(session, tr, true).pop()).toEqual({ id: 'manual', label: 'manualAdjustment', value: '+1' });
    expect(setRows(session, tr, true).map((r) => r.text)).toEqual(['1. 10 повт. · 00:40', '2. 12 повт. · 00:50 (+1)']);
  });

  test('free mode has no rest or best-set rows', () => {
    const free = { plan: { exerciseType: 'PUSH_UP', mode: 'FREE' }, startedAt: 0, finishedAt: 1000, restDurationSec: 0,
      sets: [{ setNumber: 1, autoReps: 0, manualAdjustment: 0, activeDurationSec: 1 }] };
    const ids = summaryRows(free, tr, false).map((r) => r.id);
    expect(ids).toEqual(['exercise', 'mode', 'reps', 'sets', 'active', 'total', 'cadence']);
  });

  test('date format', () => {
    expect(formatDateTime(new Date(2026, 8, 4, 7, 5).getTime())).toBe('04.09 07:05');
  });
});
