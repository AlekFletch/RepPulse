import router from '@system.router';
import { ExerciseType, WristSide } from '../../common/domain/enums.js';
import { Timing } from '../../common/domain/limits.js';
import {
    createCalibrationEngine, MAX_CALIBRATION_REPS, MIN_CALIBRATION_REPS
} from '../../common/detection/CalibrationEngine.js';
import { createHapticsAdapter, HapticMode } from '../../common/platform/HapticsAdapter.js';
import { createLogger } from '../../common/platform/Logger.js';
import { createScreenAdapter } from '../../common/platform/ScreenAdapter.js';
import { createSystemTimeAdapter } from '../../common/platform/TimeAdapter.js';
import { createMotionSensorSource } from '../../common/sensors/MotionSensorSource.js';
import { createCalibrationRepository } from '../../common/storage/CalibrationRepository.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createSettingsRepository } from '../../common/storage/SettingsRepository.js';
import { exerciseIcon, focusRotation, go, isExercise, setIfChanged } from '../../common/ui/page.js';
import { generateId } from '../../common/util/id.js';
import { createCountdownController } from '../../common/workout/CountdownController.js';

const SELECTED = '#2DE3C4';
const SELECTED_TEXT = '#04101F';
const NORMAL = '#0E1638';
const NORMAL_TEXT = '#FFFFFF';
const FAIL_COLOR = '#FF8A7A';
const OK_COLOR = '#B8F34A';
/** Recording stops by itself after this long even without 5 reps. */
const RECORDING_LIMIT_MS = 30000;

const time = createSystemTimeAdapter();
const logger = createLogger('calibration');
const storage = createSystemStorageAdapter();
const settingsRepo = createSettingsRepository(storage);
const screen = createScreenAdapter(logger);
const haptics = createHapticsAdapter(time, logger);
const countdown = createCountdownController(time);

let wrist = WristSide.LEFT;
let sensors = null;
let engine = null;
let limitTimer = null;

/** params: exercise. The chosen wrist is stored as AppSettings.wristSide. */
export default {
    data: {
        exercise: '',
        icon: '',
        vSetup: true,
        vCountdown: false,
        vRecording: false,
        vResult: false,
        leftColor: NORMAL,
        leftText: NORMAL_TEXT,
        rightColor: NORMAL,
        rightText: NORMAL_TEXT,
        countdownText: '',
        repsText: '0',
        progressText: '',
        finishColor: NORMAL,
        finishTextColor: '#5A6488',
        resultTitle: '',
        resultText: '',
        resultColor: OK_COLOR
    },

    onInit() {
        if (!isExercise(this.exercise)) {
            this.exercise = ExerciseType.SQUAT;
        }
        this.icon = exerciseIcon(this.exercise, 28);
        wrist = WristSide.LEFT;
        this.showWrist(wrist);
        const self = this;
        settingsRepo.load(function (err, settings) {
            wrist = settings.wristSide;
            self.showWrist(wrist);
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    onHide() {
        // No background work on lite: a hidden calibration is abandoned, not saved half-done.
        if (this.vCountdown || this.vRecording) {
            this.stopRecording();
            this.show('vSetup');
        }
    },

    onDestroy() {
        this.stopRecording();
    },

    show(view) {
        setIfChanged(this, 'vSetup', view === 'vSetup');
        setIfChanged(this, 'vCountdown', view === 'vCountdown');
        setIfChanged(this, 'vRecording', view === 'vRecording');
        setIfChanged(this, 'vResult', view === 'vResult');
    },

    /** Colours go through `style`: data binding inside `class` does not compile on lite. */
    showWrist(side) {
        const left = side === WristSide.LEFT;
        this.leftColor = left ? SELECTED : NORMAL;
        this.leftText = left ? SELECTED_TEXT : NORMAL_TEXT;
        this.rightColor = left ? NORMAL : SELECTED;
        this.rightText = left ? NORMAL_TEXT : SELECTED_TEXT;
    },

    choose(side) {
        wrist = side;
        this.showWrist(side);
        settingsRepo.set('wristSide', side, function () {});
    },

    chooseLeft() {
        this.choose(WristSide.LEFT);
    },

    chooseRight() {
        this.choose(WristSide.RIGHT);
    },

    start() {
        const self = this;
        focusRotation(this.$refs.list, false);
        screen.keepScreenOn(true);
        this.show('vCountdown');
        countdown.start(Timing.COUNTDOWN_SEC, function (n) {
            self.countdownText = String(n);
        }, function () {
            self.record();
        });
    },

    record() {
        const self = this;
        engine = createCalibrationEngine(this.exercise, wrist);
        this.paintProgress(0);
        this.show('vRecording');
        haptics.vibrate(HapticMode.LONG);
        sensors = createMotionSensorSource(time);
        sensors.start(function (sample) {
            const n = engine.process(sample);
            if (n !== null) {
                haptics.vibrate(HapticMode.SHORT);
                self.paintProgress(n);
                if (n >= MAX_CALIBRATION_REPS) {
                    self.finish();
                }
            }
        }, function (error) {
            logger.warn('sensor error ' + error.code);
        });
        limitTimer = time.setTimeout(function () {
            limitTimer = null;
            self.finish();
        }, RECORDING_LIMIT_MS);
    },

    paintProgress(n) {
        setIfChanged(this, 'repsText', String(n));
        setIfChanged(this, 'progressText', this.$t('strings.calibReps', { n: n, max: MAX_CALIBRATION_REPS }));
        setIfChanged(this, 'finishColor', n >= MIN_CALIBRATION_REPS ? SELECTED : NORMAL);
        setIfChanged(this, 'finishTextColor', n >= MIN_CALIBRATION_REPS ? SELECTED_TEXT : '#5A6488');
    },

    /** "Готово": allowed once the minimum number of reps is recorded. */
    finishEarly() {
        if (engine && engine.count() >= MIN_CALIBRATION_REPS) {
            this.finish();
        }
    },

    stopRecording() {
        countdown.cancel();
        if (limitTimer !== null) {
            time.clearTimeout(limitTimer);
            limitTimer = null;
        }
        if (sensors !== null) {
            sensors.stop();
            sensors = null;
        }
        screen.keepScreenOn(false);
    },

    finish() {
        if (engine === null) {
            return;
        }
        this.stopRecording();
        const now = time.now();
        const result = engine.finish(generateId(now), now);
        engine = null;
        haptics.vibrate(HapticMode.LONG);
        if (!result.ok) {
            this.showResult(false, this.$t('strings.calibrationFailed'));
            return;
        }
        const self = this;
        createCalibrationRepository(storage).save(result.profile, function (err) {
            if (err) {
                self.showResult(false, self.$t('strings.saveFailed'));
                return;
            }
            const wristName = self.$t(wrist === WristSide.RIGHT ? 'strings.wristRight' : 'strings.wristLeft');
            self.showResult(true, self.$t('strings.calibSaved', { wrist: wristName.toLowerCase() }));
        });
    },

    showResult(ok, text) {
        this.resultTitle = ok ? this.$t('strings.calibrationCompleted') : '';
        this.resultColor = ok ? OK_COLOR : FAIL_COLOR;
        this.resultText = text;
        this.show('vResult');
    },

    retry() {
        this.show('vSetup');
    },

    goBack() {
        this.stopRecording();
        go(router, this.vSetup ? this.$refs.list : null, 'exercise', { exercise: this.exercise });
    },

    onSwipe(e) {
        if (e && e.direction === 'right' && !this.vCountdown && !this.vRecording) {
            this.goBack();
        }
    }
};
