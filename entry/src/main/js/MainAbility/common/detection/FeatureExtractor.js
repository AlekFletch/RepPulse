import { createMedian3, lowPassGain } from './SignalFilter.js';

const MIN_DT_S = 0.005;
const MAX_DT_S = 0.1;
/**
 * |g| is a constant, so it is averaged very slowly. Taking it from the direction filter would
 * subtract a large part of every slow vertical acceleration and flatten slow squats.
 */
const GRAVITY_MAGNITUDE_TAU_S = 8;
/**
 * A wrist turn shows up as a large acceleration across the (lagging) gravity estimate, and its
 * projection error would be integrated into a depth drift. A squat accelerates the wrist mostly
 * along gravity (fast squats: ~1.5 m/s² sideways; a torso turn or shaking the strap: 5+), so above
 * this the integrators are reset instead, m/s².
 */
const TURN_SIDEWAYS = 3.5;

/**
 * Turns raw samples (m/s², rad/s, device frame) into the features both strategies use:
 *
 *   ux, uy, uz  unit gravity direction in the device frame: a low-pass of the accelerometer.
 *               The gyroscope is deliberately not used here: its axis convention on the watch
 *               cannot be verified off the device, and a flipped axis would turn the estimate the
 *               wrong way; accelerometer-only tracking passes every synthetic scenario.
 *   vertAcc     acceleration along gravity, m/s², up positive: specific force along the gravity
 *               direction minus |g| (|g| averaged over GRAVITY_MAGNITUDE_TAU_S)
 *   depth       vertical position, metres, down positive: vertAcc integrated twice with leaky
 *               integrators (a band-pass: fast enough to follow a squat, drift-free at rest)
 *   linAcc      magnitude of the acceleration without gravity, m/s²
 *   horizAcc    its part across gravity, m/s²
 *   gyro        angular speed, rad/s (0 without a gyroscope): a magnitude, so axis-independent
 *
 * options: gravityTauS, integratorTauS.
 * update(sample) returns the same (reused) feature object, or null for the very first sample.
 */
export function createFeatureExtractor(options) {
  const gravityTau = options.gravityTauS;
  const integratorTau = options.integratorTauS;
  const mx = createMedian3();
  const my = createMedian3();
  const mz = createMedian3();
  const f = { dtS: 0, ux: 0, uy: 0, uz: 1, vertAcc: 0, linAcc: 0, horizAcc: 0, depth: 0, gyro: 0 };
  let started = false;
  let lastT = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let vel = 0;
  let pos = 0;
  let gMag = 0;
  let magSamples = 0;

  return {
    /** The feature object of the latest update (the same reused object). */
    current: function () {
      return f;
    },

    reset: function () {
      started = false;
      mx.reset();
      my.reset();
      mz.reset();
    },

    update: function (s) {
      const ax = mx.push(s.ax);
      const ay = my.push(s.ay);
      const az = mz.push(s.az);
      if (!started) {
        started = true;
        lastT = s.t;
        gx = ax;
        gy = ay;
        gz = az;
        vel = 0;
        pos = 0;
        gMag = Math.sqrt(ax * ax + ay * ay + az * az);
        magSamples = 1;
        return null;
      }
      let dt = (s.t - lastT) / 1000;
      lastT = s.t;
      dt = dt < MIN_DT_S ? MIN_DT_S : (dt > MAX_DT_S ? MAX_DT_S : dt);

      f.gyro = s.hasGyro ? Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz) : 0;
      const k = lowPassGain(dt, gravityTau);
      gx += (ax - gx) * k;
      gy += (ay - gy) * k;
      gz += (az - gz) * k;

      const norm = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      f.ux = gx / norm;
      f.uy = gy / norm;
      f.uz = gz / norm;
      const along = ax * f.ux + ay * f.uy + az * f.uz;
      // Plain running mean at first (converges in a fraction of a second), then the slow average.
      // A small |g| error is integrated twice into a large depth drift.
      magSamples++;
      gMag += (along - gMag) * Math.max(lowPassGain(dt, GRAVITY_MAGNITUDE_TAU_S), 1 / magSamples);
      f.vertAcc = along - gMag;
      const lx = ax - gx;
      const ly = ay - gy;
      const lz = az - gz;
      const lin2 = lx * lx + ly * ly + lz * lz;
      f.linAcc = Math.sqrt(lin2);
      const h2 = lin2 - f.vertAcc * f.vertAcc;
      f.horizAcc = h2 > 0 ? Math.sqrt(h2) : 0;

      if (f.horizAcc > TURN_SIDEWAYS) {
        // The arm turned (e.g. raised from hanging to forward): the lagging gravity estimate would
        // leave a large projection error for seconds. Jump to the current direction and start over.
        gx = ax;
        gy = ay;
        gz = az;
        vel = 0;
        pos = 0;
        // Per-axis scale errors make |g| read differently in the new orientation: average afresh.
        magSamples = 0;
      }
      const decay = 1 - dt / integratorTau;
      vel = vel * decay + f.vertAcc * dt;
      pos = pos * decay + vel * dt;
      f.depth = -pos;
      f.dtS = dt;
      return f;
    }
  };
}

/** Angle between two unit vectors, degrees. */
export function angleDeg(ax, ay, az, bx, by, bz) {
  let c = ax * bx + ay * by + az * bz;
  c = c > 1 ? 1 : (c < -1 ? -1 : c);
  return Math.acos(c) * 57.29578;
}
