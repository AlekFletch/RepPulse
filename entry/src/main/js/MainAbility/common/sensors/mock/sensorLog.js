import { sampleToRow, rowToSample } from '../SensorSample.js';

/**
 * Sensor log format (JSON), written by the debug recorder on the watch and replayed by
 * MockSensorProvider / tests:
 * {
 *   "format": "reppulse-sensor-log", "version": 1,
 *   "exerciseType": "SQUAT", "wristSide": "LEFT",
 *   "recordedAt": 1758620000000, "algorithmVersion": "0.1.0",
 *   "expectedReps": 10,                       // optional ground truth (manual count)
 *   "samples": [[t, ax, ay, az, gx, gy, gz, hasGyro], ...]
 * }
 * Sensor logs contain motion data only — no personal identifiers.
 */
export const SENSOR_LOG_FORMAT = 'reppulse-sensor-log';
export const SENSOR_LOG_VERSION = 1;

export function serializeSensorLog(meta, samples) {
  const rows = [];
  for (let i = 0; i < samples.length; i++) {
    rows.push(sampleToRow(samples[i]));
  }
  const log = {
    format: SENSOR_LOG_FORMAT,
    version: SENSOR_LOG_VERSION,
    exerciseType: meta.exerciseType || null,
    wristSide: meta.wristSide || null,
    recordedAt: meta.recordedAt || 0,
    algorithmVersion: meta.algorithmVersion || null,
    samples: rows
  };
  if (typeof meta.expectedReps === 'number') {
    log.expectedReps = meta.expectedReps;
  }
  return JSON.stringify(log);
}

/** Parses and validates a log (string or object). Throws on malformed input. */
export function parseSensorLog(input) {
  const log = typeof input === 'string' ? JSON.parse(input) : input;
  if (!log || log.format !== SENSOR_LOG_FORMAT) {
    throw new Error('Not a RepPulse sensor log');
  }
  if (log.version !== SENSOR_LOG_VERSION) {
    throw new Error('Unsupported sensor log version: ' + log.version);
  }
  if (!(log.samples instanceof Array)) {
    throw new Error('Sensor log has no samples');
  }
  const samples = [];
  let lastT = -Infinity;
  for (let i = 0; i < log.samples.length; i++) {
    const row = log.samples[i];
    if (!(row instanceof Array) || row.length !== 8) {
      throw new Error('Malformed sample row at index ' + i);
    }
    for (let k = 0; k < 7; k++) {
      if (typeof row[k] !== 'number' || !isFinite(row[k])) {
        throw new Error('Non-numeric value in sample row ' + i);
      }
    }
    if (row[0] < lastT) {
      throw new Error('Sample timestamps must be non-decreasing (row ' + i + ')');
    }
    lastT = row[0];
    samples.push(rowToSample(row));
  }
  return {
    meta: {
      exerciseType: log.exerciseType,
      wristSide: log.wristSide,
      recordedAt: log.recordedAt,
      algorithmVersion: log.algorithmVersion,
      expectedReps: log.expectedReps
    },
    samples: samples
  };
}
