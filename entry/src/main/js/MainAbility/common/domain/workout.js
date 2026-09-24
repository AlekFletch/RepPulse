import { WorkoutMode, WorkoutStatus } from './enums.js';
import { ALGORITHM_VERSION } from '../detection/version.js';

/**
 * Session / set factories for the workout page. Kept apart from models.js (and plan.js) so that
 * page, which has the least JS heap to spare, bundles nothing else.
 */

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
