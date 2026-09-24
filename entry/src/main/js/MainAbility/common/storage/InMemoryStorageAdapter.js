import { toUri, MAX_KV_VALUE_LENGTH } from './paths.js';
import { storageError, StorageErrorCode } from './StorageError.js';

/**
 * LocalStorageAdapter kept in memory. Used by unit tests and the simulator.
 * Callbacks are invoked synchronously.
 * failNext(n) makes the next n operations fail with an I/O error (error-path tests).
 */
export function createInMemoryStorageAdapter() {
  const kv = {};
  const files = {};
  let failures = 0;

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function rejected(cb) {
    if (failures > 0) {
      failures--;
      cb(storageError(StorageErrorCode.IO, 'injected failure'));
      return true;
    }
    return false;
  }

  function badPath(path, cb) {
    if (toUri(path) === null) {
      cb(storageError(StorageErrorCode.INVALID_PATH, path));
      return true;
    }
    return false;
  }

  return {
    getItem: function (key, cb) {
      if (rejected(cb)) { return; }
      cb(null, has(kv, key) ? kv[key] : null);
    },
    setItem: function (key, value, cb) {
      if (rejected(cb)) { return; }
      if (typeof value !== 'string' || value.length === 0) {
        cb(storageError(StorageErrorCode.UNKNOWN, 'only non-empty strings can be stored'));
        return;
      }
      if (value.length > MAX_KV_VALUE_LENGTH) {
        cb(storageError(StorageErrorCode.VALUE_TOO_LONG, value.length + ' > ' + MAX_KV_VALUE_LENGTH));
        return;
      }
      kv[key] = value;
      cb(null);
    },
    removeItem: function (key, cb) {
      if (rejected(cb)) { return; }
      delete kv[key];
      cb(null);
    },
    writeText: function (path, text, cb) {
      if (rejected(cb) || badPath(path, cb)) { return; }
      files[path] = String(text);
      cb(null);
    },
    readText: function (path, cb) {
      if (rejected(cb) || badPath(path, cb)) { return; }
      if (!has(files, path)) {
        cb(storageError(StorageErrorCode.NOT_FOUND, path));
        return;
      }
      cb(null, files[path]);
    },
    removeFile: function (path, cb) {
      if (rejected(cb) || badPath(path, cb)) { return; }
      if (!has(files, path)) {
        cb(storageError(StorageErrorCode.NOT_FOUND, path));
        return;
      }
      delete files[path];
      cb(null);
    },
    listFiles: function (dir, cb) {
      if (rejected(cb) || badPath(dir, cb)) { return; }
      const prefix = dir.charAt(dir.length - 1) === '/' ? dir : dir + '/';
      const names = [];
      for (const path in files) {
        if (has(files, path) && path.indexOf(prefix) === 0 && path.slice(prefix.length).indexOf('/') === -1) {
          names.push(path.slice(prefix.length));
        }
      }
      names.sort();
      cb(null, names);
    },
    ensureDir: function (dir, cb) {
      if (rejected(cb) || badPath(dir, cb)) { return; }
      cb(null);
    },

    // --- test helpers ---
    failNext: function (n) {
      failures = n;
    },
    snapshot: function () {
      return { kv: JSON.parse(JSON.stringify(kv)), files: JSON.parse(JSON.stringify(files)) };
    }
  };
}
