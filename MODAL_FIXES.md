# MODAL_FIXES - Решение проблем с формами в модальных окнах webKa

## Проблемы и Причины

### 1. **Первопроблема: Сохранение данных между модальными окнами**

При переходе `editPlaylistModal` → `editTrackModal` → `editPlaylistModal`, данные не очищаются:

```javascript
// ПРОБЛЕМА: При открытии editTrackModal...
$('#editTrackModal').modal('show')
// ...значения полей из editPlaylistModal остаются в памяти

// При возврате...
$('#editPlaylistModal').modal('show')
// ...старые значения снова появляются!
```

**Причина:** Bootstrap не очищает DOM элементы при скрытии модали. Значения остаются в html атрибутах и памяти браузера.

---

### 2. **Второпроблема: Multiple Event Listeners**

```javascript
$("#editTaskModal_2").on('show.bs.modal', function (event) {
    // Этот обработчик срабатывает КАЖДЫЙ РАЗ
    // При открытии 5 раз - срабатет 5 раз!
    trigger_topic_table.data_array = ...
})
```

**Причина:** Event listeners не удаляются, а просто добавляются новые. jQuery не дедублирует.

---

### 3. **Третья проблема: Select/Input некорректное состояние**

```javascript
playlist_table.forEach(item=>{
    $("#name_input").append($('<option>',{
        value: item.name,
        text : item.name
    }))
})
// Каждый раз добавляет опции → дублируются!
```

---

### 4. **Четвёртая проблема: Backdrop "повисла"**

После быстрого переключения модалей, блокирующий слой может остаться, сделав страницу невосприимчивой.

---

## Решение: Система управления модальным состоянием

### Файл: `webKa/assets/modal-manager.js` (НОВЫЙ)

```javascript
/**
 * ModalManager - единая система управления модальными окнами
 * Избегает дублирования event listeners и очистки состояния
 */

class ModalManager {
    constructor() {
        this.modals = new Map();
        this.activeModal = null;
    }

    /**
     * Регистрация модального окна
     * @param {string} modalId - ID модали (без #)
     * @param {Object} config - { onShow, onHide, onCleanup }
     */
    registerModal(modalId, config = {}) {
        const modal = {
            element: document.getElementById(modalId),
            bsModal: null,
            listeners: [],
            isRegistered: false,
            config: config
        };

        if (!modal.element) {
            console.error(`Modal #${modalId} not found`);
            return;
        }

        // Инициализация Bootstrap Modal
        modal.bsModal = new bootstrap.Modal(modal.element, {
            backdrop: 'static',
            keyboard: false
        });

        // Один раз установить listeners (не будут дублироваться)
        if (!modal.isRegistered) {
            this._setupModalListeners(modalId, modal);
            modal.isRegistered = true;
        }

        this.modals.set(modalId, modal);
    }

    /**
     * Внутренний метод: настройка обработчиков
     */
    _setupModalListeners(modalId, modal) {
        // Очистка перед показом
        modal.element.addEventListener('show.bs.modal', (event) => {
            this._cleanupModal(modalId);
            if (modal.config.onShow) modal.config.onShow(event);
        });

        // При скрытии
        modal.element.addEventListener('hide.bs.modal', (event) => {
            if (modal.config.onHide) modal.config.onHide(event);
        });

        // После полного скрытия
        modal.element.addEventListener('hidden.bs.modal', (event) => {
            this._cleanupModal(modalId);
            if (modal.config.onCleanup) modal.config.onCleanup(event);
        });
    }

    /**
     * Показать модаль
     */
    show(modalId) {
        const modal = this.modals.get(modalId);
        if (!modal) {
            console.error(`Modal ${modalId} not registered`);
            return;
        }

        // Скрыть предыдущую активную модаль
        if (this.activeModal && this.activeModal !== modalId) {
            this._hideBackdrop();
        }

        modal.bsModal.show();
        this.activeModal = modalId;
    }

    /**
     * Скрыть модаль
     */
    hide(modalId) {
        const modal = this.modals.get(modalId);
        if (!modal) return;
        
        modal.bsModal.hide();
        if (this.activeModal === modalId) {
            this.activeModal = null;
        }
    }

    /**
     * Очистить форму в модали
     */
    _cleanupModal(modalId) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        // Очистить все input/select/textarea
        modal.element.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = false;
            } else if (el.tagName === 'SELECT') {
                el.selectedIndex = 0;
            } else {
                el.value = '';
            }
        });

        // Очистить read-only поля
        modal.element.querySelectorAll('[readonly]').forEach(el => {
            el.value = '';
        });
    }

    /**
     * Полностью очистить select опции
     */
    clearSelectOptions(selectId) {
        const select = document.getElementById(selectId);
        if (select) {
            select.querySelectorAll('option:not([value=""])').forEach(opt => opt.remove());
        }
    }

    /**
     * Безопасное скрытие backdrop
     */
    _hideBackdrop() {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(b => {
            b.remove();
        });
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
    }

    /**
     * Получить DOM элемент модали
     */
    getElement(modalId) {
        const modal = this.modals.get(modalId);
        return modal ? modal.element : null;
    }

    /**
     * Узнать, показана ли модаль
     */
    isVisible(modalId) {
        const modal = this.modals.get(modalId);
        return modal ? modal.bsModal._isShown : false;
    }
}

// Глобальный экземпляр
window.modalManager = new ModalManager();
```

---

## Применение к scheduler.js

### ДО (ПРОБЛЕМНАЯ версия):

```javascript
var exampleModal = document.getElementById('editTaskModal')
exampleModal.addEventListener('show.bs.modal', function (event) {
    // Срабатывает много раз!
    trigger_topic_table.data_array = scheduler_table[edit_task_index-1].trigger_topics
    // ... еще код
})
```

### ПОСЛЕ (ИСПРАВЛЕННАЯ версия):

```javascript
// При инициализации страницы (один раз!)
document.addEventListener('DOMContentLoaded', function() {
    modalManager.registerModal('editTaskModal_2', {
        onShow: function(event) {
            // Инициализация данных (срабатевает каждый раз, но контролируемо)
            if (typeof edit_task_index !== 'undefined' && edit_task_index > 0) {
                trigger_topic_table.data_array = scheduler_table[edit_task_index-1].trigger_topics
                populateTaskModal()
            }
        },
        onCleanup: function(event) {
            // Опциональная очистка после закрытия
            trigger_topic_table.data_array = []
        }
    })
})

// Открытие модали (вместо .modal('show'))
function open_edit_task(index) {
    edit_task_index = index
    modalManager.show('editTaskModal_2')
}

// Закрытие модали  
function cancel_edit_task() {
    modalManager.hide('editTaskModal_2')
}
```

---

## Применение к editor.js (playlists)

### ДО:

```javascript
playlist_table.forEach(item=>{
    $("#name_input").append($('<option>',{
        value: item.name,
        text : item.name
    }))
})
// Каждый раз добавляет! → дублируются опции
```

### ПОСЛЕ:

```javascript
// При инициализации
document.addEventListener('DOMContentLoaded', function() {
    modalManager.registerModal('editPlaylistModal', {
        onShow: function(event) {
            // Очистить select перед заполнением
            modalManager.clearSelectOptions('name_input')
            
            // Заполнить свежие данные
            playlist_table.forEach(item => {
                const option = document.createElement('option')
                option.value = item.name
                option.textContent = item.name
                document.getElementById('name_input').appendChild(option)
            })
            
            show_content_tab()
        }
    })
})

// Сохранение
function save_edit_playlist() {
    // ... сохранение логики
    modalManager.hide('editPlaylistModal')
    modalManager.show('editPlaylistModal')  // если нужно перезагрузить
}
```

---

## Применение к editTrack_modal.pug

### ИСПРАВЛЕННАЯ логика переходов:

```javascript
// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    modalManager.registerModal('editTrackModal', {
        onShow: function(event) {
            // Заполнить данные трека
            loadTrackData()
        }
    })
    
    modalManager.registerModal('editPlaylistModal', {
        onShow: function(event) {
            show_content_tab()
        }
    })
})

// Переходы между модалями
function open_edit_track_modal(index, mode = 'new') {
    current_track_index = index
    modalManager.hide('editPlaylistModal')  // закрыть родительскую
    
    // Небольшая задержка для корректного скрытия
    setTimeout(() => {
        modalManager.show('editTrackModal')
    }, 200)
}

function saveTrack() {
    // ... логика сохранения трека
    
    modalManager.hide('editTrackModal')
    
    setTimeout(() => {
        modalManager.show('editPlaylistModal')
    }, 200)
}

function cancelEditTrack() {
    modalManager.hide('editTrackModal')
    
    setTimeout(() => {
        modalManager.show('editPlaylistModal')
    }, 200)
}
```

---

## Интеграция в layout.pug

Добавить в `<head>` ПОСЛЕ других скриптов:

```pug
script(src="/assets/modal-manager.js" defer)
```

---

## Чек-лист внедрения

- [ ] Создать `webKa/assets/modal-manager.js`
- [ ] Подключить в `layout.pug` 
- [ ] Обновить `scheduler.js` - использовать modalManager
- [ ] Обновить `editor.js` - использовать modalManager
- [ ] Обновить `editTrack_modal.pug` - логика переходов
- [ ] Обновить `editPlaylist_modal.pug` - логика переходов
- [ ] Тестировать: открыть → закрыть → открыть (3+ раза)
- [ ] Проверить дублирование опций в select
- [ ] Проверить, что backdrop корректно скрывается

---

## Тестирование функционала

### Тест 1: Сохранение данных
1. Открыть Playlist Editor
2. Нажать Edit на плейлисте
3. Нажать Edit на треке
4. Нажать Cancel (вернуться в Playlist)
5. Нажать Edit на треке ещё раз
6. **Проверка:** поля должны быть пусты (не содержать старые значения)

### Тест 2: Select Дублирование
1. Открыть Playlist Editor (первый раз)
2. Закрыть
3. Открыть ещё раз
4. Посчитать опции в select
5. **Проверка:** количество опций должно быть одинаковым (не удваиваться)

### Тест 3: Backdrop
1. Быстро переключаться между модалями (10 раз)
2. **Проверка:** страница остаётся интерактивной, backdrop корректный

---

## Документированные Улучшения

1. ✅ **Отсутствие дублирования listeners** → единая регистрация
2. ✅ **Автоматическая очистка форм** → консистентное состояние
3. ✅ **Управление backdrop** → избежание "зависания"
4. ✅ **Безопасные переходы** → таймауты для корректного скрытия
5. ✅ **Расширяемая архитектура** → легко добавлять новые модали

---

**Автор:** GitHub Copilot  
**Дата:** Апрель 2026
