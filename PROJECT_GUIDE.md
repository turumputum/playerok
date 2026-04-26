d# PlayerOK - Проект Гайд Структуры

## 📋 Обзор Проекта

**PlayerOK** - это система управления мультимедийным контентом на встроенных устройствах Linux (Raspberry Pi, SteamOS). Состоит из нескольких слабо связанных модулей, работающих через MQTT.

---

## 📁 Структура Проекта

### Корневой уровень
```
/playerok
├── package.json              # Root зависимости (mqtt, node-watch, log-timestamp)
├── README.md                 # Начальная документация 
├── installer_1.sh            # Скрипт первичной установки
├── [ОСНОВНЫЕ МОДУЛИ]
├── [ВСПОМОГАТЕЛЬНЫЕ ПАПКИ]
└── [КОНФИГУРАЦИЯ]
```

---

## 🎯 Основные Модули

### 1. **webKa/** - WEB INTERFACE (главная часть системы)
**Назначение:** Express.js веб-приложение управления с Bootstrap интерфейсом

**Структура:**
```
webKa/
├── index.js                  # Express сервер (порт 80, Pug шаблоны)
├── package.json              # Зависимости (Express, Bootstrap, MQTT, Pug)
├── assets/                   # Frontend JavaScript и стили
│   ├── common.js             # Утилиты (htmlEscape и т.п.)
│   ├── editor.js             # Управление плейлистами/треками
│   ├── scheduler.js          # Управление задачами (ПРОБЛЕМНЫЙ!)
│   ├── login.js              # Валидация входа
│   ├── upload.js             # Загрузка файлов
│   ├── shell.js              # Терминальные команды
│   ├── *.css                 # Стили (cards, cmd, editor, home, list, login)
│   └── jquery_weekDayPicker/ # Виджет для дня недели
├── views/                    # Pug шаблоны
│   ├── layout.pug            # Главный макет
│   ├── navbar.pug            # Навигация
│   ├── home.pug              # Главная страница
│   ├── editor.pug            # Редактор плейлистов
│   ├── scheduler.pug         # Планировщик задач
│   ├── list.pug              # Файловый менеджер
│   ├── settings.pug          # Параметры системы
│   ├── modals/               # Модальные окна
│   │   ├── editPlaylist_modal.pug  # Редактор плейлиста
│   │   ├── editTrack_modal.pug     # Редактор трека
│   │   └── editTask_modal.pug      # Редактор задачи
│   ├── cards/                # Компоненты настроек
│   │   ├── logSettings-card.pug
│   │   ├── netSettings-card.pug
│   │   ├── timeSettings-card.pug
│   │   └── others...
│   └── icons/                # SVG иконки
├── tools/                    # Утилиты
│   └── tmpSupervisor.js      # Временные скрипты
└── workJson/                 # Локальные конфиги
    ├── config.json
    ├── playlist-table.json
    └── scheduler-config.json
```

**Ключевые функции:**
- 🎬 Редактор плейлистов с поддержкой простых/интерактивных треков
- ⏰ Планировщик автоматических задач
- 📁 Файловый менеджер (загрузка, переименование, удаление)
- 🔐 HTTP базовая аутентификация
- 🌐 MQTT управление контентом в реальном времени

**Порт:** 80 (HTTP)

---

### 2. **player/** - МЕДИАПЛЕЕР
**Назначение:** MPV-based мультимедийный плеер с контролем через MQTT

**Файлы:**
```
player/
├── player.js                 # Основной скрипт (управление MPV)
└── package.json              # Зависимости (mqtt, node-pty)
```

**Функции:**
- Воспроизведение аудио/видеоконтента
- MQTT события: play, stop, pause, next, previous, volume control
- Отчет о состоянии плеера
- Поддержка повторения треков

---

### 3. **supervisor/** - СУПЕРВИЗОР СИСТЕМЫ
**Назначение:** Управление всеми компонентами системы, синхронизация конфигов

**Ключевые файлы:**
```
supervisor/
├── supervisor.js             # Основной скрипт
├── device_handler.js         # Обработчик устройств
├── content_table_update.js   # Обновление таблицы контента
├── playlist_table_update.js  # Обновление плейлистов
├── updater.js                # Система обновлений
├── set_*_config.js           # Установка конфигов (net, time, log, security)
├── usb_storage.js            # Управление USB
├── touch_test.js             # Тестирование сенсоров

└── updateExample/            # Примеры обновлений
```

**Функции:**
- 🔄 Синхронизация конфигов между модулями
- 🎮 Управление внешними устройствами (через MQTT)
- 📡 MQTT broker взаимодействие
- 🔧 Настройка сети, времени, уровня логирования
- 💾 Управление USB хранилищем

**Запуск:** `node supervisor.js`

---

### 4. **scheduler/** - ПЛАНИРОВЩИК ЗАДАЧ
**Назначение:** Запуск задач по расписанию (плейлисты, скрипты)

**Файлы:**
```
scheduler/
├── scheduler.js              # Основной скрипт
└── package.json
```

**Функции:**
- ⏰ Планирование мультимедиа по времени/дню недели
- 🚀 Запуск скриптов по расписанию
- 📡 Управление через MQTT топики
- 🔔 Триггеры по событиям

---

### 5. **uart2mqtt/** - UART ↔ MQTT МОСТ
**Назначение:** Преобразование UART последовательных команд в MQTT сообщения

```
uart2mqtt/
├── uart2mqtt.js              # Основной скрипт (TTY↔MQTT)
└── package.json
```

**Используется для:** Управления Arduino/микроконтроллерами через последовательный порт

---

### 6. **outline-cli/** - VPN УПРАВЛЕНИЕ
**Назначение:** Интеграция Outline VPN на SteamOS

```
outline-cli/
├── install.sh, install-steamos.sh, uninstall.sh
├── src/                      # Вспомогательные файлы
└── patches/                  # Патчи для кастомной конфигурации
```

---

## 📊 Вспомогательные Папки

### **meta/** - КОНФИГУРАЦИЯ И МЕТАДАННЫЕ
```
meta/
├── player_config.json        # Главная конфигурация системы
├── playlist-table.json       # Регистр всех плейлистов
├── scheduler-table.json      # Регистр всех задач
├── content-table.json        # Регистр контента
├── tmp.json                  # Временные данные
└── tools/
    └── file_tools.js         # Утилиты работы с файлами
```

**player_config.json основные поля:**
```json
{
  "security": { "auth": 0|1, "admin_login": "...", "admin_pass": "..." },
  "log": { "level": "info|debug|warn|error" },
  "mqtt": { "broker": "localhost", "port": 1883 },
  "player": { "auto_start": true/false },
  "network": { ... }
}
```

---

### **data/** - КОНТЕНТ И ДАННЫЕ
```
data/
├── playlists/
│   └── playlist.json         # Пример плейлиста
├── actuatorGate/             # Скрипты управления шлюзом/туалетом
│   ├── script.py
│   ├── toilet_script.py      # Система управления туалетом 🚽
│   └── tt.js
├── content/                  # Музыка, видео
├── toilet/                   # Конфиг туалета
│   ├── toilet_script.py
│   └── toilet.service
└── 123/                      # Числовые папки (кэш?)
```

---

### **linux_conf/** - КОНФИГИ ОС
```
linux_conf/
├── grub                      # Загрузчик GRUB конфиг
├── lightdm.conf              # Display manager
├── mosquitto.conf            # MQTT broker конфиг
├── *.service                 # Systemd сервисы
└── grub-shusher/             # Утилита скрытия GRUB меню
    └── grub-shusher/
        ├── grub-kernel.c
        ├── Makefile
        └── README.md
```

**Сервисы:**
- `webka.service` - Веб-интерфейс
- `supervisor.service` - Супервизор
- `scheduler.service` - Планировщик
- `uart2mqtt.service` - UART мост
- `screen_sound_config.service` - Звук/дисплей
- `usb_storage.service` - USB управление

---

### **logs/** - ЛОГИ ПРИЛОЖЕНИЯ
Динамически генерируемые логи приложений

---

## 🔌 MQTT АРХИТЕКТУРА

### Основные топики:
```
player/                       # Управление плеером
├── play
├── stop
├── pause
├── next
├── previous
├── volume
└── state

scheduler/                    # Управление задачами
├── current_player_task
└── runing_scripts_list

script/                       # События скриптов
├── play
├── playEnd
├── timerEnd
└── ...

moduleBox/                    # GPIO управление
├── in_*                      # входные сигналы
└── out_*                     # выходные сигналы

mbss/, mbclos/, mbbr/        # Подсистемы (ModuleBox sections)
```

---

## 🐛 ИЗВЕСТНЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### ❌ ПРОБЛЕМА: Модальные окна webka
**Составляющие:**
1. При переходе editPlaylistModal → editTrackModal → editPlaylistModal форма не очищается
2. Значения полей сохраняются между открытиями
3. Event listeners могут срабатывать несколько раз
4. Bootstrap backdrop может быть "зависший"

**Файлы:** 
- [webKa/assets/scheduler.js](webKa/assets/scheduler.js)
- [webKa/views/modals/editTrack_modal.pug](webKa/views/modals/editTrack_modal.pug)  
- [webKa/views/modals/editPlaylist_modal.pug](webKa/views/modals/editPlaylist_modal.pug)
- [webKa/views/modals/editTask_modal.pug](webKa/views/modals/editTask_modal.pug)

**РЕШЕНИЕ:** Реализовано в `MODAL_FIXES.md`

---

## 🚀 БЫСТРЫЙ СТАРТ

### Установка
```bash
# 1. Основная установка
chmod +x installer_1.sh
./installer_1.sh

# 2. Вторичная установка (supervisor)
cd supervisor
chmod +x installer_2.sh
./installer_2.sh
```

### Запуск компонентов

```bash
# WebKa интерфейс
cd webKa
npm start                    # http://localhost

# Scheduler
cd scheduler
npm start

# Supervisor
cd supervisor
npm start

# Player
cd player
npm start

# UART→MQTT мост
cd uart2mqtt
npm start
```

### Конфигурация
Редактировать: `meta/player_config.json`
```json
{
  "security.auth": 1,                  // включить аутентификацию
  "security.admin_login": "admin",
  "security.admin_pass": "password",
  "log.level": "debug",
  "mqtt.broker": "192.168.1.100"
}
```

---

## 📋 МОДУЛИ И ЗАВИСИМОСТИ

| Модуль | Язык | Framework | Наличие потоков |
|--------|------|-----------|-----------------|
| webKa | Node.js | Express + Bootstrap | ✅ Async/Promise |
| player | Node.js | node-pty + MPV | ✅ Child Process |
| scheduler | Node.js | Vanilla | ✅ Timers |
| supervisor | Node.js | Vanilla | ✅ File Watchers |
| uart2mqtt | Node.js | serialport | ✅ Event Loop |
| toilet_script | Python | paho-mqtt | ✅ Threading |

---

## 🎯 ТОЧКИ ИНТЕГРАЦИИ

```
┌─────────┐
│  webKa  │ ─── HTTP (port 80)
└────┬────┘
     │
┌────┴────────────────────────────────┐
│          MQTT Broker                 │
│      (mosquitto, port 1883)          │
└────┬────────────────────────────────┘
     │
     ├─── player/player.js (воспроизведение)
     ├─── scheduler/scheduler.js (планирование)
     ├─── supervisor/supervisor.js (синхронизация)
     ├─── uart2mqtt/uart2mqtt.js (GPIO)
     └─── data/actuatorGate/toilet_script.py (логика туалета)

File System:
meta/ ─── конфиги и метаданные
data/ ─── контент и скрипты
```

---

## 💡 РЕКОМЕНДАЦИИ

1. **Перед редактированием** `player_config.json` - остановить все сервисы
2. **MQTT топики** чувствительны к регистру
3. **Логи** находятся в `logs/` для отладки
4. **Модальные окна** - использовать새로운 систему управления состоянием (см. MODAL_FIXES.md)
5. **WebKa** автоматически перезагружается через supervisor на изменение конфига

---

## 📞 КОНТАКТЫ И ПОДДЕРЖКА

Система полностью интегрирована через MQTT. Для добавления новых компонентов:
1. Используйте уже существующие топики
2. Добавьте конфиг в `meta/player_config.json`
3. Создайте сервис в `linux_conf/*.service`
4. Регистрируйте в systemctl

---

**Последнее обновление:** Апрель 2026  
**Версия:** 1.0.0
