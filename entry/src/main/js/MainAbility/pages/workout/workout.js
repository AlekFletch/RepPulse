import router from '@system.router';
import { BuildConfig } from '../../common/config/buildConfig.js';
import { WorkoutMode, WorkoutStatus } from '../../common/domain/enums.js';
import { createRepDetectionEngine } from '../../common/detection/RepDetectionEngine.js';
import { createHapticsAdapter } from '../../common/platform/HapticsAdapter.js';
import { createScreenAdapter } from '../../common/platform/ScreenAdapter.js';
import { createSystemTimeAdapter } from '../../common/platform/TimeAdapter.js';
import { createMotionSensorSource } from '../../common/sensors/MotionSensorSource.js';
import { readLastSession, saveLastSession } from '../../common/storage/LastSessionStore.js';
import { ICON_PUSH_UP, ICON_SQUAT } from '../../common/icons/icons.js';
import { go, setIfChanged } from '../../common/ui/nav.js';
import { generateId } from '../../common/util/id.js';
import { formatDuration, roundCadence } from '../../common/util/format.js';
import { safeParse } from '../../common/util/json.js';
import { createHapticFeedbackController } from '../../common/workout/HapticFeedbackController.js';
import { createWorkoutSessionController } from '../../common/workout/WorkoutSessionController.js';

const S = WorkoutStatus;
const time = createSystemTimeAdapter();
const screen = createScreenAdapter(null);

let controller = null;
/** Debug builds show the detector state under the counter (phase, signal / threshold, last reason). */
let detector = null;
let planInput = null;
let options = null;
let left = false;
/** Exit confirmation (swipe right) is open; resumeAfterCancel: the swipe paused an active set. */
let confirming = false;
let resumeAfterCancel = false;

/**
 * Countdown, active set, pause, exit confirmation (spec 2.3–2.5). The rest between sets is the
 * `rest` page: this page and the detector already use most of the ~100 KB JS heap.
 *
 * params (ui/launch.workoutParams):
 *   planJson     the WorkoutPlan (ui/launch.workoutParams builds it)
 *   optionsJson  { vibrationEnabled, countdownEnabled, sensitivity, profile }
 *   resume       '1': continue the session in workouts/last.json with its next set (from `rest`)
 *   restSec      seconds of rest to add to that session
 *   countdown    '0': start the next set at once ("Начать сейчас")
 */
export default {
    data: {
        planJson: '',
        optionsJson: '',
        resume: '',
        restSec: '',
        countdown: '',
        vPrepare: false,
        vActive: false,
        vPaused: false,
        vConfirm: false,
        iconHero: '',
        iconSmall: '',
        countdownText: '',
        topText: '',
        setLabel: '',
        repsText: '0',
        targetText: '',
        timeText: '',
        cadenceText: '',
        noteText: ''
    },

    onInit() {
        left = false;
        controller = null;
        detector = null;
        confirming = false;
        resumeAfterCancel = false;
        planInput = safeParse(this.planJson, null);
        options = safeParse(this.optionsJson, null) || {};
        if (!planInput) {
            this.leave('index');
            return;
        }
        const pushUps = planInput.exerciseType === 'PUSH_UP';
        const icon = pushUps ? ICON_PUSH_UP : ICON_SQUAT;
        this.iconHero = icon[64];
        this.iconSmall = icon[28];
        this.topText = this.$t(pushUps ? 'strings.pushUps' : 'strings.squats');
        screen.keepScreenOn(true);
        if (this.resume !== '1') {
            this.begin(null);
            return;
        }
        const self = this;
        const restSec = Number(this.restSec) || 0;
        readLastSession(function (err, session) {
            if (err || !session) {
                console.warn('cannot continue the workout: ' + (err ? err.code : 'no session'));
                self.leave('index');
                return;
            }
            session.restDurationSec += restSec;
            self.begin(session);
        });
    },

    /** The plan was validated by the setup screen; this page only runs it. */
    begin(session) {
        if (left) {
            return;
        }
        const now = time.now();
        const plan = session ? session.plan : planInput;
        const self = this;
        detector = createRepDetectionEngine({
            exerciseType: plan.exerciseType,
            profile: options.profile || null,
            sensitivity: options.sensitivity,
            debug: BuildConfig.DEBUG
        });
        controller = createWorkoutSessionController({
            plan: plan,
            sessionId: generateId(now),
            session: session,
            time: time,
            sensors: createMotionSensorSource(time),
            detector: detector,
            haptics: createHapticFeedbackController(createHapticsAdapter(time, null), {
                vibrationEnabled: options.vibrationEnabled !== false,
                vibrationOnRep: plan.vibrationOnRep
            }),
            countdownEnabled: options.countdownEnabled !== false && this.countdown !== '0',
            calibrationProfileId: options.profile ? options.profile.id : undefined,
            onState: function (state) {
                self.paint(state);
            }
        });
        controller.start();
    },

    paint(s) {
        if (s.status === S.COMPLETED || s.status === S.RESTING) {
            this.handOver(s);
            return;
        }
        if (s.status === S.CANCELLED) {
            this.leave('index');
            return;
        }
        setIfChanged(this, 'vConfirm', confirming);
        setIfChanged(this, 'vPrepare', !confirming && s.status === S.PREPARING);
        setIfChanged(this, 'vActive', !confirming && s.status === S.ACTIVE);
        setIfChanged(this, 'vPaused', !confirming && s.status === S.PAUSED);
        setIfChanged(this, 'repsText', String(s.reps));
        if (s.status === S.PREPARING) {
            setIfChanged(this, 'countdownText', String(s.countdown));
        } else if (s.status === S.ACTIVE) {
            this.paintActive(s);
        }
    },

    paintActive(s) {
        const sets = s.mode === WorkoutMode.SETS;
        setIfChanged(this, 'setLabel', sets ? this.$t('strings.setOf', { current: s.setNumber, total: s.setCount }) : '');
        setIfChanged(this, 'targetText', s.targetReps > 0 ? this.$t('strings.repsOfTarget', { reps: s.reps, target: s.targetReps }) : '');
        setIfChanged(this, 'timeText', s.workDurationSec > 0
            ? this.$t('strings.remaining', { time: formatDuration(s.workRemainingSec) })
            : formatDuration(s.activeSec));
        setIfChanged(this, 'cadenceText', s.cadence !== undefined ? this.$t('strings.cadence', { value: roundCadence(s.cadence) }) : '');
        let note = '';
        if (!s.autoCount) {
            note = this.$t('strings.manualCounting');
        } else if (BuildConfig.DEBUG && detector) {
            note = detector.debugState();
        }
        setIfChanged(this, 'noteText', note);
    },

    /** The set is over: save the session, then the rest page (more sets) or the summary. */
    handOver(s) {
        if (left) {
            return;
        }
        const self = this;
        const resting = s.status === S.RESTING;
        const plan = controller.getSession().plan;
        saveLastSession(controller.getSession(), function (err) {
            if (err) {
                console.warn('saveLastSession failed ' + err.code);
            }
            if (!resting) {
                self.leave('summary', {
                    planJson: self.planJson,
                    optionsJson: self.optionsJson,
                    saveFailed: err ? 'true' : ''
                });
                return;
            }
            self.leave('rest', {
                planJson: self.planJson,
                optionsJson: self.optionsJson,
                exercise: plan.exerciseType,
                restSec: String(plan.restDurationSec),
                autoStart: plan.autoStartNextSet ? '1' : '',
                nextSet: String(s.setNumber),
                setCount: String(s.setCount),
                lastReps: String(s.lastSet ? s.lastSet.totalReps : 0),
                endedBy: s.lastEndedBy || ''
            });
        });
    },

    leave(page, params) {
        if (left) {
            return;
        }
        left = true;
        screen.keepScreenOn(false);
        if (controller !== null) {
            controller.destroy();
        }
        // Drop every reference into this page's closures before the next page loads: the JS heap
        // (~100 KB) cannot hold this page's code and the next one's at the same time.
        controller = null;
        detector = null;
        planInput = null;
        options = null;
        // ...and drop the visible view (built with `if`): its elements go before the next page.
        this.vPrepare = false;
        this.vActive = false;
        this.vPaused = false;
        this.vConfirm = false;
        go(router, null, page, params);
    },

    pause() {
        if (controller) {
            controller.pause();
        }
    },

    resume() {
        if (controller) {
            controller.resume();
        }
    },

    plusRep() {
        if (controller) {
            controller.adjust(1);
        }
    },

    minusRep() {
        if (controller) {
            controller.adjust(-1);
        }
    },

    finish() {
        if (controller) {
            controller.finish();
        }
    },

    /** Swipe right: pause and ask "Завершить тренировку?" instead of leaving at once. */
    onSwipe(e) {
        if (!e || e.direction !== 'right' || !controller || confirming) {
            return;
        }
        const status = controller.getStatus();
        if (status === S.COMPLETED || status === S.CANCELLED || status === S.RESTING) {
            return;
        }
        resumeAfterCancel = status === S.ACTIVE || status === S.PREPARING;
        confirming = true;
        controller.pause();
        this.paint(controller.snapshot());
    },

    cancelExit() {
        confirming = false;
        if (!controller) {
            return;
        }
        if (resumeAfterCancel) {
            controller.resume();
        } else {
            this.paint(controller.snapshot());
        }
    },

    /** Completed sets go to the summary; with nothing done the controller cancels -> home. */
    confirmExit() {
        confirming = false;
        if (controller) {
            controller.finish();
        }
    },

    /** Debug builds: tapping the counter stands in for a detected rep. */
    onCounterTap() {
        if (BuildConfig.DEBUG && controller) {
            controller.simulateRep();
        }
    },

    onHide() {
        if (controller) {
            controller.onHide();
        }
    },

    onDestroy() {
        screen.keepScreenOn(false);
        if (controller !== null) {
            controller.destroy();
            controller = null;
        }
    }
};
