import { extend } from '../util/obj.js';

/**
 * Router params for the workout page. The page receives everything it needs (plan input with
 * the wrist, plus the vibration / countdown switches) instead of reading storage itself, which
 * keeps its bundle small. FREE mode takes vibrationOnRep from the settings; the timer and sets
 * screens set it explicitly.
 */
export function workoutParams(input, settings) {
  const plan = extend({}, input, { wristSide: settings.wristSide });
  if (typeof plan.vibrationOnRep !== 'boolean') {
    plan.vibrationOnRep = settings.vibrationOnRep;
  }
  return {
    planJson: JSON.stringify(plan),
    optionsJson: JSON.stringify({
      vibrationEnabled: settings.vibrationEnabled,
      countdownEnabled: settings.countdownEnabled
    })
  };
}
