# RepPulse — Этап 1. Техническая проверка платформы Huawei Watch Fit 4

Дата проверки: 2026-09-23.
Проверку вёл по трём видам источников. Каждый факт ниже помечен одним из статусов:

- **SDK** — подтверждено типизациями локально установленного DevEco Studio 6.1: `C:\Program Files\Huawei\DevEco Studio\sdk\default`, SDK HarmonyOS 6.1.1, apiVersion 24 (данные из `sdk-pkg.json`).
- **OFF** — подтверждено официальной страницей Huawei или OpenHarmony.
- **REP** — известно только из сообщений сообщества или форумов. Нужно проверить на реальных часах.
- **TODO** — не подтверждено. Проверяем вручную.

---

## 1. Итоговый вывод

| Вопрос | Ответ |
|---|---|
| Класс устройства | Watch Fit 4 — **lite wearable** (轻量级智能穿戴). **REP/OFF** |
| Тестовое устройство | **Watch Fit 4 Pro**: прошивка 6.1.0.117 (SP20C00M05), API **6.1.0(23)**. Экран такой же, как у Fit 4: 1.82" AMOLED 480×408, PPI 347. Акселерометр и гироскоп есть у обеих моделей. **OFF** ([specs](https://consumer.huawei.com/en/wearables/watch-fit4-pro/specs/)) |
| Стек разработки | **DevEco Studio → проект Lite Wearable → JS UI framework (HML + CSS + JS), FA-модель, `config.json`**. Движок — ACE Engine Lite + JerryScript. |
| ArkTS / ArkUI | **Недоступны на Fit 4.** ArkTS поддерживают только «полные» wearable (линейка Watch 3/4/5). HAP на ArkTS не ставится на lite-часы. **REP** |
| Нативные приложения на международной версии | Fit 4 поддерживает установку приложений через Huawei Health → устройство → AppGallery. Каталог в международной версии меньше, чем в китайской. **OFF** |
| Автономность | Приложение работает на часах без телефона. Телефон нужен только для установки debug-сборки или загрузки из AppGallery. |

**Принятое решение:** JS lite wearable. Бизнес-логику пишем на чистом JS в ES5-совместимом подмножестве и тестируем в Node/Jest. Все вызовы `@system.*` изолируем в адаптерах.

---

## 2. Среда разработки

| Компонент | Значение | Статус |
|---|---|---|
| IDE | DevEco Studio 6.1 (build DS-243.24978.46.36.611300), уже установлена | локально |
| SDK | HarmonyOS 6.1.1, API 24. Содержит `openharmony/js/api/@system.*.d.ts` и `hms/js/api/device-define/liteWearable*.json` | SDK |
| Шаблон проекта | Шаблон `[Lite]Empty Ability` есть в DevEco 6.1: FA-модель, JS, `deviceType: liteWearable`, SDK от 4.0.0(10) до 6.1.1(24). Иконка в шаблоне — 104×104 | **Проверено локально**: `plugins/openharmony/lib/templates/ability/Lite Empty Ability/template.json` |
| `compatibleSdkVersion` | Есть отчёт: HAP с API 20 даёт **error 40** на прошивке GT 6, а API 18 (5.1.0) устанавливается. Для Fit 4 начинаем с **API 12–18**, выбираем по версии прошивки часов. | REP, **TODO** |
| Node.js | v24.18.0, npm 10.8.2 — для unit-тестов логики | локально |

---

## 3. Системные возможности lite wearable (из SDK)

Файл `hms/js/api/device-define/liteWearable.json` перечисляет SysCaps:

```
SystemCapability.Sensors.Sensor.Lite                      → @system.sensor
SystemCapability.Sensors.MiscDevice.Lite                  → @system.vibrator
SystemCapability.FileManagement.File.FileIO.Lite          → @system.file
SystemCapability.DistributedDataManager.Preferences.Core.Lite → @system.storage
SystemCapability.PowerManager.DisplayPowerManager.Lite    → @system.brightness
SystemCapability.PowerManager.BatteryManager.Lite         → @system.battery
SystemCapability.ArkUI.ArkUI.Lite, Startup.SystemInfo.Lite, Location.Lite, Bluetooth.Lite, ...
```

`liteWearable-hmos.json` добавляет `Health.HealthService.Lite`, `Health.HealthStore.Lite` и `Health.WearEngine.Lite` (`@hms.health.*`). В MVP их не используем.

> Примечание. В `.d.ts` API `@system.*` помечены `@deprecated since 8` с `@useinstead ohos.sensor`. Для lite wearable альтернативы нет: `@ohos.sensor` в SysCaps liteWearable отсутствует. Гироскоп и ориентация дополнительно помечены `@reserved ["liteWearable"]`, то есть предназначены именно для lite wearable.

---

## 4. Датчики (`@system.sensor`)

Источник: `sdk/default/openharmony/js/api/@system.sensor.d.ts`.

| Датчик | API | Данные | Разрешение | Статус |
|---|---|---|---|---|
| Акселерометр | `subscribeAccelerometer({interval, success, fail})` / `unsubscribeAccelerometer()` | `x, y, z` | `ohos.permission.ACCELEROMETER` | SDK |
| Гироскоп | `subscribeGyroscope({interval, success, fail})` / `unsubscribeGyroscope()` (с API 6) | `x, y, z` | `ohos.permission.GYROSCOPE` | SDK. Работу на Fit 3/Fit 4 подтверждают сообщения сообщества (**REP**). |
| Ориентация | `subscribeDeviceOrientation({interval, success, fail})` (с API 6) | `alpha, beta, gamma` | не указано | SDK |
| Пульс | `subscribeHeartRate({success, fail})` | `heartRate` | `ohos.permission.READ_HEALTH_DATA` | SDK |
| Ношение на руке | `subscribeOnBodyState` / `getOnBodyState` | `value: boolean` | — | SDK |
| Шаги, барометр, компас, свет, приближение | есть | — | шаги: `ACTIVITY_MOTION` | SDK |
| **Gravity** | **нет** | — | — | SDK (отсутствует) |
| **Rotation vector** | **нет** | — | — | SDK (отсутствует) |

**Частоты дискретизации (`interval`)**, цитата из `.d.ts`:

| interval | Период | ≈ Частота |
|---|---|---|
| `game` | 20 мс | ~50 Гц |
| `ui` | 60 мс | ~16.7 Гц |
| `normal` (по умолчанию) | 200 мс | 5 Гц |

Следствия для алгоритма:

- Используем `game`. Фактическую частоту измеряем по интервалам между callback'ами, потому что `timestamp` в ответе сенсора не документирован и берётся из `Date.now()`.
- Вектор гравитации вычисляем сами: low-pass фильтр по акселерометру (α ≈ 0.1 при 50 Гц).
- Акселерометр и гироскоп приходят разными callback'ами. Выравниваем их по времени в `SensorProvider`: последнее значение гироскопа прикрепляем к каждому сэмплу акселерометра.
- По OpenHarmony-документации повторный `subscribe*` заменяет предыдущую подписку.
- **REP:** на части устройств (GT 3, GT Cyber, GT 6) гироскоп молчит и не вызывает даже `fail`. Поэтому нужен **таймаут** ожидания первого сэмпла (например, 1.5 с) и fallback на детекцию только по акселерометру.
- Во время тренировки выборка идёт непрерывно, пока приложение на экране. Для этого держим экран включённым (раздел 7).

---

## 5. Вибрация (`@system.vibrator`)

- `vibrate({ mode?: 'long' | 'short', success, fail, complete })`, разрешение `ohos.permission.VIBRATE`. **SDK**
- Длительность в миллисекундах не документирована, собственных паттернов нет. Составные сигналы собираем последовательностью вызовов с `setTimeout`:
  - «сильная» вибрация = `long`, `long`;
  - «3 секунды до старта» = `short` раз в секунду.
- **TODO:** замерить на часах реальную длительность `short` и `long`, минимальный интервал между вызовами и что происходит при вызове во время текущей вибрации.

---

## 6. Хранение данных

| API | Назначение в RepPulse | Ограничения | Статус |
|---|---|---|---|
| `@system.storage` (`get` / `set` / `delete` / `clear`) | Настройки (`AppSettings`), флаги | Key-value, callback-API. На часах 200 символов дают `202 Invalid parameter`, лимит 128 (см. §12.1) → каждое поле настроек храним отдельным ключом | SDK |
| `@system.file` (`writeText` / `readText` / `list` / `delete` / `mkdir` / `access` / ...) | История тренировок, калибровочные профили, debug-логи | URI `internal://app/...` длиной ≤128 символов. `readText` по умолчанию читает до 4 КБ, поэтому одна тренировка = один файл, а список хранится отдельным индексом | SDK (+OH docs) |

SQL/RDB на lite wearable недоступны: в SysCaps их нет.

---

## 7. Экран, фон, питание

| Вопрос | Факт | Статус |
|---|---|---|
| Не гасить экран во время тренировки | `@system.brightness.setKeepScreenOn({keepScreenOn: true})` — вызывать в `onShow` страницы тренировки и снимать на выходе | SDK |
| Фоновая работа | Для сторонних lite-приложений отсутствует. `keepAlive` в `config.json` действует только для системных приложений | OFF (OH `deviceconfig-structure`), REP |
| Блокировка экрана / кнопка / уведомление | Ожидаем `onHide` → приложение может быть уничтожено. **Стратегия:** при `onHide` — автопауза, отписка от сенсоров и сохранение черновика сессии в файл; при следующем запуске — предложить продолжить | **TODO** проверить на часах |
| Низкий заряд | `@system.battery.getStatus` доступен (BatteryManager.Lite). Перед стартом при уровне < 10 % показываем предупреждение. Поведение режима энергосбережения — **TODO** | SDK / TODO |

---

## 8. Разрешения (`config.json → module.reqPermissions`)

| Разрешение | Зачем | Обязательно |
|---|---|---|
| `ohos.permission.ACCELEROMETER` | Подсчёт повторов | да |
| `ohos.permission.GYROSCOPE` | Подсчёт повторов (точность) | да (есть fallback) |
| `ohos.permission.VIBRATE` | Вибросигналы | да |
| `ohos.permission.READ_HEALTH_DATA` | Пульс во время тренировки | нет; в v1 пульс выключен по умолчанию |

**TODO:** выяснить, запрашивается ли разрешение у пользователя в рантайме на lite (в `@system.*` нет API запроса) или оно выдаётся при установке. `PermissionManager` обрабатывает `fail`-callback подписки как «нет доступа».

---

## 9. Установка debug-сборки на Watch Fit 4 (REP, проверить)

1. Часы: Настройки → О часах → 5–7 раз нажать на номер версии → Режим разработчика → включить **HDC-отладку**.
2. Телефон на Android (есть у нас) с Huawei Health, часы сопряжены. Установить **DevEco Assistant (应用调测助手)** из Huawei AppGallery. Приложение показывает **UDID часов**.
3. AppGallery Connect (нужен developer-аккаунт):
   - создать проект и приложение (тип — HarmonyOS, lite wearable);
   - зарегистрировать устройство по UDID;
   - создать debug-сертификат (CSR генерируется в DevEco: Build → Generate Key and CSR);
   - создать debug-profile.
4. DevEco → Project Structure → Signing Configs: указать `.p12`, `.cer`, `.p7b` вручную. **Автоподпись для lite wearable не поддерживается.**
5. Build → Build HAP → скопировать подписанный `.hap` в `/sdcard/haps/` на телефоне.
6. DevEco Assistant → выбрать HAP → Установить. Health при этом должен быть запущен.
7. **Error 40** обычно означает некорректный `config.json`, слишком большую иконку или неподдерживаемый API level.

Симулятор lite wearable в DevEco умеет показывать UI, но **сенсоры в симуляторе не работают**. Поэтому для логики используем Mock/Replay-провайдер.

---

## 10. Экран и иконки

- Watch Fit 4: 1.82" AMOLED, **408 × 480** (портрет, прямоугольный). **OFF**
- `config.json`: `deviceType: ["liteWearable"]`, иконка ability строго `"icon": "$media:icon"` + обязательные `media/icon.png` и `media/icon_small.png` (иначе ошибка установки 40, см. [05 §4](05-status-handoff.md)). `distroFilter.screenWindow` = `"408*480"` — REP.
- Размер launcher-иконки: в официальном шаблоне DevEco 6.1 — **104×104** (`icon.png`), по сообщениям сообщества — 114×114. Используем 104×104. Слишком большие файлы дают error 40.
- AppGallery listing icon: отдельный экспорт из master-файла. Точные требования AGC для часов — **TODO** перед публикацией.
- Получены ассеты: `assets-src/icons/squat_icon.webp`, `pushup_icon.webp`, `reppulse_app_icon.webp` (главный знак: кольцо + pulse-wave + стрелка).
- **History Icon получен 2026-09-24** вместе с новой круглой иконкой приложения. Нейтральный placeholder «—» остался только как fallback из ТЗ на случай отсутствующего файла.

---

## 10a. Навигация (из SDK)

В `@system.router` для `SystemCapability.ArkUI.ArkUI.Lite` доступен **только `replace()`**. `push`, `back`, `getParams` и `clear` помечены как ArkUI.Full. Стека страниц нет, поэтому навигацию и передачу состояния между экранами RepPulse реализует сам (Этап 3).

## 11. Риски

| # | Риск | Влияние | Митигация |
|---|---|---|---|
| R1 | Частота ≤50 Гц, jitter JS-callback'ов | Хуже разрешение фаз | Фильтры, рассчитанные на фактический `dt`; фазы оцениваем по длительности ≥150 мс; ресэмплинг не нужен |
| R2 | Нет gravity/rotation vector | Сложнее отделить наклон руки от ускорения | Low-pass оценка гравитации, угол наклона вектора гравитации и `deviceOrientation` как дополнительный признак |
| R3 | Гироскоп не отвечает | Потеря признака | Таймаут → режим accel-only с более консервативным порогом confidence |
| R4 | Нет фона, экран гаснет | Обрыв тренировки | `setKeepScreenOn`, автопауза и сохранение в `onHide`, восстановление черновика |
| R5 | Малая память (JerryScript, ~48 КБ JS на страницу — REP) | Падения, медленный UI | Лёгкие страницы, кольцевые буферы фиксированного размера на `Array`, никаких тяжёлых библиотек |
| R6 | Синтаксис ES6+ не поддерживается движком | Ошибки на часах | Ограниченный subset JS + ESLint-правило + ранний smoke-тест на часах |
| R7 | Error 40 при установке | Блокирует разработку | Первым делом ставим «пустой» проект: проверяем API level и иконку |
| R8 | Точность rule-based алгоритма | Ошибки счёта | Калибровка, консервативный порог, ручная коррекция, replay реальных логов в тестах |
| R9 | Хранение только текстом, `readText` ≤4 КБ | Ограничение истории | Один файл на тренировку плюс индекс, лимит истории (например, 200 записей) |
| R10 | Пульс — чувствительные данные | Модерация AppGallery | Выключен по умолчанию, только локально, отражён в политике конфиденциальности |

---

## 12. Чек-лист первого запуска на часах (smoke, до Этапа 3)

1. Пустой проект Lite Wearable с иконкой 114×114 устанавливается без error 40. Зафиксировать рабочий `compatibleSdkVersion`.
2. Страница-диагностика:
   - подписка на `game` accel и gyro, вывод фактической частоты;
   - сэмплы гироскопа приходят (иначе — таймаут);
   - `deviceOrientation` отвечает.
3. `vibrate short/long`: замер субъективной длительности, серия из 3 вызовов с шагом 1 с.
4. `file.writeText` / `readText` по 3 КБ, `storage.set` строки длиной 200 символов: успех или ошибка.
5. `setKeepScreenOn(true)`: экран не гаснет 2 минуты.
6. Нажатие кнопки / входящее уведомление: какие lifecycle-события приходят (`onHide`, `onDestroy`).

### 12.1. Результаты на Watch Fit 4 Pro (2026-09-24, видео диагностики)

| Проверка | Результат | Что сделано |
|---|---|---|
| Установка | ✅ `compatible/target = 5.0.0(12)`, иконка `$media:icon` + `icon_small`, без RegExp в JS (см. [05 §4](05-status-handoff.md)) | — |
| Разрешения ACCELEROMETER + GYROSCOPE + VIBRATE | ✅ ставятся, датчики отвечают без запроса в рантайме | — |
| Единицы акселерометра | **g**, а не м/с²: в покое `A 0.05 0.96 0.18`, модуль ≈ 0.98 | `HuaweiSensorProvider` умножает на 9.80665; всё приложение работает в м/с² |
| Единицы гироскопа | рад/с: в покое \|ω\| < 0.1, при движении руки до ~1.6 | без изменений |
| Частота `game` | **42.9–50.2 Гц**, обычно 45–47 Гц (номинал 50) | детекция опирается на измеренную частоту |
| Гироскоп | ✅ данные приходят, счётчик сэмплов растёт вместе с акселерометром | таймаут не срабатывает |
| `file` > 4 КБ | ✅ `OK file 4478/4478`, чтение кусками по 4 КБ работает | — |
| `storage.set` 200 символов | ❌ `202 Invalid parameter` | лимит 128 символов в адаптерах (`MAX_KV_VALUE_LENGTH`, ошибка `VALUE_TOO_LONG`); тест «storage» в диагностике теперь пишет ровно 128 |
| Вибрация `short` / `long` | ✅ со слов пользователя: короткая ощущается как короткая, длинная — как длинная | «сильный» сигнал = long + long |
| `deviceOrientation`, `setKeepScreenOn` 2 мин, кнопка/уведомление | не проверялись | **TODO** |

---

## Источники

- Локальный SDK: `C:\Program Files\Huawei\DevEco Studio\sdk\default\openharmony\js\api\@system.{sensor,vibrator,storage,file,brightness,battery}.d.ts`, `...\hms\js\api\device-define\liteWearable.json`, `liteWearable-hmos.json`
- [HarmonyOS Wearable — Getting Started](https://developer.huawei.com/consumer/en/multidevice/wearables/get-started/)
- [Lite wearable best practices](https://developer.huawei.com/consumer/en/doc/best-practices/bpta-lite-wearable-guide)
- [JS lite component reference](https://developer.huawei.com/consumer/en/doc/harmonyos-references/arkui-js-lite-comp)
- [HUAWEI WATCH FIT 4 specs](https://consumer.huawei.com/en/wearables/watch-fit4/specs/)
- [Управление приложениями на часах HUAWEI (UK)](https://consumer.huawei.com/uk/support/content/en-gb16066729/)
- [AppGallery на серии Fit (CN)](https://consumer.huawei.com/cn/support/content/zh-cn15903440/)
- [OpenHarmony: system.sensor](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-3.2-Release/zh-cn/application-dev/reference/apis/js-apis-system-sensor.md)
- [OpenHarmony: system.storage](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-3.2-Release/zh-cn/application-dev/reference/apis/js-apis-system-storage.md)
- [OpenHarmony: system.file](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-3.2-Release/zh-cn/application-dev/reference/apis/js-apis-system-file.md)
- [OpenHarmony: deviceConfig (keepAlive)](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-3.2-Release/zh-cn/application-dev/quick-start/deviceconfig-structure.md)
- REP: [itying — accel/gyro по моделям](https://bbs.itying.com/topic/69cfe44ac504c50058fd690a), [itying — API 20 vs 18, error 40](https://bbs.itying.com/topic/69ac986a6f4d61004c83e5ce), [itying — ArkTS на GT 5](https://bbs.itying.com/topic/69fd1d2da45f61004d4d4062), [itying — разработка под Fit 3/4](https://bbs.itying.com/topic/6a1af794f483360041a3107d), [Medium — запуск lite-приложений на GT](https://medium.com/huawei-developers/running-lite-wearable-apps-on-huawei-gt-devices-d4d26db1251c), [harmonyos-dev-guide](https://github.com/megaacheyounes/harmonyos-dev-guide)
