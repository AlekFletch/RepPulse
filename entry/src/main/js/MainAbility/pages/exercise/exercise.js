import router from '@system.router';
import { ExerciseType, WorkoutMode } from '../../common/domain/enums.js';
import { createBatteryAdapter, isLowBattery } from '../../common/platform/BatteryAdapter.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createDefaultSettings } from '../../common/domain/models.js';
import { loadLaunchData, workoutParams } from '../../common/ui/launch.js';
import { exerciseIcon, exerciseKey, focusRotation, go, isExercise } from '../../common/ui/page.js';

/** Defaults until storage answers: starting must never wait for storage (see startFree). */
let settings = createDefaultSettings();
let profile = null;

/** params: exercise (ExerciseType). */
export default {
    data: {
        exercise: '',
        icon: '',
        title: '',
        pushUps: false,
        squats: false,
        lowBattery: false,
        needsCalibration: false
    },

    onInit() {
        if (!isExercise(this.exercise)) {
            this.exercise = ExerciseType.SQUAT;
        }
        this.icon = exerciseIcon(this.exercise, 64);
        this.title = this.$t('strings.' + exerciseKey(this.exercise));
        this.pushUps = this.exercise === ExerciseType.PUSH_UP;
        this.squats = !this.pushUps;
        settings = createDefaultSettings();
        profile = null;
        const self = this;
        // Spec 2.6: without a calibration show "Калибровка поможет повысить точность подсчёта".
        loadLaunchData(createSystemStorageAdapter(), this.exercise, function (loaded, found) {
            settings = loaded;
            profile = found;
            self.needsCalibration = found === null;
        });
        createBatteryAdapter().getStatus(function (err, status) {
            if (!err) {
                self.lowBattery = isLowBattery(status);
            }
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    leave(page, params) {
        go(router, this.$refs.list, page, params);
    },

    /**
     * Starts at once with whatever settings are loaded. Waiting for storage here made "Свободный
     * режим" do nothing on the watch: a storage callback that never arrives blocks the start.
     */
    startFree() {
        this.leave('workout', workoutParams({ exerciseType: this.exercise, mode: WorkoutMode.FREE }, settings, profile));
    },

    openTimer() {
        this.leave('timerSetup', { exercise: this.exercise });
    },

    openSets() {
        this.leave('setsSetup', { exercise: this.exercise });
    },

    openCalibration() {
        this.leave('calibration', { exercise: this.exercise });
    },

    goHome() {
        this.leave('index');
    },

    onSwipe(e) {
        if (e && e.direction === 'right') {
            this.goHome();
        }
    }
};
