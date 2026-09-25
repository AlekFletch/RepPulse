import { StorageErrorCode } from './StorageError.js';
import { safeParse, toAsciiJson } from '../util/json.js';
import { series } from '../util/series.js';

const DIR = 'workouts';
const INDEX = DIR + '/index.json';
const LAST = DIR + '/last.json';
/** Oldest records are dropped beyond this, so the index stays a few KB. */
export const MAX_HISTORY = 100;

function recordPath(id) {
  return DIR + '/w_' + id + '.json';
}

/** History list entry (spec 4.3): date/time, exercise, reps, duration, sets. */
export function summarize(session) {
  const duration = typeof session.startedAt === 'number' && typeof session.finishedAt === 'number'
    ? Math.round((session.finishedAt - session.startedAt) / 1000)
    : 0;
  return {
    id: session.id,
    startedAt: session.startedAt || 0,
    exerciseType: session.plan.exerciseType,
    mode: session.plan.mode,
    totalReps: session.totalReps,
    durationSec: duration,
    setCount: session.sets.length
  };
}

/**
 * Workout history over LocalStorageAdapter files:
 *   workouts/index.json    summaries, newest first
 *   workouts/w_<id>.json   one full WorkoutSession per file (a record fits well under 4 KB reads)
 *   workouts/last.json     the session just finished (written by LastSessionStore), shown by the
 *                          summary page before "Сохранить"
 * All callbacks are cb(err, result).
 */
export function createWorkoutRepository(storage) {
  /**
   * The index, or — when it is missing, unreadable or corrupt — one rebuilt from the record files.
   * On the watch the "file not found" code of @system.file is not confirmed, and a failed index read
   * must never stop a workout from being saved (history stayed empty on the watch, 2026-09-25).
   */
  function readIndex(cb) {
    storage.readText(INDEX, function (err, text) {
      const list = err ? null : safeParse(text, null);
      if (Array.isArray(list)) {
        cb(null, list);
      } else {
        rebuildIndex(cb);
      }
    });
  }

  function rebuildIndex(cb) {
    storage.listFiles(DIR, function (err, names) {
      if (err) {
        cb(null, []);
        return;
      }
      const list = [];
      const steps = [];
      for (let i = 0; i < names.length; i++) {
        if (names[i].indexOf('w_') === 0) {
          steps.push(readInto.bind(null, DIR + '/' + names[i]));
        }
      }
      function readInto(path, next) {
        readRecord(path, function (readErr, session) {
          if (!readErr && session && session.plan && session.sets) {
            list.push(summarize(session));
          }
          next(null);
        });
      }
      series(steps, function () {
        list.sort(function (a, b) { return b.startedAt - a.startedAt; });
        cb(null, list.slice(0, MAX_HISTORY));
      });
    });
  }

  function writeIndex(list, cb) {
    storage.writeText(INDEX, toAsciiJson(list), cb);
  }

  function readRecord(path, cb) {
    storage.readText(path, function (err, text) {
      if (err) {
        cb(err, null);
        return;
      }
      const session = safeParse(text, null);
      cb(session ? null : { code: StorageErrorCode.IO, message: 'corrupt record' }, session);
    });
  }

  function removeQuietly(path, next) {
    storage.removeFile(path, function () {
      next(null);
    });
  }

  return {
    save: function (session, cb) {
      let dropped = [];
      series([
        function (next) {
          // A failed access/mkdir is not fatal (the directory usually exists): the write decides.
          storage.ensureDir(DIR, function () { next(null); });
        },
        function (next) {
          storage.writeText(recordPath(session.id), toAsciiJson(session), next);
        },
        function (next) {
          readIndex(function (err, list) {
            if (err) {
              next(err);
              return;
            }
            const kept = [summarize(session)];
            for (let i = 0; i < list.length; i++) {
              if (list[i].id !== session.id) {
                kept.push(list[i]);
              }
            }
            dropped = kept.slice(MAX_HISTORY);
            writeIndex(kept.slice(0, MAX_HISTORY), next);
          });
        },
        function (next) {
          const steps = [];
          for (let i = 0; i < dropped.length; i++) {
            steps.push(removeQuietly.bind(null, recordPath(dropped[i].id)));
          }
          series(steps, next);
        }
      ], cb);
    },

    list: readIndex,

    get: function (id, cb) {
      readRecord(recordPath(id), cb);
    },

    remove: function (id, cb) {
      readIndex(function (err, list) {
        if (err) {
          cb(err);
          return;
        }
        const kept = [];
        for (let i = 0; i < list.length; i++) {
          if (list[i].id !== id) {
            kept.push(list[i]);
          }
        }
        writeIndex(kept, function (writeErr) {
          if (writeErr) {
            cb(writeErr);
            return;
          }
          removeQuietly(recordPath(id), cb);
        });
      });
    },

    clear: function (cb) {
      readIndex(function (err, list) {
        if (err) {
          cb(err);
          return;
        }
        const steps = [];
        for (let i = 0; i < list.length; i++) {
          steps.push(removeQuietly.bind(null, recordPath(list[i].id)));
        }
        series(steps, function () {
          writeIndex([], cb);
        });
      });
    },

    getLast: function (cb) {
      readRecord(LAST, cb);
    }
  };
}
