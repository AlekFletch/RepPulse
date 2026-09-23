import {
  ExerciseType,
  WorkoutMode,
  WorkoutStatus,
  WristSide,
  SetEndReason,
  Sensitivity,
  Language,
  isEnumValue
} from './enums.js';
import { Limits } from './limits.js';
import { ALGORITHM_VERSION } from '../detection/version.js';
import { getBaseline } from '../detection/DetectionConfig.js';
import { hasValue, isInteger } from '../util/obj.js';

/**
 * Validation error codes double as i18n keys: $t('strings.' + code).
 */
export const PlanError = Object.freeze({
  INVALID_EXERCISE: 'errInvalidExercise',
  INVALID_MODE: 'errInvalidMode',
  INVALID_WRIST: 'errInvalidWrist',
  TIMER_DURATION_OUT_OF_RANGE: 'errTimerDurationRange',
  SET_COUNT_OUT_OF_RANGE: 'errSetCountRange',
  TARGET_REPS_OUT_OF_RANGE: 'errTargetRepsRange',
  WORK_DURATION_OUT_OF_RANGE: 'errWorkDurationRange',
  REST_DURATION_OUT_OF_RANGE: 'errRestDurationRange',
  SET_NEEDS_GOAL: 'errSetNeedsGoal'
});

function inRange(value, range) {
  return isInteger(value) && value >= range.min && value <= range.max;
}

/**
 * Returns a list of PlanError codes; an empty list means the plan is valid.
 *
 * TIMER mode stores its duration in workDurationSec.
 * SETS mode needs at least one goal per set: targetReps, workDurationSec or both.
 */
export function validatePlan(plan) {
  const errors = [];
  if (!isEnumValue(ExerciseType, plan.exerciseType)) {
    errors.push(PlanError.INVALID_EXERCISE);
  }
  if (!isEnumValue(WorkoutMode, plan.mode)) {
    errors.push(PlanError.INVALID_MODE);
  }
  if (!isEnumValue(WristSide, plan.wristSide)) {
    errors.push(PlanError.INVALID_WRIST);
  }

  if (plan.mode === WorkoutMode.TIMER) {
    if (!inRange(plan.workDurationSec, Limits.TIMER_DURATION_SEC)) {
      errors.push(PlanError.TIMER_DURATION_OUT_OF_RANGE);
    }
  }

  if (plan.mode === WorkoutMode.SETS) {
    if (!inRange(plan.setCount, Limits.SET_COUNT)) {
      errors.push(PlanError.SET_COUNT_OUT_OF_RANGE);
    }
    const hasReps = hasValue(plan.targetReps);
    const hasTime = hasValue(plan.workDurationSec);
    if (!hasReps && !hasTime) {
      errors.push(PlanError.SET_NEEDS_GOAL);
    }
    if (hasReps && !inRange(plan.targetReps, Limits.TARGET_REPS)) {
      errors.push(PlanError.TARGET_REPS_OUT_OF_RANGE);
    }
    if (hasTime && !inRange(plan.workDurationSec, Limits.WORK_DURATION_SEC)) {
      errors.push(PlanError.WORK_DURATION_OUT_OF_RANGE);
    }
    if (!inRange(plan.restDurationSec, Limits.REST_DURATION_SEC)) {
      errors.push(PlanError.REST_DURATION_OUT_OF_RANGE);
    }
  }
  return errors;
}

/**
 * WorkoutPlan factory. Fields irrelevant to the chosen mode are dropped so the stored
 * plan is unambiguous (e.g. FREE never carries a targetReps).
 */
export function createWorkoutPlan(input, id, nowMs) {
  const plan = {
    id: id,
    exerciseType: input.exerciseType,
    mode: input.mode,
    vibrationOnRep: input.vibrationOnRep === true,
    wristSide: input.wristSide,
    createdAt: nowMs
  };
  if (input.mode === WorkoutMode.TIMER) {
    plan.workDurationSec = input.workDurationSec;
  }
  if (input.mode === WorkoutMode.SETS) {
    plan.setCount = input.setCount;
    plan.restDurationSec = input.restDurationSec;
    plan.autoStartNextSet = input.autoStartNextSet === true;
    if (hasValue(input.targetReps)) {
      plan.targetReps = input.targetReps;
    }
    if (hasValue(input.workDurationSec)) {
      plan.workDurationSec = input.workDurationSec;
    }
  }
  return plan;
}

/** Number of sets a plan will run: FREE and TIMER are a single set. */
export function plannedSetCount(plan) {
  return plan.mode === WorkoutMode.SETS ? plan.setCount : 1;
}

export function createWorkoutSession(plan, id, options) {
  const opts = options || {};
  const session = {
    id: id,
    plan: plan,
    status: WorkoutStatus.DRAFT,
    activeDurationSec: 0,
    restDurationSec: 0,
    totalReps: 0,
    totalAutoReps: 0,
    totalManualAdjustment: 0,
    algorithmVersion: opts.algorithmVersion || ALGORITHM_VERSION,
    sets: []
  };
  if (opts.calibrationProfileId) {
    session.calibrationProfileId = opts.calibrationProfileId;
  }
  return session;
}

export function createSetResult(setNumber, startedAtMs) {
  return {
    setNumber: setNumber,
    startedAt: startedAtMs,
    activeDurationSec: 0,
    autoReps: 0,
    manualAdjustment: 0,
    totalReps: 0
  };
}

export function isValidSetEndReason(reason) {
  return isEnumValue(SetEndReason, reason);
}

/**
 * CalibrationProfile factory. Thresholds default to the conservative baseline and are
 * overwritten by CalibrationEngine (Stage 4) on a successful calibration.
 */
export function createCalibrationProfile(exerciseType, wristSide, id, nowMs, overrides) {
  const baseline = getBaseline(exerciseType);
  const profile = {
    id: id,
    exerciseType: exerciseType,
    wristSide: wristSide,
    createdAt: nowMs,
    updatedAt: nowMs,
    isValid: false,
    minRepDurationMs: baseline.minRepDurationMs,
    maxRepDurationMs: baseline.maxRepDurationMs,
    minAmplitudeThreshold: baseline.minAmplitudeThreshold,
    minGyroThreshold: baseline.minGyroThreshold,
    confidenceThreshold: baseline.confidenceThreshold,
    algorithmVersion: ALGORITHM_VERSION
  };
  if (overrides) {
    for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        profile[key] = overrides[key];
      }
    }
  }
  return profile;
}

/** Storage key for a calibration profile: one profile per exercise and wrist. */
export function calibrationKey(exerciseType, wristSide) {
  return exerciseType + '_' + wristSide;
}

/**
 * AppSettings defaults.
 * heartRateEnabled is an addition to the spec's AppSettings: heart rate is opt-in
 * (spec 4.1: only when access is confirmed by the user).
 */
export function createDefaultSettings() {
  return {
    language: Language.RU,
    wristSide: WristSide.LEFT,
    vibrationEnabled: true,
    vibrationOnRep: true,
    countdownEnabled: true,
    sensitivity: Sensitivity.STANDARD,
    saveSensorLogsForDebug: false,
    hasSeenCalibrationHint: false,
    heartRateEnabled: false
  };
}

const SETTINGS_VALIDATORS = {
  language: function (v) { return isEnumValue(Language, v); },
  wristSide: function (v) { return isEnumValue(WristSide, v); },
  vibrationEnabled: function (v) { return typeof v === 'boolean'; },
  vibrationOnRep: function (v) { return typeof v === 'boolean'; },
  countdownEnabled: function (v) { return typeof v === 'boolean'; },
  sensitivity: function (v) { return isEnumValue(Sensitivity, v); },
  saveSensorLogsForDebug: function (v) { return typeof v === 'boolean'; },
  hasSeenCalibrationHint: function (v) { return typeof v === 'boolean'; },
  heartRateEnabled: function (v) { return typeof v === 'boolean'; }
};

/** Merge untrusted stored values over defaults, dropping unknown keys and invalid values. */
export function sanitizeSettings(stored) {
  const settings = createDefaultSettings();
  if (!stored) {
    return settings;
  }
  for (const key in SETTINGS_VALIDATORS) {
    if (Object.prototype.hasOwnProperty.call(stored, key) && SETTINGS_VALIDATORS[key](stored[key])) {
      settings[key] = stored[key];
    }
  }
  return settings;
}

export function settingKeys() {
  const keys = [];
  for (const key in SETTINGS_VALIDATORS) {
    if (Object.prototype.hasOwnProperty.call(SETTINGS_VALIDATORS, key)) {
      keys.push(key);
    }
  }
  return keys;
}
