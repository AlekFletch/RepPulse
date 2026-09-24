import router from '@system.router';
import { SetEndReason } from '../../common/domain/enums.js';
import { Timing } from '../../common/domain/limits.js';
import { createHapticsAdapter } from '../../common/platform/HapticsAdapter.js';
import { createLogger } from '../../common/platform/Logger.js';
import { createScreenAdapter } from '../../common/platform/ScreenAdapter.js';
import { createSystemTimeAdapter } from '../../common/platform/TimeAdapter.js';
import { formatDuration, go, setIfChanged } from '../../common/ui/page.js';
import { safeParse } from '../../common/util/json.js';
import { createHapticFeedbackController } from '../../common/workout/HapticFeedbackController.js';
import { createRestTimerController } from '../../common/workout/RestTimerController.js';

const time = createSystemTimeAdapter();
const logger = createLogger('rest');
const screen = createScreenAdapter(logger);
const timer = createRestTimerController(time);

let haptics = null;
let startedAt = 0;
let done = false;
let left = false;

function endReasonKey(reason) {
    if (reason === SetEndReason.TARGET_REPS) {
        return 'endedByReps';
    }
    return reason === SetEndReason.TIME ? 'endedByTime' : 'endedByManual';
}

/**
 * Rest between sets (spec 2.5): timer, short vibrations at 3-2-1, "+15 сек", "Начать сейчас",
 * auto-start, "Завершить тренировку". The session itself waits in workouts/last.json; this page
 * only passes the rest time on (to the workout page for the next set, or to the summary).
 *
 * params: planJson, optionsJson (passed back), restSec (planned rest), autoStart ('1'),
 *         nextSet, setCount, lastReps, endedBy (the set just finished)
 */
export default {
    data: {
        planJson: '',
        optionsJson: '',
        restSec: '',
        autoStart: '',
        nextSet: '',
        setCount: '',
        lastReps: '',
        endedBy: '',
        vRest: true,
        vConfirm: false,
        restText: '',
        nextSetText: '',
        lastSetText: '',
        startNowText: ''
    },

    onInit() {
        left = false;
        done = false;
        startedAt = time.now();
        const options = safeParse(this.optionsJson, null) || {};
        haptics = createHapticFeedbackController(createHapticsAdapter(time, logger), {
            vibrationEnabled: options.vibrationEnabled !== false,
            vibrationOnRep: false
        });
        this.nextSetText = this.$t('strings.nextSetOf', { current: this.nextSet, total: this.setCount });
        this.lastSetText = this.$t('strings.setDone', { n: Number(this.nextSet) - 1, reps: this.lastReps }) +
            ' · ' + this.$t('strings.' + endReasonKey(this.endedBy));
        this.startNowText = this.$t('strings.startNow');
        screen.keepScreenOn(true);
        const self = this;
        timer.start(Number(this.restSec) || Timing.REST_EXTEND_SEC, {
            onTick: function (remaining) {
                setIfChanged(self, 'restText', formatDuration(remaining));
            },
            onWarning: function () {
                haptics.restWarning();
            },
            onDone: function () {
                self.onRestDone();
            }
        });
    },

    onRestDone() {
        haptics.restEnd();
        done = true;
        if (this.autoStart === '1') {
            this.nextSetWith(true);
        } else {
            this.startNowText = this.$t('strings.startNextSet');
        }
    },

    elapsedSec() {
        return String(Math.round((time.now() - startedAt) / 1000));
    },

    /** Back to the workout page for the next set; withCountdown false = "Начать сейчас". */
    nextSetWith(withCountdown) {
        this.leave('workout', {
            planJson: this.planJson,
            optionsJson: this.optionsJson,
            resume: '1',
            restSec: this.elapsedSec(),
            countdown: withCountdown ? '1' : '0'
        });
    },

    startNow() {
        this.nextSetWith(done);
    },

    extendRest() {
        if (!done) {
            timer.extend(Timing.REST_EXTEND_SEC);
        }
    },

    finish() {
        this.leave('summary', {
            planJson: this.planJson,
            optionsJson: this.optionsJson,
            finishRestSec: this.elapsedSec()
        });
    },

    onSwipe(e) {
        if (e && e.direction === 'right') {
            this.vRest = false;
            this.vConfirm = true;
        }
    },

    cancelExit() {
        this.vConfirm = false;
        this.vRest = true;
    },

    leave(page, params) {
        if (left) {
            return;
        }
        left = true;
        timer.stop();
        haptics.cancel();
        screen.keepScreenOn(false);
        go(router, null, page, params);
    },

    onDestroy() {
        timer.stop();
        screen.keepScreenOn(false);
    }
};
