import { WorkoutMode } from './enums.js';
import { hasValue } from '../util/obj.js';

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
