import { createSensorSample } from './SensorSample.js';
import { createSensorCapabilities, SensorAvailability } from './SensorCapabilities.js';
import { createSensorError, SensorErrorCode } from './SensorError.js';

/**
 * SensorProvider that plays back prepared samples (synthetic scenarios or recorded JSON logs).
 *
 * Sample timestamps are treated as offsets from the first sample and rebased onto
 * time.now() at start(), so consumers see the same clock as with real sensors.
 *
 * options:
 *   samples        SensorSample[] (required)
 *   mode           'manual' (default) — tests drive delivery with emitNext/emitUntil/emitAll
 *                  'realtime' — delivered by a TimeAdapter interval, for the simulator / demo
 *   tickMs         realtime tick (20)
 *   gyroscope      'available' (default) | 'unavailable' — the latter strips gyro data and
 *                  reports GYRO_UNAVAILABLE, emulating accelerometer-only devices
 *   accelerometer  'available' (default) | 'unavailable' — emits nothing, reports ACCEL_UNAVAILABLE
 *   loop           realtime only: restart from the beginning when finished
 *   onFinished     called once all samples were delivered
 */
export function createMockSensorProvider(time, options) {
  const opts = options || {};
  const source = opts.samples || [];
  const mode = opts.mode || 'manual';
  const tickMs = opts.tickMs || 20;
  const gyroAvailable = opts.gyroscope !== 'unavailable';
  const accelAvailable = opts.accelerometer !== 'unavailable';

  let running = false;
  let onSampleCb = null;
  let cursor = 0;
  let startAt = 0;
  let firstT = source.length > 0 ? source[0].t : 0;
  let timer = null;
  let finishedNotified = false;
  const caps = createSensorCapabilities({
    accelerometer: accelAvailable ? SensorAvailability.AVAILABLE : SensorAvailability.UNAVAILABLE,
    gyroscope: gyroAvailable ? SensorAvailability.AVAILABLE : SensorAvailability.UNAVAILABLE,
    nominalIntervalMs: 20,
    measuredRateHz: estimateRate(source)
  });

  function deliver(sample) {
    const t = startAt + (sample.t - firstT);
    onSampleCb(createSensorSample(
      t, sample.ax, sample.ay, sample.az, sample.gx, sample.gy, sample.gz,
      gyroAvailable && sample.hasGyro
    ));
  }

  function checkFinished() {
    if (cursor >= source.length && !finishedNotified) {
      finishedNotified = true;
      if (opts.onFinished) {
        opts.onFinished();
      }
    }
  }

  /** Emits samples whose offset from the first sample is <= offsetMs. Returns count emitted. */
  function emitUntilOffset(offsetMs) {
    if (!running || !accelAvailable) {
      return 0;
    }
    let count = 0;
    while (running && cursor < source.length && source[cursor].t - firstT <= offsetMs) {
      deliver(source[cursor]);
      cursor++;
      count++;
    }
    checkFinished();
    return count;
  }

  function onTick() {
    const elapsed = time.now() - startAt;
    emitUntilOffset(elapsed);
    if (cursor >= source.length && opts.loop && source.length > 0) {
      cursor = 0;
      finishedNotified = false;
      startAt = time.now();
    }
  }

  return {
    start: function (onSample, onError) {
      if (running) {
        return;
      }
      running = true;
      onSampleCb = onSample;
      cursor = 0;
      finishedNotified = false;
      startAt = time.now();
      firstT = source.length > 0 ? source[0].t : 0;
      if (!accelAvailable && onError) {
        onError(createSensorError(SensorErrorCode.ACCEL_UNAVAILABLE, -1, 'mock: accelerometer disabled'));
      }
      if (!gyroAvailable && onError) {
        onError(createSensorError(SensorErrorCode.GYRO_UNAVAILABLE, -1, 'mock: gyroscope disabled'));
      }
      if (mode === 'realtime') {
        timer = time.setInterval(onTick, tickMs);
      }
    },

    stop: function () {
      running = false;
      onSampleCb = null;
      if (timer !== null) {
        time.clearInterval(timer);
        timer = null;
      }
    },

    isRunning: function () {
      return running;
    },

    getCapabilities: function () {
      return caps;
    },

    // --- manual-mode controls (tests) ---

    /** Emits the next sample; returns false when nothing is left. */
    emitNext: function () {
      if (!running || !accelAvailable || cursor >= source.length) {
        return false;
      }
      deliver(source[cursor]);
      cursor++;
      checkFinished();
      return true;
    },

    emitUntil: function (offsetMs) {
      return emitUntilOffset(offsetMs);
    },

    emitAll: function () {
      return emitUntilOffset(Infinity);
    },

    remaining: function () {
      return source.length - cursor;
    }
  };
}

function estimateRate(samples) {
  if (samples.length < 2) {
    return 0;
  }
  const span = samples[samples.length - 1].t - samples[0].t;
  return span > 0 ? ((samples.length - 1) * 1000) / span : 0;
}
