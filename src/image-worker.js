/**
 * Image Processing Web Worker
 * Handles heavy image processing off the main thread
 * 
 * WASM Support:
 * - WASM can be enabled via CONFIG.WASM_URL and CONFIG.WASM_ENABLED
 * - Automatically enabled for large images (>20MP) when WASM_URL is set
 * - Requires WASM module exporting: resize_rgba(srcPtr, srcW, srcH, dstPtr, dstW, dstH)
 * - Falls back to Canvas API if WASM is unavailable
 * 
 * To use WASM:
 * 1. Build or obtain a WASM module with resize_rgba function
 * 2. Place it in the extension's web_accessible_resources
 * 3. Call ImageProcessor.setWasmUrl('path/to/resize.wasm') from main thread
 */

// Worker context
const ctx = self;

// Configuration (synced from main thread)
let CONFIG = {
    MAX_WIDTH: 3840,
    MAX_HEIGHT: 2160,
    QUALITY_HIGH: 0.92,
    QUALITY_MEDIUM: 0.85,
    CHUNK_SIZE: 2048,
    OUTPUT_FORMAT: 'image/webp',
    FALLBACK_FORMAT: 'image/jpeg',
    TARGET_OUTPUT_SIZE: 5 * 1024 * 1024,
    WASM_URL: null,
    WASM_ENABLED: false,
    WASM_AUTO_ENABLE_THRESHOLD: 20 * 1000 * 1000, // 20MP - auto-enable threshold
    MAX_PIXELS: 80 * 1000 * 1000 // Keep for symmetry; enforced in main thread
};

// WASM state
const WASM = {
    instance: null,
    exports: null,
    ready: false,
    allocPtr: 0,
    heapCapacity: 0,
    hasNearest: false  // Whether nearest neighbor resize is available
};

/**
 * Calculate optimal dimensions while maintaining aspect ratio
 */
function calculateDimensions(width, height, maxWidth, maxHeight, screenWidth, screenHeight) {
    const targetWidth = Math.min(screenWidth || maxWidth, maxWidth);
    const targetHeight = Math.min(screenHeight || maxHeight, maxHeight);
    
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
 * Process image using OffscreenCanvas (Worker-compatible)
 */
async function processImageData(imageData, targetWidth, targetHeight, onProgress) {
    const { width: srcWidth, height: srcHeight } = imageData;
    const totalPixels = srcWidth * srcHeight;
    
    // Prefer WASM path for large images if enabled and ready
    // WASM is especially beneficial for images > 20MP where chunked Canvas processing is slow
    if (CONFIG.WASM_ENABLED) {
        // If WASM is still loading, wait a bit (max 500ms) for it to become ready
        if (!WASM.ready && CONFIG.WASM_URL) {
            const startWait = Date.now();
            while (!WASM.ready && (Date.now() - startWait) < 500) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        // Try WASM if ready
        if (WASM.ready) {
            console.log(`[Worker] Using WASM for image resize: ${srcWidth}x${srcHeight} -> ${targetWidth}x${targetHeight} (${(totalPixels / 1000000).toFixed(1)}MP)`);
            const wasmCanvas = await processImageDataWithWasm(imageData, targetWidth, targetHeight, onProgress);
            if (wasmCanvas) {
                console.log(`[Worker] WASM resize completed successfully`);
                return wasmCanvas;
            } else {
                console.warn(`[Worker] WASM resize returned null, falling back to Canvas`);
            }
        } else if (CONFIG.WASM_ENABLED && CONFIG.WASM_URL) {
            console.log(`[Worker] WASM enabled but not ready yet, using Canvas fallback`);
        }
    }

    // Fallback to Canvas API processing
    // Create OffscreenCanvas for processing
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
    });
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Create ImageBitmap from ImageData for efficient drawing
    const bitmap = await createImageBitmap(imageData);
    
    // Check if we need chunked processing
    // Note: For very large images (>20MP), WASM would be faster, but Canvas chunked processing works as fallback
    const useChunked = totalPixels > 20 * 1000 * 1000; // 20MP threshold for chunked
    
    if (useChunked) {
        // Chunked processing for large images
        const chunkSize = CONFIG.CHUNK_SIZE;
        const scaleX = targetWidth / srcWidth;
        const scaleY = targetHeight / srcHeight;
        const chunksX = Math.ceil(srcWidth / chunkSize);
        const chunksY = Math.ceil(srcHeight / chunkSize);
        const totalChunks = chunksX * chunksY;
        let processedChunks = 0;
        
        for (let cy = 0; cy < chunksY; cy++) {
            for (let cx = 0; cx < chunksX; cx++) {
                const sx = cx * chunkSize;
                const sy = cy * chunkSize;
                const sw = Math.min(chunkSize, srcWidth - sx);
                const sh = Math.min(chunkSize, srcHeight - sy);
                
                const dx = Math.round(sx * scaleX);
                const dy = Math.round(sy * scaleY);
                const dw = Math.max(1, Math.round(sw * scaleX));
                const dh = Math.max(1, Math.round(sh * scaleY));
                
                if (dw >= 1 && dh >= 1) {
                    ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
                }
                
                processedChunks++;
                if (onProgress && processedChunks % 4 === 0) {
                    onProgress(35 + Math.round((processedChunks / totalChunks) * 40));
                }
            }
        }
    } else {
        // Direct processing for smaller images
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    }
    
    bitmap.close();
    
    return canvas;
}

/**
 * Optimize blob size with quality adjustment
 */
async function optimizeBlobSize(canvas, targetSize, format) {
    let quality = CONFIG.QUALITY_HIGH;
    let blob = await canvas.convertToBlob({ type: format, quality });
    
    if (blob.size <= targetSize) {
        return blob;
    }
    
    // Binary search for optimal quality
    let minQuality = 0.3;
    let maxQuality = quality;
    
    for (let i = 0; i < 5; i++) {
        quality = (minQuality + maxQuality) / 2;
        blob = await canvas.convertToBlob({ type: format, quality });
        
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

/**
 * Load WASM module (if provided)
 * @param {string} url - URL to WASM file
 * @returns {Promise<void>}
 */
async function loadWasm(url) {
    if (WASM.ready) {
        return; // Already loaded
    }
    
    try {
        if (!url) {
            throw new Error('WASM URL not provided');
        }
        
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`Failed to fetch WASM: ${resp.status} ${resp.statusText}`);
        }
        
        const wasmBinary = await resp.arrayBuffer();
        if (!wasmBinary || wasmBinary.byteLength === 0) {
            throw new Error('WASM file is empty');
        }
        
        // Try instantiateStreaming first (more efficient), fallback to instantiate
        let instance;
        try {
            // Create a new fetch for streaming (some browsers don't support resp.clone() in workers)
            const streamResp = await fetch(url);
            const module = await WebAssembly.instantiateStreaming(streamResp);
            instance = module.instance;
        } catch (streamErr) {
            // Fallback for browsers that don't support streaming
            const module = await WebAssembly.instantiate(wasmBinary, {});
            instance = module.instance;
        }
        
        if (!instance?.exports) {
            throw new Error('WASM instance missing exports');
        }
        
        // Verify required exports exist
        if (typeof instance.exports.resize_rgba !== 'function') {
            throw new Error('WASM missing required export: resize_rgba');
        }
        
        // Optional exports (for better performance)
        if (typeof instance.exports.resize_rgba_nearest === 'function') {
            WASM.hasNearest = true;
        }
        
        if (!instance.exports.memory) {
            throw new Error('WASM missing required export: memory');
        }
        
        WASM.instance = instance;
        WASM.exports = instance.exports;
        WASM.ready = true;
        WASM.allocPtr = 0;
        WASM.heapCapacity = instance.exports.memory.buffer.byteLength || 0;
        
        console.log(`[Worker] WASM loaded successfully (${(wasmBinary.byteLength / 1024).toFixed(1)}KB)`);
        console.log(`[Worker] WASM exports: resize_rgba=${!!exports.resize_rgba}, memory=${!!exports.memory}, resize_rgba_nearest=${!!exports.resize_rgba_nearest}`);
    } catch (err) {
        console.warn('[Worker] WASM load failed, will use Canvas fallback:', err.message);
        WASM.instance = null;
        WASM.exports = null;
        WASM.ready = false;
        // Don't throw - allow fallback to Canvas processing
    }
}

/**
 * Simple bump allocator on WASM memory
 */
function wasmAlloc(size) {
    const memory = WASM.exports?.memory;
    if (!memory) return null;
    const pageSize = 64 * 1024;
    const alignedSize = (size + 7) & ~7;
    let needed = WASM.allocPtr + alignedSize;
    if (needed > WASM.heapCapacity) {
        const growPages = Math.ceil((needed - WASM.heapCapacity) / pageSize);
        try {
            memory.grow(growPages);
            WASM.heapCapacity = memory.buffer.byteLength;
        } catch (e) {
            return null;
        }
    }
    const ptr = WASM.allocPtr;
    WASM.allocPtr += alignedSize;
    return ptr;
}

/**
 * Process image data via WASM (expects export resize_rgba)
 * resize_rgba(srcPtr, srcW, srcH, dstPtr, dstW, dstH) -> error_code
 * Returns 0 on success, non-zero on error
 */
async function processImageDataWithWasm(imageData, targetWidth, targetHeight, onProgress) {
    const exports = WASM.exports;
    if (!exports || typeof exports.resize_rgba !== 'function' || !exports.memory) {
        return null;
    }

    try {
        WASM.allocPtr = 0; // reset bump pointer per call
        const srcSize = imageData.width * imageData.height * 4;
        const dstSize = targetWidth * targetHeight * 4;

        // Use WASM memory allocation if available, otherwise use JavaScript allocation
        let srcPtr, dstPtr;
        if (typeof exports.alloc_memory === 'function') {
            srcPtr = exports.alloc_memory(srcSize);
            dstPtr = exports.alloc_memory(dstSize);
        } else {
            // Fallback: allocate in WASM memory using bump allocator
            srcPtr = wasmAlloc(srcSize);
            dstPtr = wasmAlloc(dstSize);
        }
        
        if (srcPtr === null || dstPtr === null || srcPtr === 0 || dstPtr === 0) {
            console.warn('[Worker] WASM memory allocation failed');
            return null;
        }

        const memoryU8 = new Uint8Array(exports.memory.buffer);
        memoryU8.set(imageData.data, srcPtr);

        // Call resize function and check return code
        const errorCode = exports.resize_rgba(
            srcPtr, 
            imageData.width, 
            imageData.height, 
            dstPtr, 
            targetWidth, 
            targetHeight
        );
        
        if (errorCode !== 0) {
            console.warn(`[Worker] WASM resize failed with error code: ${errorCode}`);
            // Clean up allocated memory
            if (typeof exports.dealloc_memory === 'function') {
                exports.dealloc_memory(srcPtr, srcSize);
                exports.dealloc_memory(dstPtr, dstSize);
            }
            return null;
        }

        if (onProgress) onProgress(70);

        const dstView = memoryU8.subarray(dstPtr, dstPtr + dstSize);
        const outImageData = new ImageData(
            new Uint8ClampedArray(dstView.slice().buffer),
            targetWidth,
            targetHeight
        );

        // Clean up allocated memory
        if (typeof exports.dealloc_memory === 'function') {
            exports.dealloc_memory(srcPtr, srcSize);
            exports.dealloc_memory(dstPtr, dstSize);
        }

        const canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d');
        ctx.putImageData(outImageData, 0, 0);
        return canvas;
    } catch (e) {
        console.warn('[Worker] WASM processing failed, fallback to canvas:', e);
        return null;
    }
}

/**
 * Main message handler
 */
ctx.onmessage = async function(e) {
    const { type, data, id } = e.data;
    
    try {
        switch (type) {
            case 'init':
                // Initialize with config from main thread
                if (data.config) {
                    CONFIG = { ...CONFIG, ...data.config };
                }
                // Load WASM asynchronously if enabled (don't block ready signal)
                if (CONFIG.WASM_ENABLED && CONFIG.WASM_URL) {
                    loadWasm(CONFIG.WASM_URL).catch(err => {
                        console.warn('[Worker] WASM initialization failed, will use Canvas fallback:', err);
                    });
                }
                ctx.postMessage({ type: 'ready', id });
                break;
                
            case 'process':
                // Process image
                const { 
                    imageData, 
                    imageBitmap,
                    maxWidth, 
                    maxHeight, 
                    screenWidth, 
                    screenHeight,
                    format,
                    alreadyScaled,
                    originalWidth,
                    originalHeight
                } = data;
                
                const startTime = performance.now();
                
                let targetWidth = maxWidth || CONFIG.MAX_WIDTH;
                let targetHeight = maxHeight || CONFIG.MAX_HEIGHT;
                let canvas;

                if (alreadyScaled) {
                    // Already scaled: prefer ImageBitmap path if provided
                    const source = imageBitmap || imageData;
                    targetWidth = source.width;
                    targetHeight = source.height;
                    canvas = new OffscreenCanvas(targetWidth, targetHeight);
                    const outCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
                    if (imageBitmap) {
                        outCtx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
                        imageBitmap.close();
                    } else {
                        outCtx.putImageData(imageData, 0, 0);
                    }
                    // Progress update for scaled path
                    ctx.postMessage({ type: 'progress', progress: 60, id });
                } else {
                    // Calculate target dimensions
                    const dims = calculateDimensions(
                        (imageBitmap && imageBitmap.width) || imageData.width,
                        (imageBitmap && imageBitmap.height) || imageData.height,
                        maxWidth || CONFIG.MAX_WIDTH,
                        maxHeight || CONFIG.MAX_HEIGHT,
                        screenWidth,
                        screenHeight
                    );
                    targetWidth = dims.width;
                    targetHeight = dims.height;
                    
                    // Process image
                    const src = imageBitmap || imageData;
                    if (imageBitmap) {
                        canvas = new OffscreenCanvas(targetWidth, targetHeight);
                        const ctx2d = canvas.getContext('2d', { alpha: false, desynchronized: true });
                        ctx2d.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
                        imageBitmap.close();
                    } else {
                        canvas = await processImageData(
                            imageData,
                            targetWidth,
                            targetHeight,
                            (progress) => {
                                // Reduce progress chatter: only key stages
                                if (progress === 35 || progress === 70 || progress === 90) {
                                    ctx.postMessage({ type: 'progress', progress, id });
                                }
                            }
                        );
                    }
                }
                
                ctx.postMessage({ type: 'progress', progress: 75, id });
                
                // Generate optimized blob
                const outputFormat = format || CONFIG.OUTPUT_FORMAT;
                const blob = await optimizeBlobSize(canvas, CONFIG.TARGET_OUTPUT_SIZE, outputFormat);
                
                ctx.postMessage({ type: 'progress', progress: 95, id });
                
                const endTime = performance.now();
                
                // Send result back
                ctx.postMessage({
                    type: 'complete',
                    id,
                    result: {
                        blob,
                        width: targetWidth,
                        height: targetHeight,
                        originalWidth: originalWidth || imageData.width,
                        originalHeight: originalHeight || imageData.height,
                        processedSize: blob.size,
                        processingTime: Math.round(endTime - startTime)
                    }
                });
                break;
                
            case 'generatePreview':
                // Generate quick preview with aggressive downsampling
                const { imageData: previewData, maxSize } = data;
                const previewMaxDim = maxSize || 400; // Very small for quick preview
                
                const previewDims = calculateDimensions(
                    previewData.width,
                    previewData.height,
                    previewMaxDim,
                    previewMaxDim,
                    previewMaxDim,
                    previewMaxDim
                );
                
                const previewCanvas = new OffscreenCanvas(previewDims.width, previewDims.height);
                const previewCtx = previewCanvas.getContext('2d');
                
                const previewBitmap = await createImageBitmap(previewData);
                previewCtx.drawImage(previewBitmap, 0, 0, previewDims.width, previewDims.height);
                previewBitmap.close();
                
                // Use lower quality for preview
                const previewBlob = await previewCanvas.convertToBlob({ 
                    type: 'image/jpeg', 
                    quality: 0.5 
                });
                
                ctx.postMessage({
                    type: 'previewComplete',
                    id,
                    result: {
                        blob: previewBlob,
                        width: previewDims.width,
                        height: previewDims.height
                    }
                });
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        ctx.postMessage({
            type: 'error',
            id,
            error: error.message
        });
    }
};

// Signal that worker is loaded
ctx.postMessage({ type: 'loaded' });

/** 
 * Violence is the last refuge of the incompetent. 
 * — From Isaac Asimov's novel, "Foundation".
*/