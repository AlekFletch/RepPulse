import storage from '@system.storage';
import file from '@system.file';
import { createInMemoryStorageAdapter } from '../../entry/src/main/js/MainAbility/common/storage/InMemoryStorageAdapter.js';
import { createSystemStorageAdapter, KV_TIMEOUT_MS } from '../../entry/src/main/js/MainAbility/common/storage/LocalStorageAdapter.js';
import { createWorkoutRepository, MAX_HISTORY } from '../../entry/src/main/js/MainAbility/common/storage/WorkoutRepository.js';
import { createSettingsRepository, SETTINGS_TIMEOUT_MS } from '../../entry/src/main/js/MainAbility/common/storage/SettingsRepository.js';
import { createCalibrationRepository } from '../../entry/src/main/js/MainAbility/common/storage/CalibrationRepository.js';
import { createCalibrationProfile, createDefaultSettings } from '../../entry/src/main/js/MainAbility/common/domain/models.js';
import { saveLastSession } from '../../entry/src/main/js/MainAbility/common/storage/LastSessionStore.js';
import { series } from '../../entry/src/main/js/MainAbility/common/util/series.js';

const call = (fn, ...args) => new Promise((resolve) => fn(...args, (err, value) => resolve({ err, value })));

function session(id, startedAt, reps) {
  return {
    id: id,
    plan: { exerciseType: 'SQUAT', mode: 'SETS' },
    startedAt: startedAt,
    finishedAt: startedAt + 90000,
    totalReps: reps,
    restDurationSec: 30,
    sets: [{ setNumber: 1, totalReps: reps }, { setNumber: 2, totalReps: 0 }],
    note: 'Приседания'
  };
}

beforeEach(() => {
  storage.__reset();
  file.__reset();
});

describe('WorkoutRepository', () => {
  test('save, list (newest first), get, remove, clear', async () => {
    const repo = createWorkoutRepository(createInMemoryStorageAdapter());
    expect((await call(repo.list)).value).toEqual([]);
    await call(repo.save, session('a', 1000, 10));
    await call(repo.save, session('b', 2000, 20));
    const list = (await call(repo.list)).value;
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
    expect(list[0]).toEqual({
      id: 'b', startedAt: 2000, exerciseType: 'SQUAT', mode: 'SETS', totalReps: 20, durationSec: 90, setCount: 2
    });
    expect((await call(repo.get, 'a')).value.note).toBe('Приседания');
    await call(repo.remove, 'a');
    expect((await call(repo.list)).value.map((e) => e.id)).toEqual(['b']);
    expect((await call(repo.get, 'a')).err).not.toBeNull();
    await call(repo.clear);
    expect((await call(repo.list)).value).toEqual([]);
    expect((await call(repo.get, 'b')).err).not.toBeNull();
  });

  test('saving the same session twice keeps one entry; history is capped', async () => {
    const storageAdapter = createInMemoryStorageAdapter();
    const repo = createWorkoutRepository(storageAdapter);
    await call(repo.save, session('a', 1000, 10));
    await call(repo.save, session('a', 1000, 10));
    expect((await call(repo.list)).value.length).toBe(1);
    for (let i = 0; i < MAX_HISTORY + 2; i++) {
      await call(repo.save, session('x' + i, 5000 + i, i));
    }
    const list = (await call(repo.list)).value;
    expect(list.length).toBe(MAX_HISTORY);
    expect(list[0].id).toBe('x' + (MAX_HISTORY + 1));
    expect((await call(storageAdapter.listFiles, 'workouts')).value.length).toBe(MAX_HISTORY + 1);
  });

  test('last finished session: written by LastSessionStore, read by the repository', async () => {
    const repo = createWorkoutRepository(createSystemStorageAdapter());
    expect((await call(repo.getLast)).err).not.toBeNull();
    expect((await call(saveLastSession, session('z', 1, 3))).err).toBeNull();
    expect((await call(repo.getLast)).value).toMatchObject({ id: 'z', note: 'Приседания' });
  });
});

describe('SettingsRepository', () => {
  test('defaults, save, set, reload from the settings file', async () => {
    const repo = createSettingsRepository(createSystemStorageAdapter());
    expect((await call(repo.load)).value).toEqual(createDefaultSettings());
    const changed = Object.assign(createDefaultSettings(), { wristSide: 'RIGHT', sensitivity: 'HIGH' });
    expect((await call(repo.save, changed)).err).toBeNull();
    expect((await call(repo.set, 'vibrationOnRep', false)).err).toBeNull();
    // A new page gets a new repository: the values come back from the file.
    const loaded = (await call(createSettingsRepository(createSystemStorageAdapter()).load)).value;
    expect(loaded).toMatchObject({ wristSide: 'RIGHT', sensitivity: 'HIGH', vibrationOnRep: false });
    expect(Object.keys(file.__files())).toContain('internal://app/settings.json');
  });

  test('a change made before the file is read survives the late read', async () => {
    const adapter = createInMemoryStorageAdapter();
    await call(createSettingsRepository(adapter).save, Object.assign(createDefaultSettings(), { wristSide: 'RIGHT' }));
    const slow = Object.assign({}, adapter, {
      readText: (path, cb) => setTimeout(() => adapter.readText(path, cb), 10)
    });
    const repo = createSettingsRepository(slow);
    const loading = call(repo.load);
    const setting = call(repo.set, 'sensitivity', 'HIGH');
    expect((await loading).value).toMatchObject({ wristSide: 'RIGHT', sensitivity: 'HIGH' });
    expect((await setting).err).toBeNull();
    const reread = (await call(createSettingsRepository(adapter).load)).value;
    expect(reread).toMatchObject({ wristSide: 'RIGHT', sensitivity: 'HIGH' });
  });

  test('writes go one at a time and the last one wins', async () => {
    const adapter = createInMemoryStorageAdapter();
    const order = [];
    const slow = Object.assign({}, adapter, {
      writeText: (path, text, cb) => {
        order.push(JSON.parse(text).sensitivity);
        setTimeout(() => adapter.writeText(path, text, cb), 5);
      }
    });
    const repo = createSettingsRepository(slow);
    await call(repo.load);
    await Promise.all([call(repo.set, 'sensitivity', 'LOW'), call(repo.set, 'sensitivity', 'HIGH'),
      call(repo.set, 'sensitivity', 'STANDARD')]);
    expect(order).toEqual(['LOW', 'STANDARD']);
    expect((await call(createSettingsRepository(adapter).load)).value.sensitivity).toBe('STANDARD');
  });

  test('a settings file that never answers settles with the defaults', () => {
    jest.useFakeTimers();
    try {
      let loaded = null;
      createSettingsRepository({ readText: () => {} }).load((err, settings) => { loaded = settings; });
      expect(loaded).toBeNull();
      jest.advanceTimersByTime(SETTINGS_TIMEOUT_MS);
      expect(loaded).toEqual(createDefaultSettings());
    } finally {
      jest.useRealTimers();
    }
  });

  test('storage.get/set that never answer settle after the timeout', () => {
    jest.useFakeTimers();
    try {
      const adapter = createSystemStorageAdapter();
      const got = [];
      storage.__silentNext(1);
      adapter.getItem('k', (err, value) => got.push(['get', err, value]));
      storage.__silentNext(1);
      adapter.setItem('k', 'v', (err) => got.push(['set', err && err.code]));
      expect(got).toEqual([]);
      jest.advanceTimersByTime(KV_TIMEOUT_MS);
      expect(got).toEqual([['get', null, null], ['set', 'IO']]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a single storage failure is retried', async () => {
    const adapter = createSystemStorageAdapter();
    storage.__failNext(1);
    expect((await call(adapter.setItem, 'k', 'v')).err).toBeNull();
    storage.__failNext(2);
    expect((await call(adapter.getItem, 'k')).err).not.toBeNull();
  });
});

describe('CalibrationRepository', () => {
  test('missing profile is null; save and read back per exercise and wrist', async () => {
    const repo = createCalibrationRepository(createInMemoryStorageAdapter());
    expect(await call(repo.get, 'SQUAT', 'LEFT')).toEqual({ err: null, value: null });
    const profile = createCalibrationProfile('SQUAT', 'LEFT', 'c1', 5, { isValid: true });
    await call(repo.save, profile);
    expect((await call(repo.get, 'SQUAT', 'LEFT')).value).toEqual(profile);
    expect((await call(repo.get, 'SQUAT', 'RIGHT')).value).toBeNull();
  });
});

describe('series', () => {
  test('runs steps in order and stops at the first error', () => {
    const order = [];
    let result;
    series([(n) => { order.push(1); n(); }, (n) => { order.push(2); n('boom'); }, (n) => { order.push(3); n(); }],
      (err) => { result = err; });
    expect(order).toEqual([1, 2]);
    expect(result).toBe('boom');
  });
});
