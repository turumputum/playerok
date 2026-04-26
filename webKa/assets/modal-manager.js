/**
 * ModalManager - Unified Modal Management System
 * Solves issues with form persistence and bootstrap backdrop problems
 * 
 * Features:
 * - Single event listener registration (no duplicates)
 * - Automatic form cleanup on modal show/hide
 * - Backdrop management
 * - Safe modal transitions with cleanup
 */

class ModalManager {
    constructor() {
        this.modals = new Map();
        this.activeModal = null;
        this.modalStack = [];
    }

    /**
     * Register a modal window
     * @param {string} modalId - Modal ID without #
     * @param {Object} config - { onShow, onHide, onCleanup, formSelector }
     */
    registerModal(modalId, config = {}) {
        const modalElement = document.getElementById(modalId);
        
        if (!modalElement) {
            console.error(`[ModalManager] Modal #${modalId} not found in DOM`);
            return false;
        }

        // Prevent duplicate registration
        if (this.modals.has(modalId)) {
            console.warn(`[ModalManager] Modal ${modalId} already registered`);
            return true;
        }

        const modal = {
            element: modalElement,
            bsModal: null,
            isInitialized: false,
            isVisible: false,
            config: {
                onShow: config.onShow || null,
                onHide: config.onHide || null,
                onCleanup: config.onCleanup || null,
                formSelector: config.formSelector || null
            }
        };

        try {
            // Initialize Bootstrap Modal
            modal.bsModal = new bootstrap.Modal(modalElement, {
                backdrop: 'static',
                keyboard: false
            });

            // Setup event listeners (only once)
            this._setupEventListeners(modalId, modal);
            modal.isInitialized = true;

            this.modals.set(modalId, modal);
            console.log(`[ModalManager] Modal ${modalId} registered successfully`);
            return true;
        } catch (error) {
            console.error(`[ModalManager] Failed to register modal ${modalId}:`, error);
            return false;
        }
    }

    /**
     * Internal: Setup modal event listeners
     */
    _setupEventListeners(modalId, modal) {
        const element = modal.element;

        // Before showing
        element.addEventListener('show.bs.modal', (event) => {
            this._onModalShow(modalId, event);
        }, false);

        // Before hiding
        element.addEventListener('hide.bs.modal', (event) => {
            if (modal.config.onHide) {
                modal.config.onHide(event);
            }
        }, false);

        // After completely hidden
        element.addEventListener('hidden.bs.modal', (event) => {
            this._onModalHidden(modalId, event);
        }, false);
    }

    /**
     * Internal: Called when modal is shown
     */
    _onModalShow(modalId, event) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        // Clear form if specified
        if (modal.config.formSelector) {
            this._clearForm(modal.config.formSelector);
        }

        // Call user-defined onShow handler
        if (modal.config.onShow) {
            try {
                modal.config.onShow(event);
            } catch (error) {
                console.error(`[ModalManager] Error in onShow for ${modalId}:`, error);
            }
        }

        modal.isVisible = true;
        this.activeModal = modalId;
        this.modalStack.push(modalId);
    }

    /**
     * Internal: Called when modal is hidden
     */
    _onModalHidden(modalId, event) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        // Call cleanup handler
        if (modal.config.onCleanup) {
            try {
                modal.config.onCleanup(event);
            } catch (error) {
                console.error(`[ModalManager] Error in onCleanup for ${modalId}:`, error);
            }
        }

        modal.isVisible = false;

        // Update active modal
        if (this.activeModal === modalId) {
            this.modalStack.pop();
            this.activeModal = this.modalStack.length > 0 ? 
                this.modalStack[this.modalStack.length - 1] : null;
        }

        // Clean up backdrop if no modals are open
        if (this.modalStack.length === 0) {
            this._cleanupBackdrops();
        }
    }

    /**
     * Show a modal
     * @param {string} modalId - Modal ID to show
     * @param {number} delay - Optional delay before showing (ms)
     */
    show(modalId, delay = 0) {
        const modal = this.modals.get(modalId);
        
        if (!modal) {
            console.error(`[ModalManager] Modal ${modalId} not registered`);
            return false;
        }

        if (modal.isVisible) {
            console.warn(`[ModalManager] Modal ${modalId} is already visible`);
            return true;
        }

        // Clear form before showing
        if (modal.config.formSelector) {
            this._clearForm(modal.config.formSelector);
        }

        if (delay > 0) {
            setTimeout(() => {
                modal.bsModal.show();
            }, delay);
        } else {
            modal.bsModal.show();
        }

        return true;
    }

    /**
     * Hide a modal
     * @param {string} modalId - Modal ID to hide
     * @param {number} delay - Optional delay before hiding (ms)
     */
    hide(modalId, delay = 0) {
        const modal = this.modals.get(modalId);
        
        if (!modal) {
            console.error(`[ModalManager] Modal ${modalId} not registered`);
            return false;
        }

        if (!modal.isVisible) {
            console.warn(`[ModalManager] Modal ${modalId} is not visible`);
            return true;
        }

        if (delay > 0) {
            setTimeout(() => {
                modal.bsModal.hide();
            }, delay);
        } else {
            modal.bsModal.hide();
        }

        return true;
    }

    /**
     * Clear all form inputs in a container
     */
    _clearForm(formSelector) {
        const form = document.querySelector(formSelector);
        if (!form) return;

        // Clear text inputs
        form.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="password"], textarea').forEach(el => {
            el.value = '';
        });

        // Clear checkboxes and radios
        form.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(el => {
            el.checked = false;
        });

        // Reset selects
        form.querySelectorAll('select').forEach(el => {
            el.selectedIndex = 0;
        });

        // Clear readonly fields
        form.querySelectorAll('[readonly], [disabled]').forEach(el => {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = '';
            }
        });
    }

    /**
     * Clear select options (keeps first empty option)
     */
    clearSelectOptions(selectId) {
        const select = document.getElementById(selectId);
        if (!select) {
            console.warn(`[ModalManager] Select #${selectId} not found`);
            return;
        }

        while (select.options.length > 0) {
            select.remove(0);
        }
    }

    /**
     * Add options to select
     */
    addSelectOptions(selectId, options) {
        const select = document.getElementById(selectId);
        if (!select) {
            console.warn(`[ModalManager] Select #${selectId} not found`);
            return;
        }

        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value || option;
            opt.textContent = option.text || option;
            select.appendChild(opt);
        });
    }

    /**
     * Get modal element
     */
    getElement(modalId) {
        const modal = this.modals.get(modalId);
        return modal ? modal.element : null;
    }

    /**
     * Get Bootstrap Modal instance
     */
    getBsModal(modalId) {
        const modal = this.modals.get(modalId);
        return modal ? modal.bsModal : null;
    }

    /**
     * Check if modal is visible
     */
    isVisible(modalId) {
        const modal = this.modals.get(modalId);
        return modal ? modal.isVisible : false;
    }

    /**
     * Get the currently active modal
     */
    getActiveModal() {
        return this.activeModal;
    }

    /**
     * Internal: Clean up leftover backdrops
     */
    _cleanupBackdrops() {
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.remove();
        });

        if (document.querySelectorAll('.modal.show').length === 0) {
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
    }

    /**
     * Transition between modals (hide source, show target)
     */
    transition(fromModalId, toModalId, delay = 200) {
        this.hide(fromModalId);
        return new Promise(resolve => {
            setTimeout(() => {
                this.show(toModalId, 0);
                resolve();
            }, delay);
        });
    }

    /**
     * Alternative transition using async
     */
    async transitionAsync(fromModalId, toModalId, delay = 200) {
        this.hide(fromModalId);
        await new Promise(resolve => setTimeout(resolve, delay));
        this.show(toModalId);
    }

    /**
     * Debug: Log all registered modals
     */
    debug() {
        console.log('[ModalManager] Registered Modals:');
        this.modals.forEach((modal, id) => {
            console.log(`  - ${id}: visible=${modal.isVisible}, initialized=${modal.isInitialized}`);
        });
        console.log(`Active Modal: ${this.activeModal}`);
        console.log(`Modal Stack:`, this.modalStack);
    }

    /**
     * Unregister a modal
     */
    unregister(modalId) {
        this.modals.delete(modalId);
        if (this.activeModal === modalId) {
            this.activeModal = null;
        }
        console.log(`[ModalManager] Modal ${modalId} unregistered`);
    }
}

// Create and export global instance
window.modalManager = new ModalManager();

// Initialize when DOM is ready if not already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[ModalManager] ModalManager initialized');
    });
} else {
    console.log('[ModalManager] ModalManager ready (DOM already loaded)');
}
