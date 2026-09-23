export const ExerciseType = Object.freeze({
  SQUAT: 'SQUAT',
  PUSH_UP: 'PUSH_UP'
});

export const WorkoutMode = Object.freeze({
  FREE: 'FREE',
  TIMER: 'TIMER',
  SETS: 'SETS'
});

export const WorkoutStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PREPARING: 'PREPARING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  RESTING: 'RESTING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
});

export const WristSide = Object.freeze({
  LEFT: 'LEFT',
  RIGHT: 'RIGHT'
});

export const SetEndReason = Object.freeze({
  TARGET_REPS: 'TARGET_REPS',
  TIME: 'TIME',
  MANUAL: 'MANUAL',
  CANCELLED: 'CANCELLED'
});

export const Sensitivity = Object.freeze({
  LOW: 'LOW',
  STANDARD: 'STANDARD',
  HIGH: 'HIGH'
});

export const Language = Object.freeze({
  RU: 'ru',
  EN: 'en'
});

export function isEnumValue(enumObject, value) {
  for (const key in enumObject) {
    if (Object.prototype.hasOwnProperty.call(enumObject, key) && enumObject[key] === value) {
      return true;
    }
  }
  return false;
}
