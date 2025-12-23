/**
 * Wallpaper Manager Module
 * Handles all wallpaper-related functionality including storage, loading, and effects
 */

const WallpaperManager = (function () {
    'use strict';

    // ==================== Configuration Constants ====================
    const CONFIG = {
        DB_NAME: 'GenresFoxDB',
        STORE_NAME: 'wallpapers',
        WALLPAPER_KEY: 'currentWallpaper',
        MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB max
        RETRY_COUNT: 3,
        STORAGE_KEYS: {
            WALLPAPER_SETTINGS: 'wallpaperSettings',
            SEARCH_BOX_SETTINGS: 'searchBoxSettings',
            LEGACY_WALLPAPER: 'wallpaper',
            BING_WALLPAPER_CACHE: 'bingWallpaperCache',
            WALLPAPER_SOURCE: 'wallpaperSource',
            BING_MARKET: 'bingMarket',
            WALLPAPER_PREVIEW_SMALL: 'wallpaperPreviewSmall'
        },
        CSS_VARS: {
            WALLPAPER_IMAGE: '--wallpaper-image',
            WALLPAPER_BLUR: '--wallpaper-blur',
            WALLPAPER_VIGNETTE: '--wallpaper-vignette',
            SEARCH_WIDTH: '--search-width',
            SEARCH_POSITION: '--search-position',
            SEARCH_SCALE: '--search-scale',
            SEARCH_RADIUS: '--search-radius',
            SEARCH_SHADOW_ALPHA: '--search-shadow-alpha',
            SEARCH_SHADOW_SOFT: '--search-shadow-soft'
        },
        BING_API: {
            // Using a CORS proxy or direct Bing API
            BASE_URL: 'https://www.bing.com',
            API_PATH: '/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US',
            // idx=0 is today, idx=1 is tomorrow (for preload)
            API_PATH_TOMORROW: '/HPImageArchive.aspx?format=js&idx=-1&n=1&mkt=en-US',
            PROXY_URL: 'https://bing.biturl.top/',
            // Cache expires at midnight (next day)
            CACHE_STRATEGY: 'daily'
        },
        BING_CACHE: {
            DB_STORE_NAME: 'bingWallpapers',
            MAX_CACHED_DAYS: 3,  // Keep last 3 days of wallpapers
            PRELOAD_DELAY: 30000,  // Wait 30s after load before preloading
            LRU_MAX_ENTRIES: 6,    // Hard cap for entries
            LRU_MAX_BYTES: 40 * 1024 * 1024, // 40MB total for Bing blobs in IndexedDB
            MEMORY_MAX_BYTES: 20 * 1024 * 1024 // In-memory budget for Bing blobs
        },
        TIMEOUTS: {
            INFO: 8000,   // 8s for metadata fetch
            IMAGE: 12000  // 12s for image download
        },
        WALLPAPER_SOURCES: {
            CUSTOM: 'custom',
            BING: 'bing',
            DEFAULT: 'default'
        }
    };

    // ==================== Private State ====================
    let _state = {
        currentWallpaperUrl: null,
        wallpaperSettings: { blur: 0, vignette: 0 },
        searchBoxSettings: { width: 600, position: 40, scale: 100, radius: 36, shadow: 40 },
        wallpaperSource: CONFIG.WALLPAPER_SOURCES.DEFAULT,
        bingWallpaperInfo: null,
        isInitialized: false,
        dbInstance: null,
        bingPreloadScheduled: false,
        bingMarket: 'en-US'
    };

    // In-memory LRU cache for Bing blobs
    const _bingMemoryCache = new Map(); // key -> { blob, size, lastAccess }
    let _bingMemoryBytes = 0;
    let _bingWallpaperPromise = null; // dedupe Bing fetch/apply
    let _bingWarmPromise = null;      // best-effort cache warmer

    const SEARCH_LIMITS = {
        width: { min: 300, max: 1000, fallback: 600 },
        position: { min: 0, max: 100, fallback: 40 },
        scale: { min: 80, max: 150, fallback: 100 },
        radius: { min: 4, max: 64, fallback: 36 },
        shadow: { min: 0, max: 100, fallback: 40 }
    };

    function _clampSearchValue(val, { min, max, fallback }) {
        const n = Number(val);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    // ==================== DOM Element References ====================
    let _elements = {
        dropZone: null,
        uploadContent: null,
        wallpaperPreview: null,
        previewImg: null,
        wallpaperControls: null,
        blurSlider: null,
        vignetteSlider: null,
        blurValue: null,
        vignetteValue: null,
        wallpaperUpload: null,
        resetWallpaper: null,
        searchWidthSlider: null,
        searchPositionSlider: null,
        searchWidthValue: null,
        searchPositionValue: null
    };

    // ==================== IndexedDB Operations ====================

    /**
     * Run a task when the browser is idle (fallback to setTimeout)
     * @param {Function} fn
     * @param {number} timeout
     */
    function _runWhenIdle(fn, timeout = 1000) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => fn(), { timeout });
        } else {
            setTimeout(fn, 0);
        }
    }

    /**
     * Open IndexedDB database connection
     * @returns {Promise<IDBDatabase>}
     */
    function _openDB() {
        return new Promise((resolve, reject) => {
            // Reuse existing connection
            if (_state.dbInstance && _state.dbInstance.name === CONFIG.DB_NAME) {
                resolve(_state.dbInstance);
                return;
            }

            const request = indexedDB.open(CONFIG.DB_NAME, 2);  // Version 2: Added Bing cache store

            request.onerror = () => {
                console.error('IndexedDB open error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                _state.dbInstance = request.result;

                // Listen for database close event to clear reference
                _state.dbInstance.onclose = () => {
                    _state.dbInstance = null;
                };

                resolve(_state.dbInstance);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Main wallpaper store
                if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
                    db.createObjectStore(CONFIG.STORE_NAME);
                }
                // Bing wallpaper cache store
                if (!db.objectStoreNames.contains(CONFIG.BING_CACHE.DB_STORE_NAME)) {
                    db.createObjectStore(CONFIG.BING_CACHE.DB_STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Save wallpaper to IndexedDB
     * @param {Blob|File} file - Wallpaper file
     * @returns {Promise<void>}
     */
    async function _saveWallpaperToDB(file) {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.put(file, CONFIG.WALLPAPER_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('Save wallpaper error:', request.error);
                reject(request.error);
            };

            transaction.onerror = () => {
                console.error('Transaction error:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Get wallpaper from IndexedDB with retry mechanism
     * @param {number} retries - Number of retry attempts
     * @returns {Promise<Blob|string|null>}
     */
    async function _getWallpaperFromDB(retries = CONFIG.RETRY_COUNT) {
        for (let i = 0; i < retries; i++) {
            try {
                const db = await _openDB();
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction([CONFIG.STORE_NAME], 'readonly');
                    const store = transaction.objectStore(CONFIG.STORE_NAME);
                    const request = store.get(CONFIG.WALLPAPER_KEY);

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            } catch (e) {
                console.warn(`Wallpaper load attempt ${i + 1} failed:`, e);
                if (i < retries - 1) {
                    // Exponential backoff: 100ms, 200ms, 400ms
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, i)));
                } else {
                    throw e;
                }
            }
        }
        return null;
    }

    /**
     * Delete wallpaper from IndexedDB
     * @returns {Promise<void>}
     */
    async function _deleteWallpaperFromDB() {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.delete(CONFIG.WALLPAPER_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('Delete wallpaper error:', request.error);
                reject(request.error);
            };
        });
    }

    // ==================== CSS Variable Operations ====================

    /**
     * Set CSS variable
     * @param {string} name - Variable name
     * @param {string} value - Variable value
     */
    function _setCSSVar(name, value) {
        document.documentElement.style.setProperty(name, value);
    }

    // ==================== Core Wallpaper Functions ====================

    /**
     * Save a small preview of the current wallpaper to localStorage
     * so that new tabs can show a fast, low-res wallpaper immediately.
     * Runs in idle time to avoid blocking UI.
     * @param {Blob|string} source - Blob or dataURL/string from legacy storage
     * @param {string} kind - 'bing' | 'custom'
     */
    function _saveWallpaperPreviewSmall(source, kind) {
        _runWhenIdle(async () => {
            try {
                let img;
                if (source instanceof Blob) {
                    const url = URL.createObjectURL(source);
                    try {
                        img = await createImageBitmap(source);
                        URL.revokeObjectURL(url);
                    } catch (e) {
                        URL.revokeObjectURL(url);
                        return;
                    }
                } else if (typeof source === 'string' && source) {
                    // Legacy dataURL / URL string
                    img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = () => resolve();
                        img.onerror = () => reject(new Error('preview load failed'));
                        img.src = source;
                    });
                } else {
                    return;
                }

                const maxW = 480;
                const scale = img.width > maxW ? (maxW / img.width) : 1;
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.drawImage(img, 0, 0, w, h);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                canvas.width = 0;
                canvas.height = 0;
                if (img.close) img.close();

                const payload = {
                    dataUrl,
                    width: w,
                    height: h,
                    kind,
                    ts: Date.now()
                };
                try {
                    localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_PREVIEW_SMALL, JSON.stringify(payload));
                } catch (_) {
                    // Ignore quota errors
                }
            } catch (_) {
                // Silent failure. Preview is purely best-effort.
            }
        }, 2000);
    }

    /**
     * Set wallpaper URL
     * @param {string} url - Wallpaper URL (can be blob URL or data URL)
     */
    function _setWallpaper(url) {
        // Revoke old blob URL to prevent memory leaks
        if (_state.currentWallpaperUrl &&
            _state.currentWallpaperUrl.startsWith('blob:') &&
            _state.currentWallpaperUrl !== url) {
            URL.revokeObjectURL(_state.currentWallpaperUrl);
        }

        _state.currentWallpaperUrl = url;
        _setCSSVar(CONFIG.CSS_VARS.WALLPAPER_IMAGE, url === 'none' ? 'none' : `url(${url})`);
    }

    /**
     * Show a lightweight status message near the wallpaper controls
     * @param {string} text
     * @param {number} duration
     */
    function _showStatusMessage(text, duration = 2000) {
        let el = document.getElementById('wallpaper-status-message');
        if (!el) {
            el = document.createElement('div');
            el.id = 'wallpaper-status-message';
            el.style.cssText = `
                margin-top: 8px;
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.9rem;
                transition: opacity 0.3s ease;
                pointer-events: none;
                display: block;
                text-align: center;
            `;
            if (_elements.uploadContent && _elements.uploadContent.parentNode) {
                _elements.uploadContent.parentNode.insertBefore(el, _elements.uploadContent.nextSibling);
            } else {
                document.body.appendChild(el);
            }
        }
        el.textContent = text;
        el.style.opacity = '1';
        clearTimeout(el._timer);
        el._timer = setTimeout(() => {
            el.style.opacity = '0';
        }, duration);
    }

    /**
     * Enable/disable reset button based on wallpaper source
     */
    function _updateResetButtonState() {
        if (!_elements.resetWallpaper) return;
        const isCustom = _state.wallpaperSource === CONFIG.WALLPAPER_SOURCES.CUSTOM;
        _elements.resetWallpaper.disabled = !isCustom;
        _elements.resetWallpaper.classList.toggle('disabled', !isCustom);
        _elements.resetWallpaper.setAttribute(
            'aria-disabled',
            (!isCustom).toString()
        );
    }

    /**
     * Apply wallpaper effects (blur and vignette)
     */
    function _applyWallpaperEffects() {
        const { blur, vignette } = _state.wallpaperSettings;

        // Set blur effect
        _setCSSVar(CONFIG.CSS_VARS.WALLPAPER_BLUR, `${blur / 10}px`);

        // Set vignette effect
        if (vignette > 0) {
            const vignetteStrength = vignette / 100;
            const vignetteGradient = `radial-gradient(circle, transparent 0%, rgba(0,0,0,${vignetteStrength * 0.7}) 100%)`;
            _setCSSVar(CONFIG.CSS_VARS.WALLPAPER_VIGNETTE, vignetteGradient);
        } else {
            _setCSSVar(CONFIG.CSS_VARS.WALLPAPER_VIGNETTE, 'transparent');
        }
    }

    /**
     * Apply search box settings
     */
    function _applySearchBoxSettings() {
        const { width, position, scale, radius, shadow } = _state.searchBoxSettings;
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_WIDTH, `${width}px`);
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_POSITION, `${position}%`);
        const shadowAlpha = Math.min(1, Math.max(0, shadow / 100));
        const shadowSoft = Math.min(1, Math.max(0, shadowAlpha * 0.5));

        _setCSSVar(CONFIG.CSS_VARS.SEARCH_SCALE, (scale / 100).toString());
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_RADIUS, `${radius}px`);
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_SHADOW_ALPHA, shadowAlpha.toString());
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_SHADOW_SOFT, shadowSoft.toString());
    }

    /**
     * Update preview area
     * @param {string} url - Preview image URL
     */
    function _updatePreview(url) {
        if (!url || !_elements.previewImg) return;

        _elements.previewImg.src = url;

        if (_elements.uploadContent) {
            _elements.uploadContent.style.display = 'none';
        }
        if (_elements.wallpaperPreview) {
            _elements.wallpaperPreview.style.display = 'block';
        }
        if (_elements.wallpaperControls) {
            _elements.wallpaperControls.style.display = 'block';
        }
    }

    // ==================== Bing Daily Wallpaper ====================

    // ----- Bing cache helpers -----
    function _getBingMem(key) {
        const entry = _bingMemoryCache.get(key);
        if (!entry) return null;
        entry.lastAccess = Date.now();
        _bingMemoryCache.delete(key);
        _bingMemoryCache.set(key, entry); // move to tail (recent)
        return entry.blob;
    }

    function _evictOldestBingMem() {
        const oldestKey = _bingMemoryCache.keys().next().value;
        if (!oldestKey) return;
        const entry = _bingMemoryCache.get(oldestKey);
        _bingMemoryCache.delete(oldestKey);
        _bingMemoryBytes = Math.max(0, _bingMemoryBytes - (entry?.size || 0));
    }

    function _putBingMem(key, blob) {
        const size = blob?.size || 0;
        if (size > CONFIG.BING_CACHE.MEMORY_MAX_BYTES) return; // skip oversized
        while (_bingMemoryBytes + size > CONFIG.BING_CACHE.MEMORY_MAX_BYTES && _bingMemoryCache.size > 0) {
            _evictOldestBingMem();
        }
        const entry = { blob, size, lastAccess: Date.now() };
        // Replace if exists to keep bytes accurate
        if (_bingMemoryCache.has(key)) {
            const prev = _bingMemoryCache.get(key);
            _bingMemoryBytes = Math.max(0, _bingMemoryBytes - (prev?.size || 0));
            _bingMemoryCache.delete(key);
        }
        _bingMemoryCache.set(key, entry);
        _bingMemoryBytes += size;
    }

    async function _updateBingLastAccess(db, key, lastAccess) {
        return new Promise((resolve) => {
            const tx = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readwrite');
            const store = tx.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => {
                const entry = req.result;
                if (!entry) return resolve();
                entry.lastAccess = lastAccess;
                store.put(entry);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async function _enforceBingCacheLimits(db) {
        const maxEntries = CONFIG.BING_CACHE.LRU_MAX_ENTRIES;
        const maxBytes = CONFIG.BING_CACHE.LRU_MAX_BYTES;
        const entries = [];
        await new Promise((resolve) => {
            const tx = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readonly');
            const store = tx.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
            const req = store.openCursor();
            req.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const value = cursor.value;
                    entries.push({
                        id: value.id,
                        size: value.size ?? value.blob?.size ?? 0,
                        lastAccess: value.lastAccess ?? value.timestamp ?? 0
                    });
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            req.onerror = () => resolve();
        });

        let totalBytes = entries.reduce((sum, e) => sum + (e.size || 0), 0);
        if (entries.length <= maxEntries && totalBytes <= maxBytes) return;

        entries.sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0)); // oldest first
        const toDelete = [];
        for (const entry of entries) {
            if (entries.length - toDelete.length <= maxEntries && totalBytes <= maxBytes) break;
            toDelete.push(entry.id);
            totalBytes -= entry.size || 0;
        }

        if (toDelete.length === 0) return;
        await new Promise((resolve) => {
            const tx = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readwrite');
            const store = tx.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
            toDelete.forEach(id => store.delete(id));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async function _removeBingCacheEntry(key) {
        try {
            const db = await _openDB();
            await new Promise((resolve) => {
                const tx = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readwrite');
                const store = tx.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
                store.delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        } catch (e) {
            // Silent failure; best effort
        }
    }

    /**
     * Get today's date string (YYYYMMDD) using browser timezone
     * @param {number} offsetDays - Days to offset (0 = today, 1 = tomorrow, -1 = yesterday)
     * @returns {string}
     */
    function _getDateString(offsetDays = 0) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const target = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
        return formatter.format(target).replace(/-/g, '');
    }

    /**
     * Detect Bing market from browser language, fallback to en-US
     * @returns {string}
     */
    function _detectBingMarket() {
        const lang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';
        // Normalize underscores to hyphen (e.g., zh_CN -> zh-CN)
        const normalized = lang.replace('_', '-');
        return normalized || 'en-US';
    }

    /**
     * Get start-of-today timestamp (local timezone)
     * @returns {number}
     */
    function _getStartOfTodayTs() {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(new Date());
        const y = parts.find(p => p.type === 'year')?.value;
        const m = parts.find(p => p.type === 'month')?.value;
        const d = parts.find(p => p.type === 'day')?.value;
        const iso = `${y}-${m}-${d}T00:00:00`;
        const ts = new Date(iso).getTime();
        return Number.isFinite(ts) ? ts : Date.now();
    }

    /**
     * Check if cache for a specific date is still valid
     * Cache is valid until midnight local time
     * @param {string} cacheDate - Date string (YYYYMMDD)
     * @returns {boolean}
     */
    function _isBingCacheValid(cacheDate) {
        const today = _getDateString(0);
        return cacheDate === today;
    }

    /**
     * Get Bing wallpaper image blob from IndexedDB cache
     * @param {string} dateStr - Date string (YYYYMMDD)
     * @returns {Promise<Blob|null>}
     */
    async function _getBingImageFromCache(dateStr) {
        try {
            const key = `bing_${dateStr}`;

            // In-memory fast path
            const mem = _getBingMem(key);
            if (mem) return mem;

            const db = await _openDB();
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readonly');
                const store = transaction.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && result.blob) {
                        // Stale guard: date mismatch or past today's boundary
                        const entryDate = result.date || result.info?.date;
                        const startOfToday = _getStartOfTodayTs();
                        const entryTs = result.timestamp || result.lastAccess || 0;
                        const isDateMismatch = entryDate && entryDate !== dateStr;
                        const isTooOld = entryTs && entryTs < startOfToday;
                        if (isDateMismatch || isTooOld) {
                            _removeBingCacheEntry(key);
                            resolve(null);
                            return;
                        }
                        console.log(`Bing wallpaper cache hit for ${dateStr}`);
                        _putBingMem(key, result.blob);
                        _updateBingLastAccess(db, key, Date.now());
                        resolve(result.blob);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn('Failed to get Bing image from cache:', e);
            return null;
        }
    }

    /**
     * Save Bing wallpaper image blob to IndexedDB cache
     * @param {string} dateStr - Date string (YYYYMMDD)
     * @param {Blob} blob - Image blob
     * @param {Object} info - Wallpaper metadata
     */
    async function _saveBingImageToCache(dateStr, blob, info) {
        try {
            const db = await _openDB();
            const key = `bing_${dateStr}`;
            const size = blob?.size || 0;
            const now = Date.now();
            await new Promise((resolve, reject) => {
                const transaction = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
                
                const data = {
                    id: key,
                    blob: blob,
                    info: info,
                    date: dateStr,
                    timestamp: now,
                    lastAccess: now,
                    size: size
                };
                
                const request = store.put(data);
                request.onsuccess = () => {
                    console.log(`Bing wallpaper cached for ${dateStr}`);
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
            
            // Memory cache + LRU enforcement
            _putBingMem(key, blob);
            await _enforceBingCacheLimits(db);

            // Clean up old cache entries
            await _cleanupOldBingCache();
        } catch (e) {
            console.warn('Failed to save Bing image to cache:', e);
        }
    }

    /**
     * Clean up old Bing wallpaper cache entries
     */
    async function _cleanupOldBingCache() {
        try {
            const db = await _openDB();
            const cutoffDate = _getDateString(-CONFIG.BING_CACHE.MAX_CACHED_DAYS);
            
            await new Promise((resolve) => {
                const transaction = db.transaction([CONFIG.BING_CACHE.DB_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(CONFIG.BING_CACHE.DB_STORE_NAME);
                const request = store.openCursor();
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const entry = cursor.value;
                        if (entry.date && entry.date < cutoffDate) {
                            console.log(`Removing old Bing cache: ${entry.date}`);
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    /**
     * Fetch with a timeout to avoid hanging requests
     * @param {string} url
     * @param {RequestInit} options
     * @param {number} timeoutMs
     * @returns {Promise<Response>}
     */
    async function _fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
        const controller = 'AbortController' in window ? new AbortController() : null;
        const timer = setTimeout(() => controller?.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller?.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Fetch with retry and exponential backoff
     * @param {string} url
     * @param {RequestInit} options
     * @param {number} timeoutMs
     * @param {number} attempts
     * @param {number} baseDelayMs
     * @returns {Promise<Response>}
     */
    async function _fetchWithRetry(url, options = {}, timeoutMs = 10000, attempts = 3, baseDelayMs = 200) {
        let lastError = null;
        for (let i = 0; i < attempts; i++) {
            try {
                const resp = await _fetchWithTimeout(url, options, timeoutMs);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return resp;
            } catch (err) {
                lastError = err;
                if (i < attempts - 1) {
                    const delay = baseDelayMs * Math.pow(2, i);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError || new Error('Fetch failed');
    }

    /**
     * Fetch Bing wallpaper info from API
     * @param {number} index - Day index (0 = today, -1 = tomorrow for some APIs)
     * @returns {Promise<Object|null>}
     */
    async function _fetchBingWallpaperInfo(index = 0) {
        // Method 1: Try direct Bing API
        try {
            const response = await _fetchWithTimeout(
                `${CONFIG.BING_API.BASE_URL}${CONFIG.BING_API.API_PATH}`,
                { mode: 'cors' },
                CONFIG.TIMEOUTS.INFO
            );
            if (response.ok) {
                const data = await response.json();
                if (data.images && data.images[0]) {
                    const image = data.images[0];
                    return {
                        url: `${CONFIG.BING_API.BASE_URL}${image.url}`,
                        urlHD: `${CONFIG.BING_API.BASE_URL}${image.url.replace('1920x1080', 'UHD')}`,
                        title: image.title || 'Bing Daily Wallpaper',
                        copyright: image.copyright || '',
                        date: image.startdate || _getDateString(0)
                    };
                }
            }
        } catch (e) {
            // Direct fetch failed
        }

        // Method 2: Use proxy API
        try {
            const proxyUrl = `${CONFIG.BING_API.PROXY_URL}?resolution=UHD&format=image&index=${index}&mkt=en-US`;
            
            // Validate URL accessibility
            const isAccessible = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 5000);
                img.src = proxyUrl;
            });
            
            if (isAccessible) {
                return {
                    url: `${CONFIG.BING_API.PROXY_URL}?resolution=1920&format=image&index=${index}&mkt=en-US`,
                    urlHD: proxyUrl,
                    title: 'Bing Daily Wallpaper',
                    copyright: '',
                    date: _getDateString(-index)  // index=0 is today, index=-1 would be tomorrow
                };
            }
        } catch (e) {
            console.warn('Bing proxy fetch failed:', e);
        }

        return null;
    }

    /**
     * Download and cache Bing wallpaper image
     * @param {Object} info - Wallpaper info with URL
     * @returns {Promise<Blob|null>}
     */
    async function _downloadBingWallpaper(info) {
        try {
            const candidates = [];
            if (info.urlHD) candidates.push(info.urlHD);
            if (info.url && info.url !== info.urlHD) candidates.push(info.url);

            for (const candidate of candidates) {
                try {
                    const response = await _fetchWithRetry(
                        candidate,
                        {},
                        CONFIG.TIMEOUTS.IMAGE,
                        3,
                        200
                    );
                    const blob = await response.blob();
                    console.log(`Downloaded Bing wallpaper: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
                    return blob;
                } catch (err) {
                    // Continue to next candidate with backoff already applied
                }
            }
        } catch (e) {
            console.warn('Failed to download Bing wallpaper:', e);
        }
        return null;
    }

    /**
     * Get Bing wallpaper for today (with caching)
     * @returns {Promise<{blob: Blob, info: Object}|null>}
     */
    async function _getBingWallpaper() {
        if (_bingWallpaperPromise) return _bingWallpaperPromise;

        _bingWallpaperPromise = (async () => {
            const today = _getDateString(0);
            
            // Always try to fetch fresh wallpaper info from API first
            // This ensures we get the latest Bing wallpaper even if cache exists
            let info = null;
            try {
                info = await _fetchBingWallpaperInfo(0);
                } catch (e) {
                console.warn('Failed to fetch Bing wallpaper info, will try cache:', e);
            }
            
            // If API returned info, check if we need to update
            if (info) {
                try {
                    // Normalize the date from API response (Bing API uses YYYYMMDD format)
                    const apiDate = info.date || today;
                    // Remove any non-digit characters and take first 8 digits (YYYYMMDD)
                    const normalizedApiDate = apiDate.toString().replace(/\D/g, '').substring(0, 8);
                    
                    // Check if cached blob exists and matches API date
                    let cachedBlob = null;
                    try {
                        cachedBlob = await _getBingImageFromCache(normalizedApiDate);
                        } catch (e) {
                        console.warn('Failed to get Bing cache, will download fresh:', e);
                    }
                    
                    const cachedInfo = _getBingWallpaperInfoCache();
                    const cachedDate = cachedInfo?.date ? cachedInfo.date.toString().replace(/\D/g, '').substring(0, 8) : null;
                    
                    // If cache exists and dates match, use cache
                    if (cachedBlob && cachedDate === normalizedApiDate) {
                        console.log(`Using cached Bing wallpaper (date matches API: ${normalizedApiDate})`);
                        return {
                            blob: cachedBlob,
                            info: cachedInfo || info
                        };
                    }
                    
                    // Cache miss or date mismatch - download fresh wallpaper
                    console.log('Downloading fresh Bing wallpaper (cache miss or date mismatch)');
                    const blob = await _downloadBingWallpaper(info);
                    if (!blob) {
                        // Download failed, try to use existing cache as fallback
                        try {
                            const fallbackBlob = await _getBingImageFromCache(today);
                            if (fallbackBlob) {
                                console.warn('Download failed, using existing cache as fallback');
                                return {
                                    blob: fallbackBlob,
                                    info: cachedInfo || { date: today, title: 'Bing Daily Wallpaper' }
                                };
                            }
                        } catch (e) {
                            console.warn('Fallback cache also failed:', e);
                        }
                        return null;
                    }
                    
                    // Cache the new wallpaper (with error isolation)
                    try {
                        await _saveBingImageToCache(normalizedApiDate, blob, info);
                        _saveBingWallpaperInfoCache(info);
                    } catch (e) {
                        console.warn('Failed to save Bing cache, but wallpaper is available:', e);
                        // Continue even if caching fails
                    }
                    
                    return { blob, info };
                } catch (e) {
                    console.error('Error in Bing wallpaper update logic:', e);
                    // Fall through to cache fallback
                }
            }
            
            // API fetch failed or update logic failed - fallback to cache if available
            console.log('API fetch failed, checking cache...');
            try {
                const cachedBlob = await _getBingImageFromCache(today);
                if (cachedBlob) {
                    const cachedInfo = _getBingWallpaperInfoCache();
                    console.log('Using cached Bing wallpaper (API unavailable)');
                    return {
                        blob: cachedBlob,
                        info: cachedInfo || { date: today, title: 'Bing Daily Wallpaper' }
                    };
                }
            } catch (e) {
                console.warn('Cache fallback also failed:', e);
            }
            
            // No cache and API failed
            console.warn('Could not get Bing wallpaper: API failed and no cache available');
            return null;
        })();

        try {
            return await _bingWallpaperPromise;
        } catch (e) {
            console.error('Unexpected error in _getBingWallpaper:', e);
            return null;
        } finally {
            _bingWallpaperPromise = null;
        }
    }

    /**
     * Get cached Bing wallpaper info from localStorage
     * @returns {Object|null}
     */
    function _getBingWallpaperInfoCache() {
        try {
            const cached = localStorage.getItem(CONFIG.STORAGE_KEYS.BING_WALLPAPER_CACHE);
            if (!cached) return null;

            const data = JSON.parse(cached);
            
            // Check if cache is for today and not older than start-of-day
            const startOfToday = _getStartOfTodayTs();
            const cacheTs = data.timestamp || 0;
            if (cacheTs < startOfToday) {
                localStorage.removeItem(CONFIG.STORAGE_KEYS.BING_WALLPAPER_CACHE);
                return null;
            }
            if (data.info && _isBingCacheValid(data.info.date)) {
                return data.info;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save Bing wallpaper info to localStorage
     * @param {Object} info - Wallpaper info
     */
    function _saveBingWallpaperInfoCache(info) {
        try {
            const cacheData = {
                info: info,
                timestamp: Date.now()
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.BING_WALLPAPER_CACHE, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to cache Bing wallpaper info:', e);
        }
    }

    /**
     * Warm today's Bing cache in the background so reset-to-default is instant.
     * Best-effort: skips if cache already exists or a fetch is in-flight.
     */
    function _warmBingCache() {
        if (_bingWarmPromise) return _bingWarmPromise;
        _bingWarmPromise = (async () => {
            try {
                await _getBingWallpaper(); // uses cache if present
            } catch (e) {
                console.warn('Warm Bing cache failed:', e);
            } finally {
                _bingWarmPromise = null;
            }
        })();
        return _bingWarmPromise;
    }

    /**
     * Preload tomorrow's Bing wallpaper in the background
     */
    async function _preloadTomorrowBingWallpaper() {
        if (_state.bingPreloadScheduled) return;
        _state.bingPreloadScheduled = true;
        
        // Wait for idle time
        const schedulePreload = () => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => _doPreloadTomorrow(), { timeout: 60000 });
            } else {
                setTimeout(_doPreloadTomorrow, CONFIG.BING_CACHE.PRELOAD_DELAY);
            }
        };
        
        schedulePreload();
    }

    /**
     * Actually perform the preload
     */
    async function _doPreloadTomorrow() {
        try {
            const tomorrow = _getDateString(1);
            
            // Check if already cached
            const cached = await _getBingImageFromCache(tomorrow);
            if (cached) {
                console.log('Tomorrow\'s Bing wallpaper already cached');
                return;
            }
            
            console.log('Preloading tomorrow\'s Bing wallpaper...');
            
            // Fetch info for tomorrow (index=-1 on the proxy API)
            // Note: This may not always work depending on when Bing updates
            const info = await _fetchBingWallpaperInfo(-1);
            if (!info) {
                console.log('Tomorrow\'s wallpaper not yet available');
                return;
            }
            
            // Download and cache
            const blob = await _downloadBingWallpaper(info);
            if (blob) {
                await _saveBingImageToCache(tomorrow, blob, info);
                console.log('Tomorrow\'s Bing wallpaper preloaded successfully');
            }
        } catch (e) {
            console.warn('Failed to preload tomorrow\'s wallpaper:', e);
        }
    }

    /**
     * Apply Bing daily wallpaper (with smart caching)
     * @returns {Promise<boolean>} Whether successful
     */
    async function _applyBingWallpaper() {
        try {
            // Get wallpaper (from cache or download)
            const result = await _getBingWallpaper();
            
            if (!result) {
                console.warn('Could not get Bing wallpaper');
                return false;
            }
            
            const { blob, info } = result;
            _state.bingWallpaperInfo = info;
            
            // Create object URL from cached blob
            const imageUrl = URL.createObjectURL(blob);
            _setWallpaper(imageUrl);
            // Save low-res preview for instant first paint on future tabs
            _saveWallpaperPreviewSmall(blob, CONFIG.WALLPAPER_SOURCES.BING);
            
            _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.BING;
            localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, CONFIG.WALLPAPER_SOURCES.BING);
            _updateResetButtonState();
            
            // Schedule preload of tomorrow's wallpaper
            _preloadTomorrowBingWallpaper();
            
            return true;
        } catch (e) {
            console.error('Failed to apply Bing wallpaper:', e);
            return false;
        }
    }

    /**
     * Get localized message with fallback
     * @param {string} key - Message key
     * @param {string} fallback - Fallback text
     * @returns {string}
     */
    function _getLocalizedMessage(key, fallback) {
        if (typeof I18n !== 'undefined' && I18n.getMessage) {
            return I18n.getMessage(key) || fallback;
        }
        return fallback;
    }

    /**
     * Show processing progress UI
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} status - Status message
     */
    function _showProcessingProgress(progress, status = '') {
        let progressOverlay = document.getElementById('wallpaper-progress-overlay');
        
        const processingText = _getLocalizedMessage('processingImage', 'Processing image...');
        
        if (!progressOverlay) {
            progressOverlay = document.createElement('div');
            progressOverlay.id = 'wallpaper-progress-overlay';
            progressOverlay.innerHTML = `
                <div class="progress-content">
                    <div class="progress-spinner"></div>
                    <div class="progress-text">${processingText}</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill"></div>
                    </div>
                    <div class="progress-status"></div>
                </div>
            `;
            progressOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100000;
                backdrop-filter: blur(10px);
            `;
            
            const style = document.createElement('style');
            style.textContent = `
                #wallpaper-progress-overlay .progress-content {
                    text-align: center;
                    color: white;
                    padding: 40px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                #wallpaper-progress-overlay .progress-spinner {
                    width: 48px;
                    height: 48px;
                    border: 3px solid rgba(255, 255, 255, 0.3);
                    border-top-color: #fff;
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                #wallpaper-progress-overlay .progress-text {
                    font-size: 18px;
                    font-weight: 500;
                    margin-bottom: 16px;
                }
                #wallpaper-progress-overlay .progress-bar-container {
                    width: 280px;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                    overflow: hidden;
                    margin: 0 auto 12px;
                }
                #wallpaper-progress-overlay .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4facfe, #00f2fe);
                    border-radius: 3px;
                    transition: width 0.3s ease;
                    width: 0%;
                }
                #wallpaper-progress-overlay .progress-status {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.7);
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(progressOverlay);
        }
        
        const fill = progressOverlay.querySelector('.progress-bar-fill');
        const statusEl = progressOverlay.querySelector('.progress-status');
        
        if (fill) fill.style.width = `${progress}%`;
        if (statusEl && status) statusEl.textContent = status;
        
        progressOverlay.style.display = 'flex';
    }
    
    /**
     * Hide processing progress UI
     */
    function _hideProcessingProgress() {
        const overlay = document.getElementById('wallpaper-progress-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    /**
     * Handle uploaded file with smart processing for large images
     * @param {File} file - Uploaded file
     * @returns {Promise<boolean>} - Whether successful
     */
    async function _handleFile(file) {
        if (!file) return false;

        // File size check
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            alert(`Image too large (max ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)`);
            return false;
        }

        // File type check
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return false;
        }

        try {
            // Check if ImageProcessor is available
            if (typeof ImageProcessor !== 'undefined') {
                // Lazy init to avoid blocking first paint
                if (!ImageProcessor.isWorkerAvailable()) {
                    ImageProcessor.init();
                }
                // Auto-load local WASM file if available
                try {
                    ImageProcessor.setWasmUrl(chrome.runtime.getURL('resize.wasm'));
                } catch (e) {
                    // WASM file not available, will use Canvas fallback
                    console.log('[Wallpaper] WASM not available, using Canvas API');
                }
                // Use ImageProcessor for optimized handling
                const statusLoading = _getLocalizedMessage('processingLoading', 'Loading image...');
                const statusOptimizing = _getLocalizedMessage('processingOptimizing', 'Optimizing...');
                const statusCompressing = _getLocalizedMessage('processingCompressing', 'Compressing...');
                const statusSaving = _getLocalizedMessage('processingSaving', 'Saving...');
                const statusStarting = _getLocalizedMessage('processingStarting', 'Starting...');
                
                _showProcessingProgress(0, statusStarting);
                
                const result = await ImageProcessor.processImage(file, {
                    onProgress: (progress) => {
                        let status = '';
                        if (progress < 30) status = statusLoading;
                        else if (progress < 70) status = statusOptimizing;
                        else if (progress < 90) status = statusCompressing;
                        else status = statusSaving;
                        _showProcessingProgress(progress, status);
                    },
                    onPreview: (previewUrl) => {
                        // Show preview immediately while processing continues
                        _updatePreview(previewUrl);
                    }
                });
                
                // Log compression results
                console.log(`Wallpaper optimized: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(result.processedSize / 1024 / 1024).toFixed(2)}MB (${result.compressionRatio.toFixed(1)}% reduction)`);
                
                // Save optimized blob to IndexedDB
                await _saveWallpaperToDB(result.blob);
                
                // Clear legacy localStorage wallpaper
                localStorage.removeItem(CONFIG.STORAGE_KEYS.LEGACY_WALLPAPER);
                
                // Create URL from optimized blob
                const objectUrl = URL.createObjectURL(result.blob);
                _setWallpaper(objectUrl);
                _updatePreview(objectUrl);
                _applyWallpaperEffects();
                _saveWallpaperPreviewSmall(result.blob, CONFIG.WALLPAPER_SOURCES.CUSTOM);
                
                _hideProcessingProgress();
                
            } else {
                // Fallback: direct save without optimization (original behavior)
                console.warn('ImageProcessor not available, using direct save');
                await _saveWallpaperToDB(file);
                
                // Clear legacy localStorage wallpaper
                localStorage.removeItem(CONFIG.STORAGE_KEYS.LEGACY_WALLPAPER);
                
                const objectUrl = URL.createObjectURL(file);
                _setWallpaper(objectUrl);
                _updatePreview(objectUrl);
                _applyWallpaperEffects();
                _saveWallpaperPreviewSmall(file, CONFIG.WALLPAPER_SOURCES.CUSTOM);
            }

            // Mark as custom wallpaper
            _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.CUSTOM;
            localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, CONFIG.WALLPAPER_SOURCES.CUSTOM);

            _updateResetButtonState();

            return true;
        } catch (err) {
            _hideProcessingProgress();
            console.error('Failed to save wallpaper:', err);
            alert('Failed to save wallpaper: ' + (err.message || 'Unknown error'));
            return false;
        }
    }

    /**
     * Reset wallpaper to default state (Bing daily wallpaper)
     * @returns {Promise<void>}
     */
    async function _resetWallpaper() {
        try {
            await _deleteWallpaperFromDB();
        } catch (e) {
            console.warn('Failed to delete wallpaper from DB:', e);
        }

        // Clear all storage
        localStorage.removeItem(CONFIG.STORAGE_KEYS.LEGACY_WALLPAPER);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.WALLPAPER_SETTINGS);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE);

        // Reset state
        _state.wallpaperSettings = { blur: 0, vignette: 0 };

        // Reset CSS variables
        _setCSSVar(CONFIG.CSS_VARS.WALLPAPER_BLUR, '0px');
        _setCSSVar(CONFIG.CSS_VARS.WALLPAPER_VIGNETTE, 'transparent');

        // Reset UI sliders
        if (_elements.blurSlider) {
            _elements.blurSlider.value = 0;
        }
        if (_elements.vignetteSlider) {
            _elements.vignetteSlider.value = 0;
        }
        if (_elements.blurValue) {
            _elements.blurValue.textContent = '0';
        }
        if (_elements.vignetteValue) {
            _elements.vignetteValue.textContent = '0';
        }

        // Try to load Bing wallpaper as default
        const bingLoaded = await _applyBingWallpaper();
        
        if (!bingLoaded) {
            _setWallpaper('none');
            _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.DEFAULT;
        } else {
            _showStatusMessage(_getLocalizedMessage('resetToBing', 'Switched to Bing Daily Wallpaper'), 2200);
        }
        
        // Show upload content and hide preview after reset
        if (_elements.uploadContent) {
            _elements.uploadContent.style.display = 'flex';
        }
        if (_elements.wallpaperPreview) {
            _elements.wallpaperPreview.style.display = 'none';
        }
        if (_elements.wallpaperUpload) {
            // Clear file input so the same file can be selected again
            _elements.wallpaperUpload.value = '';
        }
        // Always show wallpaper controls (Bing wallpaper can also be adjusted)
        if (_elements.wallpaperControls) {
            _elements.wallpaperControls.style.display = 'block';
        }

        _updateResetButtonState();
    }

    // ==================== Event Handlers ====================

    /**
     * Handle blur slider change
     * @param {Event} e
     */
    function _handleBlurChange(e) {
        const value = parseInt(e.target.value, 10);
        _state.wallpaperSettings.blur = value;

        if (_elements.blurValue) {
            _elements.blurValue.textContent = value;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.WALLPAPER_SETTINGS,
            JSON.stringify(_state.wallpaperSettings)
        );

        _applyWallpaperEffects();

        // Live preview effect
        if (_elements.previewImg) {
            _elements.previewImg.style.filter = `blur(${value / 10}px)`;
        }
    }

    /**
     * Handle vignette slider change
     * @param {Event} e
     */
    function _handleVignetteChange(e) {
        const value = parseInt(e.target.value, 10);
        _state.wallpaperSettings.vignette = value;

        if (_elements.vignetteValue) {
            _elements.vignetteValue.textContent = value;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.WALLPAPER_SETTINGS,
            JSON.stringify(_state.wallpaperSettings)
        );

        _applyWallpaperEffects();

        // Live preview effect
        if (_elements.wallpaperPreview) {
            const vignetteIntensity = value / 100;
            _elements.wallpaperPreview.style.setProperty(
                '--preview-vignette',
                `radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,${vignetteIntensity}) 100%)`
            );
        }
    }

    /**
     * Handle search box width slider change
     * @param {Event} e
     */
    function _handleSearchWidthChange(e) {
        const value = _clampSearchValue(parseInt(e.target.value, 10), SEARCH_LIMITS.width);
        _state.searchBoxSettings.width = value;

        if (_elements.searchWidthValue) {
            _elements.searchWidthValue.textContent = `${value}px`;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.SEARCH_BOX_SETTINGS,
            JSON.stringify(_state.searchBoxSettings)
        );

        _applySearchBoxSettings();
        _updateSearchPreview();
    }

    /**
     * Handle search box position slider change
     * @param {Event} e
     */
    function _handleSearchPositionChange(e) {
        const value = _clampSearchValue(parseInt(e.target.value, 10), SEARCH_LIMITS.position);
        _state.searchBoxSettings.position = value;

        if (_elements.searchPositionValue) {
            _elements.searchPositionValue.textContent = `${value}%`;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.SEARCH_BOX_SETTINGS,
            JSON.stringify(_state.searchBoxSettings)
        );

        _applySearchBoxSettings();
        _updateSearchPreview();
    }

    /**
     * Handle search box scale slider change
     * @param {Event} e
     */
    function _handleSearchScaleChange(e) {
        const value = _clampSearchValue(parseInt(e.target.value, 10), SEARCH_LIMITS.scale);
        _state.searchBoxSettings.scale = value;

        if (_elements.searchScaleValue) {
            _elements.searchScaleValue.textContent = `${value}%`;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.SEARCH_BOX_SETTINGS,
            JSON.stringify(_state.searchBoxSettings)
        );

        _applySearchBoxSettings();
        _updateSearchPreview();
    }

    /**
     * Handle search box radius slider change
     * @param {Event} e
     */
    function _handleSearchRadiusChange(e) {
        const value = _clampSearchValue(parseInt(e.target.value, 10), SEARCH_LIMITS.radius);
        _state.searchBoxSettings.radius = value;

        if (_elements.searchRadiusValue) {
            _elements.searchRadiusValue.textContent = `${value}px`;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.SEARCH_BOX_SETTINGS,
            JSON.stringify(_state.searchBoxSettings)
        );

        _applySearchBoxSettings();
        _updateSearchPreview();
    }

    /**
     * Handle search box shadow slider change
     * @param {Event} e
     */
    function _handleSearchShadowChange(e) {
        const value = _clampSearchValue(parseInt(e.target.value, 10), SEARCH_LIMITS.shadow);
        _state.searchBoxSettings.shadow = value;

        if (_elements.searchShadowValue) {
            _elements.searchShadowValue.textContent = `${value}%`;
        }

        localStorage.setItem(
            CONFIG.STORAGE_KEYS.SEARCH_BOX_SETTINGS,
            JSON.stringify(_state.searchBoxSettings)
        );

        _applySearchBoxSettings();
        _updateSearchPreview();
    }

    /**
     * Update search box preview in wallpaper settings
     */
    function _updateSearchPreview() {
        if (!_elements.previewSearchBox) return;

        const { width, position, scale, radius, shadow } = _state.searchBoxSettings;
        
        // Calculate preview width as percentage (relative to preview container)
        // Map 300-1000px to roughly 30%-90% of preview width
        const previewWidthPercent = Math.min(90, Math.max(30, (width - 300) / 700 * 60 + 30));
        
        _elements.previewSearchBox.style.setProperty('--preview-search-width', `${previewWidthPercent}%`);
        _elements.previewSearchBox.style.setProperty('--preview-search-top', `${position}%`);
        
        // Apply scale to preview (scaled down for preview)
        const previewScale = scale / 100;
        const inner = _elements.previewSearchBox.querySelector('.preview-search-inner');
        if (inner) {
            const shadowAlpha = Math.min(1, Math.max(0, shadow / 100));
            const shadowSoft = Math.min(1, Math.max(0, shadowAlpha * 0.5));

            inner.style.transform = `scale(${previewScale})`;
            inner.style.borderRadius = `${radius}px`;
            inner.style.boxShadow = `0 12px 34px rgba(0,0,0, ${shadowAlpha}), 0 6px 18px rgba(0,0,0, ${shadowSoft})`;
        }
    }

    /**
     * Handle drag over event
     * @param {DragEvent} e
     */
    function _handleDragOver(e) {
        e.preventDefault();
        if (_elements.dropZone) {
            _elements.dropZone.classList.add('dragover');
        }
    }

    /**
     * Handle drag leave event
     */
    function _handleDragLeave() {
        if (_elements.dropZone) {
            _elements.dropZone.classList.remove('dragover');
        }
    }

    /**
     * Handle drop event
     * @param {DragEvent} e
     */
    function _handleDrop(e) {
        e.preventDefault();
        if (_elements.dropZone) {
            _elements.dropZone.classList.remove('dragover');
        }
        const file = e.dataTransfer?.files?.[0];
        if (file) {
            _handleFile(file);
        }
    }

    // ==================== Initialization ====================

    /**
     * Cache DOM element references
     */
    function _cacheElements() {
        _elements = {
            dropZone: document.getElementById('dropZone'),
            uploadContent: document.getElementById('uploadContent'),
            wallpaperPreview: document.getElementById('wallpaperPreview'),
            previewImg: document.getElementById('previewImg'),
            previewSearchBox: document.getElementById('previewSearchBox'),
            wallpaperControls: document.getElementById('wallpaperControls'),
            blurSlider: document.getElementById('blurSlider'),
            vignetteSlider: document.getElementById('vignetteSlider'),
            blurValue: document.getElementById('blurValue'),
            vignetteValue: document.getElementById('vignetteValue'),
            wallpaperUpload: document.getElementById('wallpaperUpload'),
            resetWallpaper: document.getElementById('resetWallpaper'),
            searchWidthSlider: document.getElementById('searchWidthSlider'),
            searchPositionSlider: document.getElementById('searchPositionSlider'),
            searchScaleSlider: document.getElementById('searchScaleSlider'),
            searchRadiusSlider: document.getElementById('searchRadiusSlider'),
            searchShadowSlider: document.getElementById('searchShadowSlider'),
            searchWidthValue: document.getElementById('searchWidthValue'),
            searchPositionValue: document.getElementById('searchPositionValue'),
            searchScaleValue: document.getElementById('searchScaleValue'),
            searchRadiusValue: document.getElementById('searchRadiusValue'),
            searchShadowValue: document.getElementById('searchShadowValue'),
            useBingWallpaper: document.getElementById('useBingWallpaper')
        };
    }

    /**
     * Bind event listeners
     */
    function _bindEvents() {
        // Click to upload
        if (_elements.dropZone && _elements.wallpaperUpload) {
            _elements.dropZone.addEventListener('click', () => {
                _elements.wallpaperUpload.click();
            });
        }

        // File selection
        if (_elements.wallpaperUpload) {
            _elements.wallpaperUpload.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    _handleFile(file);
                }
            });
        }

        // Drag and drop events
        if (_elements.dropZone) {
            _elements.dropZone.addEventListener('dragover', _handleDragOver);
            _elements.dropZone.addEventListener('dragleave', _handleDragLeave);
            _elements.dropZone.addEventListener('drop', _handleDrop);
        }

        // Slider events
        if (_elements.blurSlider) {
            _elements.blurSlider.addEventListener('input', _handleBlurChange);
        }
        if (_elements.vignetteSlider) {
            _elements.vignetteSlider.addEventListener('input', _handleVignetteChange);
        }
        if (_elements.searchWidthSlider) {
            _elements.searchWidthSlider.addEventListener('input', _handleSearchWidthChange);
        }
        if (_elements.searchPositionSlider) {
            _elements.searchPositionSlider.addEventListener('input', _handleSearchPositionChange);
        }
        if (_elements.searchScaleSlider) {
            _elements.searchScaleSlider.addEventListener('input', _handleSearchScaleChange);
        }
        if (_elements.searchRadiusSlider) {
            _elements.searchRadiusSlider.addEventListener('input', _handleSearchRadiusChange);
        }
        if (_elements.searchShadowSlider) {
            _elements.searchShadowSlider.addEventListener('input', _handleSearchShadowChange);
        }

        // Reset button
        if (_elements.resetWallpaper) {
            _elements.resetWallpaper.addEventListener('click', _resetWallpaper);
        }

        // Wallpaper source switches
        if (_elements.useBingWallpaper) {
            _elements.useBingWallpaper.addEventListener('click', () => _applyBingWallpaper());
        }
    }

    /**
     * Load settings from storage
     */
    function _loadSettings() {
        // Load wallpaper effect settings
        const savedWallpaperSettings = localStorage.getItem(CONFIG.STORAGE_KEYS.WALLPAPER_SETTINGS);
        if (savedWallpaperSettings) {
            try {
                const parsed = JSON.parse(savedWallpaperSettings);
                _state.wallpaperSettings = {
                    blur: parsed.blur ?? 0,
                    vignette: parsed.vignette ?? 0
                };
            } catch (e) {
                console.warn('Failed to parse wallpaper settings:', e);
            }
        }

        // Load search box settings
        const savedSearchBoxSettings = localStorage.getItem(CONFIG.STORAGE_KEYS.SEARCH_BOX_SETTINGS);
        if (savedSearchBoxSettings) {
            try {
                const parsed = JSON.parse(savedSearchBoxSettings);
                _state.searchBoxSettings = {
                    width: _clampSearchValue(parsed.width, SEARCH_LIMITS.width),
                    position: _clampSearchValue(parsed.position, SEARCH_LIMITS.position),
                    scale: _clampSearchValue(parsed.scale, SEARCH_LIMITS.scale),
                    radius: _clampSearchValue(parsed.radius, SEARCH_LIMITS.radius),
                    shadow: _clampSearchValue(parsed.shadow, SEARCH_LIMITS.shadow)
                };
            } catch (e) {
                console.warn('Failed to parse search box settings:', e);
            }
        }
    }

    /**
     * Sync UI state with internal state
     */
    function _syncUI() {
        const { blur, vignette } = _state.wallpaperSettings;
        const { width, position, scale, radius, shadow } = _state.searchBoxSettings;

        // Sync wallpaper effect sliders
        if (_elements.blurSlider) {
            _elements.blurSlider.value = blur;
        }
        if (_elements.blurValue) {
            _elements.blurValue.textContent = blur;
        }
        if (_elements.vignetteSlider) {
            _elements.vignetteSlider.value = vignette;
        }
        if (_elements.vignetteValue) {
            _elements.vignetteValue.textContent = vignette;
        }

        // Sync search box settings sliders
        if (_elements.searchWidthSlider) {
            _elements.searchWidthSlider.value = width;
        }
        if (_elements.searchWidthValue) {
            _elements.searchWidthValue.textContent = `${width}px`;
        }
        if (_elements.searchPositionSlider) {
            _elements.searchPositionSlider.value = position;
        }
        if (_elements.searchPositionValue) {
            _elements.searchPositionValue.textContent = `${position}%`;
        }
        if (_elements.searchScaleSlider) {
            _elements.searchScaleSlider.value = scale;
        }
        if (_elements.searchScaleValue) {
            _elements.searchScaleValue.textContent = `${scale}%`;
        }
        if (_elements.searchRadiusSlider) {
            _elements.searchRadiusSlider.value = radius;
        }
        if (_elements.searchRadiusValue) {
            _elements.searchRadiusValue.textContent = `${radius}px`;
        }
        if (_elements.searchShadowSlider) {
            _elements.searchShadowSlider.value = shadow;
        }
        if (_elements.searchShadowValue) {
            _elements.searchShadowValue.textContent = `${shadow}%`;
        }

        // Always show wallpaper controls (works with both custom and Bing wallpaper)
        if (_elements.wallpaperControls) {
            _elements.wallpaperControls.style.display = 'block';
        }

        // Update search box preview
        _updateSearchPreview();
    }

    /**
     * Load wallpaper from storage
     * @returns {Promise<boolean>} - Whether wallpaper was successfully loaded
     */
    async function _loadWallpaper() {
        let wallpaperLoaded = false;
        // Check saved wallpaper source preference (clean up legacy values)
        let savedSource = localStorage.getItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE);
        if (savedSource && savedSource !== CONFIG.WALLPAPER_SOURCES.BING && savedSource !== CONFIG.WALLPAPER_SOURCES.CUSTOM) {
            savedSource = CONFIG.WALLPAPER_SOURCES.BING;
            localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, savedSource);
        }

        // Try loading custom wallpaper from IndexedDB first
        try {
            const dbData = await _getWallpaperFromDB();
            if (dbData) {
                let objectUrl;
                if (dbData instanceof Blob) {
                    objectUrl = URL.createObjectURL(dbData);
                    // Backfill small preview for future cold starts
                    _saveWallpaperPreviewSmall(dbData, CONFIG.WALLPAPER_SOURCES.CUSTOM);
                } else {
                    // Backward compatibility with old format (base64 string)
                    objectUrl = dbData;
                    _saveWallpaperPreviewSmall(dbData, CONFIG.WALLPAPER_SOURCES.CUSTOM);
                }
                _setWallpaper(objectUrl);
                _updatePreview(objectUrl);
                _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.CUSTOM;
                wallpaperLoaded = true;
            }
        } catch (e) {
            console.error('Error loading wallpaper from IndexedDB:', e);
        }

        // Fallback to localStorage (legacy)
        if (!wallpaperLoaded) {
            const savedWallpaper = localStorage.getItem(CONFIG.STORAGE_KEYS.LEGACY_WALLPAPER);
            if (savedWallpaper) {
                _setWallpaper(savedWallpaper);
                _updatePreview(savedWallpaper);
                _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.CUSTOM;
                wallpaperLoaded = true;
            }
        }

        // If nothing loaded yet, respect saved source preference
        if (!wallpaperLoaded) {
            try {
                // Don't block UI on network; kick off Bing fetch in background when idle
                _runWhenIdle(() => {
                    _applyBingWallpaper().catch((e) => console.warn('Failed to load Bing wallpaper (async):', e));
                }, 1500);
                wallpaperLoaded = true; // allow UI to continue with transparent/previous state
            } catch (e) {
                console.warn('Failed to load preferred wallpaper source:', e);
            }
        }

        // Update source state
        if (wallpaperLoaded) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, _state.wallpaperSource);
        }

        _updateResetButtonState();

        return wallpaperLoaded;
    }

    // ==================== Public API ====================

    /**
     * Initialize the wallpaper manager
     * @returns {Promise<void>}
     */
    async function init() {
        if (_state.isInitialized) {
            console.warn('WallpaperManager already initialized');
            return;
        }

        // 1. Cache DOM elements
        _cacheElements();

        // 2. Load stored settings
        _loadSettings();

        // 3. Bind events
        _bindEvents();

        // 4. Load wallpaper (non-blocking to avoid first-paint stall)
        _loadWallpaper().catch((e) => console.warn('Wallpaper load failed:', e));

        // 4.1 Warm today's Bing cache in background so switching is instant later
        _runWhenIdle(() => {
            _warmBingCache().catch((e) => console.warn('Bing cache warm failed:', e));
        }, 1500);

        // 5. Apply effects
        _applyWallpaperEffects();
        _applySearchBoxSettings();

        // 6. Sync UI
        _syncUI();

        _state.isInitialized = true;
    }

    /**
     * Get current wallpaper settings
     * @returns {{blur: number, vignette: number}}
     */
    function getWallpaperSettings() {
        return { ..._state.wallpaperSettings };
    }

    /**
     * Get search box settings
     * @returns {{width: number, position: number}}
     */
    function getSearchBoxSettings() {
        return { ..._state.searchBoxSettings };
    }

    /**
     * Programmatically set wallpaper (for external use)
     * @param {File} file
     * @returns {Promise<boolean>}
     */
    function setWallpaper(file) {
        return _handleFile(file);
    }

    /**
     * Programmatically reset wallpaper (for external use)
     * @returns {Promise<void>}
     */
    function resetWallpaper() {
        return _resetWallpaper();
    }

    /**
     * Destroy the manager (cleanup resources)
     */
    function destroy() {
        // Release blob URL
        if (_state.currentWallpaperUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(_state.currentWallpaperUrl);
        }

        // Close database connection
        if (_state.dbInstance) {
            _state.dbInstance.close();
            _state.dbInstance = null;
        }

        // Reset state
        _state.isInitialized = false;
        _state.currentWallpaperUrl = null;
    }

    // Expose public API
    return {
        init,
        getWallpaperSettings,
        getSearchBoxSettings,
        setWallpaper,
        resetWallpaper,
        destroy
    };
})();

// Export for global use
window.WallpaperManager = WallpaperManager;

/**
 * You are too concerned with what was and what will be. 
 * There is a saying: Yesterday is history, tomorrow is a mystery, but today is a gift. 
 * That is why it is called the present.
 */