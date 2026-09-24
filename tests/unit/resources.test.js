const fs = require('fs');
const path = require('path');
const { checkIcons } = require('../../tools/check-icons');
import { ICON_SQUAT, ICON_PUSH_UP, ICON_HISTORY, ICON_APP, iconPath } from '../../entry/src/main/js/MainAbility/common/icons/icons.js';
import { PlanError } from '../../entry/src/main/js/MainAbility/common/domain/models.js';

const ROOT = path.resolve(__dirname, '../..');
const JS = path.join(ROOT, 'entry/src/main/js/MainAbility');
const load = (locale) => JSON.parse(fs.readFileSync(path.join(JS, 'i18n', locale + '.json'), 'utf8')).strings;

describe('icons', () => {
  test('launcher and in-app icons exist with the right format and size', () => {
    const result = checkIcons();
    expect(result.errors).toEqual([]);
    expect(result.checkedIcons.length).toBeGreaterThanOrEqual(5);
  });

  test('icon constants; a missing size falls back to the placeholder and is logged', () => {
    expect(ICON_SQUAT[64]).toBe('/common/icons/squat_icon_64.png');
    expect(ICON_PUSH_UP[28]).toBe('/common/icons/pushup_icon_28.png');
    expect(ICON_HISTORY[64]).toBe('/common/icons/history_icon_64.png');
    expect(ICON_APP[48]).toBe('/common/icons/reppulse_app_icon_48.png');
    const logger = { missingAsset: jest.fn() };
    expect(iconPath(ICON_HISTORY, 28, logger)).toBe('/common/icons/history_icon_28.png');
    expect(iconPath(ICON_SQUAT, 96, logger)).toBeNull();
    expect(logger.missingAsset).toHaveBeenCalledTimes(1);
    expect(iconPath(null, 64, logger)).toBeNull();
  });

  test('launcher icon is the RepPulse brand icon, not an exercise icon', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'entry/src/main/config.json'), 'utf8'));
    expect(config.module.abilities[0].icon).toBe('$media:icon');
    expect(config.module.deviceType).toEqual(['liteWearable']);
  });
});

describe('i18n', () => {
  const ru = load('ru-RU');
  const en = load('en-US');

  test('ru-RU and en-US define the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  test('no empty strings', () => {
    for (const [key, value] of Object.entries(ru)) {
      expect({ key, ok: typeof value === 'string' && value.length > 0 }).toEqual({ key, ok: true });
    }
  });

  test('spec wording (section 8) is used verbatim in Russian', () => {
    expect(ru).toMatchObject({
      homeTitle: 'Тренировка', squats: 'Приседания', pushUps: 'Отжимания', history: 'История', settings: 'Настройки',
      modeFree: 'Свободный режим', modeTimer: 'На время', modeSets: 'Подходы', calibration: 'Калибровка',
      start: 'Старт', pause: 'Пауза', resume: 'Продолжить', finish: 'Завершить', startNow: 'Начать сейчас',
      nextSet: 'Следующий подход', save: 'Сохранить', repeat: 'Повторить', toHome: 'На главную',
      getReady: 'Приготовьтесь', rest: 'Отдых', setCompleted: 'Подход завершён',
      workoutCompleted: 'Тренировка завершена', calibrationCompleted: 'Калибровка завершена',
      repCounted: 'Повтор засчитан', calibrationHint: 'Калибровка поможет повысить точность подсчёта',
      a11yOpenSquats: 'Открыть тренировку приседаний',
      a11yOpenPushUps: 'Открыть тренировку отжиманий',
      a11yOpenHistory: 'Открыть историю тренировок'
    });
    expect(ru.estimateWarning).toMatch(/^Автоматический подсчёт является оценкой/);
  });

  test('every validation error code has a translation', () => {
    for (const code of Object.values(PlanError)) {
      expect(ru[code]).toBeTruthy();
      expect(en[code]).toBeTruthy();
    }
  });

  test('every $t key used in pages exists', () => {
    const pagesDir = path.join(JS, 'pages');
    const used = new Set();
    for (const page of fs.readdirSync(pagesDir)) {
      for (const f of fs.readdirSync(path.join(pagesDir, page))) {
        const text = fs.readFileSync(path.join(pagesDir, page, f), 'utf8');
        for (const m of text.matchAll(/\$t\('strings\.(\w+)'\)/g)) {
          used.add(m[1]);
        }
      }
    }
    expect(used.size).toBeGreaterThan(5);
    for (const key of used) {
      expect({ key, defined: key in ru }).toEqual({ key, defined: true });
    }
  });

  test('config.json pages exist on disk', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'entry/src/main/config.json'), 'utf8'));
    for (const page of config.module.js[0].pages) {
      for (const ext of ['hml', 'css', 'js']) {
        expect(fs.existsSync(path.join(JS, page + '.' + ext))).toBe(true);
      }
    }
  });
});
