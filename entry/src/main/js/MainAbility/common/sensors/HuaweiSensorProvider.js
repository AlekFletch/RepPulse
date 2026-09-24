import sensor from '@system.sensor';
import { createSensorSample } from './SensorSample.js';
import { createSensorCapabilities, SensorAvailability } from './SensorCapabilities.js';
import { createSensorError, SensorErrorCode } from './SensorError.js';
import { createRateMeter } from './RateMeter.js';

/**
 * SensorProvider over the lite wearable @system.sensor API (verified against the SDK typings):
 *   subscribeAccelerometer({ interval, success(x,y,z), fail })   ohos.permission.ACCELEROMETER
 *   subscribeGyroscope({ interval, success(x,y,z), fail })       ohos.permission.GYROSCOPE (API 6+)
 * interval: 'game' = 20 ms, 'ui' = 60 ms, 'normal' = 200 ms.
 *
 * Accelerometer and gyroscope arrive in separate callbacks. Each accelerometer callback emits
 * one sample carrying the most recent gyroscope reading if it is fresh enough.
 *
 * Community reports say some models never call back for the gyroscope (not even `fail`),
 * so the gyroscope is declared unavailable after `gyroTimeoutMs` without data and the
 * provider continues in accelerometer-only mode.
 */
export const SensorInterval = Object.freeze({ GAME: 'game', UI: 'ui', NORMAL: 'normal' });

/**
 * Watch Fit 4 Pro reports the accelerometer in g (|a| ~= 1.0 at rest, diagnostics 2026-09-24),
 * while the rest of the app works in m/s^2. The gyroscope already arrives in rad/s.
 */
export const ACCEL_G_TO_MS2 = 9.80665;

const INTERVAL_MS = { game: 20, ui: 60, normal: 200 };

export function createHuaweiSensorProvider(time, logger, options) {
  const opts = options || {};
  const interval = opts.interval || SensorInterval.GAME;
  const gyroTimeoutMs = typeof opts.gyroTimeoutMs === 'number' ? opts.gyroTimeoutMs : 1500;
  const accelTimeoutMs = typeof opts.accelTimeoutMs === 'number' ? opts.accelTimeoutMs : 2000;
  const gyroMaxAgeMs = typeof opts.gyroMaxAgeMs === 'number' ? opts.gyroMaxAgeMs : 4 * INTERVAL_MS[interval];
  const useGyroscope = opts.useGyroscope !== false;

  let running = false;
  let onSampleCb = null;
  let onErrorCb = null;
  let gyroSubscribed = false;
  let lastGyro = null;
  let accelSeen = false;
  let gyroTimer = null;
  let accelTimer = null;
  const rate = createRateMeter();
  let caps = createSensorCapabilities({ nominalIntervalMs: INTERVAL_MS[interval] });

  function report(code, platformCode, message) {
    if (logger) {
      logger.warn('sensor error ' + code + ' (' + platformCode + ') ' + (message || ''));
    }
    if (onErrorCb) {
      onErrorCb(createSensorError(code, platformCode, message));
    }
  }

  function setCap(name, value) {
    caps[name] = value;
  }

  function onAccel(data) {
    if (!running) {
      return;
    }
    const t = time.now();
    if (!accelSeen) {
      accelSeen = true;
      setCap('accelerometer', SensorAvailability.AVAILABLE);
    }
    rate.push(t);
    caps.measuredRateHz = rate.getRateHz();
    const gyroFresh = lastGyro !== null && t - lastGyro.t <= gyroMaxAgeMs;
    const g = gyroFresh ? lastGyro : null;
    onSampleCb(createSensorSample(
      t, data.x * ACCEL_G_TO_MS2, data.y * ACCEL_G_TO_MS2, data.z * ACCEL_G_TO_MS2,
      g ? g.x : 0, g ? g.y : 0, g ? g.z : 0,
      gyroFresh
    ));
  }

  function onGyro(data) {
    if (!running) {
      return;
    }
    if (caps.gyroscope !== SensorAvailability.AVAILABLE) {
      setCap('gyroscope', SensorAvailability.AVAILABLE);
    }
    lastGyro = { t: time.now(), x: data.x, y: data.y, z: data.z };
  }

  function stopGyro() {
    if (gyroSubscribed) {
      gyroSubscribed = false;
      try {
        sensor.unsubscribeGyroscope();
      } catch (e) {
        // ignore: nothing to release
      }
    }
  }

  function markGyroUnavailable(platformCode, message) {
    setCap('gyroscope', SensorAvailability.UNAVAILABLE);
    stopGyro();
    lastGyro = null;
    report(SensorErrorCode.GYRO_UNAVAILABLE, platformCode, message);
  }

  function clearTimers() {
    if (gyroTimer !== null) {
      time.clearTimeout(gyroTimer);
      gyroTimer = null;
    }
    if (accelTimer !== null) {
      time.clearTimeout(accelTimer);
      accelTimer = null;
    }
  }

  return {
    start: function (onSample, onError) {
      if (running) {
        return;
      }
      running = true;
      onSampleCb = onSample;
      onErrorCb = onError || null;
      accelSeen = false;
      lastGyro = null;
      rate.reset();
      caps = createSensorCapabilities({ nominalIntervalMs: INTERVAL_MS[interval] });

      try {
        sensor.subscribeAccelerometer({
          interval: interval,
          success: onAccel,
          fail: function (data, code) {
            setCap('accelerometer', SensorAvailability.UNAVAILABLE);
            report(SensorErrorCode.ACCEL_UNAVAILABLE, code, data);
          }
        });
      } catch (e) {
        setCap('accelerometer', SensorAvailability.UNAVAILABLE);
        report(SensorErrorCode.ACCEL_UNAVAILABLE, -1, String(e));
      }
      accelTimer = time.setTimeout(function () {
        accelTimer = null;
        if (running && !accelSeen && caps.accelerometer !== SensorAvailability.UNAVAILABLE) {
          setCap('accelerometer', SensorAvailability.UNAVAILABLE);
          report(SensorErrorCode.ACCEL_TIMEOUT, -1, 'no accelerometer data');
        }
      }, accelTimeoutMs);

      if (!useGyroscope) {
        setCap('gyroscope', SensorAvailability.UNAVAILABLE);
        return;
      }
      try {
        sensor.subscribeGyroscope({
          interval: interval,
          success: onGyro,
          fail: function (data, code) {
            markGyroUnavailable(code, data);
          }
        });
        gyroSubscribed = true;
      } catch (e) {
        markGyroUnavailable(-1, String(e));
        return;
      }
      gyroTimer = time.setTimeout(function () {
        gyroTimer = null;
        if (running && caps.gyroscope === SensorAvailability.UNKNOWN) {
          markGyroUnavailable(-1, 'no gyroscope data within ' + gyroTimeoutMs + ' ms');
        }
      }, gyroTimeoutMs);
    },

    stop: function () {
      if (!running) {
        return;
      }
      running = false;
      clearTimers();
      try {
        sensor.unsubscribeAccelerometer();
      } catch (e) {
        // ignore
      }
      stopGyro();
      onSampleCb = null;
      onErrorCb = null;
    },

    isRunning: function () {
      return running;
    },

    getCapabilities: function () {
      return caps;
    }
  };
}
