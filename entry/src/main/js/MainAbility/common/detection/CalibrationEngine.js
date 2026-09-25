import { ExerciseType } from '../domain/enums.js';
import { createCalibrationProfile } from '../domain/models.js';
import { getBaseline } from './DetectionConfig.js';
import { createRepDetectionEngine } from './RepDetectionEngine.js';
import { median } from './SlidingWindowBuffer.js';

/** Calibration needs at least this many full cycles (spec 2.6: 3–5 reps). */
export const MIN_CALIBRATION_REPS = 3;
export const MAX_CALIBRATION_REPS = 5;
/** Calibration listens with a lower amplitude threshold than a workout, to catch gentle reps. */
const RELAXED_AMPLITUDE = 0.5;
/**
 * Personal threshold = this share of the user's median amplitude (never below 40% of baseline).
 * Not higher: the first rep after rest reads ~half as deep (the filters start from zero).
 */
const AMPLITUDE_SHARE = 0.45;
/**
 * Squats: calibration only ever lowers the threshold. Calibrating with deep squats used to raise it
 * so far that squats to parallel stopped counting (watch test 2026-09-25).
 */
const SQUAT_AMPLITUDE_SHARE = 0.3;

export const CalibrationFailure = Object.freeze({
  NOT_ENOUGH_REPS: 'NOT_ENOUGH_REPS',
  INCONSISTENT: 'INCONSISTENT'
});

/**
 * Records 3–5 reps and turns them into a CalibrationProfile (spec 2.6):
 *   minAmplitudeThreshold  0.45 × median amplitude (not below 40 % of the baseline)
 *   min/maxRepDurationMs   0.5× / 2.5× the median rep duration
 *   minGyroThreshold       push-ups: 0.4 × median peak angular speed
 *   descentSignature       { amplitude, durationMs } — the user's typical rep, used by the
 *                          confidence score of later workouts
 *
 * process(sample) -> number of cycles so far when a new one was recorded, otherwise null.
 * finish(id, nowMs) -> { ok, profile, reason, reps }.
 */
export function createCalibrationEngine(exerciseType, wristSide) {
  const baseline = getBaseline(exerciseType);
  const cycles = [];
  const engine = createRepDetectionEngine({
    exerciseType: exerciseType,
    profile: {
      minAmplitudeThreshold: baseline.minAmplitudeThreshold * RELAXED_AMPLITUDE,
      minGyroThreshold: baseline.minGyroThreshold * RELAXED_AMPLITUDE,
      confidenceThreshold: 0
    },
    debug: true
  });

  return {
    /** During the countdown: warms the filters up, nothing is recorded. */
    warm: function (sample) {
      engine.process(sample);
    },

    process: function (sample) {
      if (cycles.length >= MAX_CALIBRATION_REPS) {
        return null;
      }
      const rep = engine.process(sample);
      if (rep === null) {
        return null;
      }
      cycles.push(rep.signalSummary);
      return cycles.length;
    },

    count: function () {
      return cycles.length;
    },

    reset: function () {
      cycles.length = 0;
      engine.reset();
    },

    finish: function (id, nowMs) {
      if (cycles.length < MIN_CALIBRATION_REPS) {
        return { ok: false, profile: null, reason: CalibrationFailure.NOT_ENOUGH_REPS, reps: cycles.length };
      }
      const amplitudes = [];
      const durations = [];
      const gyroPeaks = [];
      for (let i = 0; i < cycles.length; i++) {
        amplitudes.push(cycles[i].amplitude);
        durations.push(cycles[i].durationMs);
        if (typeof cycles[i].gyroPeak === 'number') {
          gyroPeaks.push(cycles[i].gyroPeak);
        }
      }
      const amp = median(amplitudes);
      const dur = median(durations);
      // Reps of wildly different size are not a usable reference (e.g. one real rep + noise).
      if (Math.min.apply(null, amplitudes) < amp * 0.4) {
        return { ok: false, profile: null, reason: CalibrationFailure.INCONSISTENT, reps: cycles.length };
      }
      const overrides = {
        isValid: true,
        minAmplitudeThreshold: round3(amplitudeThreshold(exerciseType, baseline, amp)),
        minRepDurationMs: Math.max(300, Math.round(dur * 0.5)),
        maxRepDurationMs: Math.min(8000, Math.round(dur * 2.5)),
        descentSignature: { amplitude: round3(amp), durationMs: Math.round(dur) }
      };
      if (exerciseType === ExerciseType.PUSH_UP && gyroPeaks.length > 0) {
        overrides.minGyroThreshold = round3(Math.max(0.15, median(gyroPeaks) * 0.4));
      }
      return {
        ok: true,
        profile: createCalibrationProfile(exerciseType, wristSide, id, nowMs, overrides),
        reason: '',
        reps: cycles.length
      };
    }
  };
}

function amplitudeThreshold(exerciseType, baseline, amp) {
  const base = baseline.minAmplitudeThreshold;
  if (exerciseType === ExerciseType.SQUAT) {
    return Math.min(base, Math.max(base * 0.4, amp * SQUAT_AMPLITUDE_SHARE));
  }
  return Math.max(base * 0.4, amp * AMPLITUDE_SHARE);
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
