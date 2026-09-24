import router from '@system.router';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createWorkoutRepository } from '../../common/storage/WorkoutRepository.js';
import { exerciseIcon, focusRotation, go } from '../../common/ui/page.js';
import { setRows, summaryRows } from '../../common/ui/summaryView.js';

const repo = createWorkoutRepository(createSystemStorageAdapter());
let session = null;
let saved = false;
let saving = false;

/** params: planJson + optionsJson (for "Повторить"), saveFailed ('true' when the finished session was not stored). */
export default {
    data: {
        planJson: '',
        optionsJson: '',
        saveFailed: '',
        icon: '',
        totalText: '',
        rows: [],
        sets: [],
        saveText: '',
        hasMessage: false,
        message: ''
    },

    onInit() {
        session = null;
        saved = false;
        saving = false;
        this.saveText = this.$t('strings.save');
        if (this.saveFailed) {
            this.showMessage('saveFailed');
            return;
        }
        const self = this;
        repo.getLast(function (err, last) {
            if (err || !last) {
                self.showMessage('loadFailed');
                return;
            }
            session = last;
            self.show(last);
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    show(last) {
        const self = this;
        const tr = function (key, params) {
            return params ? self.$t('strings.' + key, params) : self.$t('strings.' + key);
        };
        this.icon = exerciseIcon(last.plan.exerciseType, 28);
        this.totalText = String(last.totalReps);
        this.rows = summaryRows(last, tr, false);
        this.sets = last.sets.length > 1 ? setRows(last, tr, false) : [];
    },

    showMessage(key) {
        this.message = this.$t('strings.' + key);
        this.hasMessage = true;
    },

    save() {
        if (session === null || saved || saving) {
            return;
        }
        saving = true;
        const self = this;
        repo.save(session, function (err) {
            saving = false;
            if (err) {
                self.showMessage('saveFailed');
                return;
            }
            saved = true;
            self.hasMessage = false;
            self.saveText = self.$t('strings.saved');
        });
    },

    repeat() {
        if (this.planJson) {
            go(router, this.$refs.list, 'workout', { planJson: this.planJson, optionsJson: this.optionsJson });
        } else {
            this.goHome();
        }
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
