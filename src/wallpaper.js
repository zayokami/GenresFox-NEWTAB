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
        MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
        RETRY_COUNT: 3,
        STORAGE_KEYS: {
            WALLPAPER_SETTINGS: 'wallpaperSettings',
            SEARCH_BOX_SETTINGS: 'searchBoxSettings',
            LEGACY_WALLPAPER: 'wallpaper',
            BING_WALLPAPER_CACHE: 'bingWallpaperCache',
            WALLPAPER_SOURCE: 'wallpaperSource'
        },
        CSS_VARS: {
            WALLPAPER_IMAGE: '--wallpaper-image',
            WALLPAPER_BLUR: '--wallpaper-blur',
            WALLPAPER_VIGNETTE: '--wallpaper-vignette',
            SEARCH_WIDTH: '--search-width',
            SEARCH_POSITION: '--search-position'
        },
        BING_API: {
            // Using a CORS proxy or direct Bing API
            BASE_URL: 'https://www.bing.com',
            API_PATH: '/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US',
            CACHE_DURATION: 6 * 60 * 60 * 1000 // 6 hours in milliseconds
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
        searchBoxSettings: { width: 600, position: 40 },
        wallpaperSource: CONFIG.WALLPAPER_SOURCES.DEFAULT,
        bingWallpaperInfo: null,
        isInitialized: false,
        dbInstance: null
    };

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

            const request = indexedDB.open(CONFIG.DB_NAME, 1);

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
                if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
                    db.createObjectStore(CONFIG.STORE_NAME);
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
        const { width, position } = _state.searchBoxSettings;
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_WIDTH, `${width}px`);
        _setCSSVar(CONFIG.CSS_VARS.SEARCH_POSITION, `${position}vh`);
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

    /**
     * Fetch Bing daily wallpaper info
     * @returns {Promise<Object|null>} Wallpaper info or null on failure
     */
    async function _fetchBingWallpaper() {
        try {
            // Check cache first
            const cached = _getBingWallpaperCache();
            if (cached) {
                return cached;
            }

            // Fetch from Bing API using a CORS proxy
            // Note: Direct Bing API has CORS restrictions, so we use multiple fallback methods
            const wallpaperInfo = await _tryFetchBingWallpaper();
            
            if (wallpaperInfo) {
                _cacheBingWallpaper(wallpaperInfo);
                return wallpaperInfo;
            }

            return null;
        } catch (e) {
            console.warn('Failed to fetch Bing wallpaper:', e);
            return null;
        }
    }

    /**
     * Try multiple methods to fetch Bing wallpaper
     * @returns {Promise<Object|null>}
     */
    async function _tryFetchBingWallpaper() {
        // Method 1: Try direct fetch (may work in some contexts)
        try {
            const response = await fetch(
                `${CONFIG.BING_API.BASE_URL}${CONFIG.BING_API.API_PATH}`,
                { mode: 'cors' }
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
                        date: image.startdate || new Date().toISOString().slice(0, 10).replace(/-/g, '')
                    };
                }
            }
        } catch (e) {
            // Direct fetch failed, try alternative
        }

        // Method 2: Use known Bing wallpaper URL pattern (fallback)
        // Bing wallpapers follow a predictable URL pattern
        try {
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
            
            // Try to load a known working Bing wallpaper URL
            const testUrl = `https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=en-US`;
            
            // Validate URL accessibility by attempting to load as image
            const isAccessible = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                // Set timeout to avoid hanging
                setTimeout(() => resolve(false), 5000);
                img.src = testUrl;
            });
            
            if (!isAccessible) {
                console.warn('Bing wallpaper URL not accessible');
                return null;
            }
            
            return {
                url: testUrl,
                urlHD: `https://bing.biturl.top/?resolution=UHD&format=image&index=0&mkt=en-US`,
                title: 'Bing Daily Wallpaper',
                copyright: '',
                date: dateStr
            };
        } catch (e) {
            console.warn('Bing wallpaper fallback failed:', e);
        }

        return null;
    }

    /**
     * Get cached Bing wallpaper info
     * @returns {Object|null}
     */
    function _getBingWallpaperCache() {
        try {
            const cached = localStorage.getItem(CONFIG.STORAGE_KEYS.BING_WALLPAPER_CACHE);
            if (!cached) return null;

            const data = JSON.parse(cached);
            const now = Date.now();

            // Check if cache is still valid
            if (data.timestamp && (now - data.timestamp) < CONFIG.BING_API.CACHE_DURATION) {
                return data.info;
            }

            // Cache expired
            localStorage.removeItem(CONFIG.STORAGE_KEYS.BING_WALLPAPER_CACHE);
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Cache Bing wallpaper info
     * @param {Object} info - Wallpaper info to cache
     */
    function _cacheBingWallpaper(info) {
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
     * Apply Bing daily wallpaper
     * @returns {Promise<boolean>} Whether successful
     */
    async function _applyBingWallpaper() {
        const wallpaperInfo = await _fetchBingWallpaper();
        
        if (!wallpaperInfo) {
            console.warn('Could not fetch Bing wallpaper');
            return false;
        }

        _state.bingWallpaperInfo = wallpaperInfo;
        
        // Use HD version if available, fallback to regular
        const imageUrl = wallpaperInfo.urlHD || wallpaperInfo.url;
        
        _setWallpaper(imageUrl);
        _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.BING;
        localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, CONFIG.WALLPAPER_SOURCES.BING);

        return true;
    }

    /**
     * Handle uploaded file
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
            await _saveWallpaperToDB(file);

            // Clear legacy localStorage wallpaper
            localStorage.removeItem(CONFIG.STORAGE_KEYS.LEGACY_WALLPAPER);

            const objectUrl = URL.createObjectURL(file);
            _setWallpaper(objectUrl);
            _updatePreview(objectUrl);
            _applyWallpaperEffects();

            // Mark as custom wallpaper
            _state.wallpaperSource = CONFIG.WALLPAPER_SOURCES.CUSTOM;
            localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, CONFIG.WALLPAPER_SOURCES.CUSTOM);

            return true;
        } catch (err) {
            console.error('Failed to save wallpaper:', err);
            alert('Failed to save wallpaper.');
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
        }
        
        // Show upload content and hide preview after reset
        if (_elements.uploadContent) {
            _elements.uploadContent.style.display = 'flex';
        }
        if (_elements.wallpaperPreview) {
            _elements.wallpaperPreview.style.display = 'none';
        }
        // Always show wallpaper controls (Bing wallpaper can also be adjusted)
        if (_elements.wallpaperControls) {
            _elements.wallpaperControls.style.display = 'block';
        }
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
        const value = parseInt(e.target.value, 10);
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
        const value = parseInt(e.target.value, 10);
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
     * Update search box preview in wallpaper settings
     */
    function _updateSearchPreview() {
        if (!_elements.previewSearchBox) return;

        const { width, position } = _state.searchBoxSettings;
        
        // Calculate preview width as percentage (relative to preview container)
        // Map 300-1000px to roughly 30%-90% of preview width
        const previewWidthPercent = Math.min(90, Math.max(30, (width - 300) / 700 * 60 + 30));
        
        _elements.previewSearchBox.style.setProperty('--preview-search-width', `${previewWidthPercent}%`);
        _elements.previewSearchBox.style.setProperty('--preview-search-top', `${position}%`);
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
            searchWidthValue: document.getElementById('searchWidthValue'),
            searchPositionValue: document.getElementById('searchPositionValue')
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

        // Reset button
        if (_elements.resetWallpaper) {
            _elements.resetWallpaper.addEventListener('click', _resetWallpaper);
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
                    width: parsed.width ?? 600,
                    position: parsed.position ?? 40
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
        const { width, position } = _state.searchBoxSettings;

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

        // Check saved wallpaper source preference
        const savedSource = localStorage.getItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE);

        // Try loading custom wallpaper from IndexedDB first
        try {
            const dbData = await _getWallpaperFromDB();
            if (dbData) {
                let objectUrl;
                if (dbData instanceof Blob) {
                    objectUrl = URL.createObjectURL(dbData);
                } else {
                    // Backward compatibility with old format (base64 string)
                    objectUrl = dbData;
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

        // If no custom wallpaper, try Bing daily wallpaper
        if (!wallpaperLoaded) {
            try {
                const bingLoaded = await _applyBingWallpaper();
                if (bingLoaded) {
                    wallpaperLoaded = true;
                    console.log('Loaded Bing daily wallpaper');
                }
            } catch (e) {
                console.warn('Failed to load Bing wallpaper:', e);
            }
        }

        // Update source state
        if (wallpaperLoaded) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.WALLPAPER_SOURCE, _state.wallpaperSource);
        }

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

        // 4. Load wallpaper
        await _loadWallpaper();

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
