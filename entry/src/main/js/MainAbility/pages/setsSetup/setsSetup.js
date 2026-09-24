import router from '@system.router';
import { ExerciseType, WorkoutMode } from '../../common/domain/enums.js';
import { Defaults, Limits } from '../../common/domain/limits.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createSettingsRepository } from '../../common/storage/SettingsRepository.js';
import { workoutParams } from '../../common/ui/launch.js';
import { createDefaultSettings } from '../../common/domain/models.js';
import { exerciseIcon, focusRotation, formatDuration, go, isExercise, setIfChanged } from '../../common/ui/page.js';
import {
    OFF, stepDuration, stepOptionalDuration, stepSetCount, stepTargetReps, validateSetup, withoutOffGoals
} from '../../common/ui/setupSteps.js';

let setCount = Defaults.SET_COUNT;
let targetReps = Defaults.TARGET_REPS;
let workSec = OFF;
let restSec = Defaults.REST_DURATION_SEC;

let settings = createDefaultSettings();

/** params: exercise. */
export default {
    data: {
        exercise: '',
        icon: '',
        setsText: '',
        repsText: '',
        workText: '',
        restText: '',
        autoStart: true,
        vibrationOnRep: true,
        hasError: false,
        errorText: ''
    },

    onInit() {
        if (!isExercise(this.exercise)) {
            this.exercise = ExerciseType.SQUAT;
        }
        this.icon = exerciseIcon(this.exercise, 28);
        setCount = Defaults.SET_COUNT;
        targetReps = Defaults.TARGET_REPS;
        workSec = OFF;
        restSec = Defaults.REST_DURATION_SEC;
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
        const off = this.$t('strings.off');
        setIfChanged(this, 'setsText', String(setCount));
        setIfChanged(this, 'repsText', targetReps === OFF ? off : String(targetReps));
        setIfChanged(this, 'workText', workSec === OFF ? off : formatDuration(workSec));
        setIfChanged(this, 'restText', formatDuration(restSec));
        // "Set a reps goal or a time" disappears as soon as either goal is back on.
        if (this.hasError && (targetReps !== OFF || workSec !== OFF)) {
            this.hasError = false;
        }
    },

    setsMinus() { setCount = stepSetCount(setCount, -1); this.paint(); },
    setsPlus() { setCount = stepSetCount(setCount, 1); this.paint(); },
    repsMinus() { targetReps = stepTargetReps(targetReps, -1); this.paint(); },
    repsPlus() { targetReps = stepTargetReps(targetReps, 1); this.paint(); },
    workMinus() { workSec = stepOptionalDuration(workSec, -1, Limits.WORK_DURATION_SEC); this.paint(); },
    workPlus() { workSec = stepOptionalDuration(workSec, 1, Limits.WORK_DURATION_SEC); this.paint(); },
    restMinus() { restSec = stepDuration(restSec, -1, Limits.REST_DURATION_SEC); this.paint(); },
    restPlus() { restSec = stepDuration(restSec, 1, Limits.REST_DURATION_SEC); this.paint(); },

    onAutoStartChange(e) {
        this.autoStart = e && typeof e.checked === 'boolean' ? e.checked : !this.autoStart;
    },

    onVibrationChange(e) {
        this.vibrationOnRep = e && typeof e.checked === 'boolean' ? e.checked : !this.vibrationOnRep;
    },

    start() {
        const input = {
            exerciseType: this.exercise,
            mode: WorkoutMode.SETS,
            setCount: setCount,
            targetReps: targetReps,
            workDurationSec: workSec,
            restDurationSec: restSec,
            autoStartNextSet: this.autoStart,
            vibrationOnRep: this.vibrationOnRep
        };
        const errors = validateSetup(input);
        if (errors.length > 0) {
            this.errorText = this.$t('strings.' + errors[0]);
            this.hasError = true;
            return;
        }
        go(router, this.$refs.list, 'workout', workoutParams(withoutOffGoals(input), settings));
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
