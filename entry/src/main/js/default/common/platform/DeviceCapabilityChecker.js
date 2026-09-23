import { canAutoCount } from '../sensors/SensorCapabilities.js';

/**
 * Probes a SensorProvider for `probeMs` and reports what is actually available, including
 * the measured sample rate. If the accelerometer is unavailable the UI offers the
 * manual-count / timer mode (acceptance criterion 12).
 *
 * callback({ capabilities, autoCountAvailable, sampleCount, errors })
 */
export function probeSensors(provider, time, probeMs, callback) {
  const errors = [];
  let samples = 0;
  provider.start(function () {
    samples++;
  }, function (error) {
    errors.push(error);
  });
  time.setTimeout(function () {
    const caps = provider.getCapabilities();
    provider.stop();
    const snapshot = {
      accelerometer: caps.accelerometer,
      gyroscope: caps.gyroscope,
      orientation: caps.orientation,
      heartRate: caps.heartRate,
      nominalIntervalMs: caps.nominalIntervalMs,
      measuredRateHz: caps.measuredRateHz
    };
    callback({
      capabilities: snapshot,
      autoCountAvailable: canAutoCount(snapshot) && samples > 0,
      sampleCount: samples,
      errors: errors
    });
  }, probeMs);
}
