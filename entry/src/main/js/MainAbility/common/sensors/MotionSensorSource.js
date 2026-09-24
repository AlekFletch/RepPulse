import sensor from '@system.sensor';
import { ACCEL_G_TO_MS2 } from './units.js';

/** Freshest gyroscope reading merged into an accelerometer sample, ms. */
const GYRO_MAX_AGE_MS = 80;
/** No accelerometer data within this time: automatic counting is not possible. */
const ACCEL_TIMEOUT_MS = 2000;

/**
 * Lean SensorProvider for the workout and calibration pages, where every byte of the page bundle
 * and of the ~100 KB JS heap counts (HuaweiSensorProvider, with rate metering and capability
 * tracking, stays on the diagnostics page).
 *
 *   - accelerometer and gyroscope at 'game' (20 ms); the accelerometer arrives in g and is
 *     converted to m/s² (verified on Watch Fit 4 Pro);
 *   - the latest gyroscope reading younger than GYRO_MAX_AGE_MS rides along with each
 *     accelerometer sample; a failing or silent gyroscope just leaves hasGyro false;
 *   - ONE sample object is reused for every callback (no garbage 50 times a second): consumers
 *     must not keep it — the detection engine does not;
 *   - no accelerometer data within ACCEL_TIMEOUT_MS reports ACCEL_TIMEOUT.
 */
export function createMotionSensorSource(time) {
  const sample = { t: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, hasGyro: false };
  // SensorCapabilities / SensorError shapes with plain values: those modules stay out of the bundle.
  const caps = { accelerometer: 'UNKNOWN', gyroscope: 'UNKNOWN', nominalIntervalMs: 20, measuredRateHz: 0 };
  let running = false;
  let onSample = null;
  let onError = null;
  let gyroT = -1;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let accelSeen = false;
  let timer = null;

  function fail(code, platformCode, message) {
    if (onError) {
      onError({ code: code, platformCode: platformCode, message: message || '' });
    }
  }

  function onAccel(data) {
    if (!running) {
      return;
    }
    const t = time.now();
    if (!accelSeen) {
      accelSeen = true;
      caps.accelerometer = 'AVAILABLE';
    }
    const fresh = gyroT >= 0 && t - gyroT <= GYRO_MAX_AGE_MS;
    sample.t = t;
    sample.ax = data.x * ACCEL_G_TO_MS2;
    sample.ay = data.y * ACCEL_G_TO_MS2;
    sample.az = data.z * ACCEL_G_TO_MS2;
    sample.gx = fresh ? gx : 0;
    sample.gy = fresh ? gy : 0;
    sample.gz = fresh ? gz : 0;
    sample.hasGyro = fresh;
    onSample(sample);
  }

  function onGyro(data) {
    if (running) {
      gyroT = time.now();
      gx = data.x;
      gy = data.y;
      gz = data.z;
      caps.gyroscope = 'AVAILABLE';
    }
  }

  return {
    start: function (sampleCb, errorCb) {
      if (running) {
        return;
      }
      running = true;
      onSample = sampleCb;
      onError = errorCb || null;
      accelSeen = false;
      gyroT = -1;
      try {
        sensor.subscribeAccelerometer({
          interval: 'game',
          success: onAccel,
          fail: function (data, code) {
            caps.accelerometer = 'UNAVAILABLE';
            fail('ACCEL_UNAVAILABLE', code, data);
          }
        });
      } catch (e) {
        caps.accelerometer = 'UNAVAILABLE';
        fail('ACCEL_UNAVAILABLE', -1, String(e));
      }
      try {
        sensor.subscribeGyroscope({
          interval: 'game',
          success: onGyro,
          fail: function () {
            caps.gyroscope = 'UNAVAILABLE';
          }
        });
      } catch (e) {
        caps.gyroscope = 'UNAVAILABLE';
      }
      timer = time.setTimeout(function () {
        timer = null;
        if (running && !accelSeen && caps.accelerometer !== 'UNAVAILABLE') {
          caps.accelerometer = 'UNAVAILABLE';
          fail('ACCEL_TIMEOUT', -1, 'no accelerometer data');
        }
      }, ACCEL_TIMEOUT_MS);
    },

    stop: function () {
      if (!running) {
        return;
      }
      running = false;
      if (timer !== null) {
        time.clearTimeout(timer);
        timer = null;
      }
      try {
        sensor.unsubscribeAccelerometer();
      } catch (e) {
        // nothing to release
      }
      try {
        sensor.unsubscribeGyroscope();
      } catch (e) {
        // nothing to release
      }
      onSample = null;
      onError = null;
    },

    isRunning: function () {
      return running;
    },

    getCapabilities: function () {
      return caps;
    }
  };
}
