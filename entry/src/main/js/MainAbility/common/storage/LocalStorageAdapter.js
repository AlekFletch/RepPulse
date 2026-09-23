import storage from '@system.storage';
import file from '@system.file';
import { toUri } from './paths.js';
import { fromFileFailure, storageError, StorageErrorCode } from './StorageError.js';

/**
 * LocalStorageAdapter contract (callback style; callback(err, result), err = null on success):
 *   getItem(key, cb(err, string|null))    setItem(key, string, cb)    removeItem(key, cb)
 *   writeText(path, text, cb)             readText(path, cb(err, string))
 *   removeFile(path, cb)                  listFiles(dir, cb(err, string[] names))
 *   ensureDir(dir, cb)
 * Paths are relative to internal://app/. Key-value storage is for small values (settings);
 * larger records (workouts, calibration) go to files as ASCII JSON (see util/json.js).
 *
 * TODO(device): verify the @system.storage value length limit on Watch Fit 4 (OpenHarmony
 * docs mention 128 bytes) and readText position/length semantics.
 */
export const READ_CHUNK = 4096;
const MISSING = '';

export function createSystemStorageAdapter() {
  function withUri(path, cb, fn) {
    const uri = toUri(path);
    if (uri === null) {
      cb(storageError(StorageErrorCode.INVALID_PATH, path));
      return;
    }
    try {
      fn(uri);
    } catch (e) {
      cb(storageError(StorageErrorCode.UNKNOWN, String(e)));
    }
  }

  function failTo(cb) {
    return function (data, code) {
      cb(fromFileFailure(code, data));
    };
  }

  function kvFail(cb) {
    return function (data, code) {
      cb(storageError(StorageErrorCode.IO, code + ' ' + data));
    };
  }

  return {
    getItem: function (key, cb) {
      try {
        storage.get({
          key: key,
          default: MISSING,
          success: function (value) {
            // Empty strings are never stored, so '' means "no value".
            const missing = value === MISSING || value === undefined || value === null;
            cb(null, missing ? null : String(value));
          },
          fail: kvFail(cb)
        });
      } catch (e) {
        cb(storageError(StorageErrorCode.UNKNOWN, String(e)));
      }
    },

    setItem: function (key, value, cb) {
      if (typeof value !== 'string' || value.length === 0) {
        cb(storageError(StorageErrorCode.UNKNOWN, 'only non-empty strings can be stored'));
        return;
      }
      try {
        storage.set({
          key: key,
          value: value,
          success: function () { cb(null); },
          fail: kvFail(cb)
        });
      } catch (e) {
        cb(storageError(StorageErrorCode.UNKNOWN, String(e)));
      }
    },

    removeItem: function (key, cb) {
      try {
        storage.delete({
          key: key,
          success: function () { cb(null); },
          fail: kvFail(cb)
        });
      } catch (e) {
        cb(storageError(StorageErrorCode.UNKNOWN, String(e)));
      }
    },

    writeText: function (path, text, cb) {
      withUri(path, cb, function (uri) {
        file.writeText({
          uri: uri,
          text: text,
          success: function () { cb(null); },
          fail: failTo(cb)
        });
      });
    },

    readText: function (path, cb) {
      withUri(path, cb, function (uri) {
        let result = '';
        function readFrom(position) {
          file.readText({
            uri: uri,
            position: position,
            length: READ_CHUNK,
            success: function (data) {
              const chunk = data.text || '';
              result += chunk;
              if (chunk.length === READ_CHUNK) {
                readFrom(position + READ_CHUNK);
              } else {
                cb(null, result);
              }
            },
            fail: failTo(cb)
          });
        }
        readFrom(0);
      });
    },

    removeFile: function (path, cb) {
      withUri(path, cb, function (uri) {
        file.delete({
          uri: uri,
          success: function () { cb(null); },
          fail: failTo(cb)
        });
      });
    },

    listFiles: function (dir, cb) {
      withUri(dir, cb, function (uri) {
        file.list({
          uri: uri,
          success: function (data) {
            const names = [];
            const list = data.fileList || [];
            for (let i = 0; i < list.length; i++) {
              if (list[i].type === 'file') {
                const parts = list[i].uri.split('/');
                names.push(parts[parts.length - 1]);
              }
            }
            cb(null, names);
          },
          fail: function (data, code) {
            const err = fromFileFailure(code, data);
            // A directory that was never created simply has no files.
            if (err.code === StorageErrorCode.NOT_FOUND) {
              cb(null, []);
            } else {
              cb(err);
            }
          }
        });
      });
    },

    ensureDir: function (dir, cb) {
      withUri(dir, cb, function (uri) {
        file.access({
          uri: uri,
          success: function () { cb(null); },
          fail: function () {
            file.mkdir({
              uri: uri,
              recursive: true,
              success: function () { cb(null); },
              fail: failTo(cb)
            });
          }
        });
      });
    }
  };
}
