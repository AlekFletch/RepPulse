import file from '@system.file';
import { safeParse, toAsciiJson } from '../util/json.js';

/**
 * The current workout between pages: written when a set ends (rest page next) or the workout
 * finishes (summary page), read back by the workout page for the next set and by the summary page
 * (also through WorkoutRepository.getLast). Deliberately tiny: the workout page bundle has to stay
 * small, so it does not pull in the whole storage adapter and repository.
 */
const CHUNK = 4096;
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

/** cb(err, session): reads in 4 KB chunks (readText's default length) — 20 sets can exceed one. */
export function readLastSession(cb) {
  let text = '';
  function readFrom(position) {
    try {
      file.readText({
        uri: LAST_SESSION_URI,
        position: position,
        length: CHUNK,
        success: function (data) {
          const chunk = data.text || '';
          text += chunk;
          if (chunk.length === CHUNK) {
            readFrom(position + CHUNK);
            return;
          }
          const session = safeParse(text, null);
          cb(session ? null : { code: 'IO', message: 'corrupt session' }, session);
        },
        fail: function (data, code) { cb({ code: code, message: data }, null); }
      });
    } catch (e) {
      cb({ code: -1, message: String(e) }, null);
    }
  }
  readFrom(0);
}
