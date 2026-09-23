import {
  ExerciseType, WorkoutMode, WorkoutStatus, WristSide, Sensitivity, isEnumValue
} from '../../entry/src/main/js/default/common/domain/enums.js';
import {
  validatePlan, createWorkoutPlan, createWorkoutSession, createSetResult, plannedSetCount,
  createCalibrationProfile, calibrationKey, createDefaultSettings, sanitizeSettings, settingKeys, PlanError
} from '../../entry/src/main/js/default/common/domain/models.js';
import { ALGORITHM_VERSION } from '../../entry/src/main/js/default/common/detection/version.js';
import { getBaseline, getSensitivityScale } from '../../entry/src/main/js/default/common/detection/DetectionConfig.js';
import { RepPhase } from '../../entry/src/main/js/default/common/detection/RepPhase.js';
import { createRepDetectionResult } from '../../entry/src/main/js/default/common/detection/RepDetectionResult.js';

const base = { exerciseType: ExerciseType.SQUAT, wristSide: WristSide.LEFT, vibrationOnRep: true };
const plan = (extra) => Object.assign({}, base, extra);

describe('enums', () => {
  test('values match the spec', () => {
    expect(Object.values(RepPhase)).toEqual([
      'IDLE', 'READY', 'DESCENT', 'BOTTOM', 'ASCENT', 'REP_CONFIRMED', 'COOLDOWN', 'INVALID_MOTION'
    ]);
    expect(Object.values(WorkoutStatus)).toEqual([
      'DRAFT', 'PREPARING', 'ACTIVE', 'PAUSED', 'RESTING', 'COMPLETED', 'CANCELLED'
    ]);
    expect(isEnumValue(ExerciseType, 'PUSH_UP')).toBe(true);
    expect(isEnumValue(ExerciseType, 'LUNGE')).toBe(false);
    expect(Object.isFrozen(WorkoutMode)).toBe(true);
  });
});

describe('validatePlan', () => {
  test('FREE mode needs only exercise, mode and wrist', () => {
    expect(validatePlan(plan({ mode: WorkoutMode.FREE }))).toEqual([]);
    expect(validatePlan({ mode: WorkoutMode.FREE })).toEqual(
      expect.arrayContaining([PlanError.INVALID_EXERCISE, PlanError.INVALID_WRIST]));
  });

  test('TIMER duration is 10 s .. 60 min', () => {
    expect(validatePlan(plan({ mode: WorkoutMode.TIMER, workDurationSec: 10 }))).toEqual([]);
    expect(validatePlan(plan({ mode: WorkoutMode.TIMER, workDurationSec: 3600 }))).toEqual([]);
    expect(validatePlan(plan({ mode: WorkoutMode.TIMER, workDurationSec: 5 })))
      .toEqual([PlanError.TIMER_DURATION_OUT_OF_RANGE]);
    expect(validatePlan(plan({ mode: WorkoutMode.TIMER, workDurationSec: 3601 })))
      .toEqual([PlanError.TIMER_DURATION_OUT_OF_RANGE]);
  });

  test('SETS requires at least one goal', () => {
    const sets = { mode: WorkoutMode.SETS, setCount: 3, restDurationSec: 60 };
    expect(validatePlan(plan(sets))).toEqual([PlanError.SET_NEEDS_GOAL]);
    expect(validatePlan(plan(Object.assign({ targetReps: 20 }, sets)))).toEqual([]);
    expect(validatePlan(plan(Object.assign({ workDurationSec: 30 }, sets)))).toEqual([]);
    expect(validatePlan(plan(Object.assign({ targetReps: 20, workDurationSec: 30 }, sets)))).toEqual([]);
  });

  test('SETS ranges: sets 1..20, reps 1..500, work 10 s..60 min, rest 10 s..10 min', () => {
    const ok = { mode: WorkoutMode.SETS, setCount: 1, targetReps: 1, restDurationSec: 10 };
    expect(validatePlan(plan(ok))).toEqual([]);
    expect(validatePlan(plan(Object.assign({}, ok, { setCount: 21 })))).toEqual([PlanError.SET_COUNT_OUT_OF_RANGE]);
    expect(validatePlan(plan(Object.assign({}, ok, { setCount: 0 })))).toEqual([PlanError.SET_COUNT_OUT_OF_RANGE]);
    expect(validatePlan(plan(Object.assign({}, ok, { targetReps: 501 })))).toEqual([PlanError.TARGET_REPS_OUT_OF_RANGE]);
    expect(validatePlan(plan(Object.assign({}, ok, { targetReps: 2.5 })))).toEqual([PlanError.TARGET_REPS_OUT_OF_RANGE]);
    expect(validatePlan(plan(Object.assign({}, ok, { workDurationSec: 9 })))).toEqual([PlanError.WORK_DURATION_OUT_OF_RANGE]);
    expect(validatePlan(plan(Object.assign({}, ok, { restDurationSec: 601 })))).toEqual([PlanError.REST_DURATION_OUT_OF_RANGE]);
    expect(validatePlan(plan(Object.assign({}, ok, { setCount: 20, targetReps: 500, restDurationSec: 600 })))).toEqual([]);
  });
});

describe('factories', () => {
  test('createWorkoutPlan keeps only fields relevant to the mode', () => {
    const free = createWorkoutPlan(plan({ mode: WorkoutMode.FREE, targetReps: 10, setCount: 3 }), 'p1', 123);
    expect(free).toEqual({
      id: 'p1', exerciseType: 'SQUAT', mode: 'FREE', vibrationOnRep: true, wristSide: 'LEFT', createdAt: 123
    });
    const sets = createWorkoutPlan(plan({
      mode: WorkoutMode.SETS, setCount: 5, targetReps: 20, restDurationSec: 90, autoStartNextSet: true
    }), 'p2', 5);
    expect(sets.setCount).toBe(5);
    expect(sets.targetReps).toBe(20);
    expect(sets.workDurationSec).toBeUndefined();
    expect(sets.autoStartNextSet).toBe(true);
    expect(plannedSetCount(sets)).toBe(5);
    expect(plannedSetCount(free)).toBe(1);
  });

  test('createWorkoutSession starts as an empty DRAFT with the algorithm version', () => {
    const p = createWorkoutPlan(plan({ mode: WorkoutMode.FREE }), 'p', 0);
    const s = createWorkoutSession(p, 's1', { calibrationProfileId: 'c1' });
    expect(s.status).toBe(WorkoutStatus.DRAFT);
    expect(s.sets).toEqual([]);
    expect(s.totalReps).toBe(0);
    expect(s.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(s.calibrationProfileId).toBe('c1');
    expect(createSetResult(2, 1000)).toEqual({
      setNumber: 2, startedAt: 1000, activeDurationSec: 0, autoReps: 0, manualAdjustment: 0, totalReps: 0
    });
  });

  test('calibration profile defaults to the conservative baseline', () => {
    const profile = createCalibrationProfile(ExerciseType.PUSH_UP, WristSide.RIGHT, 'c', 7);
    const baseline = getBaseline(ExerciseType.PUSH_UP);
    expect(profile.isValid).toBe(false);
    expect(profile.minAmplitudeThreshold).toBe(baseline.minAmplitudeThreshold);
    expect(profile.confidenceThreshold).toBeGreaterThanOrEqual(0.6);
    expect(createCalibrationProfile(ExerciseType.SQUAT, WristSide.LEFT, 'c', 7, { isValid: true }).isValid).toBe(true);
    expect(calibrationKey(ExerciseType.SQUAT, WristSide.LEFT)).toBe('SQUAT_LEFT');
    expect(() => getBaseline('LUNGE')).toThrow();
  });

  test('sensitivity scale lowers thresholds for HIGH', () => {
    expect(getSensitivityScale(Sensitivity.HIGH)).toBeLessThan(getSensitivityScale(Sensitivity.STANDARD));
    expect(getSensitivityScale(Sensitivity.LOW)).toBeGreaterThan(getSensitivityScale(Sensitivity.STANDARD));
    expect(getSensitivityScale('???')).toBe(1);
  });
});

describe('settings', () => {
  test('defaults: Russian, vibration on, heart rate opt-in, debug logs off', () => {
    const s = createDefaultSettings();
    expect(s.language).toBe('ru');
    expect(s.vibrationEnabled).toBe(true);
    expect(s.countdownEnabled).toBe(true);
    expect(s.saveSensorLogsForDebug).toBe(false);
    expect(s.heartRateEnabled).toBe(false);
    expect(settingKeys()).toEqual(Object.keys(s));
  });

  test('sanitizeSettings drops invalid and unknown values', () => {
    const s = sanitizeSettings({ language: 'en', wristSide: 'MIDDLE', vibrationOnRep: 'yes', evil: 1, sensitivity: 'HIGH' });
    expect(s.language).toBe('en');
    expect(s.wristSide).toBe('LEFT');
    expect(s.vibrationOnRep).toBe(true);
    expect(s.sensitivity).toBe('HIGH');
    expect(s.evil).toBeUndefined();
    expect(sanitizeSettings(null)).toEqual(createDefaultSettings());
  });
});

describe('RepDetectionResult', () => {
  test('clamps confidence and defaults optional fields', () => {
    const r = createRepDetectionResult({ detected: true, exerciseType: 'SQUAT', timestamp: 5, confidence: 1.7, phase: RepPhase.REP_CONFIRMED });
    expect(r.confidence).toBe(1);
    expect(r.reason).toBe('');
    expect(r.signalSummary).toBeNull();
    expect(createRepDetectionResult({ confidence: -1 }).confidence).toBe(0);
    expect(createRepDetectionResult({}).detected).toBe(false);
  });
});
