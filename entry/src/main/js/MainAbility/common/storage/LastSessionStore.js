import file from '@system.file';
import { toAsciiJson } from '../util/json.js';

/**
 * Writes the workout that just finished for the summary page (read back with
 * WorkoutRepository.getLast). Deliberately tiny: the workout page bundle has to stay small,
 * so it does not pull in the whole storage adapter and repository.
 */
const DIR_URI = 'internal://app/workouts';
export const LAST_SESSION_URI = DIR_URI + '/last.json';

export function saveLastSession(session, cb) {
  const text = toAsciiJson(session);
  function write() {
    try {
      file.writeText({
        uri: LAST_SESSION_URI,
        text: text,
        success: function () { cb(null); },
        fail: function (data, code) { cb({ code: code, message: data }); }
      });
    } catch (e) {
      cb({ code: -1, message: String(e) });
    }
  }
  try {
    // mkdir fails when the directory already exists; the write decides the outcome.
    file.mkdir({ uri: DIR_URI, recursive: true, success: write, fail: write });
  } catch (e) {
    write();
  }
}
