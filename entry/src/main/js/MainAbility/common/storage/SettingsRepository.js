import { createDefaultSettings, sanitizeSettings } from '../domain/models.js';
import { safeParse, toAsciiJson } from '../util/json.js';
import { extend } from '../util/obj.js';

export const SETTINGS_PATH = 'settings.json';
/** Longest wait for the settings file before load() settles with the defaults. */
export const SETTINGS_TIMEOUT_MS = 1500;

/**
 * AppSettings as one small file. Until Stage 5 they lived in @system.storage, one key per field,
 * but on the watch storage.get/set callbacks sometimes never arrive and a change was lost after
 * leaving the settings screen; files (workouts, calibration) have been reliable.
 *
 * set() before load() has finished is kept and applied on top of the loaded file, so a quick
 * tap cannot be overwritten by the late read. Writes go one at a time, the last one always
 * carries the newest settings. Unknown or invalid stored values fall back to the defaults.
 */
export function createSettingsRepository(storage) {
  let current = null;
  let pending = null;
  let loading = [];
  let writing = false;
  let waiting = [];

  function copy() {
    return extend({}, current);
  }

  function flush() {
    writing = true;
    const done = waiting;
    waiting = [];
    storage.writeText(SETTINGS_PATH, toAsciiJson(current), function (err) {
      writing = false;
      for (let i = 0; i < done.length; i++) {
        done[i](err || null);
      }
      if (waiting.length > 0) {
        flush();
      }
    });
  }

  function write(cb) {
    waiting.push(cb);
    if (!writing) {
      flush();
    }
  }

  function loaded(text) {
    current = sanitizeSettings(text ? safeParse(text, null) : null);
    const changes = pending;
    pending = null;
    if (changes) {
      extend(current, changes.values);
      write(function (err) {
        for (let i = 0; i < changes.callbacks.length; i++) {
          changes.callbacks[i](err);
        }
      });
    }
    const callbacks = loading;
    loading = [];
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i](null, copy());
    }
  }

  function startLoad() {
    let settled = false;
    const timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        loaded(null);
      }
    }, SETTINGS_TIMEOUT_MS);
    storage.readText(SETTINGS_PATH, function (err, text) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        loaded(err ? null : text);
      }
    });
  }

  const repo = {
    /** cb(null, settings): always settles, with the defaults when the file is missing or unreadable. */
    load: function (cb) {
      if (current !== null) {
        cb(null, copy());
        return;
      }
      loading.push(cb);
      if (loading.length === 1) {
        startLoad();
      }
    },

    /** Changes one field and writes the file; the value must be valid for sanitizeSettings to keep it. */
    set: function (key, value, cb) {
      if (current === null) {
        if (!pending) {
          pending = { values: {}, callbacks: [] };
        }
        pending.values[key] = value;
        pending.callbacks.push(cb);
        if (loading.length === 0) {
          repo.load(function () {});
        }
        return;
      }
      current[key] = value;
      write(cb);
    },

    save: function (settings, cb) {
      current = extend(createDefaultSettings(), settings);
      write(cb);
    }
  };
  return repo;
}
