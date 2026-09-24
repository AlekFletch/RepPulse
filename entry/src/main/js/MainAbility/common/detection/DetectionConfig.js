import { ExerciseType, Sensitivity } from '../domain/enums.js';

/**
 * Conservative baseline thresholds used when the user has no calibration profile.
 *
 * Units (sensor units verified on the watch 2026-09-24: m/s² after conversion, rad/s):
 *   minAmplitudeThreshold  SQUAT: estimated wrist depth, metres; PUSH_UP: forearm tilt, degrees
 *   minGyroThreshold       peak angular speed a push-up must show, rad/s (0 = not checked)
 *   min/maxRepDurationMs   measured between the threshold crossings that open and close a rep,
 *                          so they are shorter than the full movement
 *   minPhaseDurationMs     shortest descent and ascent
 * Starting values tuned on the synthetic scenarios (tests/unit/detection.test.js); real
 * recordings from the watch should refine them.
 */
const BASELINES = {};

BASELINES[ExerciseType.SQUAT] = Object.freeze({
  minRepDurationMs: 450,
  maxRepDurationMs: 6000,
  minPhaseDurationMs: 200,
  minAmplitudeThreshold: 0.15,
  minGyroThreshold: 0,
  cooldownMs: 250,
  confidenceThreshold: 0.6
});

BASELINES[ExerciseType.PUSH_UP] = Object.freeze({
  minRepDurationMs: 450,
  maxRepDurationMs: 6000,
  minPhaseDurationMs: 150,
  minAmplitudeThreshold: 15,
  minGyroThreshold: 0.3,
  cooldownMs: 250,
  confidenceThreshold: 0.6
});

/** Filter time constants shared by both exercises (seconds). */
const GRAVITY_TAU = {};
// Gravity is a low-pass of the accelerometer: slow for squats (the wrist accelerates up and
// down), fast for push-ups (the wrist barely moves, it only tilts).
GRAVITY_TAU[ExerciseType.SQUAT] = 1.0;
GRAVITY_TAU[ExerciseType.PUSH_UP] = 0.1;

export const FILTERS = Object.freeze({
  gravityTauS: Object.freeze(GRAVITY_TAU),
  integratorTauS: 3.0
});

/** Multiplier applied to amplitude thresholds; HIGH sensitivity = lower thresholds. */
const SENSITIVITY_SCALE = {};
SENSITIVITY_SCALE[Sensitivity.LOW] = 1.25;
SENSITIVITY_SCALE[Sensitivity.STANDARD] = 1.0;
SENSITIVITY_SCALE[Sensitivity.HIGH] = 0.8;

/** Extra confidence required when the gyroscope is unavailable (accelerometer-only mode). */
export const ACCEL_ONLY_CONFIDENCE_BONUS = 0.1;

export function getBaseline(exerciseType) {
  const baseline = BASELINES[exerciseType];
  if (!baseline) {
    throw new Error('Unknown exercise type: ' + exerciseType);
  }
  return baseline;
}

export function getSensitivityScale(sensitivity) {
  const scale = SENSITIVITY_SCALE[sensitivity];
  return typeof scale === 'number' ? scale : 1.0;
}
