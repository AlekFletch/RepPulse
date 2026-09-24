import { Limits } from '../domain/limits.js';
import { decrementDuration, incrementDuration, normalizeDuration } from '../domain/durationSteps.js';
import { validatePlan } from '../domain/models.js';
import { WristSide } from '../domain/enums.js';
import { clamp, extend } from '../util/obj.js';

/**
 * "−" / "+" steppers of the setup screens. Optional goals (target reps, work time) use 0 for
 * "off": one step below the minimum switches the goal off, "+" from off turns it back on.
 */
export const OFF = 0;

/** Reps step: 1 below 30, 5 up to 100, 10 above — 500 is reachable without endless taps. */
function repStep(value) {
  if (value < 30) {
    return 1;
  }
  return value < 100 ? 5 : 10;
}

export function stepTargetReps(value, delta) {
  const range = Limits.TARGET_REPS;
  if (delta > 0) {
    return value === OFF ? range.min : clamp(value + repStep(value), range.min, range.max);
  }
  if (value === OFF || value <= range.min) {
    return OFF;
  }
  return Math.max(range.min, value - repStep(value - 1));
}

export function stepSetCount(value, delta) {
  return clamp(value + (delta > 0 ? 1 : -1), Limits.SET_COUNT.min, Limits.SET_COUNT.max);
}

/** Required duration (timer length, rest) on the 10 s / 30 s / 1 min grid. */
export function stepDuration(sec, delta, range) {
  return delta > 0 ? incrementDuration(sec, range.min, range.max) : decrementDuration(sec, range.min, range.max);
}

/** Optional duration (work time per set): below the minimum it switches off. */
export function stepOptionalDuration(sec, delta, range) {
  if (delta > 0) {
    return sec === OFF ? range.min : incrementDuration(sec, range.min, range.max);
  }
  if (sec === OFF || normalizeDuration(sec, range.min, range.max) <= range.min) {
    return OFF;
  }
  return decrementDuration(sec, range.min, range.max);
}

/**
 * Plan input from a setup screen: OFF goals are dropped, then the plan is validated.
 * The wrist comes from the settings on the workout page, so it is not checked here.
 * Returns PlanError codes (i18n keys); empty means the input can start a workout.
 */
export function validateSetup(input) {
  return validatePlan(extend(withoutOffGoals(input), { wristSide: WristSide.LEFT }));
}

/** Removes OFF goals so the plan stores only what the user switched on. */
export function withoutOffGoals(input) {
  const plan = extend({}, input);
  if (plan.targetReps === OFF) {
    delete plan.targetReps;
  }
  if (plan.workDurationSec === OFF) {
    delete plan.workDurationSec;
  }
  return plan;
}
