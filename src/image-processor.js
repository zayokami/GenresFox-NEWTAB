/**
 * High-Performance Image Processor Module
 * Handles large images with optimized memory management
 * 
 * Features:
 * - Web Worker support for non-blocking processing
 * - Smart resizing based on screen resolution
 * - Progressive/incremental preview rendering
 * - Processing result caching
 * - Chunked processing for large images
 * - Memory leak prevention
 */

const ImageProcessor = (function() {
    'use strict';

    // ==================== Configuration ====================
    const CONFIG = {
        // Maximum dimensions (based on common 4K displays)
        MAX_WIDTH: 3840,
        MAX_HEIGHT: 2160,
        
        // Quality settings
        QUALITY_HIGH: 0.92,
        QUALITY_MEDIUM: 0.85,
        QUALITY_LOW: 0.7,
        QUALITY_PREVIEW: 0.4,
        
        // Preview settings - aggressive downsampling for speed
        PREVIEW_TINY: 100,      // Ultra-fast first preview
        PREVIEW_SMALL: 400,     // Quick preview
        PREVIEW_MEDIUM: 800,    // Better preview
        
        // Processing thresholds
        LARGE_IMAGE_THRESHOLD: 10 * 1024 * 1024,  // 10MB
        HUGE_IMAGE_THRESHOLD: 30 * 1024 * 1024,   // 30MB
        
        // Pixel count limits
        MAX_PIXELS: 80 * 1000 * 1000,  // 80 megapixels max
        
        // Memory management
        CHUNK_SIZE: 2048,
        GC_DELAY: 100,
        
        // Output formats
        OUTPUT_FORMAT: 'image/webp',
        FALLBACK_FORMAT: 'image/jpeg',
        
        // File size limits
        MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
        TARGET_OUTPUT_SIZE: 5 * 1024 * 1024, // 5MB target
        
        // Cache settings
        CACHE_MAX_ENTRIES: 10,
        CACHE_MAX_SIZE: 50 * 1024 * 1024, // 50MB total cache
        
        // WASM settings - auto-enabled for large images
        WASM_ENABLED: false,  // Will be auto-enabled for large images
        WASM_URL: null,       // Set to WASM file path or CDN URL if available
        WASM_AUTO_ENABLE_THRESHOLD: 20 * 1000 * 1000, // 20MP - auto-enable WASM for images larger than this
    };

    // ==================== State ====================
    let _state = {
        isProcessing: false,
        supportsWebP: null,
        supportsOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        activeObjectUrls: new Set(),
        workers: [],
        workerReadyCount: 0,
        workerCallbacks: new Map(),
        callbackId: 0,
        nextWorkerIndex: 0,
        workerQueue: [],
        maxWorkerConcurrent: 2,
        // Worker initialization timeout tracking
        workerInitTimeouts: new Map(), // worker -> timeoutId
        // Callback timeout tracking
        callbackTimeouts: new Map(), // callbackId -> timeoutId
        // WASM state tracking
        wasmState: {
            status: 'unloaded', // 'unloaded' | 'loading' | 'loaded' | 'failed'
            loadingPromise: null, // Promise that resolves when all workers have loaded WASM
            workersLoaded: 0, // Count of workers that have successfully loaded WASM
            totalWorkers: 0 // Total number of workers that should load WASM
        }
    };

    // ==================== Cache ====================
    const _cache = {
        entries: new Map(),  // hash -> { blob, metadata, timestamp, size }
        totalSize: 0,
        
        /**
         * Generate cache key from file and processing options
         * Uses FNV-1a hash algorithm for better collision resistance
         * @param {File} file - The image file
         * @param {Object} options - Processing options (maxWidth, maxHeight)
         * @returns {string} Cache key
         */
        generateKey(file, options = {}) {
            const { maxWidth = CONFIG.MAX_WIDTH, maxHeight = CONFIG.MAX_HEIGHT } = options;
            // Include processing parameters in key to avoid cache collisions
            const keyData = `${file.name}_${file.size}_${file.lastModified}_${maxWidth}_${maxHeight}`;
            
            // FNV-1a hash algorithm (better collision resistance than djb2)
            let hash = 2166136261; // FNV offset basis (32-bit)
            for (let i = 0; i < keyData.length; i++) {
                hash ^= keyData.charCodeAt(i);
                hash = Math.imul(hash, 16777619); // FNV prime (32-bit)
            }
            return `img_${(hash >>> 0).toString(36)}`;
        },
        
        /**
         * Get cached result
         */
        get(key) {
            const entry = this.entries.get(key);
            if (entry) {
                entry.lastAccess = Date.now();
                console.log(`Cache hit for ${key}`);
                return entry;
            }
            return null;
        },
        
        /**
         * Store result in cache
         */
        set(key, blob, metadata) {
            // Evict old entries if needed
            while (this.entries.size >= CONFIG.CACHE_MAX_ENTRIES || 
                   this.totalSize + blob.size > CONFIG.CACHE_MAX_SIZE) {
                if (this.entries.size === 0) break;
                this.evictOldest();
            }
            
            const entry = {
                blob,
                metadata,
                timestamp: Date.now(),
                lastAccess: Date.now(),
                size: blob.size
            };
            
            this.entries.set(key, entry);
            this.totalSize += blob.size;
            console.log(`Cached ${key}, total cache size: ${(this.totalSize / 1024 / 1024).toFixed(2)}MB`);
        },
        
        /**
         * Evict oldest entry
         */
        evictOldest() {
            let oldestKey = null;
            let oldestTime = Infinity;
            
            for (const [key, entry] of this.entries) {
                if (entry.lastAccess < oldestTime) {
                    oldestTime = entry.lastAccess;
                    oldestKey = key;
                }
            }
            
            if (oldestKey) {
                const entry = this.entries.get(oldestKey);
                this.totalSize -= entry.size;
                this.entries.delete(oldestKey);
                console.log(`Evicted cache entry: ${oldestKey}`);
            }
        },
        
        /**
         * Clear all cache
         */
        clear() {
            this.entries.clear();
            this.totalSize = 0;
        }
    };

    // ==================== Web Worker ====================
    
    /**
     * Initialize Web Worker pool
     */
    function _initWorkers() {
        if (!_state.supportsOffscreenCanvas) return;
        if (_state.workers.length > 0) return;

        const cores = navigator.hardwareConcurrency || 4;
        const maxWorkers = Math.max(1, Math.min(4, Math.floor(cores / 2) || 2));
        _state.maxWorkerConcurrent = Math.min(maxWorkers, Math.max(1, Math.floor(cores * 2 / 3))) || maxWorkers;

        for (let i = 0; i < maxWorkers; i++) {
            try {
                const worker = new Worker('image-worker.js');

                worker.onmessage = (e) => {
                    const { type, id, result, error, progress } = e.data;

                    const deliver = () => {
                        switch (type) {
                            case 'loaded': {
                                // Worker script is loaded, now safe to send init message
                                // Clear initialization timeout
                                const timeoutId = _state.workerInitTimeouts.get(worker);
                                if (timeoutId) {
                                    clearTimeout(timeoutId);
                                    _state.workerInitTimeouts.delete(worker);
                                }
                                
                                // Send init message now that worker is ready
                                try {
                                    worker.postMessage({
                                        type: 'init',
                                        id: 0,
                                        data: { 
                                            config: {
                                                ...CONFIG,
                                                // Only pass WASM config if URL is available
                                                WASM_ENABLED: CONFIG.WASM_URL ? CONFIG.WASM_ENABLED : false,
                                                WASM_URL: CONFIG.WASM_URL || null
                                            }
                                        }
                                    });
                                } catch (err) {
                                    console.error('Failed to send init message to worker:', err);
                                    // Remove worker on init failure
                                    const index = _state.workers.indexOf(worker);
                                    if (index > -1) {
                                        _state.workers.splice(index, 1);
                                    }
                                    try {
                                        worker.terminate();
                                    } catch (e) {
                                        // Ignore termination errors
                                    }
                                }
                                return true;
                            }
                            case 'ready':
                                if (!worker.__ready) {
                                    worker.__ready = true;
                                    _state.workerReadyCount++;
                                    // Clear initialization timeout on successful ready
                                    const timeoutId = _state.workerInitTimeouts.get(worker);
                                    if (timeoutId) {
                                        clearTimeout(timeoutId);
                                        _state.workerInitTimeouts.delete(worker);
                                    }
                                }
                                return true;
                            case 'wasmLoaded': {
                                // Worker successfully loaded WASM
                                if (!worker.__wasmLoaded) {
                                    worker.__wasmLoaded = true;
                                    _state.wasmState.workersLoaded++;
                                    // Check if all workers have loaded
                                    if (_state.wasmState.workersLoaded >= _state.wasmState.totalWorkers) {
                                        _state.wasmState.status = 'loaded';
                                        if (_state.wasmState.loadingPromise) {
                                            _state.wasmState.loadingPromise.resolve();
                                            _state.wasmState.loadingPromise = null;
                                        }
                                    }
                                }
                                return true;
                            }
                            case 'wasmLoadFailed': {
                                // Worker failed to load WASM
                                _state.wasmState.workersLoaded++;
                                // Check if all workers have attempted (even if failed)
                                if (_state.wasmState.workersLoaded >= _state.wasmState.totalWorkers) {
                                    if (_state.wasmState.workersLoaded === _state.wasmState.totalWorkers && 
                                        _state.workers.filter(w => w?.__wasmLoaded).length === 0) {
                                        // All workers failed
                                        _state.wasmState.status = 'failed';
                                    } else {
                                        // Some workers succeeded
                                        _state.wasmState.status = 'loaded';
                                    }
                                    if (_state.wasmState.loadingPromise) {
                                        _state.wasmState.loadingPromise.resolve();
                                        _state.wasmState.loadingPromise = null;
                                    }
                                }
                                return true;
                            }
                            case 'progress': {
                                const progressCb = _state.workerCallbacks.get(id);
                                if (progressCb?.onProgress) {
                                    progressCb.onProgress(progress);
                                    return true;
                                }
                                return false;
                            }
                            case 'complete':
                            case 'previewComplete': {
                                const cb = _state.workerCallbacks.get(id);
                                if (cb?.resolve) {
                                    cb.resolve(result);
                                    _state.workerCallbacks.delete(id);
                                    // Clear timeout
                                    const timeoutId = _state.callbackTimeouts.get(id);
                                    if (timeoutId) {
                                        clearTimeout(timeoutId);
                                        _state.callbackTimeouts.delete(id);
                                    }
                                }
                                worker.__busy = false;
                                _dispatchAllPendingTasks();
                                return true;
                            }
                            case 'error': {
                                const errCb = _state.workerCallbacks.get(id);
                                if (errCb?.reject) {
                                    errCb.reject(new Error(error));
                                    _state.workerCallbacks.delete(id);
                                    // Clear timeout
                                    const timeoutId = _state.callbackTimeouts.get(id);
                                    if (timeoutId) {
                                        clearTimeout(timeoutId);
                                        _state.callbackTimeouts.delete(id);
                                    }
                                }
                                worker.__busy = false;
                                _dispatchAllPendingTasks();
                                return true;
                            }
                        }
                        return true;
                    };

                    if (!deliver()) {
                        queueMicrotask(() => {
                            if (!deliver()) {
                                console.warn(`Worker message without callback (id=${id}, type=${type})`);
                                // Clean up callback to prevent memory leak
                                _state.workerCallbacks.delete(id);
                                // Clear timeout if exists
                                const timeoutId = _state.callbackTimeouts.get(id);
                                if (timeoutId) {
                                    clearTimeout(timeoutId);
                                    _state.callbackTimeouts.delete(id);
                                }
                            }
                        });
                    }
                };

                worker.onerror = (e) => {
                    console.error('Worker error:', e);
                    
                    // Clean up initialization timeout if exists
                    const initTimeoutId = _state.workerInitTimeouts.get(worker);
                    if (initTimeoutId) {
                        clearTimeout(initTimeoutId);
                        _state.workerInitTimeouts.delete(worker);
                    }
                    
                    // Clean up all callbacks for this worker to prevent memory leaks
                    // Find callbacks that might be waiting on this worker
                    for (const [callbackId, callback] of _state.workerCallbacks.entries()) {
                        // Reject pending callbacks
                        if (callback.reject) {
                            callback.reject(new Error('Worker crashed or failed'));
                        }
                        _state.workerCallbacks.delete(callbackId);
                        // Clear timeout
                        const timeoutId = _state.callbackTimeouts.get(callbackId);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            _state.callbackTimeouts.delete(callbackId);
                        }
                    }
                    
                    if (worker.__ready) {
                        worker.__ready = false;
                        _state.workerReadyCount = Math.max(0, _state.workerReadyCount - 1);
                    }
                    worker.__busy = false;
                    _dispatchAllPendingTasks();
                };

                worker.__ready = false;
                worker.__busy = false;
                worker.__wasmLoaded = false;
                worker.__initStartTime = Date.now(); // Track initialization start time
                _state.workers.push(worker);

                // Set up initialization timeout (10 seconds)
                // If worker doesn't respond with 'ready' within timeout, mark as failed
                const initTimeoutId = setTimeout(() => {
                    if (!worker.__ready) {
                        console.warn(`Worker initialization timeout after 10s, removing worker`);
                        // Remove worker from pool
                        const index = _state.workers.indexOf(worker);
                        if (index > -1) {
                            _state.workers.splice(index, 1);
                        }
                        // Clean up
                        try {
                            worker.terminate();
                        } catch (e) {
                            // Ignore termination errors
                        }
                        _state.workerInitTimeouts.delete(worker);
                    }
                }, 10000); // 10 second timeout
                _state.workerInitTimeouts.set(worker, initTimeoutId);

                // Note: We don't send init message here anymore
                // Instead, we wait for 'loaded' message from worker (handled in onmessage handler above)
                // This avoids race condition where init message is sent before worker script is ready
            } catch (e) {
                console.warn('Failed to create Worker:', e);
            }
        }
    }
    
    /**
     * Assign a task to a specific worker
     * @param {Worker} worker - The worker to assign the task to
     * @param {Object} task - The task object
     */
    function _assignTaskToWorker(worker, task) {
        const { type, data, onProgress, resolve, reject, transfers } = task;

        const id = ++_state.callbackId;
        _state.workerCallbacks.set(id, { resolve, reject, onProgress });
        worker.__busy = true;

        // Set up timeout for callback (60 seconds)
        // Prevents memory leaks if worker crashes or hangs
        const timeoutId = setTimeout(() => {
            if (_state.workerCallbacks.has(id)) {
                const cb = _state.workerCallbacks.get(id);
                console.warn(`Worker task timeout after 60s (id=${id}, type=${type})`);
                if (cb?.reject) {
                    cb.reject(new Error('Worker task timeout after 60 seconds'));
                }
                _state.workerCallbacks.delete(id);
                worker.__busy = false;
                _dispatchAllPendingTasks();
            }
            _state.callbackTimeouts.delete(id);
        }, 60000); // 60 second timeout
        _state.callbackTimeouts.set(id, timeoutId);

        try {
            if (transfers && transfers.length > 0) {
                worker.postMessage({ type, id, data }, transfers);
            } else {
                worker.postMessage({ type, id, data });
            }
        } catch (err) {
            // Clear timeout on immediate error
            const timeoutId = _state.callbackTimeouts.get(id);
            if (timeoutId) {
                clearTimeout(timeoutId);
                _state.callbackTimeouts.delete(id);
            }
            _state.workerCallbacks.delete(id);
            worker.__busy = false;
            reject(err);
            queueMicrotask(_dispatchAllPendingTasks);
        }
    }

    /**
     * Dispatch all pending tasks to available workers (batch processing)
     * More efficient than dispatching one at a time
     */
    function _dispatchAllPendingTasks() {
        if (_state.workerQueue.length === 0) return;

        // Get all free workers
        const freeWorkers = _state.workers.filter(w => w && w.__ready && !w.__busy);
        if (freeWorkers.length === 0) return;

        // Respect max concurrent busy workers
        const busyCount = _state.workers.filter(w => w && w.__busy).length;
        const availableSlots = _state.maxWorkerConcurrent - busyCount;
        if (availableSlots <= 0) return;

        // Dispatch tasks to available workers (up to available slots)
        const tasksToDispatch = Math.min(
            _state.workerQueue.length,
            freeWorkers.length,
            availableSlots
        );

        for (let i = 0; i < tasksToDispatch; i++) {
            const task = _state.workerQueue.shift();
            const worker = freeWorkers[i];
            _assignTaskToWorker(worker, task);
        }
    }

    /**
     * Dispatch queued tasks to an available worker (legacy function, kept for compatibility)
     * @deprecated Use _dispatchAllPendingTasks instead
     */
    function _dispatchNextWorkerTask() {
        _dispatchAllPendingTasks();
    }

    /**
     * Enqueue a task to worker pool
     */
    function _workerProcess(type, data, onProgress, transfers = []) {
        return new Promise((resolve, reject) => {
            if (_state.workerReadyCount === 0 || _state.workers.length === 0) {
                reject(new Error('Worker not available'));
                return;
            }
            _state.workerQueue.push({ type, data, onProgress, resolve, reject, transfers });
            _dispatchAllPendingTasks();
        });
    }

    // ==================== Utility Functions ====================

    /**
     * Check if browser supports WebP encoding
     */
    async function _checkWebPSupport() {
        if (_state.supportsWebP !== null) return _state.supportsWebP;
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const dataUrl = canvas.toDataURL('image/webp');
            _state.supportsWebP = dataUrl.startsWith('data:image/webp');
        } catch (e) {
            _state.supportsWebP = false;
        }
        return _state.supportsWebP;
    }

    /**
     * Get optimal output format
     */
    async function _getOutputFormat() {
        return await _checkWebPSupport() ? CONFIG.OUTPUT_FORMAT : CONFIG.FALLBACK_FORMAT;
    }

    /**
     * Calculate optimal dimensions
     */
    function _calculateDimensions(width, height, maxWidth, maxHeight) {
        const screenWidth = Math.min(maxWidth, window.screen.width * (window.devicePixelRatio || 1));
        const screenHeight = Math.min(maxHeight, window.screen.height * (window.devicePixelRatio || 1));
        
        const targetWidth = Math.min(screenWidth, maxWidth);
        const targetHeight = Math.min(screenHeight, maxHeight);
        
        if (width <= targetWidth && height <= targetHeight) {
            return { width, height };
        }
        
        const scaleX = targetWidth / width;
        const scaleY = targetHeight / height;
        const scale = Math.min(scaleX, scaleY);
        
        return {
            width: Math.round(width * scale),
            height: Math.round(height * scale)
        };
    }

    /**
     * Create tracked object URL
     */
    function _createTrackedObjectUrl(blob) {
        const url = URL.createObjectURL(blob);
        _state.activeObjectUrls.add(url);
        return url;
    }

    /**
     * Revoke tracked object URL
     */
    function _revokeTrackedObjectUrl(url) {
        if (url && _state.activeObjectUrls.has(url)) {
            URL.revokeObjectURL(url);
            _state.activeObjectUrls.delete(url);
        }
    }

    /**
     * Clean up all tracked object URLs
     */
    function _cleanupAllObjectUrls() {
        _state.activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
        _state.activeObjectUrls.clear();
    }

    /**
     * Hint garbage collection
     */
    function _hintGC() {
        return new Promise(resolve => {
            setTimeout(() => {
                if (typeof gc === 'function') gc();
                resolve();
            }, CONFIG.GC_DELAY);
        });
    }

    // ==================== Image Loading ====================

    /**
     * Load image from file
     */
    async function _loadImageFromFile(file, onProgress) {
        return new Promise((resolve, reject) => {
            const url = _createTrackedObjectUrl(file);
            const img = new Image();
            
            img.onload = () => {
                if (onProgress) onProgress(30);
                resolve(img);
            };
            
            img.onerror = () => {
                _revokeTrackedObjectUrl(url);
                reject(new Error('Failed to load image'));
            };
            
            img.src = url;
        });
    }

    /**
     * Get ImageData from image (for Worker transfer)
     */
    async function _getImageData(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        canvas.width = 0;
        canvas.height = 0;
        return imageData;
    }

    /**
     * Get scaled ImageData at target dimensions (reduces memory for huge sources)
     */
    async function _getScaledImageData(img, targetWidth, targetHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        canvas.width = 0;
        canvas.height = 0;
        return imageData;
    }

    // ==================== Canvas Processing ====================

    /**
     * Create canvas with optimal settings
     */
    function _createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
            willReadFrequently: false
        });
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        return { canvas, ctx };
    }

    /**
     * Process image in chunks
     */
    async function _processInChunks(img, targetWidth, targetHeight, onProgress) {
        const { canvas: finalCanvas, ctx: finalCtx } = _createCanvas(targetWidth, targetHeight);

        // Reuse a single temp canvas to avoid repeated allocations
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
            willReadFrequently: false
        });
        
        const scaleX = targetWidth / img.width;
        const scaleY = targetHeight / img.height;
        
        const chunkSize = CONFIG.CHUNK_SIZE;
        const chunksX = Math.ceil(img.width / chunkSize);
        const chunksY = Math.ceil(img.height / chunkSize);
        const totalChunks = chunksX * chunksY;
        let processedChunks = 0;
        
        for (let cy = 0; cy < chunksY; cy++) {
            for (let cx = 0; cx < chunksX; cx++) {
                const sx = cx * chunkSize;
                const sy = cy * chunkSize;
                const sw = Math.min(chunkSize, img.width - sx);
                const sh = Math.min(chunkSize, img.height - sy);
                
                const dx = Math.round(sx * scaleX);
                const dy = Math.round(sy * scaleY);
                const dw = Math.max(1, Math.round(sw * scaleX));
                const dh = Math.max(1, Math.round(sh * scaleY));
                
                if (dw >= 1 && dh >= 1) {
                    tempCanvas.width = dw;
                    tempCanvas.height = dh;
                    tempCtx.imageSmoothingEnabled = true;
                    tempCtx.imageSmoothingQuality = 'high';
                    try {
                        tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
                        finalCtx.drawImage(tempCanvas, dx, dy);
                    } catch (e) {
                        console.warn(`Chunk (${cx}, ${cy}) failed:`, e);
                    }
                }
                
                processedChunks++;
                if (onProgress && processedChunks % 4 === 0) {
                    onProgress(35 + Math.round((processedChunks / totalChunks) * 40));
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
        
        // Cleanup temp canvas
        tempCanvas.width = 0;
        tempCanvas.height = 0;

        return finalCanvas;
    }

    /**
     * Direct processing
     */
    function _processDirect(img, targetWidth, targetHeight) {
        const { canvas, ctx } = _createCanvas(targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        return canvas;
    }

    /**
     * Multi-step downscaling
     * Optimized to reuse two canvases alternately to avoid memory accumulation
     * For multi-step scaling (e.g., 16K → 8K → 4K → 2K → 1K), this ensures
     * only two canvases exist at any time instead of accumulating all intermediate canvases
     */
    function _processWithSteps(img, targetWidth, targetHeight) {
        let currentWidth = img.width;
        let currentHeight = img.height;
        let source = img;
        
        // Use two canvases alternately to avoid memory accumulation
        // canvasA and canvasB will be reused in each iteration
        let canvasA = null;
        let canvasB = null;
        let useA = true; // Toggle between canvasA and canvasB
        
        while (currentWidth > targetWidth * 2 || currentHeight > targetHeight * 2) {
            const stepWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
            const stepHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
            
            // Select which canvas to use for this step
            const targetCanvas = useA ? canvasA : canvasB;
            const targetCtx = targetCanvas?.getContext('2d');
            
            // Create or reuse canvas
            if (!targetCanvas || targetCanvas.width !== stepWidth || targetCanvas.height !== stepHeight) {
                if (useA) {
                    if (canvasA) {
                        canvasA.width = 0;
                        canvasA.height = 0;
                    }
                    canvasA = document.createElement('canvas');
                    canvasA.width = stepWidth;
                    canvasA.height = stepHeight;
                    const ctx = canvasA.getContext('2d', {
                        alpha: false,
                        desynchronized: true,
                        willReadFrequently: false
                    });
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(source, 0, 0, stepWidth, stepHeight);
                } else {
                    if (canvasB) {
                        canvasB.width = 0;
                        canvasB.height = 0;
                    }
                    canvasB = document.createElement('canvas');
                    canvasB.width = stepWidth;
                    canvasB.height = stepHeight;
                    const ctx = canvasB.getContext('2d', {
                        alpha: false,
                        desynchronized: true,
                        willReadFrequently: false
                    });
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(source, 0, 0, stepWidth, stepHeight);
                }
            } else {
                // Reuse existing canvas
                targetCtx.drawImage(source, 0, 0, stepWidth, stepHeight);
            }
            
            // Clean up previous intermediate canvas if it exists
            if (source !== img && source.width) {
                source.width = 0;
                source.height = 0;
            }
            
            // Set source to the canvas we just drew to
            source = useA ? canvasA : canvasB;
            currentWidth = stepWidth;
            currentHeight = stepHeight;
            
            // Toggle for next iteration
            useA = !useA;
        }
        
        // Final step: scale to exact target dimensions if needed
        let finalCanvas;
        if (currentWidth !== targetWidth || currentHeight !== targetHeight) {
            finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetWidth;
            finalCanvas.height = targetHeight;
            const finalCtx = finalCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true,
                willReadFrequently: false
            });
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.drawImage(source, 0, 0, targetWidth, targetHeight);
            
            // Clean up intermediate canvas
            if (source !== img && source.width) {
                source.width = 0;
                source.height = 0;
            }
        } else {
            // No final scaling needed, use the last step's canvas
            finalCanvas = source;
        }
        
        // Clean up unused canvas
        if (canvasA && canvasA !== finalCanvas) {
            canvasA.width = 0;
            canvasA.height = 0;
        }
        if (canvasB && canvasB !== finalCanvas) {
            canvasB.width = 0;
            canvasB.height = 0;
        }
        
        return finalCanvas;
    }

    // ==================== Output Generation ====================

    /**
     * Convert canvas to blob
     */
    async function _canvasToBlob(canvas, quality) {
        const format = await _getOutputFormat();
        
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Blob conversion failed')),
                format,
                quality
            );
        });
    }

    /**
     * Optimize blob size
     */
    async function _optimizeBlobSize(canvas, targetSize) {
        let quality = CONFIG.QUALITY_HIGH;
        let blob = await _canvasToBlob(canvas, quality);
        
        if (blob.size <= targetSize) return blob;
        
        let minQuality = 0.3;
        let maxQuality = quality;
        
        for (let i = 0; i < 5; i++) {
            quality = (minQuality + maxQuality) / 2;
            blob = await _canvasToBlob(canvas, quality);
            
            if (blob.size > targetSize) {
                maxQuality = quality;
            } else if (blob.size < targetSize * 0.8) {
                minQuality = quality;
            } else {
                break;
            }
        }
        
        return blob;
    }

    // ==================== Progressive Preview ====================

    /**
     * Generate incremental previews (tiny -> small -> medium)
     * Returns immediately with tiny preview, then upgrades
     */
    async function generateProgressivePreview(file, onPreviewUpdate) {
        const img = await _loadImageFromFile(file);
        const cleanups = [];
        
        // Stage 1: Tiny preview (instant)
        const tinyDims = _calculateDimensions(img.width, img.height, CONFIG.PREVIEW_TINY, CONFIG.PREVIEW_TINY);
        const tinyCanvas = _processDirect(img, tinyDims.width, tinyDims.height);
        const tinyBlob = await _canvasToBlob(tinyCanvas, 0.3);
        tinyCanvas.width = 0;
        tinyCanvas.height = 0;
        
        const tinyUrl = _createTrackedObjectUrl(tinyBlob);
        cleanups.push(() => _revokeTrackedObjectUrl(tinyUrl));
        
        if (onPreviewUpdate) {
            onPreviewUpdate(tinyUrl, 'tiny', tinyDims.width, tinyDims.height);
        }
        
        // Stage 2: Small preview (quick)
        await new Promise(r => setTimeout(r, 10)); // Yield
        
        const smallDims = _calculateDimensions(img.width, img.height, CONFIG.PREVIEW_SMALL, CONFIG.PREVIEW_SMALL);
        const smallCanvas = _processDirect(img, smallDims.width, smallDims.height);
        const smallBlob = await _canvasToBlob(smallCanvas, 0.5);
        smallCanvas.width = 0;
        smallCanvas.height = 0;
        
        const smallUrl = _createTrackedObjectUrl(smallBlob);
        cleanups.push(() => _revokeTrackedObjectUrl(smallUrl));
        
        if (onPreviewUpdate) {
            onPreviewUpdate(smallUrl, 'small', smallDims.width, smallDims.height);
        }
        
        // Stage 3: Medium preview (better quality)
        await new Promise(r => setTimeout(r, 50)); // Yield more
        
        const mediumDims = _calculateDimensions(img.width, img.height, CONFIG.PREVIEW_MEDIUM, CONFIG.PREVIEW_MEDIUM);
        const mediumCanvas = _processDirect(img, mediumDims.width, mediumDims.height);
        const mediumBlob = await _canvasToBlob(mediumCanvas, CONFIG.QUALITY_PREVIEW);
        mediumCanvas.width = 0;
        mediumCanvas.height = 0;
        
        const mediumUrl = _createTrackedObjectUrl(mediumBlob);
        cleanups.push(() => _revokeTrackedObjectUrl(mediumUrl));
        
        if (onPreviewUpdate) {
            onPreviewUpdate(mediumUrl, 'medium', mediumDims.width, mediumDims.height);
        }
        
        _revokeTrackedObjectUrl(img.src);
        
        return {
            url: mediumUrl,
            width: img.width,
            height: img.height,
            cleanup: () => cleanups.forEach(fn => fn())
        };
    }

    /**
     * Simple preview (single stage)
     */
    async function generatePreview(file) {
        const img = await _loadImageFromFile(file);
        const dims = _calculateDimensions(img.width, img.height, CONFIG.PREVIEW_MEDIUM, CONFIG.PREVIEW_MEDIUM);
        
        const canvas = _processDirect(img, dims.width, dims.height);
        const blob = await _canvasToBlob(canvas, CONFIG.QUALITY_PREVIEW);
        
        canvas.width = 0;
        canvas.height = 0;
        _revokeTrackedObjectUrl(img.src);
        
        const url = _createTrackedObjectUrl(blob);
        
        return {
            url,
            width: img.width,
            height: img.height,
            cleanup: () => _revokeTrackedObjectUrl(url)
        };
    }

    // ==================== Main Processing ====================

    /**
     * Process image (with Worker if available, otherwise main thread)
     */
    async function processImage(file, options = {}) {
        if (_state.isProcessing) {
            throw new Error('Already processing an image');
        }
        
        _state.isProcessing = true;
        const startTime = performance.now();
        
        const {
            onProgress = () => {},
            onPreview = () => {},
            onPreviewUpdate = null,
            maxWidth = CONFIG.MAX_WIDTH,
            maxHeight = CONFIG.MAX_HEIGHT,
            useCache = true,
            useWorker = true
        } = options;

        try {
            // Validate file size
            if (file.size > CONFIG.MAX_FILE_SIZE) {
                throw new Error(`File too large. Maximum: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
            }
            
            // Check cache (include processing parameters in key)
            if (useCache) {
                const cacheKey = _cache.generateKey(file, { maxWidth, maxHeight });
                const cached = _cache.get(cacheKey);
                if (cached) {
                    onProgress(100);
                    return {
                        blob: cached.blob,
                        ...cached.metadata,
                        fromCache: true
                    };
                }
            }
            
            onProgress(5);
            
            // Generate progressive preview
            let preview;
            if (onPreviewUpdate) {
                preview = await generateProgressivePreview(file, onPreviewUpdate);
            } else {
                preview = await generatePreview(file);
                onPreview(preview.url);
            }
            
            onProgress(15);
            
            // Load full image
            const img = await _loadImageFromFile(file, onProgress);
            const originalWidth = img.width;
            const originalHeight = img.height;
            const totalPixels = originalWidth * originalHeight;
            
            // Check pixel limit
            if (totalPixels > CONFIG.MAX_PIXELS) {
                const mp = (totalPixels / 1000000).toFixed(1);
                const maxMP = (CONFIG.MAX_PIXELS / 1000000).toFixed(0);
                _revokeTrackedObjectUrl(img.src);
                preview.cleanup();
                throw new Error(`Resolution too high (${mp}MP). Max: ${maxMP}MP`);
            }
            
            onProgress(35);
            
            // Calculate target dimensions
            const { width: targetWidth, height: targetHeight } = _calculateDimensions(
                img.width, img.height, maxWidth, maxHeight
            );
            
            // Auto-enable WASM for large images if WASM URL is available
            if (CONFIG.WASM_URL && totalPixels >= CONFIG.WASM_AUTO_ENABLE_THRESHOLD) {
                // Enable WASM in all workers if not already enabled or loading
                if (_state.wasmState.status === 'unloaded' || _state.wasmState.status === 'failed') {
                    _state.wasmState.status = 'loading';
                    _state.wasmState.workersLoaded = 0;
                    _state.wasmState.totalWorkers = _state.workers.filter(w => w && w.__ready).length;
                    
                    if (_state.wasmState.totalWorkers === 0) {
                        console.warn('[ImageProcessor] No ready workers available for WASM loading');
                        _state.wasmState.status = 'failed';
                    } else {
                        CONFIG.WASM_ENABLED = true;
                        
                        // Create promise to wait for WASM loading
                        let resolvePromise;
                        _state.wasmState.loadingPromise = {
                            promise: new Promise(resolve => {
                                resolvePromise = resolve;
                            }),
                            resolve: resolvePromise
                        };
                        
                        // Notify all ready workers to load WASM
                        _state.workers.forEach(worker => {
                            if (worker && worker.__ready) {
                                worker.postMessage({
                                    type: 'init',
                                    id: 0,
                                    data: { 
                                        config: { 
                                            WASM_ENABLED: true, 
                                            WASM_URL: CONFIG.WASM_URL 
                                        } 
                                    }
                                });
                            }
                        });
                        
                        console.log(`[ImageProcessor] Auto-enabling WASM for large image (${(totalPixels / 1000000).toFixed(1)}MP), waiting for workers to load...`);
                        
                        // Wait for WASM to load (with timeout)
                        try {
                            await Promise.race([
                                _state.wasmState.loadingPromise.promise,
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('WASM loading timeout')), 5000)
                                )
                            ]);
                            console.log(`[ImageProcessor] WASM loaded successfully in ${_state.workers.filter(w => w?.__wasmLoaded).length}/${_state.wasmState.totalWorkers} workers`);
                        } catch (err) {
                            console.warn(`[ImageProcessor] WASM loading timeout or failed:`, err.message);
                            // Continue with fallback - some workers may have loaded WASM
                        }
                    }
                } else if (_state.wasmState.status === 'loading') {
                    // WASM is already loading, wait for it
                    try {
                        await Promise.race([
                            _state.wasmState.loadingPromise?.promise || Promise.resolve(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('WASM loading timeout')), 5000)
                            )
                        ]);
                    } catch (err) {
                        console.warn(`[ImageProcessor] WASM loading timeout:`, err.message);
                    }
                }
                // If status is 'loaded', WASM is ready, proceed normally
            }
            
            let blob;
            let usedWorker = false;
            
            // Try Worker first if available and enabled
            if (useWorker && _state.workerReadyCount > 0 && _state.supportsOffscreenCanvas) {
                try {
                    // Determine processing strategy based on WASM availability
                    const wasmAvailable = _state.wasmState.status === 'loaded' && 
                                        _state.workers.some(w => w?.__wasmLoaded);
                    
                    let bitmap;
                    let workerData;
                    
                    if (wasmAvailable) {
                        // Path A: WASM available - pass original bitmap, let Worker use WASM for scaling
                        // This leverages WASM's superior performance for large images
                        console.log('Processing with Worker + WASM (original bitmap, WASM scaling)');
                        bitmap = await createImageBitmap(img);
                        _revokeTrackedObjectUrl(img.src);
                        
                        workerData = {
                            imageBitmap: bitmap,
                            maxWidth: targetWidth,
                            maxHeight: targetHeight,
                            screenWidth: window.screen.width * (window.devicePixelRatio || 1),
                            screenHeight: window.screen.height * (window.devicePixelRatio || 1),
                            format: await _getOutputFormat(),
                            alreadyScaled: false, // Worker will scale using WASM
                            originalWidth,
                            originalHeight
                        };
                    } else {
                        // Path B: WASM not available - use browser's native high-quality scaling
                        // Then pass scaled bitmap to Worker for format conversion only
                        console.log('Processing with Worker (browser-scaled bitmap, format conversion)');
                        bitmap = await createImageBitmap(img, {
                            resizeWidth: targetWidth,
                            resizeHeight: targetHeight,
                            resizeQuality: 'high'
                        });
                        _revokeTrackedObjectUrl(img.src);
                        
                        workerData = {
                            imageBitmap: bitmap,
                            maxWidth: bitmap.width,  // Use actual bitmap dimensions
                            maxHeight: bitmap.height,
                            screenWidth: window.screen.width * (window.devicePixelRatio || 1),
                            screenHeight: window.screen.height * (window.devicePixelRatio || 1),
                            format: await _getOutputFormat(),
                            alreadyScaled: true, // Already scaled by browser
                            originalWidth,
                            originalHeight
                        };
                    }
                    
                    const result = await _workerProcess('process', workerData, onProgress, [bitmap]);
                    
                    blob = result.blob;
                    usedWorker = true;
                    onProgress(95);
                    
                } catch (workerError) {
                    console.warn('Worker processing failed, falling back to main thread:', workerError);
                    // Fall through to main thread processing
                }
            }
            
            // Main thread processing (fallback or primary)
            if (!blob) {
                let canvas;
                
                // Choose processing strategy based on pixel count and scale factor
                // This is more accurate than file size (8K images may be compressed <30MB)
                const scaleFactorX = img.width / targetWidth;
                const scaleFactorY = img.height / targetHeight;
                const maxScaleFactor = Math.max(scaleFactorX, scaleFactorY);
                
                // Use multi-step scaling for large scale factors or large pixel counts
                // Chunked processing has seam artifacts, so prefer multi-step
                if (totalPixels > 20 * 1000 * 1000 || maxScaleFactor > 3) {
                    // 20MP+ or >3x scaling: use multi-step (no artifacts, better quality)
                    console.log(`Using multi-step processing (${(totalPixels / 1000000).toFixed(1)}MP, ${maxScaleFactor.toFixed(1)}x scale)`);
                    canvas = _processWithSteps(img, targetWidth, targetHeight);
                    onProgress(70);
                } else if (totalPixels > 10 * 1000 * 1000 || maxScaleFactor > 2) {
                    // 10-20MP or >2x scaling: use multi-step for quality
                    console.log(`Using multi-step processing (${(totalPixels / 1000000).toFixed(1)}MP, ${maxScaleFactor.toFixed(1)}x scale)`);
                    canvas = _processWithSteps(img, targetWidth, targetHeight);
                    onProgress(70);
                } else {
                    // Smaller images: direct processing is fastest
                    console.log('Using direct processing');
                    canvas = _processDirect(img, targetWidth, targetHeight);
                    onProgress(70);
                }
                
                _revokeTrackedObjectUrl(img.src);
                onProgress(75);
                
                blob = await _optimizeBlobSize(canvas, CONFIG.TARGET_OUTPUT_SIZE);
                canvas.width = 0;
                canvas.height = 0;
            }
            
            onProgress(90);
            
            preview.cleanup();
            await _hintGC();
            
            onProgress(100);
            
            const endTime = performance.now();
            const result = {
                blob,
                width: targetWidth,
                height: targetHeight,
                originalWidth,
                originalHeight,
                originalSize: file.size,
                processedSize: blob.size,
                compressionRatio: (1 - blob.size / file.size) * 100,
                processingTime: Math.round(endTime - startTime)
            };
            
            console.log(`Processed in ${result.processingTime}ms: ${file.size} ${blob.size} bytes`);
            
            // Cache result (include processing parameters in key)
            if (useCache) {
                const cacheKey = _cache.generateKey(file, { maxWidth, maxHeight });
                _cache.set(cacheKey, blob, {
                    width: targetWidth,
                    height: targetHeight,
                    originalWidth,
                    originalHeight,
                    originalSize: file.size,
                    processedSize: blob.size,
                    compressionRatio: result.compressionRatio
                });
            }
            
            return result;
            
        } finally {
            _state.isProcessing = false;
        }
    }

    /**
     * Process image and return URL
     */
    async function processImageToUrl(file, options = {}) {
        const result = await processImage(file, options);
        const url = _createTrackedObjectUrl(result.blob);
        
        return {
            ...result,
            url,
            cleanup: () => _revokeTrackedObjectUrl(url)
        };
    }

    // ==================== Cleanup & Init ====================

    /**
     * Clean up all resources
     */
    function cleanup() {
        _cleanupAllObjectUrls();
        _cache.clear();
        _state.isProcessing = false;
    }

    /**
     * Initialize module
     */
    function init() {
        _initWorkers();
        _checkWebPSupport();
        
        // Auto-load local WASM file if available
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                const wasmUrl = chrome.runtime.getURL('resize.wasm');
                setWasmUrl(wasmUrl);
            }
        } catch (e) {
            // WASM file not available, will use Canvas fallback
            // Silently fail - this is expected if WASM file doesn't exist
        }
    }
    
    /**
     * Set WASM URL for high-performance image processing
     * WASM will be automatically enabled for images larger than WASM_AUTO_ENABLE_THRESHOLD (20MP)
     * 
     * @param {string} wasmUrl - URL to the WASM file (must export resize_rgba function)
     * @example
     * // Set WASM URL (e.g., from CDN or local file)
     * ImageProcessor.setWasmUrl('https://cdn.example.com/resize.wasm');
     * // Or local file (must be in extension's web_accessible_resources)
     * ImageProcessor.setWasmUrl('resize.wasm');
     */
    function setWasmUrl(wasmUrl) {
        if (!wasmUrl || typeof wasmUrl !== 'string') {
            console.warn('[ImageProcessor] Invalid WASM URL provided');
            return;
        }
        
        CONFIG.WASM_URL = wasmUrl;
        CONFIG.WASM_ENABLED = false; // Will be auto-enabled for large images
        
        // Reset WASM state
        _state.wasmState.status = 'unloaded';
        _state.wasmState.workersLoaded = 0;
        _state.wasmState.totalWorkers = 0;
        _state.wasmState.loadingPromise = null;
        
        // Reset worker WASM flags
        _state.workers.forEach(worker => {
            if (worker) {
                worker.__wasmLoaded = false;
            }
        });
        
        // Notify existing workers about WASM URL (but don't load yet)
        _state.workers.forEach(worker => {
            if (worker && worker.__ready) {
                worker.postMessage({
                    type: 'init',
                    id: 0,
                    data: { 
                        config: { 
                            WASM_ENABLED: false, // Don't auto-load, wait for large image
                            WASM_URL: wasmUrl 
                        } 
                    }
                });
            }
        });
        
        console.log(`[ImageProcessor] WASM URL set: ${wasmUrl} (will auto-enable for images > ${CONFIG.WASM_AUTO_ENABLE_THRESHOLD / 1000000}MP)`);
    }

    // ==================== Public API ====================
    return {
        // Main functions
        processImage,
        processImageToUrl,
        generatePreview,
        generateProgressivePreview,
        
        // Configuration
        setWasmUrl,
        
        // Cleanup
        cleanup,
        revokeUrl: _revokeTrackedObjectUrl,
        
        // Cache
        clearCache: () => _cache.clear(),
        getCacheStats: () => ({
            entries: _cache.entries.size,
            totalSize: _cache.totalSize
        }),
        
        // Utilities
        calculateDimensions: _calculateDimensions,
        
        // Configuration
        getConfig: () => ({ ...CONFIG }),
        setMaxDimensions: (width, height) => {
            if (width > 0) CONFIG.MAX_WIDTH = width;
            if (height > 0) CONFIG.MAX_HEIGHT = height;
        },
        
        // State
        isProcessing: () => _state.isProcessing,
        getActiveUrlCount: () => _state.activeObjectUrls.size,
        isWorkerAvailable: () => _state.workerReadyCount > 0,
        
        // WASM status
        getWasmStatus: () => ({
            available: CONFIG.WASM_URL !== null,
            enabled: CONFIG.WASM_ENABLED,
            status: _state.wasmState.status, // 'unloaded' | 'loading' | 'loaded' | 'failed'
            threshold: CONFIG.WASM_AUTO_ENABLE_THRESHOLD,
            workersLoaded: _state.workers.filter(w => w?.__wasmLoaded).length,
            totalWorkers: _state.workers.length
        }),
        
        // Manual init
        init
    };
})();

// Export
if (typeof window !== 'undefined') {
    window.ImageProcessor = ImageProcessor;
}

/**
 * Give a civilisation to the years, not years to a civilisation. 
 * 给岁月以文明，而不是给文明以岁月。
 * From "The Three-Body Problem: Death's End".
 * 出自《三体：死神永生》
*/