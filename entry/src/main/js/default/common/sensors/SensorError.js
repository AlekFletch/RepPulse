export const SensorErrorCode = Object.freeze({
  ACCEL_UNAVAILABLE: 'ACCEL_UNAVAILABLE',
  ACCEL_TIMEOUT: 'ACCEL_TIMEOUT',
  GYRO_UNAVAILABLE: 'GYRO_UNAVAILABLE'
});

export function createSensorError(code, platformCode, message) {
  return { code: code, platformCode: platformCode, message: message || '' };
}
