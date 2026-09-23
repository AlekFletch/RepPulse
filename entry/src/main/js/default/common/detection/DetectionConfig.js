import { ExerciseType, Sensitivity } from '../domain/enums.js';

/**
 * Conservative baseline thresholds used when the user has no calibration profile.
 *
 * NOTE: these are starting values for Stage 4 and must be tuned on real Watch Fit 4
 * sensor logs. Units assume accelerometer in m/s^2 and gyroscope in rad/s —
 * TODO(device): the @system.sensor typings do not document units; verify on the watch.
 */
const BASELINES = {};

BASELINES[ExerciseType.SQUAT] = Object.freeze({
  minRepDurationMs: 900,
  maxRepDurationMs: 6000,
  minPhaseDurationMs: 250,
  minAmplitudeThreshold: 0.9,
  minGyroThreshold: 0.15,
  cooldownMs: 300,
  confidenceThreshold: 0.6
});

BASELINES[ExerciseType.PUSH_UP] = Object.freeze({
  minRepDurationMs: 700,
  maxRepDurationMs: 6000,
  minPhaseDurationMs: 200,
  minAmplitudeThreshold: 0.5,
  minGyroThreshold: 0.25,
  cooldownMs: 300,
  confidenceThreshold: 0.6
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
