import { ExerciseType } from '../domain/enums.js';
import { angleDeg } from './FeatureExtractor.js';
import { lowPassGain } from './SignalFilter.js';

/** How fast the "top position" orientation follows the watch while no push-up is in progress. */
const REFERENCE_TAU_S = 1.0;
/**
 * The wrist stays on the floor, so a push-up barely accelerates the watch. Walking (arm swing),
 * a wave or moving the hand accelerates it by several m/s².
 */
export const PUSH_UP_MAX_LIN_ACC = 3.0;

/**
 * Classic floor push-up: the hand stays on the floor and the forearm rotates about the wrist as
 * the chest goes down, so the watch barely moves but tilts (~20–40°).
 *   signal     angle between the current gravity direction and the top-position reference, deg
 *   reference  follows the watch slowly while READY (hand repositioned, body shifted), frozen
 *              during a cycle
 *   rejection  the watch moved (linear acceleration above PUSH_UP_MAX_LIN_ACC: walking, a wave,
 *              moving the hand); with a gyroscope, a cycle without real rotation (peak angular
 *              speed below minGyroThreshold) is a drift artefact
 */
export function createPushUpStrategy() {
  let rx = 0;
  let ry = 0;
  let rz = 1;
  let hasRef = false;
  let gyroPeak = 0;
  let linPeak = 0;
  let sawGyro = false;
  let minGyro = 0;
  return {
    exerciseType: ExerciseType.PUSH_UP,
    setMinGyro: function (value) {
      minGyro = value;
    },
    signal: function (f) {
      if (!hasRef) {
        rx = f.ux;
        ry = f.uy;
        rz = f.uz;
        hasRef = true;
      }
      return angleDeg(f.ux, f.uy, f.uz, rx, ry, rz);
    },
    ready: function (f) {
      const k = lowPassGain(f.dtS, REFERENCE_TAU_S);
      rx += (f.ux - rx) * k;
      ry += (f.uy - ry) * k;
      rz += (f.uz - rz) * k;
      const n = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      rx /= n;
      ry /= n;
      rz /= n;
    },
    begin: function () {
      gyroPeak = 0;
      linPeak = 0;
      sawGyro = false;
    },
    track: function (f, hasGyro) {
      if (f.linAcc > linPeak) {
        linPeak = f.linAcc;
      }
      if (hasGyro) {
        sawGyro = true;
        if (f.gyro > gyroPeak) {
          gyroPeak = f.gyro;
        }
      }
    },
    reject: function () {
      if (linPeak > PUSH_UP_MAX_LIN_ACC) {
        return 'watch moved ' + linPeak.toFixed(1) + ' m/s2';
      }
      return sawGyro && gyroPeak < minGyro ? 'no rotation (' + gyroPeak.toFixed(2) + ' rad/s)' : '';
    },
    stats: function () {
      return { gyroPeak: gyroPeak, linPeak: linPeak };
    },
    resetReference: function () {
      hasRef = false;
    }
  };
}
