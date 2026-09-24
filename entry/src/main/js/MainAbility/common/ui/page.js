import { ExerciseType, WorkoutMode } from '../domain/enums.js';
import { ICON_PUSH_UP, ICON_SQUAT } from '../icons/icons.js';
import { formatDuration } from '../util/format.js';

/**
 * Page helpers. Lite has only router.replace (no page stack) and every page is its own
 * bundle, so pages share nothing in memory: data travels in router params and storage.
 */

/** Page data is re-rendered on every assignment, so assign only real changes. */
export function setIfChanged(vm, key, value) {
  if (vm[key] !== value) {
    vm[key] = value;
  }
}

/**
 * Crown (rotation) focus for a scrollable list. It must be released before leaving the page:
 * a focused list removed by router.replace crashes the engine on the next crown turn or tap
 * (found and fixed in the BreathTrainer app on the same watch).
 */
export function focusRotation(list, focus) {
  try {
    list.rotation({ focus: focus });
  } catch (e) {
    // no crown or older runtime: touch scrolling still works
  }
}

/** Leaves the page: releases the crown focus of `list` (if any), then replaces the page. */
export function go(router, list, page, params) {
  if (list) {
    focusRotation(list, false);
  }
  const options = { uri: 'pages/' + page + '/' + page };
  if (params) {
    options.params = params;
  }
  router.replace(options);
}

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
