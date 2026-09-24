import router from '@system.router';
import { WorkoutMode } from '../../common/domain/enums.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createWorkoutRepository } from '../../common/storage/WorkoutRepository.js';
import {
    exerciseIcon, exerciseKey, focusRotation, formatDateTime, formatDuration, go
} from '../../common/ui/page.js';

const repo = createWorkoutRepository(createSystemStorageAdapter());

export default {
    data: {
        entries: [],
        empty: false,
        emptyText: '',
        canDelete: false,
        confirming: false
    },

    onInit() {
        this.emptyText = this.$t('strings.historyEmpty');
        this.load();
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    load() {
        const self = this;
        repo.list(function (err, list) {
            if (err) {
                self.emptyText = self.$t('strings.loadFailed');
                self.empty = true;
                return;
            }
            const entries = [];
            for (let i = 0; i < list.length; i++) {
                const e = list[i];
                let line2 = self.$t('strings.' + exerciseKey(e.exerciseType)) + ' · ' + self.$t('strings.repsCount', { n: e.totalReps });
                if (e.mode === WorkoutMode.SETS) {
                    line2 += ' · ' + self.$t('strings.setsCount', { n: e.setCount });
                }
                entries.push({
                    id: e.id,
                    icon: exerciseIcon(e.exerciseType, 28),
                    line1: formatDateTime(e.startedAt) + ' · ' + formatDuration(e.durationSec),
                    line2: line2
                });
            }
            self.entries = entries;
            self.empty = entries.length === 0;
            self.canDelete = entries.length > 0;
            self.confirming = false;
        });
    },

    open(index) {
        const entry = this.entries[index];
        if (entry) {
            go(router, this.$refs.list, 'historyDetail', { workoutId: entry.id });
        }
    },

    askDeleteAll() {
        this.canDelete = false;
        this.confirming = true;
    },

    cancelDelete() {
        this.confirming = false;
        this.canDelete = this.entries.length > 0;
    },

    deleteAll() {
        const self = this;
        repo.clear(function () {
            self.load();
        });
    },

    goHome() {
        go(router, this.$refs.list, 'index');
    },

    onSwipe(e) {
        if (e && e.direction === 'right') {
            this.goHome();
        }
    }
};
