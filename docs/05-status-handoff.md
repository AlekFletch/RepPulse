# RepPulse — статус и передача контекста

Обновлено: 2026-09-23. Документ для продолжения работы в новом диалоге. Здесь собраны главные факты, решения и открытые вопросы. Подробности — в [01](01-platform-verification.md) … [04](04-deveco-device-setup.md).

---

## 1. Где мы сейчас

| Этап | Статус |
|---|---|
| 1. Проверка платформы | ✅ [docs/01](01-platform-verification.md) |
| 2. Каркас, модели, адаптеры, MockSensorProvider, тесты | ✅ [docs/03](03-stage2-architecture.md); 98 тестов, ESLint для lite JS |
| Первая установка на часы (smoke) | ⛔ **Идёт: ошибка 40 при установке** — см. §4 |
| 3. UI-навигация, экраны, хранилище, контроллер тренировки | ⏳ не начат |
| 4. Детекция повторов, калибровка | ⏳ |
| 5. История, статистика, настройки, тесты, QA | ⏳ |
| 6. README, AppGallery, политика конфиденциальности | ⏳ |

- Репозиторий: https://github.com/AlekFletch/RepPulse, ветка `main`. Все изменения пушим туда.
- Локальная копия: `C:\Claude\RepPulse`.

---

## 2. Ключевые факты о платформе

- **Устройство для тестов:** Huawei **Watch Fit 4 Pro**.
  - Прошивка 6.1.0.117 (SP20C00M05), **API 6.1.0(23)**.
  - Экран 1.82" AMOLED **480×408**, прямоугольный (у Fit 4 такой же).
  - UDID: `0CAB1838BA81AF24079E4A61D0369C1D133D718942B862DC10E056BE8D82C719`.
- **Тип часов — lite wearable.** Отсюда стек:
  - JS UI: HML + CSS + JS, FA-модель, `config.json`, движок JerryScript;
  - **ArkTS не поддерживается**.
- **IDE:** DevEco Studio 6.1 (SDK HarmonyOS 6.1.1, API 24). Шаблон `[Lite]Empty Ability` есть.
- **API подтверждены по `.d.ts` SDK:**
  - `@system.sensor`: акселерометр, гироскоп, ориентация, пульс. Частоты: `game` = 20 мс, `ui` = 60 мс, `normal` = 200 мс;
  - `@system.vibrator`: `short` / `long`;
  - `@system.storage` и `@system.file` (`internal://app/`);
  - `@system.brightness.setKeepScreenOn`, `@system.battery`;
  - `@system.router`: **только `replace()`**, стека страниц и `back` нет.
- **Датчиков gravity и rotation vector нет.** Гравитацию считаем low-pass фильтром по акселерометру.
- **Фоновой работы у сторонних lite-приложений нет.** При `onHide` — автопауза и сохранение.
- **На часах нет HDC-отладки, и она не нужна.** Установка идёт через Android-телефон: Huawei Health + DevEco Assistant, файл кладётся в `/sdcard/haps/`.
- **В Previewer DevEco круглые часы 454×454.** Для Fit 4 нужна прямоугольная разметка 408×480 (задача Этапа 3).

---

## 3. Подпись и AppGallery Connect (сделано)

- **Проект в AGC:** **RepPulse**.
  - ID приложения **6917617199229450826**, пакет `com.alekfletch.reppulse`.
  - Team ID 1340007000010571897.
- **Файлы подписи лежат вне репозитория:** `C:\Claude\huawei-keys\RepPulse-signing\`
  - `reppulse.p12` (alias `reppulse`), `reppulse.csr`, `ReppulseDebug.cer`;
  - `RepPulseDebugProfile.p7b`: debug, действует до 23.09.2027, содержит UDID часов.
- **Подпись прописана в DevEco:** Signing Configs, локально в `build-profile.json5`.
- **Подпись не попадёт в git:** clean-фильтр `tools/strip-signing.js` при коммите превращает `signingConfigs` в `[]`. Фильтр включается в каждом клоне заново, команды в [docs/04 §6](04-deveco-device-setup.md).
- **Сборка из консоли** (DevEco при этом можно не открывать):
  ```bash
  export DEVECO_SDK_HOME="C:/Program Files/Huawei/DevEco Studio/sdk"
  "/c/Program Files/Huawei/DevEco Studio/tools/node/node.exe" "/c/Program Files/Huawei/DevEco Studio/tools/hvigor/bin/hvigorw.js" --mode module -p module=entry@default -p product=default assembleHap --no-daemon
  ```
  Результат: `entry/build/default/outputs/default/entry-default-signed.hap`. После переименований удаляйте `entry/build` перед сборкой, иначе в пакет попадут старые файлы.

---

## 4. ⛔ Открытая проблема: установка падает с ошибкой 40

DevEco Assistant пишет: *Installation failed: 40. Invalid configuration file format.*

Эталон — проект **BreathTrainer** (`C:\Claude\breath_trainer\watch`). Его HAP **ставится на эти же часы**. Конфиг вшит в `.bin` внутри HAP, его можно извлечь Python-скриптом: найти JSON по `"app"`.

**Что уже приведено к BreathTrainer (коммит `3992682`) — ошибка 40 осталась:**
- target / compatible API = 5.0.0(12);
- ability переименован в `.MainAbility`, папка `entry/src/main/js/MainAbility`;
- у разрешений `reason` — обычная строка, добавлен `usedScene`; `READ_HEALTH_DATA` убран.

**Оставшиеся отличия от BreathTrainer:**
1. Разрешения `ohos.permission.ACCELEROMETER` и `ohos.permission.GYROSCOPE`. У BreathTrainer только `VIBRATE`. **Главный подозреваемый.**
2. Иконка называется `$media:app_icon`, у BreathTrainer — `$media:icon`. У BreathTrainer в `media` лежат ещё и `icon_small.png`.
3. Ресурсы и страницы: i18n `ru-RU` / `en-US`, PNG-иконки в `common/icons` (в пакете превращаются в `.bin` по 3–43 КБ), страница `diagnostics`.
4. `vendor`: `reppulse` у нас, `AKdev` у BreathTrainer. Вряд ли влияет.

**Эксперимент, результат которого ждём.** Собраны 3 HAP в `C:\Claude\RepPulse-haps\`:

| Файл | Разрешения |
|---|---|
| `reppulse-A_vibrate_only.hap` | VIBRATE |
| `reppulse-B_vibrate_accel.hap` | VIBRATE + ACCELEROMETER |
| `reppulse-C_vibrate_gyro.hap` | VIBRATE + GYROSCOPE |

**Как читать результат:**
- **A ставится, B или C нет** — убрать «ломающие» разрешения из `config.json`. Затем в «Диагностике» проверить, работает ли датчик без объявленного разрешения. По SDK разрешения нужны, но на lite это может не проверяться.
- **A не ставится** — сравнить дальше по пунктам 2–3. Например:
  - собрать RepPulse с иконкой `icon`;
  - собрать RepPulse с минимальными страницами;
  - или взять BreathTrainer, поменять в нём bundle name и добавлять наши части по одной.

`config.json` в репозитории — это вариант со всеми тремя разрешениями (ACCELEROMETER, GYROSCOPE, VIBRATE).

---

## 5. После успешной установки

1. Пройти «Диагностику» на часах по таблице из [docs/04 §9](04-deveco-device-setup.md):
   - единицы акселерометра и гироскопа;
   - реальная частота `game`, приходят ли данные гироскопа;
   - длительность вибраций `short` / `long`;
   - тест файла больше 4 КБ;
   - storage на 200 символов;
   - что происходит при нажатии кнопки и при уведомлении.
2. Записать результаты в `docs/01` (закрыть TODO) и поправить `DetectionConfig`.
3. Начать **Этап 3**:
   - навигация на `router.replace` с собственным состоянием;
   - прямоугольная разметка 408×480;
   - экраны из ТЗ;
   - `WorkoutSessionController`, countdown, rest timer, haptics;
   - репозитории поверх `LocalStorageAdapter`.

---

## 6. Решения и договорённости

- **Иконки:** используем только ассеты дизайнера из `assets-src/icons`, их лишь масштабируем (`tools/export_icons.py`). **History Icon ещё не передан**, вместо него заглушка «—» (`ICON_HISTORY = null`).
- **Launcher-иконка:** 104×104, как в официальном шаблоне и у BreathTrainer.
- **Язык кода:** только безопасное подмножество JS: без `class`, spread, деструктуризации, `Promise`/`Map`, ES2015+ методов. Проверяет `npm run lint`.
- **Асинхронность:** адаптеры на callback'ах `cb(err, result)`.
- **Пульс** выключен по умолчанию (`heartRateEnabled: false`). Разрешение `READ_HEALTH_DATA` вернём отдельным экспериментом.
- **Release-гейт** `npm run check:release` требует `DEBUG=false` и убранную страницу diagnostics.

## 7. Команды

```bash
npm test                  # Jest
npm run lint              # ESLint (lite JS)
npm run check:icons       # иконки и манифест
npm run gen:fixtures      # синтетические JSON-логи
python tools/export_icons.py
```
