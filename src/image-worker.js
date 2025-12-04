/**
 * Image Processing Web Worker
 * Handles heavy image processing off the main thread
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
    TARGET_OUTPUT_SIZE: 5 * 1024 * 1024
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
    const totalPixels = srcWidth * srcHeight;
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
                ctx.postMessage({ type: 'ready', id });
                break;
                
            case 'process':
                // Process image
                const { 
                    imageData, 
                    maxWidth, 
                    maxHeight, 
                    screenWidth, 
                    screenHeight,
                    format 
                } = data;
                
                const startTime = performance.now();
                
                // Calculate target dimensions
                const { width: targetWidth, height: targetHeight } = calculateDimensions(
                    imageData.width,
                    imageData.height,
                    maxWidth || CONFIG.MAX_WIDTH,
                    maxHeight || CONFIG.MAX_HEIGHT,
                    screenWidth,
                    screenHeight
                );
                
                // Process image
                const canvas = await processImageData(
                    imageData,
                    targetWidth,
                    targetHeight,
                    (progress) => {
                        ctx.postMessage({ type: 'progress', progress, id });
                    }
                );
                
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
                        originalWidth: imageData.width,
                        originalHeight: imageData.height,
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

