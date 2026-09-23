import vibrator from '@system.vibrator';
import brightness from '@system.brightness';
import battery from '@system.battery';
import storage from '@system.storage';
import file from '@system.file';
import { createHapticsAdapter, HapticMode } from '../../entry/src/main/js/MainAbility/common/platform/HapticsAdapter.js';
import { createScreenAdapter } from '../../entry/src/main/js/MainAbility/common/platform/ScreenAdapter.js';
import { createBatteryAdapter, isLowBattery } from '../../entry/src/main/js/MainAbility/common/platform/BatteryAdapter.js';
import { createLogger } from '../../entry/src/main/js/MainAbility/common/platform/Logger.js';
import { createPermissionManager, Permission } from '../../entry/src/main/js/MainAbility/common/platform/PermissionManager.js';
import { createSystemStorageAdapter, READ_CHUNK } from '../../entry/src/main/js/MainAbility/common/storage/LocalStorageAdapter.js';
import { createInMemoryStorageAdapter } from '../../entry/src/main/js/MainAbility/common/storage/InMemoryStorageAdapter.js';
import { toUri } from '../../entry/src/main/js/MainAbility/common/storage/paths.js';
import { StorageErrorCode } from '../../entry/src/main/js/MainAbility/common/storage/StorageError.js';
import { toAsciiJson } from '../../entry/src/main/js/MainAbility/common/util/json.js';
import { createFakeTimeAdapter } from '../mocks/FakeTimeAdapter.js';

beforeEach(() => {
  vibrator.__reset();
  brightness.__reset();
  battery.__reset();
  storage.__reset();
  file.__reset();
});

describe('HapticsAdapter', () => {
  test('single vibration and spaced sequence', () => {
    const time = createFakeTimeAdapter(0);
    const haptics = createHapticsAdapter(time);
    haptics.vibrate(HapticMode.SHORT);
    expect(vibrator.__calls).toEqual(['short']);
    haptics.sequence(['long', 'long', 'short'], 400);
    expect(vibrator.__calls).toEqual(['short', 'long']);
    time.advance(400);
    expect(vibrator.__calls).toEqual(['short', 'long', 'long']);
    time.advance(400);
    expect(vibrator.__calls).toEqual(['short', 'long', 'long', 'short']);
  });

  test('cancelPending drops queued vibrations; failures are logged, not thrown', () => {
    const time = createFakeTimeAdapter(0);
    const warn = jest.fn();
    const haptics = createHapticsAdapter(time, { warn });
    haptics.sequence(['short', 'short', 'short']);
    haptics.cancelPending();
    time.advance(5000);
    expect(vibrator.__calls).toEqual(['short']);
    vibrator.__failNext = true;
    expect(() => haptics.vibrate('long')).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('Screen / battery / logger / permissions', () => {
  test('keepScreenOn forwards to @system.brightness', () => {
    const screen = createScreenAdapter();
    screen.keepScreenOn(true);
    expect(brightness.__keepScreenOn).toBe(true);
    screen.keepScreenOn(false);
    expect(brightness.__keepScreenOn).toBe(false);
  });

  test('battery status and low-battery rule', () => {
    const adapter = createBatteryAdapter();
    battery.__status = { level: 0.05, charging: false };
    const cb = jest.fn();
    adapter.getStatus(cb);
    expect(cb).toHaveBeenCalledWith(null, { level: 0.05, charging: false });
    expect(isLowBattery(cb.mock.calls[0][1])).toBe(true);
    expect(isLowBattery({ level: 0.05, charging: true })).toBe(false);
    battery.__fail = true;
    adapter.getStatus(cb);
    expect(cb.mock.calls[1][0]).toMatchObject({ code: 200 });
  });

  test('debug logging is suppressed when debug is off', () => {
    const sink = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const off = createLogger('t', { debug: false, sink });
    off.debug('x');
    off.missingAsset('history_icon');
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
    const on = createLogger('t', { debug: true, sink });
    on.debug('x');
    on.missingAsset('history_icon');
    expect(sink.debug).toHaveBeenCalledWith('[RepPulse:t] x');
    expect(sink.warn).toHaveBeenCalledWith('[RepPulse:t] missing asset: history_icon');
  });

  test('permission manager records denials reported by adapters', () => {
    const pm = createPermissionManager();
    expect(pm.isKnownDenied(Permission.GYROSCOPE)).toBe(false);
    pm.reportFailure(Permission.GYROSCOPE, 201);
    expect(pm.isKnownDenied(Permission.GYROSCOPE)).toBe(true);
    pm.reportSuccess(Permission.GYROSCOPE);
    expect(pm.isKnownDenied(Permission.GYROSCOPE)).toBe(false);
  });
});

describe('storage paths', () => {
  test('relative paths map to internal://app/ and unsafe paths are rejected', () => {
    expect(toUri('workouts/a.json')).toBe('internal://app/workouts/a.json');
    expect(toUri('/etc/passwd')).toBeNull();
    expect(toUri('../x')).toBeNull();
    expect(toUri('a:b')).toBeNull();
    expect(toUri('')).toBeNull();
    expect(toUri('x'.repeat(120))).toBeNull();
  });
});

/** Both adapters must satisfy the same contract. */
describe.each([
  ['system (@system.storage/@system.file)', createSystemStorageAdapter],
  ['in-memory', createInMemoryStorageAdapter]
])('LocalStorageAdapter contract: %s', (name, factory) => {
  const call = (fn, ...args) => new Promise((resolve) => fn(...args, (err, value) => resolve({ err, value })));

  test('key-value get/set/remove', async () => {
    const s = factory();
    expect((await call(s.getItem, 'missing')).value).toBeNull();
    expect((await call(s.setItem, 'k', 'v')).err).toBeNull();
    expect((await call(s.getItem, 'k')).value).toBe('v');
    await call(s.removeItem, 'k');
    expect((await call(s.getItem, 'k')).value).toBeNull();
    expect((await call(s.setItem, 'k', '')).err).not.toBeNull();
  });

  test('files: write, read, list, remove, not-found', async () => {
    const s = factory();
    await call(s.ensureDir, 'workouts');
    expect((await call(s.listFiles, 'workouts')).value).toEqual([]);
    await call(s.writeText, 'workouts/b.json', '{"b":1}');
    await call(s.writeText, 'workouts/a.json', '{"a":1}');
    expect((await call(s.readText, 'workouts/a.json')).value).toBe('{"a":1}');
    expect((await call(s.listFiles, 'workouts')).value.sort()).toEqual(['a.json', 'b.json']);
    expect((await call(s.removeFile, 'workouts/a.json')).err).toBeNull();
    expect((await call(s.readText, 'workouts/a.json')).err.code).toBe(StorageErrorCode.NOT_FOUND);
    expect((await call(s.removeFile, 'workouts/a.json')).err.code).toBe(StorageErrorCode.NOT_FOUND);
    expect((await call(s.readText, '../escape')).err.code).toBe(StorageErrorCode.INVALID_PATH);
  });

  test('large ASCII JSON survives (several 4 KB chunks)', async () => {
    const s = factory();
    const payload = toAsciiJson({ sets: Array.from({ length: 300 }, (_, i) => ({ n: i, name: 'Подход' })) });
    expect(payload.length).toBeGreaterThan(READ_CHUNK * 2);
    await call(s.writeText, 'big.json', payload);
    expect((await call(s.readText, 'big.json')).value).toBe(payload);
  });
});

test('system adapter reads files in 4 KB chunks', async () => {
  const s = createSystemStorageAdapter();
  const text = 'x'.repeat(READ_CHUNK * 2 + 10);
  await new Promise((r) => s.writeText('c.txt', text, r));
  const back = await new Promise((r) => s.readText('c.txt', (e, v) => r(v)));
  expect(back).toBe(text);
  expect(file.__reads).toBe(3);
});

test('in-memory adapter can inject failures', () => {
  const s = createInMemoryStorageAdapter();
  s.failNext(1);
  const cb = jest.fn();
  s.setItem('k', 'v', cb);
  expect(cb.mock.calls[0][0].code).toBe(StorageErrorCode.IO);
  s.setItem('k', 'v', cb);
  expect(cb.mock.calls[1][0]).toBeNull();
  expect(s.snapshot().kv).toEqual({ k: 'v' });
});
