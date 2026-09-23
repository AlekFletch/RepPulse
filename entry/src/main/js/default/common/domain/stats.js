/**
 * Workout statistics (spec 4.2). Pure functions over session / set data.
 *   repTotal           = autoReps + manualAdjustment (never below 0)
 *   totalReps          = sum of set repTotal
 *   activeDurationSec  = sum of set active time (pauses excluded)
 *   workoutDurationSec = finishedAt - startedAt
 *   averageCadence     = totalReps / activeDurationSec * 60
 *   bestSet            = set with the most reps (first one wins on a tie)
 */

export function setRepTotal(set) {
  return Math.max(0, set.autoReps + set.manualAdjustment);
}

export function cadence(reps, activeSec) {
  if (!(activeSec > 0)) {
    return undefined;
  }
  return (reps / activeSec) * 60;
}

export function findBestSet(sets) {
  let best = null;
  for (let i = 0; i < sets.length; i++) {
    if (best === null || setRepTotal(sets[i]) > setRepTotal(best)) {
      best = sets[i];
    }
  }
  return best;
}

/** Confidence averaged over sets, weighted by the number of auto-counted reps. */
export function weightedConfidence(sets) {
  let weight = 0;
  let sum = 0;
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    if (typeof set.avgConfidence === 'number' && set.autoReps > 0) {
      sum += set.avgConfidence * set.autoReps;
      weight += set.autoReps;
    }
  }
  return weight > 0 ? sum / weight : undefined;
}

export function computeSessionTotals(session) {
  let totalReps = 0;
  let totalAutoReps = 0;
  let totalManual = 0;
  let activeSec = 0;
  for (let i = 0; i < session.sets.length; i++) {
    const set = session.sets[i];
    totalReps += setRepTotal(set);
    totalAutoReps += set.autoReps;
    totalManual += set.manualAdjustment;
    activeSec += set.activeDurationSec;
  }
  const best = findBestSet(session.sets);
  let workoutDurationSec = 0;
  if (typeof session.startedAt === 'number' && typeof session.finishedAt === 'number') {
    workoutDurationSec = Math.max(0, (session.finishedAt - session.startedAt) / 1000);
  }
  return {
    totalReps: totalReps,
    totalAutoReps: totalAutoReps,
    totalManualAdjustment: totalManual,
    activeDurationSec: activeSec,
    restDurationSec: session.restDurationSec,
    workoutDurationSec: workoutDurationSec,
    averageCadence: cadence(totalReps, activeSec),
    bestSetNumber: best ? best.setNumber : undefined,
    avgConfidence: weightedConfidence(session.sets)
  };
}
