import { WorkoutMode, WorkoutStatus, SetEndReason } from '../domain/enums.js';
import { Timing } from '../domain/limits.js';
import { createWorkoutSession, createSetResult, plannedSetCount } from '../domain/workout.js';
import { createCountdownController } from './CountdownController.js';

const S = WorkoutStatus;
const TICK_MS = 250;
/** Cadence is shown only after this much active time, otherwise the first rep reads as 60+/min. */
const MIN_CADENCE_SEC = 5;

/** stats.setRepTotal / stats.cadence, repeated here so the workout page bundle skips stats.js. */
function repTotal(set) {
  return Math.max(0, set.autoReps + set.manualAdjustment);
}

function perMinute(reps, sec) {
  return sec > 0 ? reps / sec * 60 : undefined;
}

/**
 * Runs the sets of one workout (spec 2.3–2.5, 4.2): countdown, active set, pause, targets, manual
 * correction. Pages never touch sensors: they call the methods below and render snapshot().
 *
 * The rest between sets lives on its own page (the workout page and its ~100 KB JS heap cannot
 * also hold the rest screen): when a set ends and more are planned the status becomes RESTING and
 * the controller stops; the page saves the session and opens the rest page, which later reopens
 * the workout page with `session` to run the next set.
 *
 * deps:
 *   plan              WorkoutPlan (domain/plan.createWorkoutPlan)
 *   sessionId         id for a new WorkoutSession
 *   session           an unfinished WorkoutSession to continue (next set), optional
 *   time              TimeAdapter
 *   sensors           SensorProvider, or null for manual counting only
 *   detector          RepDetector (reset / process)
 *   haptics           HapticFeedbackController
 *   countdownEnabled  3-2-1 before the set, default true
 *   onState(snapshot) called after every change and on each timer tick
 *
 * Sensors run only while ACTIVE; reps found in the first Timing.RESUME_IGNORE_MS after a (re)start
 * are ignored (the samples still warm up the detector).
 * Status flow: DRAFT → PREPARING → ACTIVE ⇄ PAUSED → RESTING | COMPLETED; CANCELLED when nothing
 * was done.
 */
export function createWorkoutSessionController(deps) {
  const plan = deps.plan;
  const time = deps.time;
  const sensors = deps.sensors || null;
  const detector = deps.detector;
  const haptics = deps.haptics;
  const countdownEnabled = deps.countdownEnabled !== false;
  const onState = deps.onState || function () {};

  const setCount = plannedSetCount(plan);
  const workDurationSec = plan.mode === WorkoutMode.FREE ? 0 : (plan.workDurationSec || 0);
  const targetReps = plan.mode === WorkoutMode.SETS ? (plan.targetReps || 0) : 0;
  const session = deps.session || createWorkoutSession(plan, deps.sessionId, {
    calibrationProfileId: deps.calibrationProfileId
  });
  const countdown = createCountdownController(time);

  let status = S.DRAFT;
  let currentSet = null;
  let activeSince = null;
  let ignoreUntil = 0;
  let confidenceSum = 0;
  let countdownValue = 0;
  let pausedDuringCountdown = false;
  let lastEndedBy = null;
  let ticker = null;
  let autoCount = sensors !== null;

  function now() {
    return time.now();
  }

  function emit() {
    onState(snapshot());
  }

  function setStatus(to) {
    status = to;
    emit();
  }

  function stopTicker() {
    if (ticker !== null) {
      time.clearInterval(ticker);
      ticker = null;
    }
  }

  function startSensors() {
    if (sensors !== null && !sensors.isRunning()) {
      sensors.start(onSample, onSensorError);
    }
  }

  function stopSensors() {
    if (sensors !== null) {
      sensors.stop();
    }
  }

  function setActiveSec() {
    if (currentSet === null) {
      return 0;
    }
    return currentSet.activeDurationSec + (activeSince !== null ? (now() - activeSince) / 1000 : 0);
  }

  function enterActive() {
    if (currentSet === null) {
      const at = now();
      currentSet = createSetResult(session.sets.length + 1, at);
      session.sets.push(currentSet);
      confidenceSum = 0;
      if (typeof session.startedAt !== 'number') {
        session.startedAt = at;
      }
    }
    activeSince = now();
    ignoreUntil = activeSince + Timing.RESUME_IGNORE_MS;
    setStatus(S.ACTIVE);
    // Warmed up during the countdown: keep the filters, otherwise start from scratch.
    if (sensors === null || !sensors.isRunning()) {
      detector.reset();
      startSensors();
    }
    if (ticker === null) {
      ticker = time.setInterval(tick, TICK_MS);
    }
  }

  function leaveActive() {
    if (activeSince !== null) {
      currentSet.activeDurationSec += (now() - activeSince) / 1000;
      activeSince = null;
    }
    stopSensors();
    stopTicker();
  }

  function onSample(sample) {
    if (status !== S.ACTIVE && status !== S.PREPARING) {
      return;
    }
    const result = detector.process(sample);
    if (status === S.ACTIVE && result && result.detected && now() >= ignoreUntil) {
      countRep(result.confidence);
    }
  }

  function onSensorError(error) {
    if (error.code !== 'GYRO_UNAVAILABLE') {
      autoCount = false;
      emit();
    }
  }

  function countRep(confidence) {
    currentSet.autoReps++;
    confidenceSum += typeof confidence === 'number' ? confidence : 0;
    currentSet.totalReps = repTotal(currentSet);
    haptics.rep();
    emit();
    checkTargets();
  }

  function checkTargets() {
    if (status !== S.ACTIVE) {
      return;
    }
    if (targetReps > 0 && currentSet.totalReps >= targetReps) {
      endSet(SetEndReason.TARGET_REPS);
    } else if (workDurationSec > 0 && setActiveSec() >= workDurationSec) {
      endSet(SetEndReason.TIME);
    }
  }

  function tick() {
    if (status === S.ACTIVE) {
      checkTargets();
      if (status === S.ACTIVE) {
        emit();
      }
    }
  }

  function closeSet(reason) {
    leaveActive();
    const set = currentSet;
    set.finishedAt = now();
    set.endedBy = reason;
    set.totalReps = repTotal(set);
    const setCadence = perMinute(set.totalReps, set.activeDurationSec);
    if (setCadence !== undefined) {
      set.averageCadence = setCadence;
    }
    if (set.autoReps > 0) {
      set.avgConfidence = confidenceSum / set.autoReps;
    }
    lastEndedBy = reason;
    currentSet = null;
  }

  function endSet(reason) {
    closeSet(reason);
    if (plan.mode === WorkoutMode.SETS && session.sets.length < setCount) {
      haptics.setComplete();
      setStatus(S.RESTING);
    } else {
      complete();
    }
  }

  function prepare() {
    countdownValue = Timing.COUNTDOWN_SEC;
    setStatus(S.PREPARING);
    // The motion filters need a few seconds of the wrist at rest: without them the first squat of
    // a set read half as deep and was missed (watch test 2026-09-25). Reps are not counted yet.
    detector.reset();
    startSensors();
    countdown.start(Timing.COUNTDOWN_SEC, function (n) {
      countdownValue = n;
      emit();
    }, function () {
      countdownValue = 0;
      haptics.workoutStart();
      enterActive();
    });
  }

  function stopEverything() {
    stopTicker();
    countdown.cancel();
    stopSensors();
  }

  /** Totals are computed by the summary page (stats.finalizeSession): not bundled here. */
  function complete() {
    stopEverything();
    session.finishedAt = now();
    session.status = S.COMPLETED;
    haptics.workoutComplete();
    setStatus(S.COMPLETED);
  }

  function cancel() {
    if (status !== S.COMPLETED && status !== S.CANCELLED) {
      stopEverything();
      haptics.cancel();
      session.status = S.CANCELLED;
      setStatus(S.CANCELLED);
    }
  }

  function pause() {
    if (status === S.ACTIVE) {
      leaveActive();
      setStatus(S.PAUSED);
    } else if (status === S.PREPARING) {
      countdown.cancel();
      pausedDuringCountdown = true;
      setStatus(S.PAUSED);
    }
  }

  function snapshot() {
    const activeSec = setActiveSec();
    const reps = currentSet !== null ? currentSet.totalReps : 0;
    return {
      status: status,
      mode: plan.mode,
      countdown: countdownValue,
      setNumber: currentSet !== null ? currentSet.setNumber : session.sets.length + 1,
      setCount: setCount,
      reps: reps,
      targetReps: targetReps,
      workDurationSec: workDurationSec,
      activeSec: activeSec,
      workRemainingSec: workDurationSec > 0 ? Math.max(0, Math.ceil(workDurationSec - activeSec)) : 0,
      cadence: activeSec >= MIN_CADENCE_SEC ? perMinute(reps, activeSec) : undefined,
      lastSet: session.sets.length > 0 ? session.sets[session.sets.length - 1] : null,
      lastEndedBy: lastEndedBy,
      autoCount: autoCount
    };
  }

  return {
    /** DRAFT -> countdown (or straight to ACTIVE when the countdown is off). */
    start: function () {
      if (status !== S.DRAFT) {
        return;
      }
      if (countdownEnabled) {
        prepare();
      } else {
        haptics.workoutStart();
        enterActive();
      }
    },

    pause: pause,

    resume: function () {
      if (status !== S.PAUSED) {
        return;
      }
      if (pausedDuringCountdown) {
        pausedDuringCountdown = false;
        prepare();
        return;
      }
      enterActive();
      checkTargets();
    },

    /** "+1 повтор" / "−1 повтор" on the pause screen; the set total never goes below 0. */
    adjust: function (delta) {
      if (status !== S.PAUSED || currentSet === null) {
        return;
      }
      if (currentSet.autoReps + currentSet.manualAdjustment + delta < 0) {
        return;
      }
      currentSet.manualAdjustment += delta;
      currentSet.totalReps = repTotal(currentSet);
      emit();
    },

    /** "Завершить": keeps what was done; with nothing done at all the workout is cancelled. */
    finish: function () {
      if (status === S.ACTIVE || (status === S.PAUSED && currentSet !== null)) {
        closeSet(SetEndReason.MANUAL);
        complete();
      } else if (status === S.PREPARING || status === S.PAUSED || status === S.DRAFT) {
        countdown.cancel();
        if (session.sets.length === 0) {
          cancel();
        } else {
          complete();
        }
      }
    },

    cancel: cancel,

    /** The page was hidden (screen off, button, notification): pause instead of counting blind. */
    onHide: function () {
      if (status === S.ACTIVE || status === S.PREPARING) {
        pause();
      }
    },

    /** Debug builds only: the page lets a tap on the counter stand in for a detected rep. */
    simulateRep: function () {
      if (status === S.ACTIVE) {
        countRep(1);
      }
    },

    destroy: function () {
      stopEverything();
      haptics.cancel();
    },

    snapshot: snapshot,
    getStatus: function () {
      return status;
    },
    getSession: function () {
      return session;
    }
  };
}
