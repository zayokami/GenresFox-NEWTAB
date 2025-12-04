/**
 * Accessibility Manager Module
 * Provides built-in accessibility features for users with disabilities
 */

const AccessibilityManager = (function () {
    'use strict';

    // ==================== Configuration Constants ====================
    const CONFIG = {
        STORAGE_KEY: 'accessibilitySettings',
        CSS_CLASS_PREFIX: 'a11y-',
        THEMES: {
            STANDARD: 'standard',
            HIGH_CONTRAST_DARK: 'high-contrast-dark',
            HIGH_CONTRAST_LIGHT: 'high-contrast-light',
            YELLOW_BLACK: 'yellow-black'
        },
        FONT_FAMILIES: {
            DEFAULT: 'default',
            SANS: 'sans',
            SERIF: 'serif',
            DYSLEXIC: 'dyslexic'
        },
        LINE_SPACING: {
            NORMAL: 'normal',
            RELAXED: 'relaxed',
            VERY_RELAXED: 'very-relaxed'
        },
        MOTION: {
            FULL: 'full',
            REDUCED: 'reduced',
            NONE: 'none'
        },
        FOCUS_STYLE: {
            STANDARD: 'standard',
            ENHANCED: 'enhanced',
            LARGE: 'large'
        },
        FONT_SIZE: {
            MIN: 80,
            MAX: 200,
            DEFAULT: 100
        }
    };

    // ==================== Default Settings ====================
    const DEFAULT_SETTINGS = {
        enabled: false,
        display: {
            theme: CONFIG.THEMES.STANDARD,
            fontSize: CONFIG.FONT_SIZE.DEFAULT,
            fontFamily: CONFIG.FONT_FAMILIES.DEFAULT,
            lineSpacing: CONFIG.LINE_SPACING.NORMAL
        },
        motion: CONFIG.MOTION.FULL,
        focus: CONFIG.FOCUS_STYLE.STANDARD
    };

    // ==================== Private State ====================
    let _state = {
        settings: { ...DEFAULT_SETTINGS },
        isInitialized: false
    };

    // ==================== DOM Element References ====================
    let _elements = {
        // Theme
        themeSelect: null,
        // Font
        fontSizeSlider: null,
        fontSizeValue: null,
        fontFamilySelect: null,
        lineSpacingSelect: null,
        // Motion
        motionSelect: null,
        // Focus
        focusStyleSelect: null,
        // Reset
        resetBtn: null
    };

    // ==================== Settings Persistence ====================

    /**
     * Load settings from localStorage
     * @returns {Object} Settings object
     */
    function _loadSettings() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Deep merge with defaults to handle missing properties
                return _deepMerge(DEFAULT_SETTINGS, parsed);
            }
        } catch (e) {
            console.warn('Failed to load accessibility settings:', e);
        }
        return { ...DEFAULT_SETTINGS };
    }

    /**
     * Save settings to localStorage
     */
    function _saveSettings() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(_state.settings));
        } catch (e) {
            console.warn('Failed to save accessibility settings:', e);
        }
    }

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    function _deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = _deepMerge(target[key] || {}, source[key]);
            } else if (source[key] !== undefined) {
                result[key] = source[key];
            }
        }
        return result;
    }

    // ==================== Theme Management ====================

    /**
     * Apply theme to document
     * @param {string} theme - Theme identifier
     */
    function _applyTheme(theme) {
        const root = document.documentElement;
        
        // Remove all theme classes
        Object.values(CONFIG.THEMES).forEach(t => {
            root.classList.remove(`${CONFIG.CSS_CLASS_PREFIX}theme-${t}`);
        });

        // Add new theme class (skip for standard theme)
        if (theme !== CONFIG.THEMES.STANDARD) {
            root.classList.add(`${CONFIG.CSS_CLASS_PREFIX}theme-${theme}`);
        }

        _state.settings.display.theme = theme;
        _saveSettings();
    }

    // ==================== Font Management ====================

    /**
     * Apply font size to document
     * @param {number} size - Font size percentage (80-200)
     */
    function _applyFontSize(size) {
        const clampedSize = Math.max(CONFIG.FONT_SIZE.MIN, Math.min(CONFIG.FONT_SIZE.MAX, size));
        document.documentElement.style.setProperty('--a11y-font-scale', clampedSize / 100);
        
        _state.settings.display.fontSize = clampedSize;
        _saveSettings();
    }

    /**
     * Apply font family to document
     * @param {string} family - Font family identifier
     */
    function _applyFontFamily(family) {
        const root = document.documentElement;
        
        // Remove all font family classes
        Object.values(CONFIG.FONT_FAMILIES).forEach(f => {
            root.classList.remove(`${CONFIG.CSS_CLASS_PREFIX}font-${f}`);
        });

        // Add new font family class (skip for default)
        if (family !== CONFIG.FONT_FAMILIES.DEFAULT) {
            root.classList.add(`${CONFIG.CSS_CLASS_PREFIX}font-${family}`);
        }

        _state.settings.display.fontFamily = family;
        _saveSettings();
    }

    /**
     * Apply line spacing to document
     * @param {string} spacing - Line spacing identifier
     */
    function _applyLineSpacing(spacing) {
        const root = document.documentElement;
        
        // Remove all line spacing classes
        Object.values(CONFIG.LINE_SPACING).forEach(s => {
            root.classList.remove(`${CONFIG.CSS_CLASS_PREFIX}spacing-${s}`);
        });

        // Add new line spacing class (skip for normal)
        if (spacing !== CONFIG.LINE_SPACING.NORMAL) {
            root.classList.add(`${CONFIG.CSS_CLASS_PREFIX}spacing-${spacing}`);
        }

        _state.settings.display.lineSpacing = spacing;
        _saveSettings();
    }

    // ==================== Motion Management ====================

    /**
     * Apply motion preference to document
     * @param {string} motion - Motion preference identifier
     */
    function _applyMotion(motion) {
        const root = document.documentElement;
        
        // Remove all motion classes
        Object.values(CONFIG.MOTION).forEach(m => {
            root.classList.remove(`${CONFIG.CSS_CLASS_PREFIX}motion-${m}`);
        });

        // Add new motion class (skip for full)
        if (motion !== CONFIG.MOTION.FULL) {
            root.classList.add(`${CONFIG.CSS_CLASS_PREFIX}motion-${motion}`);
        }

        _state.settings.motion = motion;
        _saveSettings();
    }

    // ==================== Focus Style Management ====================

    /**
     * Apply focus style to document
     * @param {string} style - Focus style identifier
     */
    function _applyFocusStyle(style) {
        const root = document.documentElement;
        
        // Remove all focus style classes
        Object.values(CONFIG.FOCUS_STYLE).forEach(s => {
            root.classList.remove(`${CONFIG.CSS_CLASS_PREFIX}focus-${s}`);
        });

        // Add new focus style class (skip for standard)
        if (style !== CONFIG.FOCUS_STYLE.STANDARD) {
            root.classList.add(`${CONFIG.CSS_CLASS_PREFIX}focus-${style}`);
        }

        _state.settings.focus = style;
        _saveSettings();
    }

    // ==================== Apply All Settings ====================

    /**
     * Apply all settings to document
     */
    function _applyAllSettings() {
        const { display, motion, focus } = _state.settings;
        
        _applyTheme(display.theme);
        _applyFontSize(display.fontSize);
        _applyFontFamily(display.fontFamily);
        _applyLineSpacing(display.lineSpacing);
        _applyMotion(motion);
        _applyFocusStyle(focus);
    }

    // ==================== Event Handlers ====================

    /**
     * Handle theme change
     * @param {Event} e
     */
    function _handleThemeChange(e) {
        _applyTheme(e.target.value);
    }

    /**
     * Handle font size change
     * @param {Event} e
     */
    function _handleFontSizeChange(e) {
        const value = parseInt(e.target.value, 10);
        _applyFontSize(value);
        
        if (_elements.fontSizeValue) {
            _elements.fontSizeValue.textContent = `${value}%`;
        }
    }

    /**
     * Handle font family change
     * @param {Event} e
     */
    function _handleFontFamilyChange(e) {
        _applyFontFamily(e.target.value);
    }

    /**
     * Handle line spacing change
     * @param {Event} e
     */
    function _handleLineSpacingChange(e) {
        _applyLineSpacing(e.target.value);
    }

    /**
     * Handle motion change
     * @param {Event} e
     */
    function _handleMotionChange(e) {
        _applyMotion(e.target.value);
    }

    /**
     * Handle focus style change
     * @param {Event} e
     */
    function _handleFocusStyleChange(e) {
        _applyFocusStyle(e.target.value);
    }

    /**
     * Handle reset button click
     */
    function _handleReset() {
        _state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        _saveSettings();
        _applyAllSettings();
        _syncUI();
    }

    // ==================== UI Synchronization ====================

    /**
     * Sync UI elements with current settings
     */
    function _syncUI() {
        const { display, motion, focus } = _state.settings;

        // Theme
        if (_elements.themeSelect) {
            _elements.themeSelect.value = display.theme;
            if (typeof CustomSelect !== 'undefined') CustomSelect.sync(_elements.themeSelect);
        }

        // Font size
        if (_elements.fontSizeSlider) {
            _elements.fontSizeSlider.value = display.fontSize;
        }
        if (_elements.fontSizeValue) {
            _elements.fontSizeValue.textContent = `${display.fontSize}%`;
        }

        // Font family
        if (_elements.fontFamilySelect) {
            _elements.fontFamilySelect.value = display.fontFamily;
            if (typeof CustomSelect !== 'undefined') CustomSelect.sync(_elements.fontFamilySelect);
        }

        // Line spacing
        if (_elements.lineSpacingSelect) {
            _elements.lineSpacingSelect.value = display.lineSpacing;
            if (typeof CustomSelect !== 'undefined') CustomSelect.sync(_elements.lineSpacingSelect);
        }

        // Motion
        if (_elements.motionSelect) {
            _elements.motionSelect.value = motion;
            if (typeof CustomSelect !== 'undefined') CustomSelect.sync(_elements.motionSelect);
        }

        // Focus style
        if (_elements.focusStyleSelect) {
            _elements.focusStyleSelect.value = focus;
            if (typeof CustomSelect !== 'undefined') CustomSelect.sync(_elements.focusStyleSelect);
        }
    }

    // ==================== Initialization ====================

    /**
     * Cache DOM element references
     */
    function _cacheElements() {
        _elements = {
            themeSelect: document.getElementById('a11yTheme'),
            fontSizeSlider: document.getElementById('a11yFontSize'),
            fontSizeValue: document.getElementById('a11yFontSizeValue'),
            fontFamilySelect: document.getElementById('a11yFontFamily'),
            lineSpacingSelect: document.getElementById('a11yLineSpacing'),
            motionSelect: document.getElementById('a11yMotion'),
            focusStyleSelect: document.getElementById('a11yFocusStyle'),
            resetBtn: document.getElementById('a11yReset')
        };
    }

    /**
     * Bind event listeners
     */
    function _bindEvents() {
        if (_elements.themeSelect) {
            _elements.themeSelect.addEventListener('change', _handleThemeChange);
        }
        if (_elements.fontSizeSlider) {
            _elements.fontSizeSlider.addEventListener('input', _handleFontSizeChange);
        }
        if (_elements.fontFamilySelect) {
            _elements.fontFamilySelect.addEventListener('change', _handleFontFamilyChange);
        }
        if (_elements.lineSpacingSelect) {
            _elements.lineSpacingSelect.addEventListener('change', _handleLineSpacingChange);
        }
        if (_elements.motionSelect) {
            _elements.motionSelect.addEventListener('change', _handleMotionChange);
        }
        if (_elements.focusStyleSelect) {
            _elements.focusStyleSelect.addEventListener('change', _handleFocusStyleChange);
        }
        if (_elements.resetBtn) {
            _elements.resetBtn.addEventListener('click', _handleReset);
        }
    }

    // ==================== Public API ====================

    /**
     * Initialize the accessibility manager
     * @param {Object} options - Initialization options
     * @param {boolean} options.delayCustomSelects - Delay custom select init for i18n
     */
    function init(options = {}) {
        if (_state.isInitialized) {
            console.warn('AccessibilityManager already initialized');
            return;
        }

        // 1. Load saved settings
        _state.settings = _loadSettings();

        // 2. Cache DOM elements
        _cacheElements();

        // 3. Bind events (on native selects, they still work)
        _bindEvents();

        // 4. Apply all settings (theme, font, etc. - apply early)
        _applyAllSettings();

        // 5. Sync UI (native selects)
        _syncUI();

        // 6. Initialize keyboard shortcuts
        _initKeyboardShortcuts();

        _state.isInitialized = true;

        // 7. Custom selects will be initialized by CustomSelect module after i18n
    }

    /**
     * Get current settings
     * @returns {Object} Current settings
     */
    function getSettings() {
        return JSON.parse(JSON.stringify(_state.settings));
    }

    /**
     * Set theme programmatically
     * @param {string} theme - Theme identifier
     */
    function setTheme(theme) {
        if (Object.values(CONFIG.THEMES).includes(theme)) {
            _applyTheme(theme);
            _syncUI();
        }
    }

    /**
     * Set font size programmatically
     * @param {number} size - Font size percentage
     */
    function setFontSize(size) {
        _applyFontSize(size);
        _syncUI();
    }

    /**
     * Reset all settings to defaults
     */
    function reset() {
        _handleReset();
    }

    /**
     * Get available themes
     * @returns {Object} Theme constants
     */
    function getThemes() {
        return { ...CONFIG.THEMES };
    }

    // ==================== Keyboard Shortcuts System ====================

    /**
     * Available keyboard shortcuts
     */
    const SHORTCUTS = {
        SWITCH_ENGINE_PREV: { key: 'ArrowUp', altKey: true, description: 'switchEnginePrev' },
        SWITCH_ENGINE_NEXT: { key: 'ArrowDown', altKey: true, description: 'switchEngineNext' },
        FOCUS_SEARCH: { key: '/', altKey: false, ctrlKey: false, description: 'focusSearch' },
        OPEN_SETTINGS: { key: ',', altKey: true, description: 'openSettings' }
    };

    let _shortcutsEnabled = true;

    /**
     * Initialize keyboard shortcuts
     */
    function _initKeyboardShortcuts() {
        document.addEventListener('keydown', _handleGlobalKeydown);
    }

    /**
     * Handle global keydown events for shortcuts
     * @param {KeyboardEvent} e
     */
    function _handleGlobalKeydown(e) {
        if (!_shortcutsEnabled) return;

        // Don't trigger shortcuts when typing in input fields (except for specific ones)
        const isInputFocused = document.activeElement.tagName === 'INPUT' || 
                               document.activeElement.tagName === 'TEXTAREA' ||
                               document.activeElement.isContentEditable;

        // Alt + Arrow Up/Down: Switch search engine (works even in input)
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            _switchSearchEngine(e.key === 'ArrowUp' ? 'prev' : 'next');
            return;
        }

        // Skip other shortcuts if typing in input
        if (isInputFocused) return;

        // "/" : Focus search box
        if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            _focusSearchBox();
            return;
        }

        // Alt + ",": Open settings
        if (e.altKey && e.key === ',') {
            e.preventDefault();
            _openSettings();
            return;
        }
    }

    /**
     * Switch to previous or next search engine
     * @param {string} direction - 'prev' or 'next'
     */
    function _switchSearchEngine(direction) {
        // Get engines from global scope (defined in script.js)
        if (typeof engines === 'undefined') return;

        const engineKeys = Object.keys(engines);
        if (engineKeys.length === 0) return;

        // Get current engine
        const currentEngineKey = localStorage.getItem('preferredEngine') || 'google';
        const currentIndex = engineKeys.indexOf(currentEngineKey);

        let newIndex;
        if (direction === 'prev') {
            newIndex = currentIndex <= 0 ? engineKeys.length - 1 : currentIndex - 1;
        } else {
            newIndex = currentIndex >= engineKeys.length - 1 ? 0 : currentIndex + 1;
        }

        const newEngineKey = engineKeys[newIndex];

        // Call setEngine from script.js if available
        if (typeof setEngine === 'function') {
            setEngine(newEngineKey);
            _showEngineChangeNotification(engines[newEngineKey].name);
        }
    }

    /**
     * Show a brief notification when engine changes
     * @param {string} engineName
     */
    function _showEngineChangeNotification(engineName) {
        // Remove existing notification
        const existing = document.querySelector('.engine-change-notification');
        if (existing) {
            existing.remove();
        }

        // Create notification element safely (no innerHTML with user data)
        const notification = document.createElement('div');
        notification.className = 'engine-change-notification';
        
        // Create SVG icon
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
        svg.appendChild(path);
        
        // Create text span safely
        const span = document.createElement('span');
        span.textContent = engineName;
        
        notification.appendChild(svg);
        notification.appendChild(span);

        document.body.appendChild(notification);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Remove after animation
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 200);
        }, 1200);
    }

    /**
     * Focus the search box
     */
    function _focusSearchBox() {
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    /**
     * Open settings modal
     */
    function _openSettings() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.classList.add('active');
        }
    }

    /**
     * Enable or disable keyboard shortcuts
     * @param {boolean} enabled
     */
    function setShortcutsEnabled(enabled) {
        _shortcutsEnabled = enabled;
    }

    /**
     * Get list of available shortcuts
     * @returns {Object}
     */
    function getShortcuts() {
        return { ...SHORTCUTS };
    }

    // Expose public API
    return {
        init,
        getSettings,
        setTheme,
        setFontSize,
        reset,
        getThemes,
        setShortcutsEnabled,
        getShortcuts
    };
})();

// Export for global use
window.AccessibilityManager = AccessibilityManager;

