import sensor from '@system.sensor';
import { createHuaweiSensorProvider } from '../../entry/src/main/js/default/common/sensors/HuaweiSensorProvider.js';
import { SensorAvailability, canAutoCount } from '../../entry/src/main/js/default/common/sensors/SensorCapabilities.js';
import { SensorErrorCode } from '../../entry/src/main/js/default/common/sensors/SensorError.js';
import { createRateMeter } from '../../entry/src/main/js/default/common/sensors/RateMeter.js';
import { probeSensors } from '../../entry/src/main/js/default/common/platform/DeviceCapabilityChecker.js';
import { createFakeTimeAdapter } from '../mocks/FakeTimeAdapter.js';

const silentLogger = { warn() {}, debug() {}, info() {}, error() {} };

function setup(options) {
  const time = createFakeTimeAdapter(0);
  const provider = createHuaweiSensorProvider(time, silentLogger, options);
  const samples = [];
  const errors = [];
  provider.start((s) => samples.push(s), (e) => errors.push(e));
  return { time, provider, samples, errors };
}

/** Advance the fake clock in 20 ms steps, delivering one accel (and optionally gyro) reading per step. */
function stream(time, ms, withGyro) {
  for (let t = 0; t < ms; t += 20) {
    time.advance(20);
    if (withGyro) {
      sensor.__emit('Gyroscope', { x: 0.1, y: 0.2, z: 0.3 });
    }
    sensor.__emit('Accelerometer', { x: 0, y: 0, z: 9.81 });
  }
}

beforeEach(() => sensor.__reset());

describe('HuaweiSensorProvider (@system.sensor)', () => {
  test('subscribes accelerometer and gyroscope at the "game" interval', () => {
    setup();
    expect(sensor.__subscription('Accelerometer').interval).toBe('game');
    expect(sensor.__subscription('Gyroscope').interval).toBe('game');
  });

  test('merges the latest gyroscope reading into each accelerometer sample', () => {
    const { time, samples, provider } = setup();
    stream(time, 1000, true);
    expect(samples.length).toBe(50);
    expect(samples[10]).toMatchObject({ az: 9.81, gx: 0.1, gy: 0.2, gz: 0.3, hasGyro: true });
    const caps = provider.getCapabilities();
    expect(caps.accelerometer).toBe(SensorAvailability.AVAILABLE);
    expect(caps.gyroscope).toBe(SensorAvailability.AVAILABLE);
    expect(caps.measuredRateHz).toBeCloseTo(50, 0);
    expect(canAutoCount(caps)).toBe(true);
  });

  test('stale gyroscope data is not attached', () => {
    const { time, samples } = setup();
    stream(time, 200, true);
    stream(time, 400, false);
    expect(samples[samples.length - 1].hasGyro).toBe(false);
    expect(samples[samples.length - 1].gx).toBe(0);
  });

  test('silent gyroscope -> timeout -> accelerometer-only mode', () => {
    const { time, samples, errors, provider } = setup({ gyroTimeoutMs: 1500 });
    stream(time, 1600, false);
    expect(errors.map((e) => e.code)).toEqual([SensorErrorCode.GYRO_UNAVAILABLE]);
    expect(provider.getCapabilities().gyroscope).toBe(SensorAvailability.UNAVAILABLE);
    expect(sensor.__calls).toContain('unsubscribeGyroscope');
    expect(samples.length).toBeGreaterThan(70);
    expect(canAutoCount(provider.getCapabilities())).toBe(true);
  });

  test('gyroscope fail callback is reported and the gyroscope released', () => {
    const { errors, provider } = setup();
    sensor.__fail('Gyroscope', 'no permission', 201);
    expect(errors[0]).toMatchObject({ code: SensorErrorCode.GYRO_UNAVAILABLE, platformCode: 201 });
    expect(provider.getCapabilities().gyroscope).toBe(SensorAvailability.UNAVAILABLE);
  });

  test('accelerometer failure and timeout disable automatic counting', () => {
    const failed = setup();
    sensor.__fail('Accelerometer', 'denied', 201);
    expect(failed.errors[0].code).toBe(SensorErrorCode.ACCEL_UNAVAILABLE);
    expect(canAutoCount(failed.provider.getCapabilities())).toBe(false);
    failed.provider.stop();

    sensor.__reset();
    const silent = setup({ accelTimeoutMs: 2000 });
    silent.time.advance(2100);
    expect(silent.errors.map((e) => e.code)).toContain(SensorErrorCode.ACCEL_TIMEOUT);
    expect(canAutoCount(silent.provider.getCapabilities())).toBe(false);
  });

  test('a throwing subscribe call is handled', () => {
    sensor.__throwOn.Gyroscope = true;
    const { errors, provider } = setup();
    expect(errors[0].code).toBe(SensorErrorCode.GYRO_UNAVAILABLE);
    expect(provider.isRunning()).toBe(true);
  });

  test('stop() unsubscribes everything, clears timers and ignores late callbacks', () => {
    const { time, provider, samples } = setup();
    stream(time, 100, true);
    provider.stop();
    expect(sensor.__calls).toEqual(expect.arrayContaining(['unsubscribeAccelerometer', 'unsubscribeGyroscope']));
    expect(time.pendingTimers()).toBe(0);
    const count = samples.length;
    sensor.__emit('Accelerometer', { x: 0, y: 0, z: 9.81 });
    expect(samples.length).toBe(count);
    expect(provider.isRunning()).toBe(false);
  });

  test('useGyroscope: false never subscribes the gyroscope', () => {
    setup({ useGyroscope: false });
    expect(sensor.__subscription('Gyroscope')).toBeNull();
  });
});

describe('RateMeter', () => {
  test('measures the callback rate', () => {
    const meter = createRateMeter();
    for (let t = 0; t <= 2000; t += 20) {
      meter.push(t);
    }
    expect(meter.getRateHz()).toBeCloseTo(50, 1);
    meter.reset();
    expect(meter.getRateHz()).toBe(0);
  });
});

describe('DeviceCapabilityChecker', () => {
  test('reports availability and measured rate after probing', () => {
    const time = createFakeTimeAdapter(0);
    const provider = createHuaweiSensorProvider(time, silentLogger);
    const result = jest.fn();
    probeSensors(provider, time, 2000, result);
    stream(time, 1980, true);
    time.advance(40);
    expect(result).toHaveBeenCalledTimes(1);
    const report = result.mock.calls[0][0];
    expect(report.autoCountAvailable).toBe(true);
    expect(report.capabilities.gyroscope).toBe(SensorAvailability.AVAILABLE);
    expect(report.capabilities.measuredRateHz).toBeGreaterThan(45);
    expect(provider.isRunning()).toBe(false);
  });

  test('no accelerometer -> manual mode', () => {
    const time = createFakeTimeAdapter(0);
    const provider = createHuaweiSensorProvider(time, silentLogger);
    const result = jest.fn();
    probeSensors(provider, time, 2500, result);
    time.advance(2600);
    expect(result.mock.calls[0][0].autoCountAvailable).toBe(false);
  });
});
