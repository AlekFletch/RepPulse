import * as S from '../../entry/src/main/js/MainAbility/common/sensors/mock/scenarios.js';
import { createRepDetectionEngine, resolveParams } from '../../entry/src/main/js/MainAbility/common/detection/RepDetectionEngine.js';
import { RepPhase } from '../../entry/src/main/js/MainAbility/common/detection/RepPhase.js';
import { createSlidingWindowBuffer, median } from '../../entry/src/main/js/MainAbility/common/detection/SlidingWindowBuffer.js';
import { createMedian3 } from '../../entry/src/main/js/MainAbility/common/detection/SignalFilter.js';

/** Runs a scenario through a fresh engine: detected reps with timestamps and rejections. */
function detect(exerciseType, scenario, options) {
  const rejects = [];
  const engine = createRepDetectionEngine(Object.assign({
    exerciseType: exerciseType, debug: true, onReject: (r) => rejects.push(r)
  }, options || {}));
  const reps = [];
  for (const s of scenario.samples) {
    const r = engine.process(s);
    if (r) {
      reps.push(r);
    }
  }
  return { reps: reps, rejects: rejects, count: reps.length, expected: scenario.truth.expectedReps };
}

/** Each counted rep must land inside a different true rep window (no double count, no strays). */
function matchesTruth(result, scenario) {
  const counted = scenario.truth.reps.filter((r) => r.counted);
  const used = new Set();
  for (const rep of result.reps) {
    const i = counted.findIndex((w, idx) => !used.has(idx) && rep.timestamp >= w.start && rep.timestamp <= w.end + 600);
    if (i === -1) {
      return false;
    }
    used.add(i);
  }
  return used.size === counted.length;
}

const SQ = 'SQUAT';
const PU = 'PUSH_UP';

describe('SquatDetectionStrategy (spec 7.1)', () => {
  test('counts 10 correct squats, each exactly once and at the right time', () => {
    const sc = S.squatSeries(10);
    const r = detect(SQ, sc);
    expect(r.count).toBe(10);
    expect(matchesTruth(r, sc)).toBe(true);
    for (const rep of r.reps) {
      expect(rep.phase).toBe(RepPhase.REP_CONFIRMED);
      expect(rep.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  test('different arm positions, both wrists, no gyroscope', () => {
    for (const opts of [{}, { wristSide: 'RIGHT' }, { hasGyro: false }]) {
      for (const pose of [{ pitch: 0, roll: 80 }, { pitch: -60, roll: 30 }]) {
        expect(detect(SQ, S.squatSeries(10, opts, { pose: pose })).count).toBe(10);
      }
    }
  });

  test('does not count a single arm wave, an arm raise, walking, a torso turn, the strap, noise', () => {
    expect(detect(SQ, S.armWave(1)).count).toBe(0);
    expect(detect(SQ, S.armWave(3)).count).toBe(0);
    expect(detect(SQ, S.armRaise()).count).toBe(0);
    expect(detect(SQ, S.walking(12000)).count).toBe(0);
    expect(detect(SQ, S.torsoTurn()).count).toBe(0);
    expect(detect(SQ, S.strapAdjust()).count).toBe(0);
    expect(detect(SQ, S.noiseOnly(8000)).count).toBe(0);
  });

  test('does not count an incomplete squat', () => {
    const r = detect(SQ, S.incompleteSquat());
    expect(r.count).toBe(0);
  });

  test('fast, slow and paused squats; works again after each cooldown', () => {
    expect(detect(SQ, S.fastSquats(10)).count).toBe(10);
    expect(detect(SQ, S.slowSquats(5)).count).toBe(5);
    const paused = S.squatSeries(6, {}, { pauseBetweenMs: 2000 });
    const r = detect(SQ, paused);
    expect(r.count).toBe(6);
    expect(matchesTruth(r, paused)).toBe(true);
  });

  test('squats mixed with false motions: only the full squats count', () => {
    const sc = S.squatsWithDistractions();
    const r = detect(SQ, sc);
    expect(r.count).toBe(sc.truth.expectedReps);
    expect(matchesTruth(r, sc)).toBe(true);
  });

  test('arms held forward (agreed posture): squats to parallel and shallow ones count at every sensitivity', () => {
    for (const sensitivity of ['LOW', 'STANDARD', 'HIGH']) {
      for (const seed of [1, 2, 3]) {
        // Parallel: the wrist drops ~0.25 m and travels ~0.12 m forward as the torso leans.
        expect(detect(SQ, S.squatSeries(10, { seed: seed }, { depthM: 0.25, forwardM: 0.12 }),
          { sensitivity: sensitivity }).count).toBe(10);
        expect(detect(SQ, S.squatSeries(8, { seed: seed }, { depthM: 0.12, forwardM: 0.06 }),
          { sensitivity: sensitivity }).count).toBeGreaterThanOrEqual(7);
      }
    }
  });

  test('uses the calibration profile', () => {
    const shallow = S.squatSeries(5, {}, { depthM: 0.25 });
    expect(detect(SQ, shallow).count).toBe(5);
    // A profile threshold of 0.4 m rejects these (CalibrationEngine never makes one that high)...
    expect(detect(SQ, shallow, { profile: { minAmplitudeThreshold: 0.4 } }).count).toBe(0);
    // ...and a lower profile threshold counts dips the baseline misses.
    const tiny = S.squatSeries(5, {}, { depthM: 0.04 });
    expect(detect(SQ, tiny).count).toBeLessThan(5);
    expect(detect(SQ, tiny, { profile: { minAmplitudeThreshold: 0.02 } }).count).toBe(5);
  });

  test('sensitivity scales the amplitude threshold', () => {
    expect(resolveParams(SQ, null, 'HIGH').minAmp).toBeLessThan(resolveParams(SQ, null, 'STANDARD').minAmp);
    expect(resolveParams(SQ, null, 'LOW').minAmp).toBeGreaterThan(resolveParams(SQ, null, 'STANDARD').minAmp);
  });
});

describe('PushUpDetectionStrategy (spec 7.2)', () => {
  test('counts 10 correct push-ups, each exactly once', () => {
    const sc = S.pushUpSeries(10);
    const r = detect(PU, sc);
    expect(r.count).toBe(10);
    expect(matchesTruth(r, sc)).toBe(true);
  });

  test('does not count a hand repositioned on the floor', () => {
    expect(detect(PU, S.floorShift()).count).toBe(0);
    const sc = S.pushUpsWithFloorShift();
    const r = detect(PU, sc);
    expect(r.count).toBe(sc.truth.expectedReps);
    expect(matchesTruth(r, sc)).toBe(true);
  });

  test('does not count a partial push-up', () => {
    expect(detect(PU, S.incompletePushUp()).count).toBe(0);
  });

  test('slow and fast push-ups, both wrists, no gyroscope', () => {
    for (const opts of [{}, { wristSide: 'RIGHT' }, { hasGyro: false }]) {
      expect(detect(PU, S.slowPushUps(5, opts)).count).toBe(5);
      expect(detect(PU, S.fastPushUps(10, opts)).count).toBe(10);
    }
  });

  test('walking or waving with push-ups selected counts nothing (the watch moves)', () => {
    expect(detect(PU, S.walking(12000)).count).toBe(0);
    expect(detect(PU, S.armWave(3)).count).toBe(0);
    expect(detect(PU, S.noiseOnly(8000)).count).toBe(0);
  });

  test('uses the calibration profile', () => {
    const small = S.pushUpSeries(6, {}, { tiltDeg: 12 });
    expect(detect(PU, small).count).toBe(0);
    expect(detect(PU, small, { profile: { minAmplitudeThreshold: 7 } }).count).toBe(6);
    expect(detect(PU, S.pushUpSeries(6), { profile: { minAmplitudeThreshold: 40 } }).count).toBe(0);
  });
});

describe('robustness over seeds, noise and dropped samples', () => {
  test('main scenarios stay exact over several seeds', () => {
    const cases = [
      [SQ, (o) => S.squatSeries(10, o)], [SQ, (o) => S.fastSquats(8, o)], [SQ, (o) => S.slowSquats(4, o)],
      [SQ, (o) => S.walking(8000, o)], [SQ, (o) => S.armWave(2, o)],
      [PU, (o) => S.pushUpSeries(10, o)], [PU, (o) => S.pushUpsWithFloorShift(o)], [PU, (o) => S.walking(8000, o)]
    ];
    const misses = [];
    for (const [ex, make] of cases) {
      for (let seed = 1; seed <= 4; seed++) {
        for (const v of [{}, { accelNoise: 0.2, gyroNoise: 0.05 }, { dropRate: 0.03, jitterMs: 3 }]) {
          const sc = make(Object.assign({ seed: seed }, v));
          const n = detect(ex, sc).count;
          if (n !== sc.truth.expectedReps) {
            misses.push(ex + ' seed ' + seed + ' ' + JSON.stringify(v) + ': ' + n + '/' + sc.truth.expectedReps);
          }
        }
      }
    }
    expect(misses).toEqual([]);
  });

  test('the gyroscope axis convention does not matter (only its magnitude is used)', () => {
    const sc = S.pushUpSeries(10);
    const flipped = sc.samples.map((s) => Object.assign({}, s, { gx: -s.gx, gy: s.gz, gz: -s.gy }));
    expect(detect(PU, { samples: flipped, truth: sc.truth }).count).toBe(10);
  });
});

describe('engine plumbing', () => {
  test('reset clears the state; debugState describes it', () => {
    const engine = createRepDetectionEngine({ exerciseType: SQ });
    const sc = S.squatSeries(2);
    let n = 0;
    for (const s of sc.samples) {
      if (engine.process(s)) {
        n++;
      }
    }
    expect(n).toBe(2);
    engine.reset();
    expect(engine.getPhase()).toBe(RepPhase.IDLE);
    expect(typeof engine.debugState()).toBe('string');
  });

  test('signalSummary only in debug mode', () => {
    const sc = S.squatSeries(1);
    const quiet = createRepDetectionEngine({ exerciseType: SQ });
    let rep = null;
    for (const s of sc.samples) {
      rep = quiet.process(s) || rep;
    }
    expect(rep.signalSummary).toBeNull();
    expect(detect(SQ, sc).reps[0].signalSummary.amplitude).toBeGreaterThan(0.15);
  });

  test('helpers: ring buffer, median, median-of-3 spike filter', () => {
    const b = createSlidingWindowBuffer(3);
    [1, 2, 3, 4].forEach((x) => b.push(x));
    expect([b.get(0), b.get(1), b.get(2), b.size()]).toEqual([2, 3, 4, 3]);
    expect(b.std()).toBeCloseTo(Math.sqrt(2 / 3), 6);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const m = createMedian3();
    expect([1, 1, 50, 1, 1].map((x) => m.push(x))).toEqual([1, 1, 1, 1, 1]);
  });
});
