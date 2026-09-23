import { WorkoutStatus } from './enums.js';

/**
 * Workout lifecycle:
 *
 *   DRAFT ──start──▶ PREPARING (3-2-1) ──▶ ACTIVE ◀──resume── PAUSED
 *                       ▲                    │  └──pause──▶ ─┘ │
 *                       │                    ├──set done──▶ RESTING
 *                       └──next set (countdown)──────────────┘ │
 *   RESTING ──"Начать сейчас" without countdown──▶ ACTIVE
 *   ACTIVE / PAUSED / RESTING ──finish──▶ COMPLETED
 *   any non-terminal ──cancel──▶ CANCELLED
 *
 * PREPARING → PAUSED covers the app being hidden during a countdown.
 */
const S = WorkoutStatus;

const TRANSITIONS = {};
TRANSITIONS[S.DRAFT] = [S.PREPARING, S.ACTIVE, S.CANCELLED];
TRANSITIONS[S.PREPARING] = [S.ACTIVE, S.PAUSED, S.CANCELLED];
TRANSITIONS[S.ACTIVE] = [S.PAUSED, S.RESTING, S.COMPLETED, S.CANCELLED];
TRANSITIONS[S.PAUSED] = [S.ACTIVE, S.PREPARING, S.COMPLETED, S.CANCELLED];
TRANSITIONS[S.RESTING] = [S.PREPARING, S.ACTIVE, S.COMPLETED, S.CANCELLED];
TRANSITIONS[S.COMPLETED] = [];
TRANSITIONS[S.CANCELLED] = [];

export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return !!allowed && allowed.indexOf(to) !== -1;
}

export function isTerminal(status) {
  return status === S.COMPLETED || status === S.CANCELLED;
}

/** Sensors must run (and reps be counted) only in this state. */
export function isCounting(status) {
  return status === S.ACTIVE;
}

export function createInvalidTransitionError(from, to) {
  const error = new Error('Invalid workout transition ' + from + ' -> ' + to);
  error.code = 'INVALID_TRANSITION';
  error.from = from;
  error.to = to;
  return error;
}

/**
 * Small observable state holder. onChange(to, from, meta) fires after each transition.
 */
export function createWorkoutStateMachine(initialStatus, onChange) {
  let status = initialStatus || S.DRAFT;
  return {
    getStatus: function () {
      return status;
    },
    can: function (to) {
      return canTransition(status, to);
    },
    transition: function (to, meta) {
      if (!canTransition(status, to)) {
        throw createInvalidTransitionError(status, to);
      }
      const from = status;
      status = to;
      if (onChange) {
        onChange(to, from, meta);
      }
      return status;
    }
  };
}
