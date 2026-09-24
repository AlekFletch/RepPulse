import { calibrationKey } from '../domain/models.js';
import { StorageErrorCode } from './StorageError.js';
import { safeParse, toAsciiJson } from '../util/json.js';

const DIR = 'calibration';

function profilePath(exerciseType, wristSide) {
  return DIR + '/' + calibrationKey(exerciseType, wristSide) + '.json';
}

/**
 * One CalibrationProfile per exercise and wrist (spec 2.6), stored as a file.
 * get() returns null when there is no profile yet (the baseline is used then).
 */
export function createCalibrationRepository(storage) {
  return {
    get: function (exerciseType, wristSide, cb) {
      storage.readText(profilePath(exerciseType, wristSide), function (err, text) {
        if (err) {
          cb(err.code === StorageErrorCode.NOT_FOUND ? null : err, null);
          return;
        }
        cb(null, safeParse(text, null));
      });
    },

    save: function (profile, cb) {
      storage.ensureDir(DIR, function (err) {
        if (err) {
          cb(err);
          return;
        }
        storage.writeText(profilePath(profile.exerciseType, profile.wristSide), toAsciiJson(profile), cb);
      });
    },

    remove: function (exerciseType, wristSide, cb) {
      storage.removeFile(profilePath(exerciseType, wristSide), cb);
    }
  };
}
