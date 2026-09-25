import { buildScenario, MotionType, Pose } from './motionSynth.js';

/**
 * Ready-made scenarios from the spec (section 7). Each returns buildScenario() output:
 * { samples, truth: { reps, expectedReps }, durationMs, meta }.
 * `options` is passed through to buildScenario (seed, wristSide, hasGyro, noise, ...).
 */
const LEAD_IN_MS = 1500;
const TAIL_MS = 1000;

function framed(segments, pose) {
  const list = [{ type: MotionType.IDLE, durationMs: LEAD_IN_MS, pose: pose }];
  for (let i = 0; i < segments.length; i++) {
    list.push(segments[i]);
  }
  list.push({ type: MotionType.IDLE, durationMs: TAIL_MS, pose: pose });
  return list;
}

export function squatSeries(reps, options, squatSpec) {
  const spec = { type: MotionType.SQUAT, reps: reps };
  copyInto(spec, squatSpec);
  return buildScenario(framed([spec], spec.pose || Pose.ARMS_FORWARD), options);
}

export function pushUpSeries(reps, options, pushUpSpec) {
  const spec = { type: MotionType.PUSH_UP, reps: reps };
  copyInto(spec, pushUpSpec);
  return buildScenario(framed([spec], spec.pose || Pose.PUSH_UP_TOP), options);
}

export function fastSquats(reps, options) {
  return squatSeries(reps, options, { repDurationMs: 1200 });
}

export function slowSquats(reps, options) {
  return squatSeries(reps, options, { repDurationMs: 4000 });
}

export function fastPushUps(reps, options) {
  return pushUpSeries(reps, options, { repDurationMs: 1000 });
}

export function slowPushUps(reps, options) {
  return pushUpSeries(reps, options, { repDurationMs: 3500 });
}

/** A knee bend of ~3 cm: since 2026-09-25 any clear dip of the arms-forward posture is a squat. */
export function incompleteSquat(options) {
  return squatSeries(1, options, { partial: true, partialFactor: 0.06 });
}

export function incompletePushUp(options) {
  return pushUpSeries(1, options, { partial: true });
}

export function walking(durationMs, options) {
  return buildScenario([
    { type: MotionType.IDLE, durationMs: 1000, pose: Pose.ARM_HANGING },
    { type: MotionType.WALK, durationMs: durationMs || 10000 },
    { type: MotionType.IDLE, durationMs: 1000, pose: Pose.ARM_HANGING }
  ], options);
}

export function armWave(count, options) {
  return buildScenario([
    { type: MotionType.IDLE, durationMs: 1000, pose: Pose.ARM_HANGING },
    { type: MotionType.ARM_WAVE, count: count || 1 },
    { type: MotionType.IDLE, durationMs: 1000, pose: Pose.ARM_HANGING }
  ], options);
}

export function armRaise(options) {
  return buildScenario([
    { type: MotionType.IDLE, durationMs: 1000, pose: Pose.ARM_HANGING },
    { type: MotionType.ARM_RAISE },
    { type: MotionType.IDLE, durationMs: 1000, pose: Pose.ARMS_FORWARD }
  ], options);
}

export function floorShift(options) {
  return buildScenario(framed([{ type: MotionType.FLOOR_SHIFT }], Pose.PUSH_UP_TOP), options);
}

export function strapAdjust(options) {
  return buildScenario(framed([{ type: MotionType.STRAP_ADJUST }], Pose.ARMS_FORWARD), options);
}

export function torsoTurn(options) {
  return buildScenario(framed([{ type: MotionType.TORSO_TURN }], Pose.ARMS_FORWARD), options);
}

/** Stationary watch with heavy sensor noise. */
export function noiseOnly(durationMs, options) {
  const opts = { accelNoise: 0.35, gyroNoise: 0.08 };
  copyInto(opts, options);
  return buildScenario([{ type: MotionType.IDLE, durationMs: durationMs || 8000 }], opts);
}

/** Squats interrupted by false motions: only the full squats should count. */
export function squatsWithDistractions(options) {
  return buildScenario([
    { type: MotionType.IDLE, durationMs: LEAD_IN_MS },
    { type: MotionType.SQUAT, reps: 3 },
    { type: MotionType.STRAP_ADJUST, pose: Pose.ARMS_FORWARD },
    { type: MotionType.SQUAT, reps: 1, partial: true },
    { type: MotionType.TORSO_TURN },
    { type: MotionType.SQUAT, reps: 3, pauseBetweenMs: 1500 },
    { type: MotionType.IDLE, durationMs: TAIL_MS }
  ], options);
}

/** Push-ups with a hand reposition in the middle. */
export function pushUpsWithFloorShift(options) {
  return buildScenario([
    { type: MotionType.IDLE, durationMs: LEAD_IN_MS, pose: Pose.PUSH_UP_TOP },
    { type: MotionType.PUSH_UP, reps: 4 },
    { type: MotionType.FLOOR_SHIFT },
    { type: MotionType.PUSH_UP, reps: 1, partial: true },
    { type: MotionType.PUSH_UP, reps: 4 },
    { type: MotionType.IDLE, durationMs: TAIL_MS, pose: Pose.PUSH_UP_TOP }
  ], options);
}

function copyInto(target, source) {
  if (!source) {
    return target;
  }
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
  return target;
}
