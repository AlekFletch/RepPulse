import brightness from '@system.brightness';

/** Keeps the screen on during a workout (@system.brightness.setKeepScreenOn). */
export function createScreenAdapter(logger) {
  return {
    keepScreenOn: function (enabled) {
      try {
        brightness.setKeepScreenOn({
          keepScreenOn: enabled === true,
          success: function () {},
          fail: function (data, code) {
            if (logger) {
              logger.warn('setKeepScreenOn failed: ' + code + ' ' + data);
            }
          }
        });
      } catch (e) {
        if (logger) {
          logger.warn('setKeepScreenOn threw: ' + e);
        }
      }
    }
  };
}
