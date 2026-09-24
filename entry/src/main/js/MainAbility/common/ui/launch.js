import { createDefaultSettings } from '../domain/models.js';
import { createWorkoutPlan } from '../domain/plan.js';
import { generateId } from '../util/id.js';
import { createCalibrationRepository } from '../storage/CalibrationRepository.js';
import { createSettingsRepository } from '../storage/SettingsRepository.js';
import { extend } from '../util/obj.js';

/** CalibrationProfile fields the detector uses; the rest stays out of the router params. */
const PROFILE_FIELDS = ['id', 'minRepDurationMs', 'maxRepDurationMs', 'minAmplitudeThreshold',
  'minGyroThreshold', 'confidenceThreshold', 'descentSignature'];

/**
 * Router params for the workout page. The page receives everything it needs (the finished plan with
 * the wrist, vibration / countdown switches, sensitivity, the calibration profile) instead of reading
 * storage itself, which keeps its bundle small. FREE mode takes vibrationOnRep from the settings;
 * the timer and sets screens set it explicitly.
 */
export function workoutParams(input, settings, profile) {
  const planInput = extend({}, input, { wristSide: settings.wristSide });
  if (typeof planInput.vibrationOnRep !== 'boolean') {
    planInput.vibrationOnRep = settings.vibrationOnRep;
  }
  const now = new Date().getTime();
  const plan = createWorkoutPlan(planInput, generateId(now), now);
  const options = {
    vibrationEnabled: settings.vibrationEnabled,
    countdownEnabled: settings.countdownEnabled,
    sensitivity: settings.sensitivity
  };
  if (profile && profile.isValid) {
    options.profile = {};
    for (let i = 0; i < PROFILE_FIELDS.length; i++) {
      const key = PROFILE_FIELDS[i];
      if (profile[key] !== undefined) {
        options.profile[key] = profile[key];
      }
    }
  }
  return { planJson: JSON.stringify(plan), optionsJson: JSON.stringify(options) };
}

/**
 * Settings, then the calibration profile for this exercise and the chosen wrist. `ready` may
 * fire twice (settings, then with the profile); a page must never wait for it before starting:
 * a storage callback can fail to arrive on the watch.
 */
export function loadLaunchData(storage, exerciseType, ready) {
  let settings = createDefaultSettings();
  createSettingsRepository(storage).load(function (err, loaded) {
    settings = loaded;
    ready(settings, null);
    createCalibrationRepository(storage).get(exerciseType, settings.wristSide, function (getErr, profile) {
      if (!getErr && profile && profile.isValid) {
        ready(settings, profile);
      }
    });
  });
}
