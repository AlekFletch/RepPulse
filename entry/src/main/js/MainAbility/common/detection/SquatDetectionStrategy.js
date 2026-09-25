import { ExerciseType } from '../domain/enums.js';
import { angleDeg } from './FeatureExtractor.js';

/**
 * Squat, arms held forward at chest height: the wrist travels down and up with the shoulders
 * (a few cm for a shallow dip, ~0.2–0.4 m to parallel), the forearm barely turns.
 *   signal     estimated depth of the wrist, metres (FeatureExtractor.depth)
 *   rejection  a cycle whose wrist orientation turned more than SQUAT_MAX_TILT_DEG is an arm
 *              movement (wave, raise, reaching), not a squat; walking moves the wrist only a few
 *              cm vertically and never reaches the amplitude threshold. Sideways acceleration is
 *              not checked any more: a bump of the arm at the bottom rejected real squats on the
 *              watch ("sideways 2.4 vs 1.6", 2026-09-25), and turns are handled by the
 *              FeatureExtractor.
 */
export const SQUAT_MAX_TILT_DEG = 45;
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
      return '';
    },
    stats: function () {
      return { tiltDeg: maxTilt, vertPeak: vertPeak, horizPeak: horizPeak };
    }
  };
}
