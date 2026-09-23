import battery from '@system.battery';

export const LOW_BATTERY_LEVEL = 0.1;

/**
 * @system.battery.getStatus -> { level: 0..1, charging }.
 * callback(err, status); err is { code, message } when the platform call fails.
 */
export function createBatteryAdapter() {
  return {
    getStatus: function (callback) {
      try {
        battery.getStatus({
          success: function (data) {
            callback(null, { level: data.level, charging: data.charging });
          },
          fail: function (data, code) {
            callback({ code: code, message: data });
          }
        });
      } catch (e) {
        callback({ code: -1, message: String(e) });
      }
    }
  };
}

export function isLowBattery(status) {
  return !!status && !status.charging && status.level < LOW_BATTERY_LEVEL;
}
