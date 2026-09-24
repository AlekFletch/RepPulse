import { WorkoutMode, WorkoutStatus } from './enums.js';
import { ALGORITHM_VERSION } from '../detection/version.js';
import { hasValue } from '../util/obj.js';

/**
 * Workout plan / session / set factories. Kept apart from models.js so the workout page
 * bundle does not pull in validation, settings and calibration code (page size matters on
 * lite: every page is compiled to bytecode on the watch at install time).
 */

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
