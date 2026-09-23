# RepPulse — план реализации MVP v1 (lite wearable, JS)

Этот план основан на выводах [01-platform-verification.md](01-platform-verification.md).

## 1. Финальный стек

- DevEco Studio 6.1, проект **Lite Wearable**, JS UI (HML/CSS/JS), FA-модель, `config.json`.
- Логика: чистый JS в безопасном подмножестве (`let`/`const`, стрелочные функции, `class`, шаблонные строки). Запрещены: деструктуризация, spread/rest, `async`/`await`, `?.`, `??`, генераторы, `Map`/`Set` (**TODO**: проверить поддержку в JerryScript).
- Тесты: Jest (Node 24) + ESLint с правилами на запрещённый синтаксис.
- Платформенные API: только `@system.sensor`, `@system.vibrator`, `@system.storage`, `@system.file`, `@system.brightness`, `@system.battery`, `@system.router`.

## 2. Структура проекта (адаптация раздела 6 ТЗ)

```
RepPulse/
  entry/src/main/
    config.json                     # deviceType liteWearable, reqPermissions, icon $media:app_icon
    resources/base/media/app_icon.png   # главная иконка (114×114, TODO размер)
    js/default/
      app.js                        # lifecycle, DI-контейнер
      i18n/ru-RU.json, en-US.json
      common/
        icons/squat_icon.png, pushup_icon.png, history_icon.png(TODO), reppulse_app_icon.png
        domain/      models.js (enums, фабрики), stats.js (расчёты раздела 4.2)
        sensors/     SensorProvider.js (контракт), HuaweiSensorProvider.js,
                     MockSensorProvider.js, SensorCapabilities.js
        detection/   RepDetectionEngine.js, SquatDetectionStrategy.js, PushUpDetectionStrategy.js,
                     SignalFilter.js, SlidingWindowBuffer.js, FeatureExtractor.js,
                     RepPhase.js, CalibrationEngine.js, DetectionConfig.js
        workout/     WorkoutSessionController.js, CountdownController.js,
                     RestTimerController.js, HapticFeedbackController.js, HeartRateProvider.js
        storage/     LocalStorageAdapter.js, WorkoutRepository.js,
                     CalibrationRepository.js, SettingsRepository.js
        platform/    HapticsAdapter.js, TimeAdapter.js, Logger.js,
                     DeviceCapabilityChecker.js, PermissionManager.js, ScreenAdapter.js
      pages/
        splash/ home/ exercise/ (выбор режима + калибровка-вход)
        timerSetup/ setsSetup/ workout/ (подготовка 3-2-1, активный подход, пауза — состояния)
        rest/ calibration/ summary/ history/ historyDetail/ settings/
  tests/unit, tests/integration, tests/mocks (@system.* моки), tests/fixtures (JSON-логи)
  assets-src/icons/                 # оригиналы от дизайнера, не редактировать
  tools/                            # экспорт иконок (resize), проверка иконок в сборке
  docs/
```

Принципы:

- Страницы общаются только с `WorkoutSessionController` (подписка на `onState`).
- `detection/*` не импортирует ничего из `platform`, `storage` и `@system`.
- `@system.*` импортируется только в `sensors/HuaweiSensorProvider.js` и в `platform/*`, `storage/LocalStorageAdapter.js`.

Соответствие экранам ТЗ:

- `PreparationScreen`, `ActiveWorkoutScreen`, `PauseScreen` и `FreeWorkoutScreen` объединены в `pages/workout` и переключаются через состояние. Так меньше переходов между страницами и расход памяти.
- `ModeSelectionScreen` + `ExerciseSelectionScreen` → `pages/exercise`.

## 3. Этапы

| Этап | Результат | Проверка |
|---|---|---|
| **2** | Scaffold проекта Lite Wearable, `config.json`, модели и enum'ы, state machine `WorkoutStatus`, интерфейсы адаптеров, `MockSensorProvider` (синтетика: приседания и отжимания, шум, ходьба, взмах, неполный повтор, быстрые и медленные повторы, серии 5/10/20, replay JSON), Jest + ESLint | `npm test`; smoke-установка пустого HAP на часы (чек-лист §12 документа 01) |
| **3** | Навигация и страницы, `LocalStorageAdapter` + репозитории, `WorkoutSessionController`, countdown, rest timer, haptics, `setKeepScreenOn`, автопауза на `onHide` | Тесты контроллера на фейковом времени; прогон в симуляторе с Mock-провайдером |
| **4** | `SignalFilter` (EMA low-pass, медиана-5, отсечение выбросов), `SlidingWindowBuffer` (кольцевой, ~3 с), `FeatureExtractor` (модули accel и gyro, гравитация через low-pass, угол наклона, производные), стратегии приседаний и отжиманий (фазовые автоматы `RepPhase`), confidence, `CalibrationEngine`, debug-лог (выключен в production) | Тесты детекции на синтетике и replay; диагностическая страница на часах пишет сырые логи для набора реальных данных |
| **5** | Статистика, история (индекс + файл на тренировку), детали, удаление, настройки, ручная коррекция, полный набор тестов, manual QA checklist | `npm test`, QA на часах |
| **6** | README: окружение, AGC, подпись, установка, тесты, ограничения, AppGallery, политика конфиденциальности, разрешения | Проход по README «с нуля» |

## 4. Детекция — ключевые решения

- Входной сэмпл: `{t, ax, ay, az, gx, gy, gz, hasGyro}`. Гироскоп выравнивается по последнему известному значению.
- Гравитация: `g = g + α·(a − g)`. Динамическое ускорение: `a − g`. Признак фазы — проекция динамического ускорения на ось гравитации, записанную в начале повтора, плюс изменение угла наклона `g` для отжиманий.
- Фазы подтверждаются по длительности (`minimumPhaseDurationMs`) и амплитуде (`minimumAmplitudeThreshold`). Повтор засчитывается только после полного цикла `DESCENT → BOTTOM → ASCENT → READY`, дальше идёт `COOLDOWN`.
- После старта или возобновления первые 750 мс игнорируются (warm-up фильтров).
- Confidence = взвешенная сумма оценок: полнота фаз, амплитуда относительно калибровки, длительность относительно калибровки, уровень шума. Порог по умолчанию — 0.6 (консервативный).
- Режим accel-only: если гироскоп не ответил за 1.5 с, порог поднимается до 0.7.
- Калибровка: 3–5 повторов → медианы амплитуды и длительности → персональные пороги (амплитуда ×0.6, длительность в диапазоне ×0.5…×2.0). Если найдено меньше 3 циклов, калибровка считается неудачной.

## 5. Точность и честность

- В UI есть предупреждение: «Автоматический подсчёт является оценкой…».
- Не обещаем поддержку отжиманий с колен и от стены, не оцениваем технику, калории не считаем.
- Пульс по умолчанию выключен. Включается в настройках и работает только при успешной подписке.
