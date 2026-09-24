import app from '@system.app';
import router from '@system.router';
import { BuildConfig } from '../../common/config/buildConfig.js';
import { ExerciseType } from '../../common/domain/enums.js';
import { focusRotation, go } from '../../common/ui/page.js';

export default {
    data: {
        debug: BuildConfig.DEBUG
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    leave(page, params) {
        go(router, this.$refs.list, page, params);
    },

    openSquats() {
        this.leave('exercise', { exercise: ExerciseType.SQUAT });
    },

    openPushUps() {
        this.leave('exercise', { exercise: ExerciseType.PUSH_UP });
    },

    openHistory() {
        this.leave('history');
    },

    openSettings() {
        this.leave('settings');
    },

    openDiagnostics() {
        this.leave('diagnostics');
    },

    /** Swipe right on the home screen closes the app (crown focus released first). */
    onSwipe(e) {
        if (e && e.direction === 'right') {
            focusRotation(this.$refs.list, false);
            app.terminate();
        }
    }
};
