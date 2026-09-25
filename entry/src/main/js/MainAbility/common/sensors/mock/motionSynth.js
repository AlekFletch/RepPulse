import { createRandom } from './prng.js';
import { createSensorSample } from '../SensorSample.js';
import { ExerciseType, WristSide } from '../../domain/enums.js';

/**
 * Synthetic wrist-motion generator for tests and the simulator.
 *
 * Model: each motion segment describes the wrist pose over time in a world frame
 * (position x/y/z in metres, z up; pitch/roll of the watch in radians). The generator
 * differentiates the pose numerically and produces what a watch IMU would read:
 *   accelerometer = R^T · (a_kinematic + [0, 0, g])   (specific force, device frame)
 *   gyroscope     = angular velocity in the device frame
 * with R = Ry(roll) · Rx(pitch) (device -> world). Gaussian noise and timing jitter are
 * added from a seeded PRNG so every scenario is reproducible.
 *
 * This is a simplified physical model meant to exercise the detection pipeline;
 * it is not a substitute for real sensor logs recorded on the Watch Fit 4.
 */

export const GRAVITY = 9.81;
const DEG = Math.PI / 180;
const DIFF_STEP_S = 0.005;

export const MotionType = Object.freeze({
  IDLE: 'idle',
  SQUAT: 'squat',
  PUSH_UP: 'pushUp',
  WALK: 'walk',
  ARM_WAVE: 'armWave',
  ARM_RAISE: 'armRaise',
  FLOOR_SHIFT: 'floorShift',
  STRAP_ADJUST: 'strapAdjust',
  TORSO_TURN: 'torsoTurn'
});

/** Base wrist poses (angles in degrees for readability). */
export const Pose = Object.freeze({
  /** Squat, arms extended forward, watch face up: gravity on +z. */
  ARMS_FORWARD: Object.freeze({ pitch: 0, roll: 0 }),
  /** Squat, hands together at the chest, watch face sideways. */
  HANDS_AT_CHEST: Object.freeze({ pitch: 0, roll: 80 }),
  /** Squat, hands on hips. */
  HANDS_ON_HIPS: Object.freeze({ pitch: -60, roll: 30 }),
  /** Push-up top position: forearm vertical, gravity along the forearm (+y). */
  PUSH_UP_TOP: Object.freeze({ pitch: 90, roll: 0 }),
  /** Standing, arm hanging down. */
  ARM_HANGING: Object.freeze({ pitch: -90, roll: 0 })
});

function smoothStep(u) {
  if (u <= 0) {
    return 0;
  }
  if (u >= 1) {
    return 1;
  }
  return (1 - Math.cos(Math.PI * u)) / 2;
}

/**
 * Rep depth profile over one repetition, u in [0, 1] -> depth in [0, 1]:
 * descent 45 %, bottom hold 10 %, ascent 45 %.
 */
export function repProfile(u) {
  if (u <= 0 || u >= 1) {
    return 0;
  }
  if (u < 0.45) {
    return smoothStep(u / 0.45);
  }
  if (u < 0.55) {
    return 1;
  }
  return 1 - smoothStep((u - 0.55) / 0.45);
}

function pitchAdd(delta) {
  this.pitch += delta;
  return this;
}

/** Pose in radians; pitchAdd(rad) lets builders express "base pose + extra pitch". */
function makePose(x, y, z, pitchDeg, rollDeg) {
  return { x: x, y: y, z: z, pitch: pitchDeg * DEG, roll: rollDeg * DEG, pitchAdd: pitchAdd };
}

function basePose(poseDef) {
  return makePose(0, 0, 0, poseDef.pitch, poseDef.roll);
}

/**
 * Lays out `reps` repetitions with individual durations (seeded variation) and optional
 * pauses between them. Returns [{ start, end }] in ms relative to the segment start.
 */
function layoutReps(reps, repDurationMs, pauseBetweenMs, variation, rnd) {
  const windows = [];
  let t = 0;
  for (let i = 0; i < reps; i++) {
    const factor = 1 + rnd.uniform(-variation, variation);
    const duration = Math.max(200, repDurationMs * factor);
    windows.push({ start: t, end: t + duration });
    t += duration + pauseBetweenMs;
  }
  return windows;
}

function repDepthAt(windows, tMs) {
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (tMs >= w.start && tMs <= w.end) {
      return repProfile((tMs - w.start) / (w.end - w.start));
    }
  }
  return 0;
}

function windowsEnd(windows, pauseBetweenMs) {
  if (windows.length === 0) {
    return 0;
  }
  return windows[windows.length - 1].end + pauseBetweenMs;
}

// ---------------------------------------------------------------------------
// Segment builders. Each returns:
//   { type, durationMs, poseAt(tMs) -> pose, reps: [{ start, end, counted, exerciseType }] }
// ---------------------------------------------------------------------------

function buildIdle(spec) {
  const pose = basePose(spec.pose || Pose.ARMS_FORWARD);
  return {
    durationMs: spec.durationMs || 1000,
    poseAt: function () {
      return pose;
    },
    reps: []
  };
}

function buildSquat(spec, rnd) {
  const reps = spec.reps || 1;
  const depthM = typeof spec.depthM === 'number' ? spec.depthM : 0.45;
  const partial = spec.partial === true;
  const depth = partial ? depthM * (spec.partialFactor || 0.3) : depthM;
  const pitchSwing = (typeof spec.pitchSwingDeg === 'number' ? spec.pitchSwingDeg : 8) * DEG;
  // Hips go back and the torso leans: arms held forward also travel forward and back.
  const forward = (typeof spec.forwardM === 'number' ? spec.forwardM : 0.05) * (partial ? depth / depthM : 1);
  const pauseMs = spec.pauseBetweenMs || 0;
  const windows = layoutReps(reps, spec.repDurationMs || 2200, pauseMs, spec.variation || 0.08, rnd);
  const poseDef = spec.pose || Pose.ARMS_FORWARD;
  // The arms slowly sink and rise again over a set (tired arms): the watch orientation drifts.
  const drift = (spec.postureDriftDeg || 0) * DEG;
  const driftPeriodMs = spec.postureDriftPeriodMs || 12000;
  return {
    durationMs: windowsEnd(windows, pauseMs) + 200,
    poseAt: function (t) {
      const d = repDepthAt(windows, t);
      // Wrist travels down with the hips; the forearm tilts slightly for balance.
      return makePose(0, forward * d, -depth * d, poseDef.pitch, poseDef.roll + drift * 0.5 * Math.sin(2 * Math.PI * t / (driftPeriodMs * 1.3)))
        .pitchAdd(pitchSwing * d + drift * Math.sin(2 * Math.PI * t / driftPeriodMs));
    },
    reps: mapReps(windows, ExerciseType.SQUAT, !partial)
  };
}

function buildPushUp(spec, rnd) {
  const reps = spec.reps || 1;
  const tiltDeg = typeof spec.tiltDeg === 'number' ? spec.tiltDeg : 30;
  const partial = spec.partial === true;
  const tilt = (partial ? tiltDeg * (spec.partialFactor || 0.3) : tiltDeg) * DEG;
  const lift = typeof spec.wristLiftM === 'number' ? spec.wristLiftM : 0.01;
  const pauseMs = spec.pauseBetweenMs || 0;
  const windows = layoutReps(reps, spec.repDurationMs || 1800, pauseMs, spec.variation || 0.08, rnd);
  const poseDef = spec.pose || Pose.PUSH_UP_TOP;
  return {
    durationMs: windowsEnd(windows, pauseMs) + 200,
    poseAt: function (t) {
      const d = repDepthAt(windows, t);
      // The hand stays on the floor: the forearm rotates about the wrist as the chest lowers.
      return makePose(0, 0, -lift * d, poseDef.pitch, poseDef.roll).pitchAdd(-tilt * d);
    },
    reps: mapReps(windows, ExerciseType.PUSH_UP, !partial)
  };
}

function buildWalk(spec) {
  const stepHz = spec.stepHz || 1.8;
  const swing = (spec.swingDeg || 20) * DEG;
  const poseDef = spec.pose || Pose.ARM_HANGING;
  return {
    durationMs: spec.durationMs || 8000,
    poseAt: function (t) {
      const s = t / 1000;
      const armPhase = 2 * Math.PI * (stepHz / 2) * s;
      const bob = 0.025 * Math.sin(2 * Math.PI * stepHz * s);
      const swingOffset = 0.2 * Math.sin(armPhase);
      // Constant walking speed adds no acceleration, so only arm swing and body bob are modelled.
      return makePose(swingOffset, 0, bob, poseDef.pitch, poseDef.roll)
        .pitchAdd(swing * Math.sin(armPhase));
    },
    reps: []
  };
}

function buildArmWave(spec) {
  const count = spec.count || 1;
  const waveMs = spec.waveDurationMs || 600;
  const amp = (spec.amplitudeDeg || 70) * DEG;
  const poseDef = spec.pose || Pose.ARM_HANGING;
  const gapMs = spec.gapMs || 400;
  return {
    durationMs: count * (waveMs + gapMs) + 200,
    poseAt: function (t) {
      const cycle = waveMs + gapMs;
      const local = t % cycle;
      const inWave = Math.floor(t / cycle) < count && local <= waveMs;
      const u = inWave ? Math.sin(Math.PI * local / waveMs) : 0;
      return makePose(0.3 * u, 0, 0.35 * u, poseDef.pitch, poseDef.roll).pitchAdd(amp * u);
    },
    reps: []
  };
}

function buildArmRaise(spec) {
  const raiseMs = spec.raiseDurationMs || 800;
  const holdMs = spec.holdMs || 1200;
  const from = spec.fromPose || Pose.ARM_HANGING;
  const to = spec.toPose || Pose.ARMS_FORWARD;
  return {
    durationMs: raiseMs + holdMs,
    poseAt: function (t) {
      const u = smoothStep(t / raiseMs);
      return makePose(
        0.5 * u, 0, 0.55 * u,
        from.pitch + (to.pitch - from.pitch) * u,
        from.roll + (to.roll - from.roll) * u
      );
    },
    reps: []
  };
}

function buildFloorShift(spec) {
  const moveMs = spec.moveDurationMs || 700;
  const poseDef = spec.pose || Pose.PUSH_UP_TOP;
  const lateral = typeof spec.lateralM === 'number' ? spec.lateralM : 0.12;
  const rollDeg = typeof spec.rollDeg === 'number' ? spec.rollDeg : 15;
  return {
    durationMs: moveMs + 500,
    poseAt: function (t) {
      const u = smoothStep(t / moveMs);
      const liftU = Math.sin(Math.PI * Math.min(1, t / moveMs));
      return makePose(lateral * u, 0, 0.06 * liftU, poseDef.pitch, poseDef.roll + rollDeg * liftU);
    },
    reps: []
  };
}

function buildStrapAdjust(spec) {
  const poseDef = spec.pose || Pose.ARMS_FORWARD;
  return {
    durationMs: spec.durationMs || 1500,
    poseAt: function (t) {
      const s = t / 1000;
      return makePose(
        0.004 * Math.sin(2 * Math.PI * 7 * s), 0.003 * Math.sin(2 * Math.PI * 5 * s), 0,
        poseDef.pitch + 6 * Math.sin(2 * Math.PI * 3 * s),
        poseDef.roll + 10 * Math.sin(2 * Math.PI * 4 * s)
      );
    },
    reps: []
  };
}

function buildTorsoTurn(spec) {
  const turnMs = spec.turnDurationMs || 1400;
  const amp = spec.rollDeg || 35;
  const poseDef = spec.pose || Pose.ARMS_FORWARD;
  return {
    durationMs: turnMs + 300,
    poseAt: function (t) {
      const u = Math.sin(Math.PI * Math.min(1, t / turnMs));
      return makePose(0.25 * u, 0.1 * u, 0, poseDef.pitch, poseDef.roll + amp * u);
    },
    reps: []
  };
}

function mapReps(windows, exerciseType, counted) {
  const out = [];
  for (let i = 0; i < windows.length; i++) {
    out.push({ start: windows[i].start, end: windows[i].end, counted: counted, exerciseType: exerciseType });
  }
  return out;
}

const BUILDERS = {};
BUILDERS[MotionType.IDLE] = buildIdle;
BUILDERS[MotionType.SQUAT] = buildSquat;
BUILDERS[MotionType.PUSH_UP] = buildPushUp;
BUILDERS[MotionType.WALK] = buildWalk;
BUILDERS[MotionType.ARM_WAVE] = buildArmWave;
BUILDERS[MotionType.ARM_RAISE] = buildArmRaise;
BUILDERS[MotionType.FLOOR_SHIFT] = buildFloorShift;
BUILDERS[MotionType.STRAP_ADJUST] = buildStrapAdjust;
BUILDERS[MotionType.TORSO_TURN] = buildTorsoTurn;

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

/** World vector -> device frame: v_dev = Rx(-pitch) · Ry(-roll) · v. */
export function worldToDevice(v, pitch, roll) {
  const cr = Math.cos(-roll);
  const sr = Math.sin(-roll);
  const x1 = v[0] * cr + v[2] * sr;
  const y1 = v[1];
  const z1 = -v[0] * sr + v[2] * cr;
  const cp = Math.cos(-pitch);
  const sp = Math.sin(-pitch);
  return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
}

function blendPose(a, b, w) {
  return {
    x: a.x + (b.x - a.x) * w,
    y: a.y + (b.y - a.y) * w,
    z: a.z + (b.z - a.z) * w,
    pitch: a.pitch + (b.pitch - a.pitch) * w,
    roll: a.roll + (b.roll - a.roll) * w
  };
}

/**
 * Builds a scenario from segment specs, e.g.
 *   buildScenario([{ type: 'idle', durationMs: 1500 }, { type: 'squat', reps: 10 }], { seed: 7 })
 *
 * options:
 *   seed (1), sampleIntervalMs (20 = 'game'), jitterMs (1.5), dropRate (0),
 *   accelNoise (0.08 m/s^2), gyroNoise (0.02 rad/s), hasGyro (true),
 *   wristSide (LEFT; RIGHT mirrors the lateral axis), transitionMs (400)
 *
 * Returns { samples, truth: { reps, expectedReps }, durationMs, meta }.
 */
export function buildScenario(segmentSpecs, options) {
  const opts = options || {};
  const rnd = createRandom(typeof opts.seed === 'number' ? opts.seed : 1);
  const intervalMs = opts.sampleIntervalMs || 20;
  const jitterMs = typeof opts.jitterMs === 'number' ? opts.jitterMs : 1.5;
  const dropRate = opts.dropRate || 0;
  const accelNoise = typeof opts.accelNoise === 'number' ? opts.accelNoise : 0.08;
  const gyroNoise = typeof opts.gyroNoise === 'number' ? opts.gyroNoise : 0.02;
  const hasGyro = opts.hasGyro !== false;
  const mirror = opts.wristSide === WristSide.RIGHT;
  const transitionMs = typeof opts.transitionMs === 'number' ? opts.transitionMs : 400;
  // MEMS errors per axis: zero offset, m/s², and scale (1 = exact). Typical: ±0.2 m/s², ±2 %.
  const bias = opts.accelBias || [0, 0, 0];
  const scale = opts.accelScale || [1, 1, 1];

  const segments = [];
  const truthReps = [];
  let offset = 0;
  for (let i = 0; i < segmentSpecs.length; i++) {
    const spec = segmentSpecs[i];
    const builder = BUILDERS[spec.type];
    if (!builder) {
      throw new Error('Unknown motion type: ' + spec.type);
    }
    const seg = builder(spec, rnd);
    segments.push({ start: offset, end: offset + seg.durationMs, seg: seg });
    for (let r = 0; r < seg.reps.length; r++) {
      const rep = seg.reps[r];
      truthReps.push({
        start: offset + rep.start,
        end: offset + rep.end,
        counted: rep.counted,
        exerciseType: rep.exerciseType
      });
    }
    offset += seg.durationMs;
  }
  const totalMs = offset;

  function poseAt(tMs) {
    let idx = segments.length - 1;
    for (let i = 0; i < segments.length; i++) {
      if (tMs < segments[i].end) {
        idx = i;
        break;
      }
    }
    const current = segments[idx];
    const local = Math.max(0, tMs - current.start);
    const pose = current.seg.poseAt(Math.min(local, current.seg.durationMs));
    if (idx > 0 && local < transitionMs) {
      const prev = segments[idx - 1];
      const prevEnd = prev.seg.poseAt(prev.seg.durationMs);
      return blendPose(prevEnd, pose, smoothStep(local / transitionMs));
    }
    return pose;
  }

  const samples = [];
  const h = DIFF_STEP_S * 1000;
  let t = 0;
  while (t <= totalMs) {
    if (!(dropRate > 0 && rnd.next() < dropRate)) {
      const p0 = poseAt(t - h);
      const p1 = poseAt(t);
      const p2 = poseAt(t + h);
      const inv = 1 / (DIFF_STEP_S * DIFF_STEP_S);
      const accWorld = [
        (p2.x - 2 * p1.x + p0.x) * inv,
        (p2.y - 2 * p1.y + p0.y) * inv,
        (p2.z - 2 * p1.z + p0.z) * inv + GRAVITY
      ];
      const acc = worldToDevice(accWorld, p1.pitch, p1.roll);
      const pitchRate = (p2.pitch - p0.pitch) / (2 * DIFF_STEP_S);
      const rollRate = (p2.roll - p0.roll) / (2 * DIFF_STEP_S);
      // omega_dev = (pitch', roll' cos(pitch), -roll' sin(pitch)) for R = Ry(roll) Rx(pitch)
      const gyro = [pitchRate, rollRate * Math.cos(p1.pitch), -rollRate * Math.sin(p1.pitch)];

      let ax = acc[0] * scale[0] + bias[0] + rnd.gaussian(0, accelNoise);
      const ay = acc[1] * scale[1] + bias[1] + rnd.gaussian(0, accelNoise);
      const az = acc[2] * scale[2] + bias[2] + rnd.gaussian(0, accelNoise);
      const gx = gyro[0] + rnd.gaussian(0, gyroNoise);
      let gy = gyro[1] + rnd.gaussian(0, gyroNoise);
      let gz = gyro[2] + rnd.gaussian(0, gyroNoise);
      if (mirror) {
        // Reflection across the body's sagittal plane: x flips; y/z of the pseudo-vector flip.
        ax = -ax;
        gy = -gy;
        gz = -gz;
      }
      samples.push(createSensorSample(Math.round(t), ax, ay, az, gx, gy, gz, hasGyro));
    }
    t += Math.max(5, intervalMs + rnd.gaussian(0, jitterMs));
  }

  let expected = 0;
  for (let i = 0; i < truthReps.length; i++) {
    if (truthReps[i].counted) {
      expected++;
    }
  }

  return {
    samples: samples,
    truth: { reps: truthReps, expectedReps: expected },
    durationMs: totalMs,
    meta: {
      seed: typeof opts.seed === 'number' ? opts.seed : 1,
      sampleIntervalMs: intervalMs,
      wristSide: mirror ? WristSide.RIGHT : WristSide.LEFT,
      hasGyro: hasGyro
    }
  };
}
