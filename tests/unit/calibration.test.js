import * as S from '../../entry/src/main/js/MainAbility/common/sensors/mock/scenarios.js';
import {
  CalibrationFailure, createCalibrationEngine, MAX_CALIBRATION_REPS
} from '../../entry/src/main/js/MainAbility/common/detection/CalibrationEngine.js';
import { createRepDetectionEngine } from '../../entry/src/main/js/MainAbility/common/detection/RepDetectionEngine.js';
import { getBaseline } from '../../entry/src/main/js/MainAbility/common/detection/DetectionConfig.js';

function calibrate(exerciseType, scenario) {
  const cal = createCalibrationEngine(exerciseType, 'LEFT');
  const progress = [];
  for (const s of scenario.samples) {
    const n = cal.process(s);
    if (n !== null) {
      progress.push(n);
    }
  }
  return { result: cal.finish('cal1', 1234), progress: progress };
}

function count(exerciseType, scenario, profile) {
  const engine = createRepDetectionEngine({ exerciseType: exerciseType, profile: profile });
  let n = 0;
  for (const s of scenario.samples) {
    if (engine.process(s)) {
      n++;
    }
  }
  return n;
}

describe('CalibrationEngine (spec 2.6)', () => {
  test('5 squats give a valid personal profile', () => {
    const { result, progress } = calibrate('SQUAT', S.squatSeries(5));
    expect(progress).toEqual([1, 2, 3, 4, 5]);
    expect(result.ok).toBe(true);
    const p = result.profile;
    expect(p).toMatchObject({ id: 'cal1', exerciseType: 'SQUAT', wristSide: 'LEFT', isValid: true, createdAt: 1234 });
    expect(p.descentSignature.amplitude).toBeGreaterThan(0.25);
    expect(p.minAmplitudeThreshold).toBeCloseTo(p.descentSignature.amplitude * 0.45, 2);
    expect(p.minRepDurationMs).toBeLessThan(p.descentSignature.durationMs);
    expect(p.maxRepDurationMs).toBeGreaterThan(p.descentSignature.durationMs);
    // The profile counts the user's squats and still ignores walking.
    expect(count('SQUAT', S.squatSeries(10, { seed: 3 }), p)).toBe(10);
    expect(count('SQUAT', S.walking(10000), p)).toBe(0);
  });

  test('shallow squats: calibration lowers the threshold so they count', () => {
    const shallow = (seed) => S.squatSeries(5, { seed: seed }, { depthM: 0.14 });
    expect(count('SQUAT', shallow(2))).toBeLessThan(5);
    const { result } = calibrate('SQUAT', shallow(1));
    expect(result.ok).toBe(true);
    expect(result.profile.minAmplitudeThreshold).toBeLessThan(getBaseline('SQUAT').minAmplitudeThreshold);
    expect(count('SQUAT', shallow(2), result.profile)).toBe(5);
  });

  test('push-ups: profile with a gyroscope threshold', () => {
    const { result } = calibrate('PUSH_UP', S.pushUpSeries(4));
    expect(result.ok).toBe(true);
    expect(result.profile.minGyroThreshold).toBeGreaterThan(0.15);
    expect(count('PUSH_UP', S.pushUpSeries(8, { seed: 5 }), result.profile)).toBe(8);
  });

  test('stops recording after 5 reps', () => {
    const { result, progress } = calibrate('SQUAT', S.squatSeries(8));
    expect(progress[progress.length - 1]).toBe(MAX_CALIBRATION_REPS);
    expect(result.reps).toBe(MAX_CALIBRATION_REPS);
  });

  test('fails without enough full reps: walking, noise, one incomplete squat', () => {
    for (const sc of [S.walking(10000), S.noiseOnly(6000), S.incompleteSquat(), S.squatSeries(2)]) {
      const { result } = calibrate('SQUAT', sc);
      expect(result).toMatchObject({ ok: false, profile: null, reason: CalibrationFailure.NOT_ENOUGH_REPS });
    }
  });
});
