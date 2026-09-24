import router from '@system.router';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createWorkoutRepository } from '../../common/storage/WorkoutRepository.js';
import { exerciseIcon, focusRotation, formatDateTime, go } from '../../common/ui/page.js';
import { setRows, summaryRows } from '../../common/ui/summaryView.js';

const repo = createWorkoutRepository(createSystemStorageAdapter());

/** params: workoutId. */
export default {
    data: {
        workoutId: '',
        icon: '',
        title: '',
        rows: [],
        sets: [],
        canDelete: false,
        confirming: false,
        hasMessage: false,
        message: ''
    },

    onInit() {
        const self = this;
        const tr = function (key, params) {
            return params ? self.$t('strings.' + key, params) : self.$t('strings.' + key);
        };
        repo.get(this.workoutId, function (err, session) {
            if (err || !session) {
                self.message = tr('loadFailed');
                self.hasMessage = true;
                return;
            }
            self.icon = exerciseIcon(session.plan.exerciseType, 28);
            self.title = formatDateTime(session.startedAt || 0);
            self.rows = summaryRows(session, tr, true);
            self.sets = setRows(session, tr, true);
            self.canDelete = true;
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    askDelete() {
        this.canDelete = false;
        this.confirming = true;
    },

    cancelDelete() {
        this.confirming = false;
        this.canDelete = true;
    },

    confirmDelete() {
        const self = this;
        repo.remove(this.workoutId, function () {
            self.goBack();
        });
    },

    goBack() {
        go(router, this.$refs.list, 'history');
    },

    onSwipe(e) {
        if (e && e.direction === 'right') {
            this.goBack();
        }
    }
};
