# RepPulse — Этап 2. Структура проекта, доменные модели, адаптеры, MockSensorProvider

## 1. Структура

```
RepPulse/
  build-profile.json5, hvigorfile.ts, oh-package.json5, hvigor/   # проект DevEco (FA, lite), по официальным шаблонам 6.1
  entry/
    build-profile.json5 (apiType faMode), hvigorfile.ts (legacyHapTasks)
    src/main/
      config.json                         # liteWearable, reqPermissions, icon $media:icon (строго, см. 05 §4)
      resources/base/media/icon.png       # launcher 104×104 + icon_small.png 92×92
      resources/base/element/string.json  # label/description/permission reasons
      js/MainAbility/
        app.js
        i18n/ru-RU.json, en-US.json       # все строки UI; ключи плоские: $t('strings.<key>')
        pages/index/                       # временная главная (полная — Этап 3)
        pages/diagnostics/                 # smoke-тест на часах (удаляется из release)
        common/
          config/buildConfig.js            # DEBUG-флаг (release-гейт проверяет, что false)
          util/                            # obj, id, format, json (ES5-safe)
          domain/                          # enums, limits, models, stats, durationSteps, workoutStateMachine
          detection/                       # RepPhase, RepDetectionResult, DetectionConfig, version
          sensors/                         # SensorSample, SensorCapabilities, SensorError, SensorProvider,
                                           # RateMeter, HuaweiSensorProvider, MockSensorProvider
          sensors/mock/                    # prng, motionSynth, scenarios, sensorLog
          platform/                        # TimeAdapter, Logger, HapticsAdapter, ScreenAdapter,
                                           # BatteryAdapter, PermissionManager, DeviceCapabilityChecker
          storage/                         # LocalStorageAdapter (@system), InMemoryStorageAdapter, paths
          icons/                           # PNG нужных размеров + icons.js (ICON_SQUAT, ICON_PUSH_UP, ICON_HISTORY)
  tests/unit, tests/mocks (@system.* двойники, FakeTimeAdapter), tests/fixtures (JSON-логи)
  tools/ export_icons.py, check-icons.js, check-release.js, gen-fixtures.mjs
  assets-src/icons (оригиналы дизайнера), assets-src/export (1024/512/192/96/48 для QA и AppGallery)
```

Где могут встречаться вызовы `@system.*`:

| Модуль | Разрешённые `@system.*` |
|---|---|
| `sensors/HuaweiSensorProvider` | sensor |
| `platform/HapticsAdapter` | vibrator |
| `platform/ScreenAdapter` | brightness |
| `platform/BatteryAdapter` | battery |
| `storage/LocalStorageAdapter` | storage, file |
| `pages/*` | только router |

Всё остальное — чистый JS, его тестирует Jest.

## 2. Ограничения языка (lite JS / JerryScript)

ESLint (`eslint.config.mjs`) проверяет, что код в `entry/src/main/js` использует только поддерживаемое подмножество.

- **Разрешено:** ES5, `let`/`const`, стрелочные функции, шаблонные строки, `import`/`export`.
- **Запрещено:**
  - синтаксис: `class`, spread/rest, деструктуризация, параметры по умолчанию, `for…of`, генераторы, `async`/`await`, `?.`, `??`;
  - встроенные объекты ES2015+: `Map`/`Set`/`Promise`/`Symbol`, `Object.assign`, `Array.from`, `Math.imul`;
  - методы ES2015+: `.includes()`, `.find()` и т.п.
- **Поэтому:** API асинхронных адаптеров построено на callback'ах `cb(err, result)`, а не на `Promise`.

## 3. Доменные модели (`domain/models.js`)

- **Типы из спецификации:** `WorkoutPlan`, `WorkoutSession`, `SetResult`, `CalibrationProfile`, `AppSettings` — фабрики с полями ровно из раздела 5 ТЗ.
- **Дополнительное поле в настройках:** `heartRateEnabled` (по умолчанию `false`). Пульс показываем только после явного согласия пользователя.
- **`validatePlan`** возвращает коды ошибок. Эти же коды служат ключами i18n (`errSetNeedsGoal` и т.п.). Проверяемые ограничения:
  - подходы — от 1 до 20;
  - повторы — от 1 до 500;
  - работа — от 10 с до 60 мин;
  - отдых — от 10 с до 10 мин;
  - в режиме «Подходы» нужна хотя бы одна цель.
- **Режим «На время»** хранит длительность в `workDurationSec`. Режимы FREE и TIMER — это один подход.
- **`stats.js`** считает показатели по формулам раздела 4.2: `repTotal`, `totalReps`, `cadence`, `bestSet`, средний confidence с весом по auto-повторам.
- **`durationSteps.js`** задаёт шаг выбора времени: 10 с до 2 мин, 30 с от 2 до 10 мин, 60 с дальше.

## 4. State machine тренировки (`domain/workoutStateMachine.js`)

```
DRAFT → PREPARING (3-2-1) → ACTIVE ⇄ PAUSED
                             ACTIVE → RESTING → PREPARING | ACTIVE («Начать сейчас» без отсчёта)
ACTIVE | PAUSED | RESTING → COMPLETED ;  любое нетерминальное → CANCELLED
PREPARING → PAUSED (приложение скрыто во время отсчёта)
```

- `isCounting(status)` истинно только для ACTIVE: повторы на паузе не считаются.
- Недопустимый переход выбрасывает ошибку с `code: 'INVALID_TRANSITION'`.

## 5. Сенсоры

- **Сэмпл.** `SensorSample` — единый формат `{t, ax, ay, az, gx, gy, gz, hasGyro}`.
- **Контракт провайдера:** `start(onSample, onError)`, `stop()`, `isRunning()`, `getCapabilities()`.
- **`HuaweiSensorProvider`:**
  - подписка на `game` (20 мс);
  - к каждому сэмплу акселерометра прикрепляется последнее свежее значение гироскопа (не старше 80 мс);
  - если гироскоп молчит 1.5 с, он помечается `UNAVAILABLE`, провайдер отписывается от него и переходит в режим accel-only;
  - если акселерометр молчит 2 с, возвращается ошибка `ACCEL_TIMEOUT`, и UI предлагает ручной режим;
  - фактическая частота измеряется через `RateMeter`.
- **`MockSensorProvider`:**
  - воспроизводит массив сэмплов (синтетику или JSON-лог) с переносом времени на `time.now()`;
  - режимы: `manual` (`emitNext`/`emitUntil`/`emitAll`, для тестов) и `realtime` (для симулятора);
  - умеет эмулировать отсутствие гироскопа или акселерометра.
- **`mock/motionSynth.js`** — упрощённая кинематика запястья:
  - поза задаётся положением и pitch/roll в мировых координатах;
  - численное дифференцирование даёт показания акселерометра (specific force в координатах часов) и гироскопа;
  - добавляются seeded-шум и jitter интервалов.
  - Отжимание моделируется как поворот предплечья вокруг неподвижного запястья: основной сигнал — наклон вектора гравитации и гироскоп. Присед — вертикальное смещение.
  - Правая рука получается зеркалированием по боковой оси.
- **`mock/scenarios.js`** — сценарии из раздела 7 ТЗ, у каждого есть эталонное число повторов (`truth.expectedReps`):
  - серии по 5, 10 и 20 повторов;
  - быстрые и медленные повторы;
  - неполные повторы;
  - ходьба, взмах рукой, подъём руки, смена положения на полу, поправка ремешка, поворот корпуса, чистый шум;
  - смешанные сценарии.
- **`mock/sensorLog.js`** — JSON-формат логов (`reppulse-sensor-log` v1) для записи на часах и replay в тестах. Пример: `tests/fixtures/*_synthetic.json`, генерируется командой `npm run gen:fixtures`.

> Единицы измерения (м/с², рад/с) в `.d.ts` не указаны. **TODO(device):** сверить по странице диагностики. Пороги в `DetectionConfig` — стартовые значения, их настроим на Этапе 4 по реальным логам.

## 6. Платформа и хранилище

- **Время и логирование.** `TimeAdapter` (системный) и `FakeTimeAdapter` (тесты) дают детерминированные таймеры. `Logger.debug` и `missingAsset` работают только при DEBUG.
- **`HapticsAdapter`:** `vibrate('short'|'long')` и `sequence(modes, gapMs)`, из которых собираются составные сигналы.
- **`ScreenAdapter.keepScreenOn`, `BatteryAdapter`** (`isLowBattery` — ниже 10 % без зарядки).
- **`PermissionManager`.** В lite API нет запроса разрешений в рантайме: отказ приходит как `fail` конкретного API, и менеджер его фиксирует.
- **`DeviceCapabilityChecker.probeSensors`:** за N мс проверяет, отвечают ли датчики, и измеряет их частоту. По результату UI выбирает авто- или ручной режим.
- **`LocalStorageAdapter`:**
  - key-value (`@system.storage`) и файлы (`@system.file`, `internal://app/…`);
  - чтение кусками по 4 КБ;
  - JSON сохраняется в ASCII (`toAsciiJson`), чтобы один символ всегда был равен одному байту;
  - `InMemoryStorageAdapter` выполняет тот же контракт; один и тот же набор тестов гоняется на обеих реализациях.

## 7. Иконки

- `tools/export_icons.py` делает только resize и экспорт PNG из оригиналов в `assets-src/icons`. Цвета и форма не меняются.
- `ICON_HISTORY` — с 2026-09-24 (28 и 64 px). Если иконки нужного размера нет, UI показывает нейтральный placeholder «—», а в debug-лог пишется `missingAsset`.
- Как заменить или добавить иконку: положить оригинал в `assets-src/icons/`, выполнить `python tools/export_icons.py`, прописать размеры в `icons.js`.
- `npm run check:icons` (запускается и в Jest) проверяет:
  - что манифест ссылается на `$media:icon`, есть `icon.png` и `icon_small.png`;
  - что launcher-иконка — PNG 104×104 размером до 64 КБ;
  - что все иконки, на которые ссылается код, существуют и имеют нужный размер.

## 8. Страница диагностики (для первой установки на часы)

Страница показывает:
- живые показания акселерометра и гироскопа;
- измеренную частоту;
- число сэмплов гироскопа.

Кнопки: короткая и длинная вибрация, тест файла (~5 КБ с кириллицей, запись и чтение), тест storage (значение длиной 200 символов). Результаты отвечают на TODO из `01-platform-verification.md` §12. Перед релизом страницу нужно убрать из `config.json`; `npm run check:release` это проверяет.

## 9. Команды

```
npm install            # один раз
npm test               # Jest (133 теста после Этапа 3)
npm run lint           # ESLint с правилами lite JS
npm run check:icons
npm run check:release  # падает, пока DEBUG=true и есть diagnostics — это ожидаемо в разработке
npm run gen:fixtures
python tools/export_icons.py
```
