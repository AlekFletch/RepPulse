import { sanitizeSettings, settingKeys } from '../domain/models.js';
import { safeParse } from '../util/json.js';
import { series } from '../util/series.js';

const PREFIX = 's_';

/**
 * AppSettings in @system.storage, one key per field: a value is limited to 128 characters
 * on the watch, and a whole settings JSON would not fit. Unknown or invalid stored values
 * fall back to the defaults (models.sanitizeSettings).
 */
export function createSettingsRepository(storage) {
  return {
    load: function (cb) {
      const keys = settingKeys();
      const stored = {};
      const steps = [];
      for (let i = 0; i < keys.length; i++) {
        steps.push(readKey.bind(null, keys[i]));
      }
      function readKey(key, next) {
        storage.getItem(PREFIX + key, function (err, value) {
          if (!err && value !== null) {
            stored[key] = safeParse(value, undefined);
          }
          next(null);
        });
      }
      series(steps, function () {
        cb(null, sanitizeSettings(stored));
      });
    },

    /** Writes one field; the value must be valid for sanitizeSettings to keep it. */
    set: function (key, value, cb) {
      storage.setItem(PREFIX + key, JSON.stringify(value), cb);
    },

    save: function (settings, cb) {
      const keys = settingKeys();
      const steps = [];
      for (let i = 0; i < keys.length; i++) {
        steps.push(writeKey.bind(null, keys[i]));
      }
      function writeKey(key, next) {
        storage.setItem(PREFIX + key, JSON.stringify(settings[key]), next);
      }
      series(steps, cb);
    }
  };
}
