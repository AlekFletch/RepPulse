import { BuildConfig } from '../config/buildConfig.js';

/**
 * Logger: debug() is a no-op unless debug is enabled (BuildConfig.DEBUG by default),
 * so diagnostic output never reaches production builds. No personal data is logged.
 */
export function createLogger(tag, options) {
  const opts = options || {};
  const debugEnabled = typeof opts.debug === 'boolean' ? opts.debug : BuildConfig.DEBUG;
  const sink = opts.sink || console;
  const prefix = '[RepPulse:' + tag + '] ';
  return {
    isDebug: function () {
      return debugEnabled;
    },
    debug: function (message) {
      if (debugEnabled) {
        sink.debug(prefix + message);
      }
    },
    info: function (message) {
      sink.info(prefix + message);
    },
    warn: function (message) {
      sink.warn(prefix + message);
    },
    error: function (message) {
      sink.error(prefix + message);
    },
    /** Spec: a missing icon asset is logged in development builds only. */
    missingAsset: function (name) {
      if (debugEnabled) {
        sink.warn(prefix + 'missing asset: ' + name);
      }
    }
  };
}
