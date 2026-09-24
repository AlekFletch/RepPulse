import router from '@system.router';
import { BuildConfig } from '../../common/config/buildConfig.js';
import { WorkoutMode, WorkoutStatus, SetEndReason } from '../../common/domain/enums.js';
import { Timing } from '../../common/domain/limits.js';
import { createWorkoutPlan } from '../../common/domain/workout.js';
import { createNullRepDetector } from '../../common/detection/RepDetector.js';
import { createHapticsAdapter } from '../../common/platform/HapticsAdapter.js';
import { createLogger } from '../../common/platform/Logger.js';
import { createScreenAdapter } from '../../common/platform/ScreenAdapter.js';
import { createSystemTimeAdapter } from '../../common/platform/TimeAdapter.js';
import { saveLastSession } from '../../common/storage/LastSessionStore.js';
import { exerciseIcon, exerciseKey, formatDuration, go, setIfChanged } from '../../common/ui/page.js';
import { generateId } from '../../common/util/id.js';
import { roundCadence } from '../../common/util/format.js';
import { safeParse } from '../../common/util/json.js';
import { createHapticFeedbackController } from '../../common/workout/HapticFeedbackController.js';
import { createWorkoutSessionController } from '../../common/workout/WorkoutSessionController.js';

/**
 * Stage 3 runs without sensors: the detection engine arrives in Stage 4, and an unused sensor
 * provider only costs JS heap (the whole page must fit in ~100 KB together with its bytecode).
 * The note on the active screen tells the user to correct reps by hand for now.
 */
const AUTO_COUNT_READY = false;

const S = WorkoutStatus;
const time = createSystemTimeAdapter();
const logger = createLogger('workout');
const screen = createScreenAdapter(logger);

let controller = null;
let planInput = null;
let left = false;
/** Fixed strings looked up once. Templates go through $t(path, params) on every paint:
 * on lite, $t without params strips the {placeholders}. */
let t = null;

function endReasonKey(reason) {
    if (reason === SetEndReason.TARGET_REPS) {
        return 'endedByReps';
    }
    return reason === SetEndReason.TIME ? 'endedByTime' : 'endedByManual';
}

/**
 * params (ui/launch.workoutParams):
 *   planJson     plan input with the wrist and vibrationOnRep (no id yet)
 *   optionsJson  { vibrationEnabled, countdownEnabled }
 */
export default {
    data: {
        planJson: '',
        optionsJson: '',
        vPrepare: false,
        vActive: false,
        vPaused: false,
        vRest: false,
        iconHero: '',
        iconSmall: '',
        countdownText: '',
        topText: '',
        setLabel: '',
        repsText: '0',
        targetText: '',
        timeText: '',
        cadenceText: '',
        noteText: '',
        restText: '',
        nextSetText: '',
        lastSetText: '',
        startNowText: ''
    },

    onInit() {
        left = false;
        controller = null;
        planInput = safeParse(this.planJson, null);
        if (!planInput) {
            this.leave('index');
            return;
        }
        t = {
            startNow: this.$t('strings.startNow'),
            startNextSet: this.$t('strings.startNextSet'),
            manual: this.$t('strings.manualCounting'),
            soon: this.$t('strings.autoCountSoon')
        };
        this.iconHero = exerciseIcon(planInput.exerciseType, 96);
        this.iconSmall = exerciseIcon(planInput.exerciseType, 28);
        this.topText = this.$t('strings.' + exerciseKey(planInput.exerciseType));
        screen.keepScreenOn(true);
        this.begin(safeParse(this.optionsJson, null) || {});
    },

    /** The plan was validated by the setup screen; this page only runs it. */
    begin(options) {
        const now = time.now();
        const plan = createWorkoutPlan(planInput, generateId(now), now);
        const self = this;
        controller = createWorkoutSessionController({
            plan: plan,
            sessionId: generateId(now),
            time: time,
            sensors: null,
            detector: createNullRepDetector(),
            haptics: createHapticFeedbackController(createHapticsAdapter(time, logger), {
                vibrationEnabled: options.vibrationEnabled !== false,
                vibrationOnRep: plan.vibrationOnRep
            }),
            countdownEnabled: options.countdownEnabled !== false,
            onState: function (state) {
                self.paint(state);
            }
        });
        controller.start();
    },

    paint(s) {
        if (s.status === S.COMPLETED) {
            this.onCompleted();
            return;
        }
        if (s.status === S.CANCELLED) {
            this.leave('index');
            return;
        }
        setIfChanged(this, 'vPrepare', s.status === S.PREPARING);
        setIfChanged(this, 'vActive', s.status === S.ACTIVE);
        setIfChanged(this, 'vPaused', s.status === S.PAUSED);
        setIfChanged(this, 'vRest', s.status === S.RESTING);
        setIfChanged(this, 'repsText', String(s.reps));

        if (s.status === S.PREPARING) {
            setIfChanged(this, 'countdownText', String(s.countdown));
        } else if (s.status === S.ACTIVE) {
            this.renderActive(s);
        } else if (s.status === S.RESTING) {
            this.renderRest(s);
        }
    },

    renderActive(s) {
        const sets = s.mode === WorkoutMode.SETS;
        setIfChanged(this, 'setLabel', sets ? this.$t('strings.setOf', { current: s.setNumber, total: s.setCount }) : '');
        setIfChanged(this, 'targetText', s.targetReps > 0 ? this.$t('strings.repsOfTarget', { reps: s.reps, target: s.targetReps }) : '');
        setIfChanged(this, 'timeText', s.workDurationSec > 0
            ? this.$t('strings.remaining', { time: formatDuration(s.workRemainingSec) })
            : formatDuration(s.activeSec));
        setIfChanged(this, 'cadenceText', s.cadence !== undefined ? this.$t('strings.cadence', { value: roundCadence(s.cadence) }) : '');
        let note = '';
        if (!AUTO_COUNT_READY) {
            note = t.soon;
        } else if (!s.autoCount) {
            note = t.manual;
        }
        setIfChanged(this, 'noteText', note);
    },

    renderRest(s) {
        setIfChanged(this, 'restText', formatDuration(s.restRemainingSec));
        setIfChanged(this, 'nextSetText', this.$t('strings.nextSetOf', { current: s.setNumber, total: s.setCount }));
        let last = '';
        if (s.lastSet) {
            last = this.$t('strings.setDone', { n: s.lastSet.setNumber, reps: s.lastSet.totalReps }) +
                ' · ' + this.$t('strings.' + endReasonKey(s.lastEndedBy));
        }
        setIfChanged(this, 'lastSetText', last);
        setIfChanged(this, 'startNowText', s.restDone ? t.startNextSet : t.startNow);
    },

    onCompleted() {
        if (left) {
            return;
        }
        const self = this;
        saveLastSession(controller.getSession(), function (err) {
            if (err) {
                logger.warn('saveLastSession failed ' + err.code);
            }
            self.leave('summary', {
                planJson: self.planJson,
                optionsJson: self.optionsJson,
                saveFailed: err ? 'true' : ''
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

    startNow() {
        if (!controller) {
            return;
        }
        if (controller.snapshot().restDone) {
            controller.startNextSet();
        } else {
            controller.startNow();
        }
    },

    extendRest() {
        if (controller) {
            controller.extendRest(Timing.REST_EXTEND_SEC);
        }
    },

    finish() {
        if (controller) {
            controller.finish();
        }
    },

    /** Debug builds: tapping the counter stands in for a detected rep (no detector until Stage 4). */
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
