import { ExerciseType, WorkoutMode } from '../domain/enums.js';
import { ICON_PUSH_UP, ICON_SQUAT } from '../icons/icons.js';
import { formatDuration } from '../util/format.js';

/** Page helpers for the list / setup / history pages (nav.js has the minimal set). */

export { focusRotation, go, setIfChanged } from './nav.js';

export function exerciseKey(exerciseType) {
  return exerciseType === ExerciseType.PUSH_UP ? 'pushUps' : 'squats';
}

export function exerciseIcon(exerciseType, size) {
  return (exerciseType === ExerciseType.PUSH_UP ? ICON_PUSH_UP : ICON_SQUAT)[size];
}

export function modeKey(mode) {
  if (mode === WorkoutMode.TIMER) {
    return 'modeTimer';
  }
  return mode === WorkoutMode.SETS ? 'modeSets' : 'modeFree';
}

export function isExercise(value) {
  return value === ExerciseType.SQUAT || value === ExerciseType.PUSH_UP;
}

/** "24.09 11:30" in local time. */
export function formatDateTime(ms) {
  const d = new Date(ms);
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export { formatDuration };
