import { WorkoutMode } from '../domain/enums.js';
import { computeSessionTotals, setRepTotal } from '../domain/stats.js';
import { formatDuration, roundCadence } from '../util/format.js';
import { exerciseKey, modeKey } from './page.js';

/**
 * Rows for the workout summary (spec 4.1) and the history record (spec 4.3).
 * tr(key, params) translates 'strings.<key>' and fills its {placeholders} — on lite this must be
 * $t(path, params): $t without params strips the placeholders. Algorithm confidence is stored but never shown (spec 4.1).
 * details: true adds what the history record shows on top — manual corrections.
 */
export function summaryRows(session, tr, details) {
  const totals = computeSessionTotals(session);
  const plan = session.plan;
  const rows = [
    { id: 'exercise', label: tr('exercise'), value: tr(exerciseKey(plan.exerciseType)) },
    { id: 'mode', label: tr('mode'), value: tr(modeKey(plan.mode)) },
    { id: 'reps', label: tr('totalReps'), value: String(totals.totalReps) },
    { id: 'sets', label: tr('setsDone'), value: String(session.sets.length) },
    { id: 'active', label: tr('activeTime'), value: formatDuration(totals.activeDurationSec) }
  ];
  if (plan.mode === WorkoutMode.SETS) {
    rows.push({ id: 'rest', label: tr('restTotal'), value: formatDuration(totals.restDurationSec) });
  }
  rows.push({ id: 'total', label: tr('totalTime'), value: formatDuration(totals.workoutDurationSec) });
  if (totals.averageCadence !== undefined) {
    rows.push({ id: 'cadence', label: tr('avgCadence'), value: tr('cadence', { value: roundCadence(totals.averageCadence) }) });
  }
  if (session.sets.length > 1 && totals.bestSetNumber !== undefined) {
    const best = session.sets[totals.bestSetNumber - 1];
    rows.push({ id: 'best', label: tr('bestSet'), value: tr('bestSetValue', { n: best.setNumber, reps: setRepTotal(best) }) });
  }
  if (details && totals.totalManualAdjustment !== 0) {
    rows.push({ id: 'manual', label: tr('manualAdjustment'), value: signed(totals.totalManualAdjustment) });
  }
  return rows;
}

/** One line per set: "2. 12 повт. · 00:45", with "(+1)" for manual corrections in details. */
export function setRows(session, tr, details) {
  const rows = [];
  for (let i = 0; i < session.sets.length; i++) {
    const set = session.sets[i];
    let text = tr('setRow', {
      n: set.setNumber,
      reps: setRepTotal(set),
      time: formatDuration(set.activeDurationSec)
    });
    if (details && set.manualAdjustment) {
      text += ' (' + signed(set.manualAdjustment) + ')';
    }
    rows.push({ id: 'set' + set.setNumber, text: text });
  }
  return rows;
}

function signed(n) {
  return n > 0 ? '+' + n : String(n);
}
