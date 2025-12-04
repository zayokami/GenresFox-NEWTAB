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
        MAX_PIXELS: 50 * 1000 * 1000,  // 50 megapixels max
        
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
    };

    // ==================== State ====================
    let _state = {
        isProcessing: false,
        supportsWebP: null,
        supportsOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        activeObjectUrls: new Set(),
        worker: null,
        workerReady: false,
        workerCallbacks: new Map(),
        callbackId: 0
    };

    // ==================== Cache ====================
    const _cache = {
        entries: new Map(),  // hash -> { blob, metadata, timestamp, size }
        totalSize: 0,
        
        /**
         * Generate cache key from file
         */
        async generateKey(file) {
            // Use file name + size + last modified as key
            const keyData = `${file.name}_${file.size}_${file.lastModified}`;
            
            // Simple hash function
            let hash = 0;
            for (let i = 0; i < keyData.length; i++) {
                const char = keyData.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return `img_${Math.abs(hash).toString(36)}`;
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
     * Initialize Web Worker
     */
    function _initWorker() {
        if (_state.worker || !_state.supportsOffscreenCanvas) return;
        
        try {
            _state.worker = new Worker('image-worker.js');
            
            _state.worker.onmessage = (e) => {
                const { type, id, result, error, progress } = e.data;
                
                switch (type) {
                    case 'loaded':
                        console.log('Image Worker loaded');
                        break;
                        
                    case 'ready':
                        _state.workerReady = true;
                        console.log('Image Worker ready');
                        break;
                        
                    case 'progress':
                        const progressCb = _state.workerCallbacks.get(id);
                        if (progressCb?.onProgress) {
                            progressCb.onProgress(progress);
                        }
                        break;
                        
                    case 'complete':
                    case 'previewComplete':
                        const cb = _state.workerCallbacks.get(id);
                        if (cb?.resolve) {
                            cb.resolve(result);
                        }
                        _state.workerCallbacks.delete(id);
                        break;
                        
                    case 'error':
                        const errCb = _state.workerCallbacks.get(id);
                        if (errCb?.reject) {
                            errCb.reject(new Error(error));
                        }
                        _state.workerCallbacks.delete(id);
                        break;
                }
            };
            
            _state.worker.onerror = (e) => {
                console.error('Worker error:', e);
                _state.worker = null;
                _state.workerReady = false;
            };
            
            // Initialize worker with config
            _state.worker.postMessage({
                type: 'init',
                id: 0,
                data: { config: CONFIG }
            });
            
        } catch (e) {
            console.warn('Failed to create Worker:', e);
            _state.worker = null;
        }
    }
    
    /**
     * Send message to worker and wait for response
     */
    function _workerProcess(type, data, onProgress) {
        return new Promise((resolve, reject) => {
            if (!_state.worker || !_state.workerReady) {
                reject(new Error('Worker not available'));
                return;
            }
            
            const id = ++_state.callbackId;
            _state.workerCallbacks.set(id, { resolve, reject, onProgress });
            
            _state.worker.postMessage({ type, id, data });
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
                    const { canvas: tempCanvas, ctx: tempCtx } = _createCanvas(dw, dh);
                    try {
                        tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
                        finalCtx.drawImage(tempCanvas, dx, dy);
                    } catch (e) {
                        console.warn(`Chunk (${cx}, ${cy}) failed:`, e);
                    }
                    tempCanvas.width = 0;
                    tempCanvas.height = 0;
                }
                
                processedChunks++;
                if (onProgress && processedChunks % 4 === 0) {
                    onProgress(35 + Math.round((processedChunks / totalChunks) * 40));
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
        
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
     */
    function _processWithSteps(img, targetWidth, targetHeight) {
        let currentWidth = img.width;
        let currentHeight = img.height;
        let source = img;
        
        while (currentWidth > targetWidth * 2 || currentHeight > targetHeight * 2) {
            const stepWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
            const stepHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
            
            const { canvas, ctx } = _createCanvas(stepWidth, stepHeight);
            ctx.drawImage(source, 0, 0, stepWidth, stepHeight);
            
            if (source !== img && source.width) {
                source.width = 0;
                source.height = 0;
            }
            
            source = canvas;
            currentWidth = stepWidth;
            currentHeight = stepHeight;
        }
        
        if (currentWidth !== targetWidth || currentHeight !== targetHeight) {
            const { canvas: finalCanvas, ctx: finalCtx } = _createCanvas(targetWidth, targetHeight);
            finalCtx.drawImage(source, 0, 0, targetWidth, targetHeight);
            
            if (source !== img && source.width) {
                source.width = 0;
                source.height = 0;
            }
            
            return finalCanvas;
        }
        
        return source;
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
            
            // Check cache
            if (useCache) {
                const cacheKey = await _cache.generateKey(file);
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
            
            let blob;
            
            // Try Worker first if available and enabled
            if (useWorker && _state.worker && _state.workerReady && _state.supportsOffscreenCanvas) {
                try {
                    console.log('Processing with Worker');
                    const imageData = await _getImageData(img);
                    _revokeTrackedObjectUrl(img.src);
                    
                    const result = await _workerProcess('process', {
                        imageData,
                        maxWidth,
                        maxHeight,
                        screenWidth: window.screen.width * (window.devicePixelRatio || 1),
                        screenHeight: window.screen.height * (window.devicePixelRatio || 1),
                        format: await _getOutputFormat()
                    }, onProgress);
                    
                    blob = result.blob;
                    onProgress(95);
                    
                } catch (workerError) {
                    console.warn('Worker processing failed, falling back to main thread:', workerError);
                    // Fall through to main thread processing
                }
            }
            
            // Main thread processing (fallback or primary)
            if (!blob) {
                let canvas;
                
                if (file.size > CONFIG.HUGE_IMAGE_THRESHOLD) {
                    console.log('Using chunked processing');
                    canvas = await _processInChunks(img, targetWidth, targetHeight, onProgress);
                } else if (file.size > CONFIG.LARGE_IMAGE_THRESHOLD || 
                           img.width > targetWidth * 3 || 
                           img.height > targetHeight * 3) {
                    console.log('Using multi-step processing');
                    canvas = _processWithSteps(img, targetWidth, targetHeight);
                    onProgress(70);
                } else {
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
            
            console.log(`Processed in ${result.processingTime}ms: ${file.size} → ${blob.size} bytes`);
            
            // Cache result
            if (useCache) {
                const cacheKey = await _cache.generateKey(file);
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
        _initWorker();
        _checkWebPSupport();
    }

    // Auto-initialize
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    // ==================== Public API ====================
    return {
        // Main functions
        processImage,
        processImageToUrl,
        generatePreview,
        generateProgressivePreview,
        
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
        isWorkerAvailable: () => _state.workerReady,
        
        // Manual init
        init
    };
})();

// Export
if (typeof window !== 'undefined') {
    window.ImageProcessor = ImageProcessor;
}
