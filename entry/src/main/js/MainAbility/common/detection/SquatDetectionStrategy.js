import { ExerciseType } from '../domain/enums.js';
import { angleDeg } from './FeatureExtractor.js';

/**
 * Squat, arms held forward at chest height: the wrist travels down and up with the shoulders
 * (a few cm for a shallow dip, ~0.2–0.4 m to parallel), the forearm barely turns.
 *   signal     estimated depth of the wrist, metres (FeatureExtractor.depth)
 *   rejection  a cycle whose wrist orientation turned more than SQUAT_MAX_TILT_DEG, or whose
 *              sideways acceleration rivals the vertical one, is an arm or torso movement (wave,
 *              raise, reaching, turning), not a squat; walking moves the wrist only a few cm
 *              vertically and never reaches the amplitude threshold.
 */
export const SQUAT_MAX_TILT_DEG = 45;
/**
 * The hips go straight down and up, so the wrist accelerates mostly along gravity. A wave, a torso
 * turn or reaching accelerate it sideways as much (without a gyroscope the lagging gravity
 * estimate also shows a wrist turn as sideways acceleration).
 */
export const SQUAT_MAX_SIDEWAYS_RATIO = 1.3;
/**
 * With the arms held forward the hips go back and the torso leans, so the wrists also travel
 * forward and back (about half the vertical travel): sideways jitter below this never rejects a
 * squat, m/s².
 */
const SIDEWAYS_FLOOR = 1.5;

export function createSquatStrategy() {
  let sx = 0;
  let sy = 0;
  let sz = 1;
  let maxTilt = 0;
  let vertPeak = 0;
  let horizPeak = 0;
  return {
    exerciseType: ExerciseType.SQUAT,
    signal: function (f) {
      return f.depth;
    },
    ready: function () {},
    begin: function (f) {
      sx = f.ux;
      sy = f.uy;
      sz = f.uz;
      maxTilt = 0;
      vertPeak = 0;
      horizPeak = 0;
    },
    track: function (f) {
      const v = f.vertAcc < 0 ? -f.vertAcc : f.vertAcc;
      if (v > vertPeak) {
        vertPeak = v;
      }
      if (f.horizAcc > horizPeak) {
        horizPeak = f.horizAcc;
      }
      const tilt = angleDeg(f.ux, f.uy, f.uz, sx, sy, sz);
      if (tilt > maxTilt) {
        maxTilt = tilt;
      }
    },
    /** '' when the cycle looks like a squat, otherwise the rejection reason. */
    reject: function () {
      if (maxTilt > SQUAT_MAX_TILT_DEG) {
        return 'wrist turned ' + Math.round(maxTilt) + ' deg';
      }
      if (horizPeak > SIDEWAYS_FLOOR && horizPeak > vertPeak * SQUAT_MAX_SIDEWAYS_RATIO) {
        return 'sideways ' + horizPeak.toFixed(1) + ' vs ' + vertPeak.toFixed(1) + ' m/s2';
      }
      return '';
    },
    stats: function () {
      return { tiltDeg: maxTilt, vertPeak: vertPeak, horizPeak: horizPeak };
    }
  };
}
