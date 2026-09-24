/**
 * Watch Fit 4 Pro reports the accelerometer in g (|a| ~= 1.0 at rest, diagnostics 2026-09-24),
 * while the rest of the app works in m/s^2. The gyroscope already arrives in rad/s.
 */
export const ACCEL_G_TO_MS2 = 9.80665;
