import router from '@system.router';
import { ExerciseType, WorkoutMode } from '../../common/domain/enums.js';
import { Defaults, Limits } from '../../common/domain/limits.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createSettingsRepository } from '../../common/storage/SettingsRepository.js';
import { workoutParams } from '../../common/ui/launch.js';
import { createDefaultSettings } from '../../common/domain/models.js';
import { exerciseIcon, focusRotation, formatDuration, go, isExercise, setIfChanged } from '../../common/ui/page.js';
import { stepDuration, validateSetup } from '../../common/ui/setupSteps.js';

let durationSec = Defaults.TIMER_DURATION_SEC;

let settings = createDefaultSettings();

/** params: exercise. */
export default {
    data: {
        exercise: '',
        icon: '',
        durationText: '',
        vibrationOnRep: true,
        hasError: false,
        errorText: ''
    },

    onInit() {
        if (!isExercise(this.exercise)) {
            this.exercise = ExerciseType.SQUAT;
        }
        this.icon = exerciseIcon(this.exercise, 28);
        durationSec = Defaults.TIMER_DURATION_SEC;
        this.paint();
        const self = this;
        settings = createDefaultSettings();
        createSettingsRepository(createSystemStorageAdapter()).load(function (err, loaded) {
            settings = loaded;
            self.vibrationOnRep = loaded.vibrationOnRep;
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    paint() {
        setIfChanged(this, 'durationText', formatDuration(durationSec));
    },

    durationMinus() {
        durationSec = stepDuration(durationSec, -1, Limits.TIMER_DURATION_SEC);
        this.paint();
    },

    durationPlus() {
        durationSec = stepDuration(durationSec, 1, Limits.TIMER_DURATION_SEC);
        this.paint();
    },

    onVibrationChange(e) {
        this.vibrationOnRep = e && typeof e.checked === 'boolean' ? e.checked : !this.vibrationOnRep;
    },

    start() {
        const input = {
            exerciseType: this.exercise,
            mode: WorkoutMode.TIMER,
            workDurationSec: durationSec,
            vibrationOnRep: this.vibrationOnRep
        };
        const errors = validateSetup(input);
        if (errors.length > 0) {
            this.errorText = this.$t('strings.' + errors[0]);
            this.hasError = true;
            return;
        }
        go(router, this.$refs.list, 'workout', workoutParams(input, settings));
    },

    goBack() {
        go(router, this.$refs.list, 'exercise', { exercise: this.exercise });
    },

    onSwipe(e) {
        if (e && e.direction === 'right') {
            this.goBack();
        }
    }
};
