import { WorkoutMode, WorkoutStatus, SetEndReason } from '../domain/enums.js';
import { Timing } from '../domain/limits.js';
import { createWorkoutSession, createSetResult, plannedSetCount } from '../domain/workout.js';
import { createWorkoutStateMachine } from '../domain/workoutStateMachine.js';
import { cadence, computeSessionTotals, setRepTotal } from '../domain/stats.js';
import { SensorErrorCode } from '../sensors/SensorError.js';
import { createCountdownController } from './CountdownController.js';
import { createRestTimerController } from './RestTimerController.js';

const S = WorkoutStatus;
const TICK_MS = 250;
/** Cadence is shown only after this much active time, otherwise the first rep reads as 60+/min. */
const MIN_CADENCE_SEC = 5;

/**
 * Runs one workout: countdown, sets, pauses, rests, targets, totals (spec 2.3–2.5, 4.2).
 * Pages never touch sensors: they call the methods below and render snapshot() from onState.
 *
 * deps:
 *   plan              WorkoutPlan (models.createWorkoutPlan)
 *   sessionId         id for the WorkoutSession
 *   time              TimeAdapter
 *   sensors           SensorProvider, or null for manual counting only
 *   detector          RepDetector (reset / process)
 *   haptics           HapticFeedbackController
 *   countdownEnabled  3-2-1 before each set (AppSettings.countdownEnabled), default true
 *   onState(snapshot) called after every change and on each timer tick
 *
 * Sensors run only while ACTIVE; the first Timing.RESUME_IGNORE_MS after (re)start are ignored.
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
  const session = createWorkoutSession(plan, deps.sessionId, {
    calibrationProfileId: deps.calibrationProfileId
  });
  const machine = createWorkoutStateMachine(S.DRAFT);
  const countdown = createCountdownController(time);
  const rest = createRestTimerController(time);

  let currentSet = null;
  let activeSince = null;
  let ignoreUntil = 0;
  let confidenceSum = 0;
  let restStartedAt = null;
  let restDone = false;
  let countdownValue = 0;
  let pausedDuringCountdown = false;
  let lastEndedBy = null;
  let ticker = null;
  let autoCount = sensors !== null;
  let gyroAvailable = sensors !== null;

  function now() {
    return time.now();
  }

  function emit() {
    onState(snapshot());
  }

  function setStatus(to) {
    machine.transition(to);
    emit();
  }

  function startTicker() {
    if (ticker === null) {
      ticker = time.setInterval(tick, TICK_MS);
    }
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
    const running = activeSince !== null ? (now() - activeSince) / 1000 : 0;
    return currentSet.activeDurationSec + running;
  }

  function beginSet() {
    const at = now();
    currentSet = createSetResult(session.sets.length + 1, at);
    session.sets.push(currentSet);
    confidenceSum = 0;
    if (typeof session.startedAt !== 'number') {
      session.startedAt = at;
    }
  }

  function enterActive() {
    if (currentSet === null) {
      beginSet();
    }
    activeSince = now();
    ignoreUntil = activeSince + Timing.RESUME_IGNORE_MS;
    detector.reset();
    setStatus(S.ACTIVE);
    startSensors();
    startTicker();
  }

  function leaveActive() {
    if (activeSince !== null) {
      currentSet.activeDurationSec += (now() - activeSince) / 1000;
      activeSince = null;
    }
    stopSensors();
  }

  function onSample(sample) {
    if (machine.getStatus() !== S.ACTIVE || now() < ignoreUntil) {
      return;
    }
    const result = detector.process(sample);
    if (result && result.detected) {
      countRep(result.confidence);
    }
  }

  function onSensorError(error) {
    if (error.code === SensorErrorCode.GYRO_UNAVAILABLE) {
      gyroAvailable = false;
    } else {
      autoCount = false;
      gyroAvailable = false;
    }
    emit();
  }

  function countRep(confidence) {
    currentSet.autoReps++;
    confidenceSum += typeof confidence === 'number' ? confidence : 0;
    currentSet.totalReps = setRepTotal(currentSet);
    haptics.rep();
    emit();
    checkTargets();
  }

  function checkTargets() {
    if (machine.getStatus() !== S.ACTIVE) {
      return;
    }
    if (targetReps > 0 && currentSet.totalReps >= targetReps) {
      endSet(SetEndReason.TARGET_REPS);
    } else if (workDurationSec > 0 && setActiveSec() >= workDurationSec) {
      endSet(SetEndReason.TIME);
    }
  }

  function tick() {
    const status = machine.getStatus();
    if (status === S.ACTIVE) {
      checkTargets();
      if (machine.getStatus() === S.ACTIVE) {
        emit();
      }
    }
  }

  function closeSet(reason) {
    leaveActive();
    const set = currentSet;
    set.finishedAt = now();
    set.endedBy = reason;
    set.totalReps = setRepTotal(set);
    const setCadence = cadence(set.totalReps, set.activeDurationSec);
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
      startRest();
    } else {
      complete();
    }
  }

  function startRest() {
    stopTicker();
    restStartedAt = now();
    restDone = false;
    setStatus(S.RESTING);
    rest.start(plan.restDurationSec, {
      onTick: emit,
      onWarning: function () {
        haptics.restWarning();
      },
      onDone: onRestDone
    });
  }

  function onRestDone() {
    haptics.restEnd();
    restDone = true;
    if (plan.autoStartNextSet === true) {
      startNextSet(true);
    } else {
      emit();
    }
  }

  function closeRest() {
    rest.stop();
    if (restStartedAt !== null) {
      session.restDurationSec += (now() - restStartedAt) / 1000;
      restStartedAt = null;
    }
  }

  function startNextSet(withCountdown) {
    closeRest();
    if (withCountdown && countdownEnabled) {
      prepare();
    } else {
      haptics.workoutStart();
      enterActive();
    }
  }

  function prepare() {
    stopTicker();
    countdownValue = Timing.COUNTDOWN_SEC;
    setStatus(S.PREPARING);
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
    rest.stop();
    stopSensors();
  }

  function complete() {
    closeRest();
    stopEverything();
    session.finishedAt = now();
    const totals = computeSessionTotals(session);
    session.totalReps = totals.totalReps;
    session.totalAutoReps = totals.totalAutoReps;
    session.totalManualAdjustment = totals.totalManualAdjustment;
    session.activeDurationSec = totals.activeDurationSec;
    if (totals.averageCadence !== undefined) {
      session.averageCadence = totals.averageCadence;
    }
    session.status = S.COMPLETED;
    haptics.workoutComplete();
    setStatus(S.COMPLETED);
  }

  function cancel() {
    if (machine.can(S.CANCELLED)) {
      stopEverything();
      haptics.cancel();
      session.status = S.CANCELLED;
      setStatus(S.CANCELLED);
    }
  }

  function pause() {
    const status = machine.getStatus();
    if (status === S.ACTIVE) {
      leaveActive();
      stopTicker();
      setStatus(S.PAUSED);
    } else if (status === S.PREPARING) {
      countdown.cancel();
      pausedDuringCountdown = true;
      setStatus(S.PAUSED);
    }
  }

  function snapshot() {
    const status = machine.getStatus();
    const activeSec = setActiveSec();
    const reps = currentSet !== null ? currentSet.totalReps : 0;
    const shownCadence = activeSec >= MIN_CADENCE_SEC ? cadence(reps, activeSec) : undefined;
    const upcoming = currentSet !== null ? currentSet.setNumber : session.sets.length + 1;
    return {
      status: status,
      mode: plan.mode,
      exerciseType: plan.exerciseType,
      countdown: countdownValue,
      setNumber: upcoming,
      setCount: setCount,
      reps: reps,
      targetReps: targetReps,
      workDurationSec: workDurationSec,
      activeSec: activeSec,
      workRemainingSec: workDurationSec > 0 ? Math.max(0, Math.ceil(workDurationSec - activeSec)) : 0,
      cadence: shownCadence,
      restRemainingSec: rest.remainingSec(),
      restDone: restDone,
      lastSet: session.sets.length > 0 ? session.sets[session.sets.length - 1] : null,
      lastEndedBy: lastEndedBy,
      autoCount: autoCount,
      gyroAvailable: gyroAvailable
    };
  }

  return {
    /** DRAFT -> countdown (or straight to ACTIVE when the countdown is off). */
    start: function () {
      if (machine.getStatus() !== S.DRAFT) {
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
      if (machine.getStatus() !== S.PAUSED) {
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
      if (machine.getStatus() !== S.PAUSED || currentSet === null) {
        return;
      }
      if (currentSet.autoReps + currentSet.manualAdjustment + delta < 0) {
        return;
      }
      currentSet.manualAdjustment += delta;
      currentSet.totalReps = setRepTotal(currentSet);
      emit();
    },

    /** "Начать сейчас": ends the rest at once, without a countdown. */
    startNow: function () {
      if (machine.getStatus() === S.RESTING) {
        startNextSet(false);
      }
    },

    /** "Начать следующий подход" after the rest ran out with auto-start off. */
    startNextSet: function () {
      if (machine.getStatus() === S.RESTING) {
        startNextSet(true);
      }
    },

    extendRest: function (sec) {
      if (machine.getStatus() === S.RESTING && !restDone) {
        rest.extend(sec);
        emit();
      }
    },

    /** "Завершить": keeps what was done; with nothing done the workout is cancelled. */
    finish: function () {
      const status = machine.getStatus();
      if (status === S.ACTIVE || (status === S.PAUSED && currentSet !== null)) {
        if (status === S.ACTIVE) {
          leaveActive();
        }
        closeSet(SetEndReason.MANUAL);
        complete();
      } else if (status === S.RESTING) {
        complete();
      } else if (status === S.PREPARING || status === S.PAUSED) {
        countdown.cancel();
        if (session.sets.length === 0) {
          cancel();
        } else {
          if (status === S.PREPARING) {
            setStatus(S.PAUSED);
          }
          complete();
        }
      } else if (status === S.DRAFT) {
        cancel();
      }
    },

    cancel: cancel,

    /** The page was hidden (screen off, button, notification): pause instead of counting blind. */
    onHide: function () {
      const status = machine.getStatus();
      if (status === S.ACTIVE || status === S.PREPARING) {
        pause();
      }
    },

    /** Debug builds only: the page lets a tap on the counter stand in for a detected rep. */
    simulateRep: function () {
      if (machine.getStatus() === S.ACTIVE) {
        countRep(1);
      }
    },

    destroy: function () {
      stopEverything();
      haptics.cancel();
    },

    snapshot: snapshot,
    getStatus: function () {
      return machine.getStatus();
    },
    getSession: function () {
      return session;
    }
  };
}
