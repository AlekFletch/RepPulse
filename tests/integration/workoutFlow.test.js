/**
 * Stage 5: whole flows through the real modules the pages use — synthetic sensor data, the
 * detection engine, WorkoutSessionController, the session handed between pages, totals, the
 * repositories on the mocked @system.file / @system.storage, and the rows the screens show.
 */
import storage from '@system.storage';
import file from '@system.file';
import { ExerciseType, WorkoutMode, WorkoutStatus } from '../../entry/src/main/js/MainAbility/common/domain/enums.js';
import { createWorkoutPlan } from '../../entry/src/main/js/MainAbility/common/domain/plan.js';
import { createCalibrationProfile, createDefaultSettings } from '../../entry/src/main/js/MainAbility/common/domain/models.js';
import { finalizeSession } from '../../entry/src/main/js/MainAbility/common/domain/stats.js';
import { createRepDetectionEngine } from '../../entry/src/main/js/MainAbility/common/detection/RepDetectionEngine.js';
import { createWorkoutSessionController } from '../../entry/src/main/js/MainAbility/common/workout/WorkoutSessionController.js';
import { squatSeries, pushUpSeries, walking } from '../../entry/src/main/js/MainAbility/common/sensors/mock/scenarios.js';
import { createSystemStorageAdapter } from '../../entry/src/main/js/MainAbility/common/storage/LocalStorageAdapter.js';
import { createWorkoutRepository } from '../../entry/src/main/js/MainAbility/common/storage/WorkoutRepository.js';
import { createSettingsRepository } from '../../entry/src/main/js/MainAbility/common/storage/SettingsRepository.js';
import { createCalibrationRepository } from '../../entry/src/main/js/MainAbility/common/storage/CalibrationRepository.js';
import { readLastSession, saveLastSession } from '../../entry/src/main/js/MainAbility/common/storage/LastSessionStore.js';
import { workoutParams } from '../../entry/src/main/js/MainAbility/common/ui/launch.js';
import { setRows, summaryRows } from '../../entry/src/main/js/MainAbility/common/ui/summaryView.js';
import { createFakeTimeAdapter } from '../mocks/FakeTimeAdapter.js';
import ru from '../../entry/src/main/js/MainAbility/i18n/ru-RU.json';

const call = (fn, ...args) => new Promise((resolve) => fn(...args, (err, value) => resolve({ err, value })));

/** $t(path, params) of the page, on the Russian strings. */
function tr(key, params) {
  let text = ru.strings[key];
  for (const name in params || {}) {
    text = text.split('{' + name + '}').join(String(params[name]));
  }
  return text;
}

function silentHaptics() {
  const h = { calls: [] };
  ['workoutStart', 'rep', 'setComplete', 'restWarning', 'restEnd', 'workoutComplete', 'cancel'].forEach((name) => {
    h[name] = () => h.calls.push(name);
  });
  return h;
}

/** Sensor source that the test feeds with scenario samples, on the controller's clock. */
function scriptedSensors(time) {
  let onSample = null;
  return {
    start(s) { onSample = s; },
    stop() { onSample = null; },
    isRunning() { return onSample !== null; },
    getCapabilities() { return { hasGyroscope: true }; },
    play(scenario) {
      const t0 = time.now();
      for (const sample of scenario.samples) {
        time.advanceTo(t0 + sample.t);
        if (onSample) {
          onSample(Object.assign({}, sample, { t: t0 + sample.t }));
        }
      }
    }
  };
}

/** What the workout page does, from the router params that launch.js builds. */
function runWorkout(params, startAtMs, session) {
  const plan = session ? session.plan : JSON.parse(params.planJson);
  const options = JSON.parse(params.optionsJson);
  const time = createFakeTimeAdapter(startAtMs);
  const sensors = scriptedSensors(time);
  const haptics = silentHaptics();
  const ctrl = createWorkoutSessionController({
    plan: plan,
    sessionId: 'w' + startAtMs,
    session: session || null,
    time: time,
    sensors: sensors,
    detector: createRepDetectionEngine({
      exerciseType: plan.exerciseType, profile: options.profile || null, sensitivity: options.sensitivity
    }),
    haptics: haptics,
    countdownEnabled: false,
    calibrationProfileId: options.profile ? options.profile.id : undefined
  });
  ctrl.start();
  return { ctrl, time, sensors, haptics };
}

beforeEach(() => {
  storage.__reset();
  file.__reset();
});

describe('Stage 5: workout → summary → history', () => {
  test('free squats: counted, saved, listed, opened, deleted', async () => {
    const adapter = createSystemStorageAdapter();
    const params = workoutParams({ exerciseType: ExerciseType.SQUAT, mode: WorkoutMode.FREE },
      createDefaultSettings(), null);
    const run = runWorkout(params, 1000000);
    run.sensors.play(squatSeries(10, { seed: 3 }));
    run.sensors.play(walking(4000, { seed: 3 }));
    run.ctrl.finish();
    expect(run.ctrl.getStatus()).toBe(WorkoutStatus.COMPLETED);

    // Workout page → summary page.
    expect((await call(saveLastSession, run.ctrl.getSession())).err).toBeNull();
    const last = (await call(readLastSession)).value;
    const session = finalizeSession(last, last.finishedAt);
    expect(session).toMatchObject({ totalReps: 10, totalAutoReps: 10, totalManualAdjustment: 0 });
    expect(session.avgConfidence).toBeGreaterThan(0.6);

    const rows = summaryRows(session, tr, false);
    expect(rows.find((r) => r.id === 'reps').value).toBe('10');
    expect(rows.find((r) => r.id === 'exercise').value).toBe('Приседания');
    expect(rows.map((r) => r.label).join(' ')).not.toMatch(/уверенн/i);

    const repo = createWorkoutRepository(adapter);
    expect((await call(repo.save, session)).err).toBeNull();
    const list = (await call(repo.list)).value;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: session.id, exerciseType: ExerciseType.SQUAT, totalReps: 10 });

    const record = (await call(repo.get, session.id)).value;
    expect(record.avgConfidence).toBeCloseTo(session.avgConfidence, 5);
    expect(setRows(record, tr, true)).toHaveLength(1);

    expect((await call(repo.remove, session.id)).err).toBeNull();
    expect((await call(repo.list)).value).toEqual([]);
  });

  test('push-up sets with rest and a manual correction: totals, rest, best set, details', async () => {
    const adapter = createSystemStorageAdapter();
    const params = workoutParams({
      exerciseType: ExerciseType.PUSH_UP, mode: WorkoutMode.SETS, setCount: 2, targetReps: 5,
      restDurationSec: 30, autoStartNextSet: true
    }, createDefaultSettings(), null);

    // Set 1: five push-ups end the set, the page hands the session to the rest page.
    const first = runWorkout(params, 2000000);
    first.sensors.play(pushUpSeries(6, { seed: 5 }));
    expect(first.ctrl.getStatus()).toBe(WorkoutStatus.RESTING);
    await call(saveLastSession, first.ctrl.getSession());

    // Rest page: 30 s of rest, then the workout page continues the same session.
    const resting = (await call(readLastSession)).value;
    resting.restDurationSec += 30;
    const second = runWorkout(params, first.time.now() + 30000, resting);
    second.sensors.play(pushUpSeries(3, { seed: 6 }));
    second.ctrl.pause();
    second.ctrl.adjust(1);
    second.ctrl.finish();
    await call(saveLastSession, second.ctrl.getSession());

    const session = finalizeSession((await call(readLastSession)).value, second.time.now());
    expect(session.sets.map((s) => s.totalReps)).toEqual([5, 4]);
    expect(session).toMatchObject({ totalReps: 9, totalManualAdjustment: 1, restDurationSec: 30 });

    const rows = summaryRows(session, tr, true);
    expect(rows.find((r) => r.id === 'rest').value).toBe('00:30');
    expect(rows.find((r) => r.id === 'best').value).toBe(tr('bestSetValue', { n: 1, reps: 5 }));
    expect(rows.find((r) => r.id === 'manual').value).toBe('+1');
    expect(setRows(session, tr, true)[1].text).toContain('(+1)');

    const repo = createWorkoutRepository(adapter);
    await call(repo.save, session);
    expect((await call(repo.list)).value[0]).toMatchObject({ totalReps: 9, setCount: 2 });
    expect((await call(repo.clear)).err).toBeNull();
    expect((await call(repo.list)).value).toEqual([]);
  });
});

describe('Stage 5: settings and calibration survive a restart', () => {
  test('settings changed on the settings page reach the next workout', async () => {
    // Settings page: high sensitivity, right wrist, no countdown.
    const page = createSettingsRepository(createSystemStorageAdapter());
    await call(page.load);
    await call(page.set, 'sensitivity', 'HIGH');
    await call(page.set, 'wristSide', 'RIGHT');
    await call(page.set, 'countdownEnabled', false);

    // App restarted: new adapter and repository over the same files.
    const settings = (await call(createSettingsRepository(createSystemStorageAdapter()).load)).value;
    expect(settings).toMatchObject({ sensitivity: 'HIGH', wristSide: 'RIGHT', countdownEnabled: false });

    const params = workoutParams({ exerciseType: ExerciseType.SQUAT, mode: WorkoutMode.FREE }, settings, null);
    expect(JSON.parse(params.optionsJson)).toMatchObject({ sensitivity: 'HIGH', countdownEnabled: false });
    expect(JSON.parse(params.planJson).wristSide).toBe('RIGHT');
  });

  test('a calibration profile is stored per exercise and wrist and passed to the workout', async () => {
    const repo = createCalibrationRepository(createSystemStorageAdapter());
    const profile = createCalibrationProfile(ExerciseType.SQUAT, 'RIGHT', 'cal1', 5, {
      isValid: true, minAmplitudeThreshold: 0.12, minRepDurationMs: 600, maxRepDurationMs: 4000
    });
    await call(repo.save, profile);
    const stored = (await call(createCalibrationRepository(createSystemStorageAdapter()).get,
      ExerciseType.SQUAT, 'RIGHT')).value;
    expect(stored).toMatchObject({ id: 'cal1', minAmplitudeThreshold: 0.12 });

    const params = workoutParams({ exerciseType: ExerciseType.SQUAT, mode: WorkoutMode.FREE },
      Object.assign(createDefaultSettings(), { wristSide: 'RIGHT' }), stored);
    expect(JSON.parse(params.optionsJson).profile).toMatchObject({ id: 'cal1', minAmplitudeThreshold: 0.12 });
    const plan = createWorkoutPlan({ exerciseType: ExerciseType.SQUAT, mode: WorkoutMode.FREE,
      wristSide: 'RIGHT', vibrationOnRep: true }, 'p', 0);
    expect(plan.wristSide).toBe('RIGHT');
  });
});
