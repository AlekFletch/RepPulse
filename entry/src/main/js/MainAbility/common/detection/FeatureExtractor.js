import { createMedian3, lowPassGain } from './SignalFilter.js';

const MIN_DT_S = 0.005;
const MAX_DT_S = 0.1;
/**
 * |g| is a constant, so it is averaged very slowly. Taking it from the direction filter would
 * subtract a large part of every slow vertical acceleration and flatten slow squats.
 */
const GRAVITY_MAGNITUDE_TAU_S = 8;
/**
 * A wrist turn (raising the arm from hanging to forward, a torso turn) leaves the slow gravity
 * estimate pointing the old way for seconds, and the projection error is integrated into a depth
 * drift. It is recognised by the direction of the accelerometer averaged over TURN_TAU_S moving
 * away from the gravity estimate by more than 25°; the estimate then follows it. Squats
 * tilt the forearm by 10-15° at most, and a short bump (the arm bounces at the bottom, the other
 * hand holds a phone) hardly moves the average. Until 2026-09-25 a large sideways acceleration
 * was taken for a turn, and bumps reset the estimates mid-squat: the depth drifted by metres
 * (watch video: "READY -2.43 / 0.06").
 */
const TURN_TAU_S = 0.3;
const TURN_COS = Math.cos(25 * Math.PI / 180);
/**
 * A strong sideways acceleration held this long (m/s², s) is also a turn or a shake of the arm
 * (the strap, a torso turn) rather than a squat, which accelerates the wrist mostly along gravity.
 */
const TURN_SIDEWAYS = 3.5;
const TURN_SIDEWAYS_S = 0.15;
/** The turn is over once the averaged direction turns slower than this, rad/s (smoothed). */
const TURN_SETTLED = 0.35;
/**
 * After a turn |g| is re-measured while the arm is held still (smoothed acceleration without
 * gravity plus angular speed below STILL_MOTION for STILL_MIN_S): averaging it during a squat
 * would take part of the squat for gravity.
 */
const STILL_MOTION = 0.3;
const STILL_MIN_S = 0.3;
const STILL_TAU_S = 0.2;

/**
 * Turns raw samples (m/s², rad/s, device frame) into the features both strategies use:
 *
 *   ux, uy, uz  unit gravity direction in the device frame: a low-pass of the accelerometer.
 *               The gyroscope is deliberately not used here: its axis convention on the watch
 *               cannot be verified off the device, and a flipped axis would turn the estimate the
 *               wrong way; accelerometer-only tracking passes every synthetic scenario.
 *   vertAcc     acceleration along gravity, m/s², up positive: magnitude of the specific force
 *               minus |g| (|g| averaged over GRAVITY_MAGNITUDE_TAU_S); independent of the
 *               direction estimate, so a slowly turning wrist adds no drift
 *   depth       vertical position, metres, down positive: vertAcc integrated twice with leaky
 *               integrators (a band-pass: fast enough to follow a squat, drift-free at rest)
 *   linAcc      magnitude of the acceleration without gravity, m/s²
 *   horizAcc    its part across gravity, m/s²
 *   gyro        angular speed, rad/s (0 without a gyroscope): a magnitude, so axis-independent
 *   turning     the arm is turning (see TURN_COS): depth is held at 0 meanwhile
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
  const f = { dtS: 0, ux: 0, uy: 0, uz: 1, vertAcc: 0, linAcc: 0, horizAcc: 0, depth: 0, gyro: 0, turning: false };
  let started = false;
  let lastT = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let vel = 0;
  let pos = 0;
  let gMag = 0;
  let magSamples = 0;
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let turning = false;
  let bx = 0;
  let by = 0;
  let bz = 1;
  let bMag = 0;
  let remeasure = false;
  let stillSamples = 0;
  let sidewaysS = 0;
  let settle = 0;
  let stillS = 0;
  let motion = 0;

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
      stillS = 0;
      sidewaysS = 0;
      turning = false;
      remeasure = false;
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
        fx = ax;
        fy = ay;
        fz = az;
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
      // Vertical acceleration from the magnitude, not the projection on the gravity estimate:
      // |g + a| = |g| + (a along g) + O(|a sideways|² / 2|g|). The projection needs the direction,
      // which lags whenever the arms slowly sink or rise over a set; the error, g(1 - cos lag), was
      // integrated into the ±2 m drift seen on the watch (video 2026-09-25, "READY -1.80").
      const along = Math.sqrt(ax * ax + ay * ay + az * az);
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

      const kt = lowPassGain(dt, TURN_TAU_S);
      fx += (ax - fx) * kt;
      fy += (ay - fy) * kt;
      fz += (az - fz) * kt;
      const fNorm = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      sidewaysS = f.horizAcc > TURN_SIDEWAYS ? sidewaysS + dt : 0;
      if (!turning && (sidewaysS >= TURN_SIDEWAYS_S || fx * f.ux + fy * f.uy + fz * f.uz < TURN_COS * fNorm)) {
        turning = true;
        settle = TURN_SETTLED * 4;
        bx = f.ux;
        by = f.uy;
        bz = f.uz;
        bMag = gMag;
      }
      if (turning) {
        // Follow the averaged direction until the arm settles; nothing is integrated meanwhile.
        const c = (fx * gx + fy * gy + fz * gz) / (fNorm * (Math.sqrt(gx * gx + gy * gy + gz * gz) || 1));
        const rate = Math.sqrt(c < 1 ? 2 * (1 - c) : 0) / dt;
        settle += (rate - settle) * kt;
        gx = fx;
        gy = fy;
        gz = fz;
        vel = 0;
        pos = 0;
        if (settle <= TURN_SETTLED) {
          turning = false;
          if (fx * bx + fy * by + fz * bz < TURN_COS * fNorm) {
            // A new orientation: per-axis scale errors make |g| read differently. Take the
            // averaged reading for now and measure it once the arm is held still.
            gMag = fNorm;
            remeasure = true;
            stillSamples = 0;
          } else {
            // Back where it was (a torso turn, a shake): the |g| from before still holds.
            gMag = bMag;
          }
        }
      }
      // Smoothed, so sensor noise alone never breaks a still spell.
      motion += (f.linAcc + f.gyro - motion) * lowPassGain(dt, STILL_TAU_S);
      stillS = motion < STILL_MOTION ? stillS + dt : 0;
      if (remeasure && stillS >= STILL_MIN_S) {
        // |g| is the mean of the specific force over the still spell.
        stillSamples++;
        gMag += (along - gMag) / stillSamples;
      } else if (remeasure && stillSamples > 0) {
        remeasure = false;
      }
      const decay = 1 - dt / integratorTau;
      vel = vel * decay + f.vertAcc * dt;
      pos = pos * decay + vel * dt;
      f.depth = -pos;
      f.turning = turning;
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
