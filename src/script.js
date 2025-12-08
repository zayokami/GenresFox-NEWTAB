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
const shortcutOpenCurrent = document.getElementById("shortcutOpenCurrent");
const shortcutOpenNewTab = document.getElementById("shortcutOpenNewTab");

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

const FOLDER_FEATURE_ENABLED = false; // Temporarily disable folder feature
const SHORTCUT_TARGET_KEY = 'shortcutOpenTarget';

// --- Image helpers to reduce hotlink failures ---
function _decorateImg(img) {
    if (!img) return;
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.loading = 'lazy';
}

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

// Folder helpers
function _isFolder(item) {
    return item && item.type === 'folder' && Array.isArray(item.items);
}

function _createFolderName() {
    const base = (window.I18n && I18n.t) ? I18n.t('folderDefault', 'Folder') : 'Folder';
    const ts = Date.now().toString().slice(-3);
    return `${base} ${ts}`;
}

function _ensureShortcutId(item) {
    if (!item.id) {
        item.id = `shortcut_${Math.random().toString(36).slice(2, 8)}`;
    }
    return item;
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
        // DuckDuckGo icon service returns CORS-enabled .ico
        return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    } catch (e) {
        return "icon.png";
    }
}

function _buildIconCandidates(rawIconUrl, pageUrl) {
    const candidates = [];
    const seen = new Set();
    const add = (u) => {
        if (!u || seen.has(u)) return;
        candidates.push(u);
        seen.add(u);
    };

    // Start with provided icon URL (if any)
    if (rawIconUrl) add(rawIconUrl);

    const basisUrl = pageUrl || rawIconUrl;
    if (basisUrl) {
        try {
            const urlObj = new URL(basisUrl);
            const origin = urlObj.origin;
            const domain = urlObj.hostname;
            add(`${origin}/favicon.ico`);
            add(`${origin}/apple-touch-icon.png`);
            add(`${origin}/apple-touch-icon-precomposed.png`);
            // DuckDuckGo icon service (CORS)
            add(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
            // Google s2 (may be non-CORS; keep as late fallback)
            add(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
        } catch (e) {
            // Ignore parse errors
        }
    }

    if (candidates.length === 0) add("icon.png");
    return candidates;
}

// --- Icon Caching Logic (IndexedDB with expiry and fallback) ---
const ICON_CACHE_DB_NAME = 'genresfox-icon-cache';
const ICON_CACHE_STORE = 'icons';
const ICON_CACHE_DB_VERSION = 1;
const ICON_CACHE_VERSION = 1;
const ICON_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const _iconCacheInMemory = new Map();
const _iconCacheInFlight = new Map();
let _iconCacheDbPromise = null;

function _openIconCacheDB() {
    if (_iconCacheDbPromise) return _iconCacheDbPromise;
    _iconCacheDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(ICON_CACHE_DB_NAME, ICON_CACHE_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(ICON_CACHE_STORE)) {
                db.createObjectStore(ICON_CACHE_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return _iconCacheDbPromise;
}

function _isIconFresh(entry) {
    if (!entry) return false;
    if (entry.version !== ICON_CACHE_VERSION) return false;
    return (Date.now() - entry.updatedAt) < ICON_CACHE_TTL;
}

async function _getIconFromDB(key) {
    const db = await _openIconCacheDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ICON_CACHE_STORE, 'readonly');
        const store = tx.objectStore(ICON_CACHE_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function _putIconToDB(key, dataUrl) {
    const db = await _openIconCacheDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ICON_CACHE_STORE, 'readwrite');
        const store = tx.objectStore(ICON_CACHE_STORE);
        const record = { key, data: dataUrl, updatedAt: Date.now(), version: ICON_CACHE_VERSION };
        store.put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error);
    });
}

function _updateImagesForKey(key, dataUrl) {
    document.querySelectorAll(`img[data-cache-key="${key}"]`).forEach(img => {
        img.src = dataUrl;
    });
}

async function _fetchIconAsDataUrl(url) {
    // Direct fetch first
    const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function _loadIconViaImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width || 64;
                canvas.height = img.height || 64;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = url;
    });
}

async function cacheIcon(key, rawIconUrl, pageUrl) {
    if (_iconCacheInFlight.has(key)) return _iconCacheInFlight.get(key);

    const task = (async () => {
        const candidates = _buildIconCandidates(rawIconUrl, pageUrl);

        for (const candidate of candidates) {
            try {
                const dataUrl = await _fetchIconAsDataUrl(candidate);
                _iconCacheInMemory.set(key, { data: dataUrl, updatedAt: Date.now(), version: ICON_CACHE_VERSION });
                await _putIconToDB(key, dataUrl);
                _updateImagesForKey(key, dataUrl);
                // Keep legacy localStorage for backward compatibility
                localStorage.setItem(`icon_cache_${key}`, dataUrl);
                return;
            } catch (fetchErr) {
                // If fetch failed, try canvas-based fallback
                try {
                    const dataUrl = await _loadIconViaImage(candidate);
                    _iconCacheInMemory.set(key, { data: dataUrl, updatedAt: Date.now(), version: ICON_CACHE_VERSION });
                    await _putIconToDB(key, dataUrl);
                    _updateImagesForKey(key, dataUrl);
                    localStorage.setItem(`icon_cache_${key}`, dataUrl);
                    return;
                } catch (imgErr) {
                    // Continue to next candidate
                }
            }
        }
        console.warn(`Failed to cache icon: ${key}`);
    })().finally(() => {
        _iconCacheInFlight.delete(key);
    });

    _iconCacheInFlight.set(key, task);
    return task;
}

function getIconSrc(key, url, pageUrl) {
    const preferredUrl = url || (pageUrl ? getFavicon(pageUrl) : null) || "icon.png";

    // 1) In-memory cache
    const mem = _iconCacheInMemory.get(key);
    if (mem && _isIconFresh(mem)) return mem.data;

    // 2) Legacy localStorage (migrate to DB asynchronously)
    const legacy = localStorage.getItem(`icon_cache_${key}`);
    if (legacy) {
        _iconCacheInMemory.set(key, { data: legacy, updatedAt: 0, version: ICON_CACHE_VERSION });
        _putIconToDB(key, legacy).catch(() => {});
        // Refresh asynchronously to ensure freshness
        cacheIcon(key, preferredUrl, pageUrl);
        return legacy;
    }

    // 3) IndexedDB async fetch; update DOM when ready
    _getIconFromDB(key).then(entry => {
        if (entry && _isIconFresh(entry)) {
            _iconCacheInMemory.set(key, entry);
            _updateImagesForKey(key, entry.data);
        } else if (entry && entry.data) {
            // Stale: show it first, then refresh
            _iconCacheInMemory.set(key, entry);
            _updateImagesForKey(key, entry.data);
            cacheIcon(key, preferredUrl, pageUrl);
        } else {
            cacheIcon(key, preferredUrl, pageUrl);
        }
    }).catch(() => cacheIcon(key, preferredUrl, pageUrl));

    // 4) Fallback to live URL while cache resolves
    return preferredUrl;
}

// --- UI Rendering ---
function _updateSearchActionWidth() {
    if (!searchActionBtn || !searchActionLabel) return;
    const labelWidth = searchActionLabel.scrollWidth;
    const base = 44; // collapsed width
    const padding = 32; // padding and gap
    const expanded = Math.max(base + padding + labelWidth, 112);
    searchActionBtn.style.setProperty('--search-action-expand', `${expanded}px`);
}

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
    _decorateImg(img);
    img.onerror = () => {
        img.onerror = null;
        img.src = 'icon.png';
    };
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
        _decorateImg(img);
        img.onerror = () => {
            img.onerror = null;
            img.src = 'icon.png';
        };
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
        _decorateImg(img);
        img.onerror = () => {
            img.onerror = null;
            img.src = 'icon.png';
        };
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
        if (_isFolder(shortcut)) {
            const folderIcon = document.createElement('span');
            folderIcon.textContent = '[Folder]';
            folderIcon.style.marginRight = '8px';
            spanInfo.appendChild(folderIcon);
            spanInfo.appendChild(document.createTextNode(shortcut.name || 'Folder'));
        } else {
            const img = document.createElement('img');
            _decorateImg(img);
            // Prefer cached icon; cache key matches grid view (url as stable identifier)
            const cacheKey = `shortcut_${shortcut.url}`;
            img.src = getIconSrc(cacheKey, shortcut.icon, shortcut.url);
            img.dataset.cacheKey = cacheKey;
            img.width = 20;
            img.height = 20;
            img.onerror = () => {
                // Fallback to first letter to avoid repeated remote fetch retries
                img.style.display = 'none';
                const fallback = document.createElement('span');
                fallback.textContent = shortcut.name.charAt(0).toUpperCase();
                fallback.style.fontWeight = '600';
                spanInfo.appendChild(fallback);
            };
            spanInfo.appendChild(img);
            spanInfo.appendChild(document.createTextNode(' ' + shortcut.name));
        }
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
    
    // Apply hide-names class based on setting
    const showNames = localStorage.getItem('showShortcutNames') !== 'false';
    shortcutsGrid.classList.toggle('hide-names', !showNames);
    const targetPref = (localStorage.getItem(SHORTCUT_TARGET_KEY) || 'current') === 'newtab' ? '_blank' : '_self';
    
    shortcuts.forEach((shortcut, index) => {
        const a = document.createElement("a");
        a.className = "shortcut-item";
        a.draggable = true;
        a.dataset.index = index;
        a.target = targetPref;
        if (targetPref === '_blank') {
            a.rel = 'noopener noreferrer';
        }

        if (_isFolder(shortcut) && FOLDER_FEATURE_ENABLED) {
            a.classList.add('shortcut-folder');
            a.href = 'javascript:void(0)';
            a.dataset.type = 'folder';
            a.addEventListener('click', () => openFolderOverlay(index));

            const iconDiv = document.createElement("div");
            iconDiv.className = "shortcut-icon folder-icon";

            const stack = document.createElement('div');
            stack.className = 'folder-stack';
            const previews = shortcut.items.slice(0, 4);
            previews.forEach(item => {
                const cell = document.createElement('div');
                cell.className = 'folder-stack-cell';
                const img = document.createElement('img');
                img.alt = item.name;
                const cacheKey = `shortcut_${item.url || item.id}`;
                img.src = getIconSrc(cacheKey, item.icon || '', item.url);
                img.onerror = () => {
                    img.style.display = 'none';
                    cell.textContent = (item.name || '?').charAt(0).toUpperCase();
                };
                cell.appendChild(img);
                stack.appendChild(cell);
            });
            if (previews.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'folder-stack-empty';
                empty.textContent = '[Folder]';
                stack.appendChild(empty);
            }
            iconDiv.appendChild(stack);

            const nameDiv = document.createElement("div");
            nameDiv.className = "shortcut-name";
            nameDiv.textContent = shortcut.name || 'Folder';

            a.appendChild(iconDiv);
            a.appendChild(nameDiv);
        } else {
            a.href = shortcut.url;
            a.dataset.type = 'item';

        const iconDiv = document.createElement("div");
        iconDiv.className = "shortcut-icon loading"; // Add loading class for skeleton

        const img = document.createElement("img");
        img.alt = shortcut.name;
        _decorateImg(img);
            
            // Use cached icon with stable key based on URL (not index, which changes on delete)
            const cacheKey = `shortcut_${shortcut.url}`;
            img.dataset.cacheKey = cacheKey; // For updating after cache completes
            const iconSrc = getIconSrc(cacheKey, shortcut.icon, shortcut.url);
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
        }
        
        // Add drag event listeners
        a.addEventListener('dragstart', handleShortcutDragStart);
        a.addEventListener('dragend', handleShortcutDragEnd);
        a.addEventListener('dragover', handleShortcutDragOver);
        a.addEventListener('drop', handleShortcutDrop);
        a.addEventListener('dragleave', handleShortcutDragLeave);
        
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

window.deleteShortcut = (index, options = {}) => {
    const shortcut = shortcuts[index];
    if (!shortcut) return;

    const { silent } = options;
    if (!silent) {
        const label = shortcut.name || shortcut.url || 'shortcut';
        const i18nMsg = (window.I18n && I18n.getMessage) ? I18n.getMessage('deleteShortcutConfirm') : '';
        let message = i18nMsg || '';

        // Fallback to browser language if i18n not ready or missing
        if (!message) {
            const lang = (window.I18n && I18n.getCurrentLanguage && I18n.getCurrentLanguage()) ||
                (navigator.language || '').toLowerCase();
            if (lang.startsWith('zh')) {
                message = '确认删除快捷方式“%s”？';
            } else if (lang.startsWith('ja')) {
                message = 'ショートカット「%s」を削除しますか？';
            } else {
                message = 'Delete shortcut "%s"?';
            }
        }

        if (message.includes('%s')) {
            message = message.replace('%s', label);
        } else {
            message = `${message} "${label}"?`;
        }
        const confirmed = confirm(message);
        if (!confirmed) return;
    }

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

// Security: Allow only http/https and reject control chars / blank
function isDangerousUrl(url) {
    if (!url || typeof url !== 'string') return true;
    const trimmed = url.trim();
    // Reject control/non-printable chars
    if (/[^\x20-\x7E]/.test(trimmed)) return true;

    try {
        // If protocol missing, assume https for validation only
        const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const parsed = new URL(candidate);
        const proto = (parsed.protocol || '').toLowerCase();
        if (proto !== 'http:' && proto !== 'https:') return true;
        return false;
    } catch (e) {
        // If parsing失败，视为危险
        return true;
    }
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

// Engine Selector Toggle
selectedEngineIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    engineSelector.classList.toggle("active");
});
document.addEventListener("click", (e) => {
    if (!engineSelector.contains(e.target)) engineSelector.classList.remove("active");
});

// ==================== Shortcut Name Display Toggle ====================
const showShortcutNamesCheckbox = document.getElementById('showShortcutNames');
if (showShortcutNamesCheckbox) {
    // Load saved setting
    const showNames = localStorage.getItem('showShortcutNames') !== 'false';
    showShortcutNamesCheckbox.checked = showNames;
    
    showShortcutNamesCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('showShortcutNames', e.target.checked);
        shortcutsGrid.classList.toggle('hide-names', !e.target.checked);
    });
}

// ==================== Shortcut Open Target ====================
function _syncShortcutTargetUI() {
    const target = localStorage.getItem(SHORTCUT_TARGET_KEY) || 'current';
    if (shortcutOpenCurrent) shortcutOpenCurrent.checked = target !== 'newtab';
    if (shortcutOpenNewTab) shortcutOpenNewTab.checked = target === 'newtab';
}

_syncShortcutTargetUI();

if (shortcutOpenCurrent) {
    shortcutOpenCurrent.addEventListener('change', (e) => {
        if (e.target.checked) {
            localStorage.setItem(SHORTCUT_TARGET_KEY, 'current');
            renderShortcutsGrid();
        }
    });
}

if (shortcutOpenNewTab) {
    shortcutOpenNewTab.addEventListener('change', (e) => {
        if (e.target.checked) {
            localStorage.setItem(SHORTCUT_TARGET_KEY, 'newtab');
            renderShortcutsGrid();
        }
    });
}

// ==================== Shortcut Drag & Drop Sorting ====================
let draggedShortcutIndex = null;
let folderOverlay = null;
let folderOverlayContent = null;
let folderOverlayInput = null;
let currentFolderIndex = null;
let mergeHoverTimer = null;
let mergeAllowedIndex = null;
let currentMergeTargetIndex = null;

function handleShortcutDragStart(e) {
    draggedShortcutIndex = parseInt(e.currentTarget.dataset.index);
    currentMergeTargetIndex = null;
    mergeAllowedIndex = null;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedShortcutIndex);

    // Use icon as drag image for a tighter preview
    const iconEl = e.currentTarget.querySelector('.shortcut-icon');
    if (iconEl && e.dataTransfer.setDragImage) {
        const { width, height } = iconEl.getBoundingClientRect();
        e.dataTransfer.setDragImage(iconEl, width / 2, height / 2);
    }

    if (shortcutsGrid) {
        shortcutsGrid.classList.add('dragging-active');
    }
}

function handleShortcutDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    // Remove drag-over class from all items
    document.querySelectorAll('.shortcut-item').forEach(item => {
        item.classList.remove('drag-over');
        item.classList.remove('drag-over-merge');
    });
    if (shortcutsGrid) {
        shortcutsGrid.classList.remove('dragging-active');
    }
    if (mergeHoverTimer) clearTimeout(mergeHoverTimer);
    draggedShortcutIndex = null;
    currentMergeTargetIndex = null;
    mergeAllowedIndex = null;
}

function handleShortcutDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.currentTarget;
    const targetIndex = parseInt(target.dataset.index);
    
    if (draggedShortcutIndex !== null && targetIndex !== draggedShortcutIndex) {
        target.classList.add('drag-over');

        if (!FOLDER_FEATURE_ENABLED) return;

        // Only start timer if we are new to this target
        if (currentMergeTargetIndex !== targetIndex) {
            // Clean up previous target if any
            if (mergeHoverTimer) clearTimeout(mergeHoverTimer);
            if (currentMergeTargetIndex !== null) {
                const oldEl = shortcutsGrid.querySelector(`.shortcut-item[data-index="${currentMergeTargetIndex}"]`);
                if (oldEl) oldEl.classList.remove('drag-over-merge');
            }
            
            currentMergeTargetIndex = targetIndex;
            mergeAllowedIndex = null;

            mergeHoverTimer = setTimeout(() => {
                // Double check if we are still on the same target
                if (currentMergeTargetIndex === targetIndex) {
                    mergeAllowedIndex = targetIndex;
                    target.classList.add('drag-over-merge');
                }
            }, 800); // 0.8s hover to allow merge
        }
    }
}

function handleShortcutDragLeave(e) {
    const target = e.currentTarget;
    // Ignore leave events triggered by children
    if (target.contains(e.relatedTarget)) return;

    target.classList.remove('drag-over');
    target.classList.remove('drag-over-merge');
    
    if (!FOLDER_FEATURE_ENABLED) return;

    const targetIndex = parseInt(target.dataset.index);
    if (currentMergeTargetIndex === targetIndex) {
        if (mergeHoverTimer) clearTimeout(mergeHoverTimer);
        currentMergeTargetIndex = null;
        mergeAllowedIndex = null;
    }
}

function handleShortcutDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    e.currentTarget.classList.remove('drag-over-merge');
    if (shortcutsGrid) {
        shortcutsGrid.classList.remove('dragging-active');
    }
    if (mergeHoverTimer) clearTimeout(mergeHoverTimer);
    
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    currentMergeTargetIndex = null;
    
    if (draggedShortcutIndex === null || targetIndex === draggedShortcutIndex) return;

    const draggedItem = shortcuts[draggedShortcutIndex];
    const targetItem = shortcuts[targetIndex];

    // If drop target is a folder, push into folder (only when feature enabled)
    if (FOLDER_FEATURE_ENABLED && _isFolder(targetItem)) {
        shortcuts.splice(draggedShortcutIndex, 1);
        _ensureShortcutId(draggedItem);
        targetItem.items.push(draggedItem);
        saveShortcuts();
        return;
    }

    const allowMerge = FOLDER_FEATURE_ENABLED && mergeAllowedIndex === targetIndex;

    // If dragging a folder onto item, just reorder
    if (_isFolder(draggedItem) && !_isFolder(targetItem)) {
        shortcuts.splice(draggedShortcutIndex, 1);
        shortcuts.splice(targetIndex, 0, draggedItem);
        saveShortcuts();
            return;
        }

    // Create folder when item dropped onto another item
    if (!_isFolder(draggedItem) && !_isFolder(targetItem) && allowMerge) {
        const higher = Math.max(draggedShortcutIndex, targetIndex);
        const lower = Math.min(draggedShortcutIndex, targetIndex);
        const first = shortcuts[lower];
        const second = shortcuts[higher];
        shortcuts.splice(higher, 1);
        shortcuts.splice(lower, 1);
        _ensureShortcutId(first);
        _ensureShortcutId(second);
        const folder = {
            type: 'folder',
            name: _createFolderName(),
            items: [first, second]
        };
        shortcuts.splice(lower, 0, folder);
        saveShortcuts();
        return;
    }

    // Default reorder
    shortcuts.splice(draggedShortcutIndex, 1);
    shortcuts.splice(targetIndex, 0, draggedItem);
    saveShortcuts();
}

// ==================== Folder Overlay / Management ====================

function _ensureFolderOverlay() {
    if (folderOverlay) return;
    folderOverlay = document.createElement('div');
    folderOverlay.className = 'folder-overlay';
    folderOverlay.innerHTML = `
        <div class="folder-bubble">
            <div class="folder-bubble-header">
                <input id="folderOverlayInput" class="folder-bubble-input" />
                <button id="folderOverlayClose" class="folder-bubble-close">&times;</button>
            </div>
            <div id="folderOverlayContent" class="folder-bubble-content"></div>
        </div>
    `;
    document.body.appendChild(folderOverlay);
    folderOverlayContent = folderOverlay.querySelector('#folderOverlayContent');
    folderOverlayInput = folderOverlay.querySelector('#folderOverlayInput');
    const closeBtn = folderOverlay.querySelector('#folderOverlayClose');
    closeBtn.addEventListener('click', closeFolderOverlay);
    folderOverlay.addEventListener('click', (e) => {
        if (e.target === folderOverlay) closeFolderOverlay();
    });
}

function _positionFolderOverlay(targetEl) {
    if (!folderOverlay || !targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const bubble = folderOverlay.querySelector('.folder-bubble');
    const bubbleRect = bubble.getBoundingClientRect();
    const top = rect.bottom + 12;
    let left = rect.left + rect.width / 2 - bubbleRect.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - bubbleRect.width - 12));
    folderOverlay.style.display = 'flex';
    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
}

function openFolderOverlay(index) {
    currentFolderIndex = index;
    const folder = shortcuts[index];
    if (!_isFolder(folder)) return;
    _ensureFolderOverlay();
    folderOverlayInput.value = folder.name || '';
    folderOverlayContent.innerHTML = '';
    folder.items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'folder-item-row';
        const left = document.createElement('div');
        left.className = 'folder-item-info';
        const img = document.createElement('img');
        const cacheKey = `shortcut_${item.url || item.id}`;
        img.src = getIconSrc(cacheKey, item.icon || '', item.url);
        img.onerror = () => {
            img.style.display = 'none';
            const fallback = document.createElement('span');
            fallback.textContent = (item.name || '?').charAt(0).toUpperCase();
            fallback.className = 'folder-item-fallback';
            left.appendChild(fallback);
        };
        img.width = 20;
        img.height = 20;
        left.appendChild(img);
        const text = document.createElement('span');
        text.textContent = item.name;
        left.appendChild(text);

        const actions = document.createElement('div');
        actions.className = 'folder-item-actions';
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            folder.items.splice(idx, 1);
            if (folder.items.length === 1) {
                const lone = folder.items[0];
                shortcuts.splice(index, 1, lone);
            } else if (folder.items.length === 0) {
                shortcuts.splice(index, 1);
            }
            saveShortcuts();
            openFolderOverlay(index);
        });

        const extractBtn = document.createElement('button');
        extractBtn.textContent = 'Extract';
        extractBtn.addEventListener('click', () => {
            const extracted = folder.items.splice(idx, 1)[0];
            shortcuts.splice(index + 1, 0, extracted);
            if (folder.items.length === 1) {
                const lone = folder.items[0];
                shortcuts.splice(index, 1, lone);
            } else if (folder.items.length === 0) {
                shortcuts.splice(index, 1);
            }
            saveShortcuts();
            openFolderOverlay(index);
        });

        actions.appendChild(removeBtn);
        actions.appendChild(extractBtn);

        row.appendChild(left);
        row.appendChild(actions);
        folderOverlayContent.appendChild(row);
    });

    folderOverlayInput.onchange = () => {
        const folder = shortcuts[currentFolderIndex];
        if (_isFolder(folder)) {
            folder.name = folderOverlayInput.value.trim() || folder.name;
        saveShortcuts();
        }
    };

    _positionFolderOverlay(shortcutsGrid.querySelector(`.shortcut-item[data-index="${index}"]`));
    document.body.classList.add('modal-open');
}

function closeFolderOverlay() {
    if (folderOverlay) {
        folderOverlay.style.display = 'none';
    }
    currentFolderIndex = null;
    document.body.classList.remove('modal-open');
}

// ==================== Settings List Drag & Drop ====================
function initSettingsListDragDrop() {
    const shortcutsList = document.getElementById('shortcutsList');
    if (!shortcutsList) return;
    
    // Use MutationObserver to add drag handlers to new items
    const observer = new MutationObserver(() => {
        const items = shortcutsList.querySelectorAll('.list-item');
        items.forEach((item, index) => {
            if (!item.dataset.dragInit) {
                item.draggable = true;
                item.dataset.index = index;
                item.dataset.dragInit = 'true';
                
                // Add drag handle icon
                if (!item.querySelector('.drag-handle')) {
                    const handle = document.createElement('span');
                    handle.className = 'drag-handle';
                    handle.innerHTML = '⋮⋮';
                    item.insertBefore(handle, item.firstChild);
                }
                
                item.addEventListener('dragstart', handleListDragStart);
                item.addEventListener('dragend', handleListDragEnd);
                item.addEventListener('dragover', handleListDragOver);
                item.addEventListener('drop', handleListDrop);
                item.addEventListener('dragleave', handleListDragLeave);
            }
        });
    });
    
    observer.observe(shortcutsList, { childList: true });
}

let draggedListIndex = null;

function handleListDragStart(e) {
    draggedListIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleListDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.list-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedListIndex = null;
}

function handleListDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    if (draggedListIndex !== null && targetIndex !== draggedListIndex) {
        e.currentTarget.classList.add('drag-over');
    }
}

function handleListDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleListDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    
    if (draggedListIndex !== null && targetIndex !== draggedListIndex) {
        // Reorder shortcuts array
        const draggedItem = shortcuts[draggedListIndex];
        shortcuts.splice(draggedListIndex, 1);
        shortcuts.splice(targetIndex, 0, draggedItem);
        
        // Save and re-render
        saveShortcuts();
    }
}

// Init
async function init() {
    const safeInit = async (label, fn) => {
        try {
            await fn();
        } catch (e) {
            console.warn(`Failed to initialize ${label}:`, e);
        }
    };

    // Initialize i18n module first
    await safeInit('i18n', () => {
        if (typeof I18n !== 'undefined' && I18n.init) {
            I18n.init();
        }
    });

    // Initialize Accessibility Manager (applies theme/font settings early)
    // Note: Don't sync UI yet, custom selects aren't created
    await safeInit('AccessibilityManager', () => {
        if (typeof AccessibilityManager !== 'undefined' && AccessibilityManager.init) {
            AccessibilityManager.init();
        }
    });

    // Initialize Wallpaper Manager
    await safeInit('WallpaperManager', async () => {
        if (typeof WallpaperManager !== 'undefined' && WallpaperManager.init) {
            return WallpaperManager.init();
        }
    });

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
    await safeInit('CustomSelect', () => {
        if (typeof CustomSelect !== 'undefined' && CustomSelect.init) {
            CustomSelect.init('#tab-accessibility select');
        }
    });
    
    // Now sync accessibility UI after custom selects exist
    await safeInit('AccessibilityManager.syncUI', () => {
        if (typeof AccessibilityManager !== 'undefined' && AccessibilityManager.syncUI) {
            AccessibilityManager.syncUI();
        }
    });
    
    updateUI();
    renderEnginesList();
    renderShortcutsList();
    renderShortcutsGrid();
    if (window.SearchBar && typeof window.SearchBar.init === 'function') {
        window.SearchBar.init({
            searchInputId: 'search',
            actionBtnId: 'searchActionBtn',
            actionLabelId: 'searchActionLabel',
            getEngines: () => engines,
            getCurrentEngine: () => currentEngine
        });
    }
    
    // Initialize settings list drag & drop
    initSettingsListDragDrop();

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

// Initialize ripple effects
// Note: Script loads at end of body, so DOM is already ready
(function initRipples() {
    // Check if DOM is ready (it should be since script is at end of body)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRipples);
        return;
    }
    
    initRippleEffects();
    
    // Re-init ripples when dynamic content is added
    const observer = new MutationObserver(() => {
        initRippleEffects();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();

// Expose for global use
window.initRippleEffects = initRippleEffects;

// Then run full init
init();

/**
 * "And if I only could
 * I'd make a deal with God
 * And I'd get Him to swap our places"
 * - Kate Bush, "Running Up That Hill" (1985)
 */