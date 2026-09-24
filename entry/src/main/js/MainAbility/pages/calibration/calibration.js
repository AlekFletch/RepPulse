import router from '@system.router';
import { ExerciseType, WristSide } from '../../common/domain/enums.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createSettingsRepository } from '../../common/storage/SettingsRepository.js';
import { exerciseIcon, focusRotation, go, isExercise } from '../../common/ui/page.js';

const repo = createSettingsRepository(createSystemStorageAdapter());
const SELECTED = '#2DE3C4';
const SELECTED_TEXT = '#04101F';
const NORMAL = '#0E1638';
const NORMAL_TEXT = '#FFFFFF';

/** params: exercise. The chosen wrist is stored as AppSettings.wristSide. */
export default {
    data: {
        exercise: '',
        icon: '',
        leftColor: NORMAL,
        leftText: NORMAL_TEXT,
        rightColor: NORMAL,
        rightText: NORMAL_TEXT
    },

    onInit() {
        if (!isExercise(this.exercise)) {
            this.exercise = ExerciseType.SQUAT;
        }
        this.icon = exerciseIcon(this.exercise, 28);
        const self = this;
        repo.load(function (err, settings) {
            self.showWrist(settings.wristSide);
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
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
        this.showWrist(side);
        repo.set('wristSide', side, function () {});
    },

    chooseLeft() {
        this.choose(WristSide.LEFT);
    },

    chooseRight() {
        this.choose(WristSide.RIGHT);
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
