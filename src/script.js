// script.js

// ==================== Custom Select Module ====================
const CustomSelect = (function() {
    'use strict';

    let _initialized = false;

    /**
     * Initialize custom select dropdowns
     * @param {string} selector - CSS selector for selects to convert
     */
    function init(selector = '.modal select') {
        const selects = document.querySelectorAll(selector);
        selects.forEach(select => {
            _createCustomSelect(select);
        });

        // Only add global listeners once
        if (!_initialized) {
            document.addEventListener('click', _handleOutsideClick);
            document.addEventListener('keydown', _handleKeyboardNav);
            _initialized = true;
        }
    }

    /**
     * Create a custom select component from a native select
     * @param {HTMLSelectElement} nativeSelect
     */
    function _createCustomSelect(nativeSelect) {
        // Skip if already converted
        if (nativeSelect.parentElement.classList.contains('custom-select')) {
            return;
        }

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select';
        wrapper.setAttribute('data-select-id', nativeSelect.id);

        // Create trigger button
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');

        // Create options container
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-select-options';
        optionsContainer.setAttribute('role', 'listbox');

        // Build options from native select
        Array.from(nativeSelect.options).forEach((option) => {
            const customOption = document.createElement('div');
            customOption.className = 'custom-select-option';
            customOption.setAttribute('role', 'option');
            customOption.setAttribute('data-value', option.value);
            customOption.setAttribute('tabindex', '-1');
            
            // Copy i18n attribute if exists
            const i18nKey = option.getAttribute('data-i18n');
            if (i18nKey) {
                customOption.setAttribute('data-i18n', i18nKey);
            }
            
            customOption.textContent = option.textContent;

            if (option.selected) {
                customOption.classList.add('selected');
                customOption.setAttribute('aria-selected', 'true');
                trigger.textContent = option.textContent;
            }

            customOption.addEventListener('click', (e) => {
                e.stopPropagation();
                _selectOption(wrapper, customOption);
            });

            optionsContainer.appendChild(customOption);
        });

        // Insert wrapper and move native select inside
        nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsContainer);
        wrapper.appendChild(nativeSelect);

        // Bind trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleDropdown(wrapper);
        });

        // Store reference for syncing
        wrapper._nativeSelect = nativeSelect;
    }

    /**
     * Toggle dropdown open/close
     */
    function _toggleDropdown(wrapper) {
        const isOpen = wrapper.classList.contains('open');
        
        // Close all other dropdowns first
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== wrapper) {
                _closeDropdown(el);
            }
        });

        if (!isOpen) {
            _openDropdown(wrapper);
        } else {
            _closeDropdown(wrapper);
        }
    }

    /**
     * Open a dropdown
     */
    function _openDropdown(wrapper) {
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const options = wrapper.querySelector('.custom-select-options');
        
        if (!trigger || !options) return;
        
        wrapper.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');

        // Focus selected option
        const selectedOption = options.querySelector('.custom-select-option.selected') ||
                               options.querySelector('.custom-select-option');
        if (selectedOption) {
            setTimeout(() => selectedOption.focus(), 50);
        }
    }

    /**
     * Close a dropdown
     */
    function _closeDropdown(wrapper) {
        const trigger = wrapper.querySelector('.custom-select-trigger');
        
        wrapper.classList.remove('open');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Select an option
     */
    function _selectOption(wrapper, option) {
        const value = option.getAttribute('data-value');
        const text = option.textContent;
        const nativeSelect = wrapper._nativeSelect;

        nativeSelect.value = value;

        // Trigger change event
        const event = new Event('change', { bubbles: true });
        nativeSelect.dispatchEvent(event);

        // Call inline onchange if exists
        if (nativeSelect.onchange) {
            nativeSelect.onchange(event);
        }

        // Update UI
        const trigger = wrapper.querySelector('.custom-select-trigger');
        trigger.textContent = text;

        // Update selected state
        wrapper.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.remove('selected');
            opt.setAttribute('aria-selected', 'false');
        });
        option.classList.add('selected');
        option.setAttribute('aria-selected', 'true');

        // Close dropdown
        _closeDropdown(wrapper);
        trigger.focus();
    }

    /**
     * Handle clicks outside dropdowns
     */
    function _handleOutsideClick(e) {
        if (!e.target.closest('.custom-select') && !e.target.closest('.custom-select-options')) {
            document.querySelectorAll('.custom-select.open').forEach(el => {
                _closeDropdown(el);
            });
        }
    }

    /**
     * Handle keyboard navigation
     */
    function _handleKeyboardNav(e) {
        const openDropdown = document.querySelector('.custom-select.open');
        if (!openDropdown) return;

        const options = Array.from(openDropdown.querySelectorAll('.custom-select-option'));
        if (options.length === 0) return;
        
        const currentIndex = options.findIndex(opt => opt === document.activeElement);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                options[(currentIndex + 1) % options.length].focus();
                break;
            case 'ArrowUp':
                e.preventDefault();
                options[currentIndex > 0 ? currentIndex - 1 : options.length - 1].focus();
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (document.activeElement.classList.contains('custom-select-option')) {
                    _selectOption(openDropdown, document.activeElement);
                }
                break;
            case 'Escape':
                e.preventDefault();
                _closeDropdown(openDropdown);
                openDropdown.querySelector('.custom-select-trigger').focus();
                break;
            case 'Tab':
                _closeDropdown(openDropdown);
                break;
        }
    }

    /**
     * Sync custom select with native select value
     * @param {HTMLSelectElement} nativeSelect
     */
    function sync(nativeSelect) {
        const wrapper = nativeSelect.closest('.custom-select');
        if (!wrapper) return;

        const value = nativeSelect.value;
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const options = wrapper.querySelectorAll('.custom-select-option');

        options.forEach(opt => {
            const isSelected = opt.getAttribute('data-value') === value;
            opt.classList.toggle('selected', isSelected);
            opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            if (isSelected) {
                trigger.textContent = opt.textContent;
            }
        });
    }

    return {
        init,
        sync
    };
})();

// Expose globally
window.CustomSelect = CustomSelect;

// Elements
const searchInput = document.getElementById("search");
const enginesList = document.getElementById("enginesList");
const shortcutsList = document.getElementById("shortcutsList");
const shortcutsGrid = document.getElementById("shortcuts");
const settingsBtn = document.querySelector(".settings-btn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.querySelector(".close-btn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const addEngineBtn = document.getElementById("addEngineBtn");
const addShortcutBtn = document.getElementById("addShortcutBtn");
const engineSelector = document.querySelector(".engine-selector");
const selectedEngineIcon = document.querySelector(".selected-engine");
const engineDropdown = document.querySelector(".engine-dropdown");

// Default Data
const defaultEngines = {
    google: {
        name: "Google",
        url: "https://www.google.com/search?q=%s",
        icon: "https://www.google.com/favicon.ico"
    },
    bing: {
        name: "Bing",
        url: "https://www.bing.com/search?q=%s",
        icon: "https://www.bing.com/favicon.ico"
    },
    duckduckgo: {
        name: "DuckDuckGo",
        url: "https://duckduckgo.com/?q=%s",
        icon: "https://duckduckgo.com/favicon.ico"
    }
};

const defaultShortcuts = [
    { name: "GitHub", url: "https://github.com", icon: "https://github.com/favicon.ico" },
    { name: "YouTube", url: "https://youtube.com", icon: "https://www.youtube.com/favicon.ico" },
    { name: "Bilibili", url: "https://bilibili.com", icon: "https://www.bilibili.com/favicon.ico" },
    { name: "Gmail", url: "https://mail.google.com", icon: "https://mail.google.com/favicon.ico" }
];

// State - with safe JSON parsing to handle corrupted data
let engines;
try {
    engines = JSON.parse(localStorage.getItem("engines")) || defaultEngines;
} catch (e) {
    console.warn('Failed to parse engines from localStorage, using defaults');
    engines = defaultEngines;
}

let currentEngine = localStorage.getItem("preferredEngine") || "google";

let shortcuts;
try {
    const stored = localStorage.getItem("shortcuts");
    shortcuts = stored ? JSON.parse(stored) : null;
} catch (e) {
    console.warn('Failed to parse shortcuts from localStorage, using defaults');
    shortcuts = null;
}

if (!shortcuts || !Array.isArray(shortcuts) || shortcuts.length === 0) {
    shortcuts = defaultShortcuts;
    localStorage.setItem("shortcuts", JSON.stringify(shortcuts));
}

// --- Helper Functions ---
function saveEngines() {
    localStorage.setItem("engines", JSON.stringify(engines));
    renderEnginesList();
    renderEngineDropdown();
}

function saveShortcuts() {
    localStorage.setItem("shortcuts", JSON.stringify(shortcuts));
    renderShortcutsList();
    renderShortcutsGrid();
}

function getFavicon(url) {
    try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
        return "icon.png";
    }
}

// --- Icon Caching Logic ---
async function cacheIcon(key, url) {
    try {
        // Try direct fetch first (works for same-origin or CORS-enabled)
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            localStorage.setItem(`icon_cache_${key}`, reader.result);
            // Don't call updateUI here to avoid infinite loop, just update the specific image
            document.querySelectorAll(`img[data-cache-key="${key}"]`).forEach(img => {
                img.src = reader.result;
            });
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        // If direct fetch fails, try using an Image element (can load cross-origin images)
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width || 64;
                    canvas.height = img.height || 64;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    localStorage.setItem(`icon_cache_${key}`, dataUrl);
                    document.querySelectorAll(`img[data-cache-key="${key}"]`).forEach(imgEl => {
                        imgEl.src = dataUrl;
                    });
                } catch (canvasError) {
                    // Canvas tainted by cross-origin data, can't cache
                    console.warn(`Cannot cache icon (CORS): ${key}`);
                }
            };
            img.onerror = () => {
                console.warn(`Failed to load icon for caching: ${key}`);
            };
            img.src = url;
        } catch (imgError) {
            console.warn(`Failed to cache icon for ${key}`, imgError);
        }
    }
}

function getIconSrc(key, url) {
    const cached = localStorage.getItem(`icon_cache_${key}`);
    if (cached) return cached;
    // Schedule caching in background
    setTimeout(() => cacheIcon(key, url), 100);
    return url;
}

// --- UI Rendering ---
function updateUI() {
    // Update selected engine icon
    const engine = engines[currentEngine] || engines.google;
    const src = getIconSrc(currentEngine, engine.icon);
    selectedEngineIcon.textContent = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = engine.name;
    img.width = 20;
    img.height = 20;
    img.dataset.cacheKey = currentEngine; // For updating after cache completes
    selectedEngineIcon.appendChild(img);

    renderEngineDropdown();
}

function renderEngineDropdown() {
    engineDropdown.innerHTML = '';
    Object.keys(engines).forEach(key => {
        const engine = engines[key];
        const div = document.createElement("div");
        div.className = "engine-option";
        div.dataset.engine = key;
        
        const img = document.createElement('img');
        img.src = getIconSrc(key, engine.icon);
        img.width = 20;
        img.height = 20;
        img.dataset.cacheKey = key; // For updating after cache completes
        
        const span = document.createElement('span');
        span.textContent = engine.name;
        
        div.appendChild(img);
        div.appendChild(span);
        div.addEventListener("click", () => setEngine(key));
        engineDropdown.appendChild(div);
    });
}

function renderEnginesList() {
    enginesList.innerHTML = '';
    Object.keys(engines).forEach(key => {
        const engine = engines[key];
        const div = document.createElement("div");
        div.className = "list-item";

        const spanInfo = document.createElement("span");
        const img = document.createElement('img');
        img.src = getIconSrc(key, engine.icon);
        img.width = 20;
        img.height = 20;
        spanInfo.appendChild(img);
        spanInfo.appendChild(document.createTextNode(' ' + engine.name));
        div.appendChild(spanInfo);

        if (!defaultEngines[key]) {
            const deleteBtn = document.createElement("span");
            deleteBtn.className = "delete-btn";
            deleteBtn.textContent = '\u00D7'; // multiplication sign
            deleteBtn.addEventListener("click", () => deleteEngine(key));
            div.appendChild(deleteBtn);
        }

        enginesList.appendChild(div);
    });
}

function renderShortcutsList() {
    shortcutsList.innerHTML = '';
    shortcuts.forEach((shortcut, index) => {
        const div = document.createElement("div");
        div.className = "list-item";

        const spanInfo = document.createElement("span");
        const img = document.createElement('img');
        img.src = shortcut.icon;
        img.width = 20;
        img.height = 20;
        spanInfo.appendChild(img);
        spanInfo.appendChild(document.createTextNode(' ' + shortcut.name));
        div.appendChild(spanInfo);

        const deleteBtn = document.createElement("span");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = '\u00D7'; // multiplication sign
        deleteBtn.addEventListener("click", () => deleteShortcut(index));
        div.appendChild(deleteBtn);

        shortcutsList.appendChild(div);
    });
}

function renderShortcutsGrid() {
    shortcutsGrid.innerHTML = '';
    shortcuts.forEach((shortcut, index) => {
        const a = document.createElement("a");
        a.href = shortcut.url;
        a.className = "shortcut-item";

        const iconDiv = document.createElement("div");
        iconDiv.className = "shortcut-icon loading"; // Add loading class for skeleton

        const img = document.createElement("img");
        img.alt = shortcut.name;
        
        // Use cached icon with unique key based on URL
        const cacheKey = `shortcut_${index}_${shortcut.url}`;
        img.dataset.cacheKey = cacheKey; // For updating after cache completes
        const iconSrc = getIconSrc(cacheKey, shortcut.icon);
        img.src = iconSrc;

        // Remove loading class when image loads or fails
        img.onload = () => iconDiv.classList.remove("loading");
        img.onerror = () => {
            iconDiv.classList.remove("loading");
            // Use a fallback icon (first letter of name)
            img.style.display = 'none';
            iconDiv.textContent = shortcut.name.charAt(0).toUpperCase();
            iconDiv.style.fontSize = '18px';
            iconDiv.style.fontWeight = '600';
        };

        iconDiv.appendChild(img);

        const nameDiv = document.createElement("div");
        nameDiv.className = "shortcut-name";
        nameDiv.textContent = shortcut.name;

        a.appendChild(iconDiv);
        a.appendChild(nameDiv);
        shortcutsGrid.appendChild(a);
    });
}

// --- Actions ---
function setEngine(key) {
    if (!engines[key]) return;
    currentEngine = key;
    localStorage.setItem("preferredEngine", key);
    updateUI();
    engineSelector.classList.remove("active");
}

// Expose setEngine and engines globally for keyboard shortcuts
window.setEngine = setEngine;
window.engines = engines;

window.deleteEngine = (key) => {
    if (defaultEngines[key]) return;
    delete engines[key];
    if (currentEngine === key) setEngine("google");
    saveEngines();
};

window.deleteShortcut = (index) => {
    shortcuts.splice(index, 1);
    saveShortcuts();
};

// --- Event Listeners ---

// Settings Modal
settingsBtn.addEventListener("click", () => settingsModal.classList.add("active"));
closeSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove("active");
});

// Tabs
tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
});

// Reset Shortcuts
const resetShortcutsBtn = document.getElementById("resetShortcutsBtn");
if (resetShortcutsBtn) {
    resetShortcutsBtn.addEventListener("click", () => {
        if (confirm("Reset shortcuts to default?")) {
            shortcuts = JSON.parse(JSON.stringify(defaultShortcuts)); // Deep copy
            saveShortcuts();
        }
    });
}

// Security: Check if URL uses dangerous protocol
function isDangerousUrl(url) {
    const dangerous = /^(javascript|data|vbscript|file):/i;
    return dangerous.test(url.trim());
}

// Add Engine
addEngineBtn.addEventListener("click", () => {
    const name = document.getElementById("newEngineName").value.trim();
    let url = document.getElementById("newEngineUrl").value.trim();
    if (name && url) {
        // Security check
        if (isDangerousUrl(url)) {
            alert('Invalid URL protocol');
            return;
        }
        
        const key = name.toLowerCase().replace(/\s+/g, '_');
        let icon = "icon.png";
        try {
            const cleanUrl = url.replace('%s', '').replace(/=$/, '');
            const domain = new URL(cleanUrl).hostname;
            icon = `https://${domain}/favicon.ico`;
        } catch (e) { }

        engines[key] = { name, url, icon };
        saveEngines();
        document.getElementById("newEngineName").value = "";
        document.getElementById("newEngineUrl").value = "";
    }
});

// Add Shortcut
addShortcutBtn.addEventListener("click", () => {
    const name = document.getElementById("newShortcutName").value.trim();
    let url = document.getElementById("newShortcutUrl").value.trim();
    if (name && url) {
        // Security check
        if (isDangerousUrl(url)) {
            alert('Invalid URL protocol');
            return;
        }
        
        if (!/^http(s)?:\/\//i.test(url)) url = "https://" + url;
        const icon = getFavicon(url);
        shortcuts.push({ name, url, icon });
        saveShortcuts();
        document.getElementById("newShortcutName").value = "";
        document.getElementById("newShortcutUrl").value = "";
    }
});

// Search Logic
function handleSearch(e) {
    if (e.key === "Enter") {
        let val = searchInput.value.trim();
        if (!val) return;
        const isUrl = /^(http(s)?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/i.test(val);
        if (isUrl) {
            if (!/^http(s)?:\/\//i.test(val)) val = "https://" + val;
            location.href = val;
        } else {
            const engine = engines[currentEngine];
            let searchUrl = engine.url;
            if (searchUrl.includes("%s")) {
                searchUrl = searchUrl.replace("%s", encodeURIComponent(val));
            } else {
                searchUrl += encodeURIComponent(val);
            }
            location.href = searchUrl;
        }
    }
}

// Engine Selector Toggle
selectedEngineIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    engineSelector.classList.toggle("active");
});
document.addEventListener("click", (e) => {
    if (!engineSelector.contains(e.target)) engineSelector.classList.remove("active");
});

// Init
async function init() {
    // Initialize i18n module first
    if (typeof I18n !== 'undefined') {
        I18n.init();
    }

    // Initialize Accessibility Manager (applies theme/font settings early)
    if (typeof AccessibilityManager !== 'undefined') {
        try {
            AccessibilityManager.init();
        } catch (e) {
            console.warn('Failed to initialize AccessibilityManager:', e);
        }
    }

    // Initialize Wallpaper Manager
    if (typeof WallpaperManager !== 'undefined') {
        try {
            await WallpaperManager.init();
        } catch (e) {
            console.warn('Failed to initialize WallpaperManager:', e);
        }
    }

    // Ensure shortcuts exist (Double check)
    if (!shortcuts || shortcuts.length === 0) {
        shortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
        saveShortcuts();
    }

    // Apply translations
    if (typeof I18n !== 'undefined') {
        I18n.localize();
    }
    
    // Initialize custom selects after i18n is applied
    if (typeof CustomSelect !== 'undefined') {
        CustomSelect.init('#tab-accessibility select');
    }
    
    updateUI();
    renderEnginesList();
    renderShortcutsList();
    renderShortcutsGrid();
    searchInput.addEventListener("keydown", handleSearch);

    // Ensure focus (autofocus attribute handles initial, this is backup)
    searchInput.focus();
}

// Focus immediately before any async operations
searchInput.focus();

// ==================== Ripple Effect ====================

/**
 * Create ripple effect on click
 * @param {MouseEvent} e - Click event
 */
function createRipple(e) {
    const element = e.currentTarget;
    
    // Remove any existing ripples
    const existingRipple = element.querySelector('.ripple');
    if (existingRipple) {
        existingRipple.remove();
    }

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    
    element.appendChild(ripple);
    
    // Remove ripple after animation
    ripple.addEventListener('animationend', () => {
        ripple.remove();
    });
}

/**
 * Initialize ripple effects on interactive elements
 */
function initRippleEffects() {
    const rippleSelectors = [
        '.btn-primary',
        '.btn-secondary',
        '.btn-danger',
        '.tab-btn',
        '.settings-btn',
        '.selected-engine',
        '.engine-option',
        '.github-btn',
        '.shortcut-icon'
    ];

    rippleSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            // Avoid adding multiple listeners
            if (!element.dataset.rippleInit) {
                element.addEventListener('click', createRipple);
                element.dataset.rippleInit = 'true';
            }
        });
    });
}

// Initialize ripple effects after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initRippleEffects();
    
    // Re-init ripples when dynamic content is added
    const observer = new MutationObserver(() => {
        initRippleEffects();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Expose for global use
window.initRippleEffects = initRippleEffects;

// Then run full init
init();

/** "And if I only could
I'd make a deal with God
And I'd get Him to swap our places" 
- Kate Bush, "Running Up That Hill" (1985) */