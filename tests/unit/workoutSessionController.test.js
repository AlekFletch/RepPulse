import { WorkoutMode, WorkoutStatus as S, ExerciseType, SetEndReason } from '../../entry/src/main/js/MainAbility/common/domain/enums.js';
import { createWorkoutPlan } from '../../entry/src/main/js/MainAbility/common/domain/models.js';
import { createWorkoutSessionController } from '../../entry/src/main/js/MainAbility/common/workout/WorkoutSessionController.js';
import { createCountdownController } from '../../entry/src/main/js/MainAbility/common/workout/CountdownController.js';
import { createRestTimerController } from '../../entry/src/main/js/MainAbility/common/workout/RestTimerController.js';
import { createHapticFeedbackController } from '../../entry/src/main/js/MainAbility/common/workout/HapticFeedbackController.js';
import { createNullRepDetector } from '../../entry/src/main/js/MainAbility/common/detection/RepDetector.js';
import { finalizeSession } from '../../entry/src/main/js/MainAbility/common/domain/stats.js';
import { SensorErrorCode } from '../../entry/src/main/js/MainAbility/common/sensors/SensorError.js';
import { createFakeTimeAdapter } from '../mocks/FakeTimeAdapter.js';

/** Sensor provider driven by the test: emit() delivers a sample while running. */
function fakeSensors() {
  let onSample = null;
  let onError = null;
  return {
    starts: 0,
    start(s, e) { onSample = s; onError = e; this.starts++; },
    stop() { onSample = null; onError = null; },
    isRunning() { return onSample !== null; },
    getCapabilities() { return {}; },
    emit(sample) { if (onSample) { onSample(sample || {}); } },
    fail(code) { if (onError) { onError({ code: code }); } }
  };
}

/** Every sample marked { rep: true } is a confirmed rep with confidence 0.8. */
function scriptedDetector() {
  return {
    resets: 0,
    reset() { this.resets++; },
    process(sample) { return sample.rep ? { detected: true, confidence: 0.8 } : null; }
  };
}

function fakeHaptics() {
  const calls = [];
  const h = {};
  ['workoutStart', 'rep', 'setComplete', 'restWarning', 'restEnd', 'workoutComplete', 'cancel'].forEach((name) => {
    h[name] = () => calls.push(name);
  });
  h.calls = calls;
  return h;
}

function setup(planInput, options) {
  const opts = options || {};
  const time = createFakeTimeAdapter(0);
  const sensors = fakeSensors();
  const detector = scriptedDetector();
  const haptics = fakeHaptics();
  const states = [];
  const plan = createWorkoutPlan(Object.assign({
    exerciseType: ExerciseType.SQUAT, wristSide: 'LEFT', vibrationOnRep: true
  }, planInput), 'p1', 0);
  const ctrl = createWorkoutSessionController({
    plan: plan,
    sessionId: 's1',
    time: time,
    sensors: opts.noSensors ? null : sensors,
    detector: detector,
    haptics: haptics,
    countdownEnabled: opts.countdown !== false,
    onState: (s) => states.push(s)
  });
  const rep = () => sensors.emit({ rep: true });
  return { time, sensors, detector, haptics, states, ctrl, rep, last: () => states[states.length - 1] };
}

describe('WorkoutSessionController', () => {
  test('free mode: 3-2-1, start vibration; sensors warm up during the countdown without counting', () => {
    const t = setup({ mode: WorkoutMode.FREE });
    t.ctrl.start();
    expect(t.ctrl.getStatus()).toBe(S.PREPARING);
    expect(t.last().countdown).toBe(3);
    expect(t.sensors.isRunning()).toBe(true);
    t.rep();
    expect(t.last().reps).toBe(0);
    t.time.advance(2000);
    expect(t.last().countdown).toBe(1);
    t.time.advance(1000);
    expect(t.ctrl.getStatus()).toBe(S.ACTIVE);
    expect(t.haptics.calls).toEqual(['workoutStart']);
    expect(t.sensors.isRunning()).toBe(true);
    expect(t.detector.resets).toBe(1);
  });

  test('countdown off starts immediately', () => {
    const t = setup({ mode: WorkoutMode.FREE }, { countdown: false });
    t.ctrl.start();
    expect(t.ctrl.getStatus()).toBe(S.ACTIVE);
  });

  test('ignores motion for 750 ms after start and resume', () => {
    const t = setup({ mode: WorkoutMode.FREE }, { countdown: false });
    t.ctrl.start();
    t.rep();
    expect(t.last().reps).toBe(0);
    t.time.advance(750);
    t.rep();
    expect(t.last().reps).toBe(1);
    expect(t.haptics.calls).toContain('rep');
    t.ctrl.pause();
    t.ctrl.resume();
    t.rep();
    expect(t.last().reps).toBe(1);
    t.time.advance(800);
    t.rep();
    expect(t.last().reps).toBe(2);
  });

  test('pause stops sensors and the clock; no reps counted while paused', () => {
    const t = setup({ mode: WorkoutMode.FREE }, { countdown: false });
    t.ctrl.start();
    t.time.advance(10000);
    t.ctrl.pause();
    expect(t.sensors.isRunning()).toBe(false);
    t.rep();
    t.time.advance(30000);
    expect(t.ctrl.snapshot().activeSec).toBeCloseTo(10, 5);
    t.ctrl.resume();
    t.time.advance(5000);
    expect(t.ctrl.snapshot().activeSec).toBeCloseTo(15, 5);
  });

  test('manual adjustment on pause, never below zero, kept separately', () => {
    const t = setup({ mode: WorkoutMode.FREE }, { countdown: false });
    t.ctrl.start();
    t.time.advance(1000);
    t.rep();
    t.ctrl.adjust(1);
    expect(t.last().reps).toBe(1);
    t.ctrl.pause();
    t.ctrl.adjust(-1);
    t.ctrl.adjust(-1);
    expect(t.last().reps).toBe(0);
    t.ctrl.adjust(1);
    t.ctrl.adjust(1);
    t.ctrl.finish();
    const session = t.ctrl.getSession();
    expect(session.sets[0]).toMatchObject({ autoReps: 1, manualAdjustment: 1, totalReps: 2, endedBy: SetEndReason.MANUAL });
    expect(session.status).toBe(S.COMPLETED);
    // Totals are computed by the summary page (finalizeSession), not by the controller.
    finalizeSession(session, session.finishedAt);
    expect(session).toMatchObject({ totalReps: 2, totalAutoReps: 1, totalManualAdjustment: 1, status: S.COMPLETED });
  });

  test('timer mode ends by time with a strong vibration', () => {
    const t = setup({ mode: WorkoutMode.TIMER, workDurationSec: 30 }, { countdown: false });
    t.ctrl.start();
    t.time.advance(10000);
    expect(t.last().workRemainingSec).toBe(20);
    t.time.advance(20250);
    expect(t.ctrl.getStatus()).toBe(S.COMPLETED);
    expect(t.sensors.isRunning()).toBe(false);
    expect(t.haptics.calls).toContain('workoutComplete');
    expect(t.ctrl.getSession().sets[0].endedBy).toBe(SetEndReason.TIME);
    expect(finalizeSession(t.ctrl.getSession(), 0).activeDurationSec).toBeCloseTo(30, 0);
    expect(t.time.pendingTimers()).toBe(0);
  });

  test('sets: target reps end the set -> RESTING, the controller stops for the rest page', () => {
    const t = setup({ mode: WorkoutMode.SETS, setCount: 2, targetReps: 3, restDurationSec: 10, autoStartNextSet: true });
    t.ctrl.start();
    t.time.advance(3000 + 750);
    t.rep(); t.rep(); t.rep();
    expect(t.ctrl.getStatus()).toBe(S.RESTING);
    expect(t.last()).toMatchObject({ lastEndedBy: SetEndReason.TARGET_REPS, setNumber: 2, setCount: 2 });
    expect(t.last().lastSet).toMatchObject({ setNumber: 1, totalReps: 3 });
    expect(t.haptics.calls).toContain('setComplete');
    expect(t.sensors.isRunning()).toBe(false);
    expect(t.time.pendingTimers()).toBe(0);
  });

  test('continuing a saved session runs the next set and completes the workout', () => {
    const first = setup({ mode: WorkoutMode.SETS, setCount: 2, targetReps: 3, restDurationSec: 10 }, { countdown: false });
    first.ctrl.start();
    first.time.advance(750);
    first.rep(); first.rep(); first.rep();
    // The rest page adds the rest it measured, then the workout page continues the same session.
    const saved = JSON.parse(JSON.stringify(first.ctrl.getSession()));
    saved.restDurationSec += 12;
    const time = createFakeTimeAdapter(60000);
    const sensors = fakeSensors();
    const haptics = fakeHaptics();
    const ctrl = createWorkoutSessionController({
      plan: saved.plan, session: saved, time: time, sensors: sensors, detector: scriptedDetector(),
      haptics: haptics, countdownEnabled: true
    });
    expect(ctrl.snapshot().setNumber).toBe(2);
    ctrl.start();
    time.advance(3000 + 750);
    expect(ctrl.snapshot()).toMatchObject({ status: S.ACTIVE, setNumber: 2 });
    sensors.emit({ rep: true }); sensors.emit({ rep: true }); sensors.emit({ rep: true });
    expect(ctrl.getStatus()).toBe(S.COMPLETED);
    const session = finalizeSession(ctrl.getSession(), time.now());
    expect(session.sets.length).toBe(2);
    expect(session).toMatchObject({ totalReps: 6, restDurationSec: 12, status: S.COMPLETED });
    expect(session.sets[0].avgConfidence).toBeCloseTo(0.8, 5);
    expect(haptics.calls).toContain('workoutComplete');
  });

  test('sets: reps and time both set, the first reached wins and is reported', () => {
    const t = setup({
      mode: WorkoutMode.SETS, setCount: 3, targetReps: 50, workDurationSec: 20, restDurationSec: 30
    }, { countdown: false });
    t.ctrl.start();
    t.time.advance(20250);
    expect(t.last()).toMatchObject({ status: S.RESTING, lastEndedBy: SetEndReason.TIME });
  });

  test('finish before any set cancels; hiding the page pauses', () => {
    const a = setup({ mode: WorkoutMode.FREE });
    a.ctrl.start();
    a.ctrl.finish();
    expect(a.ctrl.getStatus()).toBe(S.CANCELLED);

    const b = setup({ mode: WorkoutMode.FREE });
    b.ctrl.start();
    b.ctrl.onHide();
    expect(b.ctrl.getStatus()).toBe(S.PAUSED);
    b.ctrl.resume();
    expect(b.ctrl.getStatus()).toBe(S.PREPARING);
    b.time.advance(3000);
    b.ctrl.onHide();
    expect(b.ctrl.getStatus()).toBe(S.PAUSED);
    expect(b.sensors.isRunning()).toBe(false);
  });

  test('accelerometer failure switches to manual counting; no sensors works too', () => {
    const t = setup({ mode: WorkoutMode.FREE }, { countdown: false });
    t.ctrl.start();
    t.sensors.fail(SensorErrorCode.GYRO_UNAVAILABLE);
    expect(t.ctrl.snapshot().autoCount).toBe(true);
    t.sensors.fail(SensorErrorCode.ACCEL_TIMEOUT);
    expect(t.last().autoCount).toBe(false);

    const m = setup({ mode: WorkoutMode.FREE }, { countdown: false, noSensors: true });
    m.ctrl.start();
    expect(m.last().autoCount).toBe(false);
    m.ctrl.simulateRep();
    expect(m.last().reps).toBe(1);
  });

  test('cadence appears after 5 s of activity', () => {
    const t = setup({ mode: WorkoutMode.FREE }, { countdown: false });
    t.ctrl.start();
    t.time.advance(1000);
    t.rep();
    expect(t.last().cadence).toBeUndefined();
    t.time.advance(5000);
    expect(t.ctrl.snapshot().cadence).toBeCloseTo(10, 5);
  });

  test('destroy releases every timer', () => {
    const t = setup({ mode: WorkoutMode.SETS, setCount: 2, targetReps: 1, restDurationSec: 30 });
    t.ctrl.start();
    t.time.advance(3000);
    t.ctrl.destroy();
    expect(t.time.pendingTimers()).toBe(0);
  });
});

describe('CountdownController / RestTimerController', () => {
  test('countdown ticks 3,2,1 then done; cancel stops it', () => {
    const time = createFakeTimeAdapter(0);
    const cd = createCountdownController(time);
    const ticks = [];
    let done = 0;
    cd.start(3, (n) => ticks.push(n), () => done++);
    time.advance(3000);
    expect(ticks).toEqual([3, 2, 1]);
    expect(done).toBe(1);
    cd.start(3, () => {}, () => done++);
    cd.cancel();
    time.advance(5000);
    expect(done).toBe(1);
  });

  test('rest timer: warnings at 3,2,1, extend re-arms them', () => {
    const time = createFakeTimeAdapter(0);
    const rest = createRestTimerController(time);
    const warnings = [];
    let done = 0;
    rest.start(5, { onTick() {}, onWarning: (s) => warnings.push(s), onDone: () => done++ });
    time.advance(2500);
    expect(warnings).toEqual([3]);
    rest.extend(15);
    expect(rest.remainingSec()).toBe(18);
    time.advance(18000);
    expect(warnings).toEqual([3, 3, 2, 1]);
    expect(done).toBe(1);
    expect(time.pendingTimers()).toBe(0);
  });
});

describe('HapticFeedbackController', () => {
  function adapter() {
    const calls = [];
    return { calls, vibrate: (m) => calls.push(m), sequence: (m) => calls.push(m.join('+')), cancelPending() {} };
  }

  test('per-rep pulse needs vibrationOnRep; everything is silent when vibration is off', () => {
    const a = adapter();
    const on = createHapticFeedbackController(a, { vibrationEnabled: true, vibrationOnRep: false });
    on.rep();
    on.workoutStart();
    on.workoutComplete();
    expect(a.calls).toEqual(['long', 'long+long']);
    const b = adapter();
    const off = createHapticFeedbackController(b, { vibrationEnabled: false, vibrationOnRep: true });
    off.rep(); off.restWarning(); off.workoutComplete();
    expect(b.calls).toEqual([]);
  });

  test('null detector never reports a rep', () => {
    const d = createNullRepDetector();
    d.reset();
    expect(d.process({})).toBeNull();
  });
});
