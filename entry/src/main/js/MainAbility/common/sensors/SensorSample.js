/**
 * Unified sensor sample produced by every SensorProvider.
 *   t            timestamp, ms (provider clock)
 *   ax, ay, az   accelerometer, device frame (m/s^2 assumed — TODO(device): verify units)
 *   gx, gy, gz   gyroscope, device frame (rad/s assumed — TODO(device): verify units); 0 when absent
 *   hasGyro      true when gx..gz carry a fresh gyroscope reading
 * Orientation from subscribeDeviceOrientation is optional and delivered separately (alpha/beta/gamma).
 */
export function createSensorSample(t, ax, ay, az, gx, gy, gz, hasGyro) {
  return {
    t: t,
    ax: ax,
    ay: ay,
    az: az,
    gx: hasGyro ? gx : 0,
    gy: hasGyro ? gy : 0,
    gz: hasGyro ? gz : 0,
    hasGyro: hasGyro === true
  };
}

/** Compact log row: [t, ax, ay, az, gx, gy, gz, hasGyro(0|1)] — used by debug logs and replay. */
export function sampleToRow(s) {
  return [s.t, round4(s.ax), round4(s.ay), round4(s.az), round4(s.gx), round4(s.gy), round4(s.gz), s.hasGyro ? 1 : 0];
}

export function rowToSample(row) {
  return createSensorSample(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7] === 1);
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}
