import {
  buildScenario, worldToDevice, repProfile, GRAVITY, MotionType, Pose
} from '../../entry/src/main/js/MainAbility/common/sensors/mock/motionSynth.js';
import * as Scenarios from '../../entry/src/main/js/MainAbility/common/sensors/mock/scenarios.js';
import { serializeSensorLog, parseSensorLog } from '../../entry/src/main/js/MainAbility/common/sensors/mock/sensorLog.js';
import { createRandom } from '../../entry/src/main/js/MainAbility/common/sensors/mock/prng.js';
import { createMockSensorProvider } from '../../entry/src/main/js/MainAbility/common/sensors/MockSensorProvider.js';
import { assertSensorProvider } from '../../entry/src/main/js/MainAbility/common/sensors/SensorProvider.js';
import { SensorAvailability } from '../../entry/src/main/js/MainAbility/common/sensors/SensorCapabilities.js';
import { SensorErrorCode } from '../../entry/src/main/js/MainAbility/common/sensors/SensorError.js';
import { WristSide } from '../../entry/src/main/js/MainAbility/common/domain/enums.js';
import { createFakeTimeAdapter } from '../mocks/FakeTimeAdapter.js';

const mag = (s) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
const within = (samples, from, to) => samples.filter((s) => s.t >= from && s.t <= to);
const mean = (list, key) => list.reduce((acc, s) => acc + s[key], 0) / list.length;
/** Tilt of the measured gravity direction relative to the device y axis, degrees. */
const tiltFromY = (s) => (Math.acos(Math.max(-1, Math.min(1, s.ay / mag(s)))) * 180) / Math.PI;

describe('prng', () => {
  test('is deterministic and roughly normal', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(seqA);
    const r = createRandom(7);
    const values = Array.from({ length: 4000 }, () => r.gaussian(0, 1));
    const m = values.reduce((x, y) => x + y, 0) / values.length;
    const sd = Math.sqrt(values.reduce((x, y) => x + (y - m) * (y - m), 0) / values.length);
    expect(Math.abs(m)).toBeLessThan(0.08);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });
});

describe('motion physics', () => {
  test('worldToDevice: gravity reading for base poses', () => {
    const up = [0, 0, GRAVITY];
    const flat = worldToDevice(up, 0, 0);
    expect(flat[2]).toBeCloseTo(GRAVITY);
    const vertical = worldToDevice(up, Math.PI / 2, 0);
    expect(vertical[1]).toBeCloseTo(GRAVITY);
    expect(vertical[2]).toBeCloseTo(0);
  });

  test('repProfile: 0 at the top, 1 at the bottom hold', () => {
    expect(repProfile(0)).toBe(0);
    expect(repProfile(0.5)).toBe(1);
    expect(repProfile(1)).toBe(0);
    expect(repProfile(0.225)).toBeCloseTo(0.5);
  });

  test('idle watch reads ~1 g and ~0 rad/s', () => {
    const { samples } = buildScenario([{ type: MotionType.IDLE, durationMs: 3000, pose: Pose.ARMS_FORWARD }], { seed: 3 });
    expect(mean(samples, 'az')).toBeCloseTo(GRAVITY, 1);
    expect(Math.abs(mean(samples, 'ax'))).toBeLessThan(0.05);
    expect(Math.abs(mean(samples, 'gx'))).toBeLessThan(0.01);
  });

  test('sampling interval ~20 ms with jitter (\'game\' rate)', () => {
    const { samples } = buildScenario([{ type: MotionType.IDLE, durationMs: 10000 }], { seed: 5 });
    const span = samples[samples.length - 1].t - samples[0].t;
    const meanDt = span / (samples.length - 1);
    expect(meanDt).toBeGreaterThan(19);
    expect(meanDt).toBeLessThan(21);
    const dts = samples.slice(1).map((s, i) => s.t - samples[i].t);
    expect(Math.min(...dts)).toBeGreaterThanOrEqual(5);
  });

  test('squats produce clear vertical acceleration around each rep', () => {
    const sc = Scenarios.squatSeries(5, { seed: 11 });
    const rep = sc.truth.reps[0];
    const during = within(sc.samples, rep.start, rep.end);
    const peak = Math.max(...during.map((s) => Math.abs(mag(s) - GRAVITY)));
    expect(peak).toBeGreaterThan(1.5);
    const idle = within(sc.samples, 0, 1000);
    expect(Math.max(...idle.map((s) => Math.abs(mag(s) - GRAVITY)))).toBeLessThan(0.5);
  });

  test('push-ups rotate the forearm: gravity tilts ~30° and the gyroscope sees it', () => {
    const sc = Scenarios.pushUpSeries(3, { seed: 12 });
    const rep = sc.truth.reps[1];
    const during = within(sc.samples, rep.start, rep.end);
    const tilts = during.map(tiltFromY);
    expect(Math.max(...tilts) - Math.min(...tilts)).toBeGreaterThan(22);
    expect(Math.max(...during.map((s) => Math.abs(s.gx)))).toBeGreaterThan(0.6);
  });

  test('incomplete reps have much smaller amplitude and are not counted', () => {
    const full = Scenarios.squatSeries(1, { seed: 20 });
    const partial = Scenarios.incompleteSquat({ seed: 20 });
    const peak = (sc) => Math.max(...within(sc.samples, sc.truth.reps[0].start, sc.truth.reps[0].end)
      .map((s) => Math.abs(mag(s) - GRAVITY)));
    expect(peak(partial)).toBeLessThan(peak(full) * 0.5);
    expect(partial.truth.expectedReps).toBe(0);
    expect(Scenarios.incompletePushUp({ seed: 1 }).truth.expectedReps).toBe(0);
  });

  test('right wrist mirrors the lateral axis', () => {
    const opts = { seed: 9, accelNoise: 0, gyroNoise: 0, jitterMs: 0 };
    const left = Scenarios.torsoTurn(opts);
    const right = Scenarios.torsoTurn(Object.assign({ wristSide: WristSide.RIGHT }, opts));
    const i = Math.floor(left.samples.length / 2);
    expect(right.samples[i].ax).toBeCloseTo(-left.samples[i].ax);
    expect(right.samples[i].az).toBeCloseTo(left.samples[i].az);
    expect(right.samples[i].gy).toBeCloseTo(-left.samples[i].gy);
  });

  test('same seed -> identical samples, different seed -> different noise', () => {
    const a = Scenarios.squatSeries(2, { seed: 100 });
    const b = Scenarios.squatSeries(2, { seed: 100 });
    const c = Scenarios.squatSeries(2, { seed: 101 });
    expect(b.samples).toEqual(a.samples);
    expect(c.samples[10].ax).not.toBe(a.samples[10].ax);
  });

  test('hasGyro=false zeroes the gyroscope; dropRate removes samples', () => {
    const noGyro = Scenarios.pushUpSeries(2, { seed: 1, hasGyro: false });
    expect(noGyro.samples.every((s) => !s.hasGyro && s.gx === 0 && s.gz === 0)).toBe(true);
    const full = Scenarios.walking(5000, { seed: 1 });
    const dropped = Scenarios.walking(5000, { seed: 1, dropRate: 0.2 });
    expect(dropped.samples.length).toBeLessThan(full.samples.length * 0.9);
  });

  test('unknown motion type is rejected', () => {
    expect(() => buildScenario([{ type: 'jumpingJack' }])).toThrow(/Unknown motion type/);
  });
});

describe('scenario presets (spec section 7)', () => {
  test.each([5, 10, 20])('squat and push-up series of %i reps', (n) => {
    expect(Scenarios.squatSeries(n).truth.expectedReps).toBe(n);
    expect(Scenarios.pushUpSeries(n).truth.expectedReps).toBe(n);
  });

  test('fast and slow reps have the expected durations', () => {
    const dur = (sc) => sc.truth.reps.reduce((a, r) => a + (r.end - r.start), 0) / sc.truth.reps.length;
    expect(dur(Scenarios.fastSquats(5))).toBeLessThan(1400);
    expect(dur(Scenarios.slowSquats(5))).toBeGreaterThan(3500);
    expect(dur(Scenarios.fastPushUps(5))).toBeLessThan(1200);
    expect(dur(Scenarios.slowPushUps(5))).toBeGreaterThan(3000);
  });

  test('false-motion scenarios contain no countable reps', () => {
    [
      Scenarios.walking(6000), Scenarios.armWave(2), Scenarios.armRaise(), Scenarios.floorShift(),
      Scenarios.strapAdjust(), Scenarios.torsoTurn(), Scenarios.noiseOnly(3000)
    ].forEach((sc) => {
      expect(sc.truth.expectedReps).toBe(0);
      expect(sc.samples.length).toBeGreaterThan(50);
    });
  });

  test('mixed scenarios expose ground truth for later detector tests', () => {
    expect(Scenarios.squatsWithDistractions().truth.expectedReps).toBe(6);
    expect(Scenarios.pushUpsWithFloorShift().truth.expectedReps).toBe(8);
  });
});

describe('sensor log JSON', () => {
  test('serialize -> parse round trip', () => {
    const sc = Scenarios.squatSeries(2, { seed: 4 });
    const text = serializeSensorLog({ exerciseType: 'SQUAT', wristSide: 'LEFT', recordedAt: 1, expectedReps: 2 }, sc.samples);
    const parsed = parseSensorLog(text);
    expect(parsed.meta.expectedReps).toBe(2);
    expect(parsed.samples.length).toBe(sc.samples.length);
    expect(parsed.samples[3].ax).toBeCloseTo(sc.samples[3].ax, 3);
    expect(parsed.samples[3].hasGyro).toBe(true);
  });

  test('rejects malformed logs', () => {
    expect(() => parseSensorLog('{"format":"other"}')).toThrow();
    expect(() => parseSensorLog({ format: 'reppulse-sensor-log', version: 2, samples: [] })).toThrow(/version/);
    expect(() => parseSensorLog({ format: 'reppulse-sensor-log', version: 1, samples: [[0, 1, 2]] })).toThrow(/Malformed/);
    expect(() => parseSensorLog({ format: 'reppulse-sensor-log', version: 1, samples: [[0, 'x', 0, 0, 0, 0, 0, 1]] })).toThrow(/Non-numeric/);
    expect(() => parseSensorLog({
      format: 'reppulse-sensor-log', version: 1, samples: [[10, 0, 0, 0, 0, 0, 0, 1], [5, 0, 0, 0, 0, 0, 0, 1]]
    })).toThrow(/non-decreasing/);
  });

  test('bundled fixture replays through the mock provider', () => {
    const fixture = require('../fixtures/squat_5_left_synthetic.json');
    const parsed = parseSensorLog(fixture);
    const time = createFakeTimeAdapter(50_000);
    const provider = createMockSensorProvider(time, { samples: parsed.samples });
    const got = [];
    provider.start((s) => got.push(s));
    provider.emitAll();
    expect(got.length).toBe(parsed.samples.length);
    expect(parsed.meta.expectedReps).toBe(5);
  });
});

describe('MockSensorProvider', () => {
  const scenario = () => Scenarios.squatSeries(3, { seed: 2 });

  test('implements the SensorProvider contract', () => {
    expect(() => assertSensorProvider(createMockSensorProvider(createFakeTimeAdapter(), { samples: [] }))).not.toThrow();
    expect(() => assertSensorProvider({ start() {} })).toThrow(/stop/);
  });

  test('manual mode: timestamps rebased onto the clock, emitUntil / emitNext / emitAll', () => {
    const time = createFakeTimeAdapter(10_000);
    const sc = scenario();
    const provider = createMockSensorProvider(time, { samples: sc.samples });
    const got = [];
    provider.start((s) => got.push(s));
    expect(got.length).toBe(0);
    provider.emitUntil(1000);
    expect(got.length).toBeGreaterThan(45);
    expect(got[0].t).toBe(10_000);
    expect(got[got.length - 1].t).toBeLessThanOrEqual(11_000);
    expect(provider.emitNext()).toBe(true);
    provider.emitAll();
    expect(got.length).toBe(sc.samples.length);
    expect(provider.emitNext()).toBe(false);
    expect(provider.remaining()).toBe(0);
  });

  test('realtime mode follows the clock and reports completion', () => {
    const time = createFakeTimeAdapter(0);
    const sc = scenario();
    const onFinished = jest.fn();
    const provider = createMockSensorProvider(time, { samples: sc.samples, mode: 'realtime', onFinished });
    const got = [];
    provider.start((s) => got.push(s));
    time.advance(2000);
    expect(got.length).toBeGreaterThan(90);
    expect(got.length).toBeLessThan(110);
    time.advance(sc.durationMs);
    expect(got.length).toBe(sc.samples.length);
    expect(onFinished).toHaveBeenCalledTimes(1);
    provider.stop();
    expect(time.pendingTimers()).toBe(0);
  });

  test('no samples after stop()', () => {
    const time = createFakeTimeAdapter(0);
    const provider = createMockSensorProvider(time, { samples: scenario().samples, mode: 'realtime' });
    const got = [];
    provider.start((s) => got.push(s));
    time.advance(500);
    provider.stop();
    const count = got.length;
    time.advance(2000);
    expect(got.length).toBe(count);
    expect(provider.isRunning()).toBe(false);
  });

  test('emulates a missing gyroscope and a missing accelerometer', () => {
    const time = createFakeTimeAdapter(0);
    const errors = [];
    const got = [];
    const noGyro = createMockSensorProvider(time, { samples: scenario().samples, gyroscope: 'unavailable' });
    noGyro.start((s) => got.push(s), (e) => errors.push(e.code));
    noGyro.emitUntil(500);
    expect(got.every((s) => !s.hasGyro && s.gx === 0)).toBe(true);
    expect(errors).toEqual([SensorErrorCode.GYRO_UNAVAILABLE]);
    expect(noGyro.getCapabilities().gyroscope).toBe(SensorAvailability.UNAVAILABLE);

    const noAccel = createMockSensorProvider(time, { samples: scenario().samples, accelerometer: 'unavailable' });
    const accelErrors = [];
    const none = [];
    noAccel.start((s) => none.push(s), (e) => accelErrors.push(e.code));
    expect(noAccel.emitAll()).toBe(0);
    expect(accelErrors).toEqual([SensorErrorCode.ACCEL_UNAVAILABLE]);
  });

  test('capabilities report the measured rate of the source data', () => {
    const provider = createMockSensorProvider(createFakeTimeAdapter(), { samples: scenario().samples });
    expect(provider.getCapabilities().measuredRateHz).toBeGreaterThan(47);
    expect(provider.getCapabilities().measuredRateHz).toBeLessThan(53);
  });
});
