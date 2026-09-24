import router from '@system.router';
import { Sensitivity, WristSide } from '../../common/domain/enums.js';
import { createDefaultSettings } from '../../common/domain/models.js';
import { createSystemStorageAdapter } from '../../common/storage/LocalStorageAdapter.js';
import { createSettingsRepository } from '../../common/storage/SettingsRepository.js';
import { focusRotation, go, setIfChanged } from '../../common/ui/page.js';

const repo = createSettingsRepository(createSystemStorageAdapter());
const SENSITIVITY_ORDER = [Sensitivity.LOW, Sensitivity.STANDARD, Sensitivity.HIGH];
const SENSITIVITY_KEYS = { LOW: 'sensLow', STANDARD: 'sensStandard', HIGH: 'sensHigh' };

let settings = createDefaultSettings();

function checkedOf(e, fallback) {
    return e && typeof e.checked === 'boolean' ? e.checked : fallback;
}

export default {
    data: {
        wristText: '',
        sensitivityText: '',
        vibrationEnabled: true,
        vibrationOnRep: true,
        countdownEnabled: true,
        hasMessage: false
    },

    onInit() {
        settings = createDefaultSettings();
        this.paint();
        const self = this;
        repo.load(function (err, loaded) {
            settings = loaded;
            self.paint();
        });
    },

    onShow() {
        focusRotation(this.$refs.list, true);
    },

    paint() {
        setIfChanged(this, 'wristText', this.$t(settings.wristSide === WristSide.RIGHT ? 'strings.wristRight' : 'strings.wristLeft'));
        setIfChanged(this, 'sensitivityText', this.$t('strings.' + SENSITIVITY_KEYS[settings.sensitivity]));
        setIfChanged(this, 'vibrationEnabled', settings.vibrationEnabled);
        setIfChanged(this, 'vibrationOnRep', settings.vibrationOnRep);
        setIfChanged(this, 'countdownEnabled', settings.countdownEnabled);
    },

    update(key, value) {
        settings[key] = value;
        this.paint();
        const self = this;
        repo.set(key, value, function (err) {
            setIfChanged(self, 'hasMessage', !!err);
        });
    },

    toggleWrist() {
        this.update('wristSide', settings.wristSide === WristSide.LEFT ? WristSide.RIGHT : WristSide.LEFT);
    },

    cycleSensitivity() {
        const next = (SENSITIVITY_ORDER.indexOf(settings.sensitivity) + 1) % SENSITIVITY_ORDER.length;
        this.update('sensitivity', SENSITIVITY_ORDER[next]);
    },

    onVibrationChange(e) {
        this.update('vibrationEnabled', checkedOf(e, !settings.vibrationEnabled));
    },

    onRepVibrationChange(e) {
        this.update('vibrationOnRep', checkedOf(e, !settings.vibrationOnRep));
    },

    onCountdownChange(e) {
        this.update('countdownEnabled', checkedOf(e, !settings.countdownEnabled));
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
