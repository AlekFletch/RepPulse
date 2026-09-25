# RepPulse — статус и передача контекста

Обновлено: 2026-09-24 (Этап 5). Документ для продолжения работы в новом диалоге. Здесь собраны главные факты, решения и открытые вопросы. Подробности — в [01](01-platform-verification.md) … [04](04-deveco-device-setup.md), Этап 3 — в [06](06-stage3.md), Этап 4 — в [07](07-stage4.md), Этап 5 — в [08](08-stage5.md).

---

## 1. Где мы сейчас

| Этап | Статус |
|---|---|
| 1. Проверка платформы | ✅ [docs/01](01-platform-verification.md) |
| 2. Каркас, модели, адаптеры, MockSensorProvider, тесты | ✅ [docs/03](03-stage2-architecture.md); 98 тестов, ESLint для lite JS |
| Первая установка на часы (smoke) | ✅ 2026-09-24 `reppulse-fix2_all-perms.hap` установлен (со всеми разрешениями); ошибки 40 и 34 разобраны в §4. Далее — «Диагностика» (§5) |
| 3. UI-навигация, экраны, хранилище, контроллер тренировки | ✅ [docs/06](06-stage3.md): проверено в симуляторе, ждём проверки на часах |
| 4. Детекция повторов, калибровка | ✅ [docs/07](07-stage4.md): на синтетике, ждём проверки на часах |
| 5. История, статистика, настройки, тесты, QA | ✅ [docs/08](08-stage5.md): настройки сохраняются (файл вместо `storage`), сквозные тесты, чек-лист проверки на часах; 2026-09-25 — автосохранение истории и чувствительные приседания |
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
  npm run check:bundles
  ```
  Результат: `entry/build/default/outputs/default/entry-default-signed.hap`. Перед сборкой удаляйте `entry/build`, иначе в пакет могут попасть старые файлы.
- **Сборка обычная, debug, но JS в ней минифицирован.** Страница больше 48 КБ на часах не откроется (см. [06 §3](06-stage3.md)). SDK сам минифицирует JS только в release, а release-пакет DevEco Assistant не ставит: *Failed to decompress*. Поэтому в `entry/hvigorfile.ts` добавлена задача `RepPulseMinifyLiteJS`: между компиляцией JS и упаковкой в `.bin` она прогоняет `tools/minify-lite.js` (terser из SDK с настройками release). Это работает и в DevEco, и из консоли. `npm run check:bundles` проверяет размеры.

---

## 4. Ошибки установки 40 и 34 — причины найдены (2026-09-24)

DevEco Assistant писал: *Installation failed: 40. Invalid configuration file format.* Падали все три варианта с разными разрешениями (A/B/C), так что разрешения ни при чём.

**Причина — launcher-иконка.** Установщик lite wearable (`GtBundleParser` в OpenHarmony `appexecfwk_lite`, `services/bundlemgr_lite/src/gt_bundle_parser.cpp`) проверяет две вещи:
- иконка ability — **строго `"$media:icon"`** (`strcmp` с `DEFAULT_ICON_SETTING`), любое другое имя отклоняется;
- в папке иконки должны лежать **оба файла**: `icon` и `icon_small` (`ICON_NAME` / `SMALL_ICON_NAME`), иначе иконка считается невалидной.

У нас была `$media:app_icon` без маленькой иконки. У BreathTrainer — `$media:icon` плюс `icon_small.png`, поэтому он ставился.

**Исправление:**
- `config.json`: `"icon": "$media:icon"`;
- `resources/base/media/`: `icon.png` 104×104 и `icon_small.png` 92×92, RGBA (размеры как у BreathTrainer);
- `tools/export_icons.py` генерирует обе иконки, `npm run check:icons` проверяет имя в манифесте, оба файла, их размеры и что в `media` нет лишних файлов.

> ⚠️ Никогда не переименовывайте launcher-иконку и не удаляйте `icon_small.png`: установка снова упадёт с ошибкой 40.

После этого исправления оба HAP (`fix-icon_*`) дошли дальше и упали с **ошибкой 34**.

### 4.1. Ошибка 34: регулярные выражения в JS

Код 34 — `ERR_APPEXECFWK_INSTALL_FAILED_TRANSFORM_BC_FILE_ERROR`. При установке часы сами компилируют каждый `.js` из `assets/js` в байткод JerryScript (`GtBundleInstaller::TransformJsToBc` → `walk_directory` → `jerry_generate_snapshot`). Если компиляция хотя бы одного файла падает, установка прерывается.

**Причина:** в `diagnostics.js` были два литерала регулярных выражений. Движок на часах собран без RegExp, а в BreathTrainer регулярок нет вообще. Регулярки приходили из общих модулей:
- `util/json.js` — `toAsciiJson`;
- `storage/paths.js` — проверка запрещённых символов;
- `util/format.js` — `fill`, в собранные страницы пока не попадала.

**Исправление:**
- все три функции переписаны на циклы с `indexOf` / `charCodeAt`;
- `tests/unit/noRegexHelpers.test.js` сверяет их со старыми версиями на регулярках;
- ESLint запрещает в коде часов регулярные литералы, `new RegExp` и `RegExp()`.

> ⚠️ В коде часов нельзя использовать регулярные выражения: установка упадёт с ошибкой 34.

**HAP для проверки** в `C:\Claude\RepPulse-haps\` (прошлые версии перенесены в `old\`):

| Файл | Разрешения |
|---|---|
| `reppulse-fix2_all-perms.hap` | ACCELEROMETER + GYROSCOPE + VIBRATE, как в репозитории |
| `reppulse-fix2_vibrate-only.hap` | только VIBRATE, запасной |

Если первый не ставится, а второй ставится, дело в разрешениях датчиков. Тогда убрать их из `config.json` и в «Диагностике» проверить, работают ли датчики без них.

**Другие коды установщика** (`appexecfwk_errors.h` в `appexecfwk_lite`): 26 — повреждён файл, 27–32 — подпись и профиль, 33 — версия JS-движка, 34 — компиляция JS, 40 и выше — разбор `config.json`.

---

## 5. После успешной установки

**Диагностика пройдена 2026-09-24**, результаты в [docs/01 §12.1](01-platform-verification.md). Итог:
- акселерометр отдаёт **g**, провайдер переводит в м/с²;
- гироскоп в рад/с, данные приходят;
- `game` ≈ 45–50 Гц;
- файлы больше 4 КБ читаются;
- `storage` ограничен 128 символами.

Вибрация проверена: `short` ощущается коротко, `long` — длинно. Осталось на часах: `setKeepScreenOn`, поведение при кнопке и уведомлении (вошло в чек-лист Этапа 3, [06 §5](06-stage3.md)).

**Этап 3 готов** ([docs/06](06-stage3.md)), проверен на часах: установка, экраны, свободный режим, свайп «назад» с подтверждением в тренировке, иконки.

**Этап 4 готов** ([docs/07](07-stage4.md)): подсчёт повторов, калибровка, отдельная страница отдыха. На синтетике 1241 из 1248 прогонов точные. Пакет `C:\Claude\RepPulse-haps\reppulse-stage4.hap` ждёт проверки на часах: сколько засчитано из 10 приседаний и 10 отжиманий, нет ли ложных срабатываний. Под счётчиком в debug-сборке видна строка детектора `ФАЗА сигнал / порог · причина`; по её фото или видео подстраиваются пороги в `DetectionConfig`.

**Этап 5 готов** ([docs/08](08-stage5.md)). На часах настройки не сохранялись: колбэки `storage.get/set` не приходили. Теперь настройки — файл `settings.json`, проверено в симуляторе. Добавлены сквозные тесты (164 всего) и чек-лист проверки на часах из 25 пунктов ([08 §4](08-stage5.md)). Пакет `C:\Claude\RepPulse-haps\reppulse-stage5.hap` заменяет `reppulse-stage4.hap`.

**2026-09-25, по проверке на часах** ([08 §1.1](08-stage5.md)): история сохраняется автоматически при открытии итогов, индекс истории пересобирается из записей; приседания в позе «руки перед грудью горизонтально» засчитываются от ~8–10 см глубины запястья (порог 0,06 м), калибровка приседаний только снижает порог, датчики прогреваются во время 3-2-1. Пакет `C:\Claude\RepPulse-haps\reppulse-stage5b.hap`; после установки заново откалибровать приседания.

### 5.1. Ограничения lite, найденные на Этапах 3–5 (держать в голове при любых правках)

| Ограничение | Последствие | Защита |
|---|---|---|
| Иконка ability строго `$media:icon` плюс `icon_small` | иначе ошибка установки 40 | `npm run check:icons` |
| Нет RegExp в движке | иначе ошибка установки 34 | ESLint |
| Страница JS ≤ 48 КБ | больше — страница не откроется | минификация в сборке + `npm run check:bundles` |
| JS-куча ~100 КБ, из них 45–50 КБ — фреймворк | переполнение `JS HEAP OOM` | страница тренировки без отдыха и итогов; прогон в `tools/simulator.py --heap 97280` (тренировка должна проходить при 95 КБ, как сборка Этапа 3) |
| terser `compress` ломает страницы | «TypeError: wrong type of argument» | только `mangle` в `tools/minify-lite.js` |
| Release-HAP DevEco Assistant не ставит | «Failed to decompress» | только debug-формат (`.bin` внутри) |
| HAP около 1 МБ зависает на *Transferring* | установка не завершается | `.js.map` удаляются, иконки только нужных размеров; держать пакет около 0,5 МБ |
| `render` и `styleSheet` зарезервированы на странице | «Expected a function» | ESLint |
| `$t` без параметров вырезает `{…}` | пропадают числа в строках | всегда `$t(ключ, параметры)` |
| `show=false` у `list-item` оставляет место | скрытое наезжает на кнопки | в списках `if` |
| Текстовый блок не растёт под текст, на часах перенос по словам | текст наезжает на соседние элементы | высоты с запасом под русский текст |
| `storage.get/set` может не вызвать колбэк | экран «зависает», настройки теряются | всё храним в файлах (настройки — `settings.json` с Этапа 5); у оставшихся вызовов `storage` таймаут 1,5 с |
| Значение в `storage` ≤ 128 символов | запись падает с 202 | `MAX_KV_VALUE_LENGTH` в адаптерах; `storage` осталось только в тесте «Диагностики» |
| Акселерометр отдаёт g | пороги не совпадут | перевод в м/с² в провайдерах |

---

## 6. Решения и договорённости

- **Иконки:** используем только ассеты дизайнера из `assets-src/icons`, их лишь масштабируем (`tools/export_icons.py`). 2026-09-24 получены круглая иконка приложения (заменила прежнюю) и History Icon. У круглой иконки чёрные углы при экспорте становятся прозрачными (`ROUND_MASTERS`), пиксели внутри круга не меняются.
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
npm run check:bundles     # после сборки: страницы ≤ 48 КБ
python tools/simulator.py --heap 97280 --out shots "wait 2" "shot home"   # симулятор часов
npm run gen:fixtures      # синтетические JSON-логи
python tools/export_icons.py
```
