import router from '@system.router';
import { createSystemTimeAdapter } from '../../common/platform/TimeAdapter.js';
import { createLogger } from '../../common/platform/Logger.js';
import { createHapticsAdapter, HapticMode } from '../../common/platform/HapticsAdapter.js';
import { createScreenAdapter } from '../../common/platform/ScreenAdapter.js';
import { createHuaweiSensorProvider } from '../../common/sensors/HuaweiSensorProvider.js';
import { SensorAvailability } from '../../common/sensors/SensorCapabilities.js';
import { createSystemStorageAdapter, MAX_KV_VALUE_LENGTH } from '../../common/storage/LocalStorageAdapter.js';
import { toAsciiJson } from '../../common/util/json.js';

/**
 * Diagnostics page: live accelerometer / gyroscope readings, measured sample rate,
 * vibration and storage checks. The UI refreshes at 5 Hz, not per sensor sample.
 */
const time = createSystemTimeAdapter();
const logger = createLogger('diagnostics', { debug: true });
const haptics = createHapticsAdapter(time, logger);
const screen = createScreenAdapter(logger);
const storageAdapter = createSystemStorageAdapter();

let provider = null;
let refreshTimer = null;
let lastSample = null;
let gyroSamples = 0;
/** Accelerometer averaged over ~1 s, in g: resolves per-axis offset / scale errors of ~1 %. */
let avgX = 0;
let avgY = 0;
let avgZ = 0;
let avgCount = 0;
const G = 9.80665;

function fixed(v) {
    return (Math.round(v * 100) / 100).toString();
}

function fixed3(v) {
    return (Math.round(v * 1000) / 1000).toString();
}

export default {
    data: {
        accelLine: '',
        normLine: '',
        gyroLine: '',
        rateLine: '',
        resultLine: ''
    },

    onInit() {
        this.accelLine = this.$t('strings.diagAccel') + ': ...';
        this.gyroLine = this.$t('strings.diagGyro') + ': ...';
        this.rateLine = this.$t('strings.diagRate') + ': ...';
    },

    onShow() {
        screen.keepScreenOn(true);
        lastSample = null;
        gyroSamples = 0;
        provider = createHuaweiSensorProvider(time, logger);
        avgCount = 0;
        provider.start(function (sample) {
            lastSample = sample;
            const k = avgCount < 45 ? 1 / (avgCount + 1) : 1 / 45;
            avgCount++;
            avgX += (sample.ax / G - avgX) * k;
            avgY += (sample.ay / G - avgY) * k;
            avgZ += (sample.az / G - avgZ) * k;
            if (sample.hasGyro) {
                gyroSamples++;
            }
        }, function (error) {
            logger.warn('sensor error ' + error.code);
        });
        const self = this;
        refreshTimer = time.setInterval(function () {
            self.refresh();
        }, 200);
    },

    onHide() {
        this.release();
    },

    onDestroy() {
        this.release();
    },

    release() {
        if (refreshTimer !== null) {
            time.clearInterval(refreshTimer);
            refreshTimer = null;
        }
        if (provider !== null) {
            provider.stop();
            provider = null;
        }
        haptics.cancelPending();
        screen.keepScreenOn(false);
    },

    refresh() {
        if (provider === null) {
            return;
        }
        const caps = provider.getCapabilities();
        const noData = this.$t('strings.diagNoData');
        if (lastSample !== null) {
            this.accelLine = 'A ' + fixed3(avgX) + ' ' + fixed3(avgY) + ' ' + fixed3(avgZ);
            this.normLine = '|A| ' + fixed3(Math.sqrt(avgX * avgX + avgY * avgY + avgZ * avgZ)) + ' g';
        } else {
            this.accelLine = this.$t('strings.diagAccel') + ': ' + noData;
        }
        if (caps.gyroscope === SensorAvailability.UNAVAILABLE) {
            this.gyroLine = this.$t('strings.diagGyro') + ': ' + noData;
        } else if (lastSample !== null && lastSample.hasGyro) {
            this.gyroLine = 'G ' + fixed(lastSample.gx) + ' ' + fixed(lastSample.gy) + ' ' + fixed(lastSample.gz);
        }
        this.rateLine = this.$t('strings.diagRate') + ': ' + fixed(caps.measuredRateHz) + ' Hz, G=' + gyroSamples;
    },

    vibrateShort() {
        haptics.vibrate(HapticMode.SHORT);
    },

    vibrateLong() {
        haptics.vibrate(HapticMode.LONG);
    },

    /** Writes ~5 KB (more than one 4 KB read chunk) and reads it back. */
    fileTest() {
        const self = this;
        let payload = '';
        for (let i = 0; i < 70; i++) {
            payload += this.$t('strings.squats') + '-' + i + ';';
        }
        const text = toAsciiJson({ p: payload });
        storageAdapter.ensureDir('diag', function (dirErr) {
            if (dirErr) {
                self.resultLine = 'mkdir: ' + dirErr.code;
                return;
            }
            storageAdapter.writeText('diag/test.json', text, function (writeErr) {
                if (writeErr) {
                    self.resultLine = 'write: ' + writeErr.code + ' ' + writeErr.platformCode;
                    return;
                }
                storageAdapter.readText('diag/test.json', function (readErr, back) {
                    if (readErr) {
                        self.resultLine = 'read: ' + readErr.code + ' ' + readErr.platformCode;
                        return;
                    }
                    const ok = back === text;
                    self.resultLine = (ok ? self.$t('strings.diagOk') : self.$t('strings.diagFail')) +
                        ' file ' + back.length + '/' + text.length;
                });
            });
        });
    },

    /** Checks that a value of MAX_KV_VALUE_LENGTH (128) characters survives @system.storage. */
    storageTest() {
        const self = this;
        let value = '';
        while (value.length < MAX_KV_VALUE_LENGTH) {
            value += '0123456789';
        }
        value = value.slice(0, MAX_KV_VALUE_LENGTH);
        storageAdapter.setItem('diag_kv_max', value, function (err) {
            if (err) {
                self.resultLine = 'kv set ' + value.length + ': ' + err.message;
                return;
            }
            storageAdapter.getItem('diag_kv_max', function (getErr, back) {
                const ok = !getErr && back === value;
                self.resultLine = (ok ? self.$t('strings.diagOk') : self.$t('strings.diagFail')) +
                    ' kv ' + (back ? back.length : 0) + '/' + value.length;
            });
        });
    },

    goHome() {
        router.replace({ uri: 'pages/index/index' });
    }
};
