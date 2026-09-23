/**
 * PermissionManager.
 *
 * Lite wearable @system.* APIs expose no runtime permission request/query call: permissions
 * are declared in config.json (reqPermissions) and a missing grant surfaces as a `fail`
 * callback of the API itself. This class therefore records denials reported by adapters.
 * TODO(device): confirm on Watch Fit 4 whether any grant dialog appears at install/first use
 * and which fail code a denied permission produces.
 */
export const Permission = Object.freeze({
  ACCELEROMETER: 'ohos.permission.ACCELEROMETER',
  GYROSCOPE: 'ohos.permission.GYROSCOPE',
  VIBRATE: 'ohos.permission.VIBRATE',
  READ_HEALTH_DATA: 'ohos.permission.READ_HEALTH_DATA'
});

export function createPermissionManager() {
  const denied = {};
  return {
    reportFailure: function (permission, code) {
      denied[permission] = { code: code };
    },
    reportSuccess: function (permission) {
      delete denied[permission];
    },
    isKnownDenied: function (permission) {
      return Object.prototype.hasOwnProperty.call(denied, permission);
    }
  };
}
