export const SensorAvailability = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE'
});

export function createSensorCapabilities(fields) {
  const f = fields || {};
  return {
    accelerometer: f.accelerometer || SensorAvailability.UNKNOWN,
    gyroscope: f.gyroscope || SensorAvailability.UNKNOWN,
    orientation: f.orientation || SensorAvailability.UNKNOWN,
    heartRate: f.heartRate || SensorAvailability.UNKNOWN,
    /** Nominal callback period requested from the platform ('game' = 20 ms). */
    nominalIntervalMs: typeof f.nominalIntervalMs === 'number' ? f.nominalIntervalMs : 20,
    /** Measured accelerometer rate; 0 until enough samples arrived. */
    measuredRateHz: typeof f.measuredRateHz === 'number' ? f.measuredRateHz : 0
  };
}

/** Automatic counting needs at least the accelerometer. */
export function canAutoCount(capabilities) {
  return capabilities.accelerometer === SensorAvailability.AVAILABLE;
}
