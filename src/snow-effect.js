/**
 * Snow Effect Module
 * Performance-optimized snow animation for holiday easter egg
 * Enhanced with security, error handling, and performance optimizations
 */

const SnowEffect = (function () {
    'use strict';

    const CONFIG = {
        MAX_FLAKES: 80,              // Maximum number of snowflakes (increased for better visual)
        FLAKE_SIZE_MIN: 1,            // Minimum flake size (px)
        FLAKE_SIZE_MAX: 3,            // Maximum flake size (px)
        FALL_SPEED_MIN: 0.5,          // Minimum fall speed
        FALL_SPEED_MAX: 2,            // Maximum fall speed
        WIND_STRENGTH: 0.3,           // Horizontal drift strength
        OPACITY_MIN: 0.5,             // Minimum opacity
        OPACITY_MAX: 1.0,             // Maximum opacity
        RESPAWN_DELAY: 100,           // Delay before respawning a flake (ms)
        ANIMATION_FPS: 60,            // Target FPS (60 FPS for smooth animation)
        PERFORMANCE_CHECK_INTERVAL: 1000, // Check performance every 1 second
        MIN_FPS_THRESHOLD: 30,        // If FPS drops below this, reduce flakes
        STORAGE_KEY: 'snowEffectEnabled',
        STORAGE_KEY_TRIGGERED: 'snowEffectTriggered',
        MAX_DELTA_TIME: 100,          // Maximum delta time to prevent large jumps (ms)
        MAX_CANVAS_SIZE: 8192,        // Maximum canvas dimension (safety limit)
        MAX_ITERATIONS: 10000,        // Maximum iterations in loops (safety limit)
        ERROR_RETRY_DELAY: 1000,      // Delay before retrying after error (ms)
        MAX_ERROR_COUNT: 5,           // Maximum consecutive errors before disabling
        INIT_DELAY: 2000,             // Delay initialization to not affect LCP (ms)
        BATCH_DRAW_SIZE: 20,          // Number of flakes to draw in one batch
        USE_IMAGE_DATA: false         // Use ImageData for batch operations (experimental)
    };

    let _canvas = null;
    let _ctx = null;
    let _flakes = [];
    let _animationId = null;
    let _isEnabled = false;
    let _lastFrameTime = 0;
    let _frameInterval = 1000 / CONFIG.ANIMATION_FPS;
    let _currentFlakeCount = CONFIG.MAX_FLAKES;
    let _performanceCheckTime = 0;
    let _frameCount = 0;
    let _lastFpsCheck = 0;
    let _errorCount = 0;
    let _resizeObserver = null;
    let _resizeTimeout = null;
    let _cleanupResize = null;
    
    // Object pool for flakes (reuse objects to reduce GC pressure)
    const _flakePool = [];
    const _POOL_SIZE = CONFIG.MAX_FLAKES * 2;
    
    // Pre-allocated arrays for batch operations
    let _visibleFlakes = [];
    
    // Performance monitoring
    let _performanceMonitor = {
        lastCheck: 0,
        frameCount: 0,
        totalTime: 0,
        minFPS: Infinity,
        maxFPS: 0
    };
    
    // Cached values to reduce calculations
    let _cachedWidth = 0;
    let _cachedHeight = 0;
    let _cachedNormalizedDelta = 0;
    
    // Batch drawing optimization
    let _opacityGroups = new Map(); // Group flakes by opacity for batch drawing

    /**
     * Safe date validation
     * @param {Date} date
     * @returns {boolean}
     */
    function _isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

    /**
     * Check if current date is within the holiday period (Dec 23 - Jan 5)
     * Uses user's local timezone with enhanced error handling
     * @returns {boolean}
     */
    function _isHolidayPeriod() {
        try {
            const now = new Date();
            if (!_isValidDate(now)) {
                return false;
            }
            
            const month = now.getMonth(); // 0-11
            const date = now.getDate();   // 1-31

            // Validate month and date ranges
            if (month < 0 || month > 11 || date < 1 || date > 31) {
                return false;
            }

            // December 23-31
            if (month === 11 && date >= 23) {
                return true;
            }
            // January 1-5
            if (month === 0 && date <= 5) {
                return true;
            }

            return false;
        } catch (e) {
            // Silently fail - don't break the page if date operations fail
            return false;
        }
    }

    /**
     * Check if snow effect has been triggered
     * @returns {boolean}
     */
    function _isTriggered() {
        try {
            return localStorage.getItem(CONFIG.STORAGE_KEY_TRIGGERED) === 'true';
        } catch (e) {
            return false;
        }
    }

    /**
     * Mark snow effect as triggered
     */
    function _markTriggered() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY_TRIGGERED, 'true');
        } catch (e) {
            // Ignore storage errors
        }
    }

    /**
     * Get enabled state from storage
     * @returns {boolean}
     */
    function _getEnabledState() {
        try {
            return localStorage.getItem(CONFIG.STORAGE_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    /**
     * Save enabled state to storage
     * @param {boolean} enabled
     */
    function _saveEnabledState(enabled) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, enabled ? 'true' : 'false');
        } catch (e) {
            // Ignore storage errors
        }
    }

    /**
     * Get or create a flake from object pool (reduces GC pressure)
     * @returns {Object}
     */
    function _getFlakeFromPool() {
        let flake;
        if (_flakePool.length > 0) {
            flake = _flakePool.pop();
        } else {
            flake = {};
        }
        return flake;
    }

    /**
     * Return flake to object pool
     * @param {Object} flake
     */
    function _returnFlakeToPool(flake) {
        if (_flakePool.length < _POOL_SIZE && flake) {
            // Clear properties
            flake.x = 0;
            flake.y = 0;
            flake.size = 0;
            flake.speed = 0;
            flake.opacity = 0;
            flake.wind = 0;
            _flakePool.push(flake);
        }
    }

    /**
     * Create a single snowflake with validation
     * @returns {Object}
     */
    function _createFlake() {
        try {
            const width = _canvas && _canvas.width > 0 ? _canvas.width : (window.innerWidth || 1920);
            const safeWidth = Math.max(1, Math.min(width, CONFIG.MAX_CANVAS_SIZE));
            
            const flake = _getFlakeFromPool();
            flake.x = Math.random() * safeWidth;
            flake.y = -Math.random() * 100; // Start above viewport
            flake.size = Math.max(CONFIG.FLAKE_SIZE_MIN, 
                Math.min(CONFIG.FLAKE_SIZE_MAX, 
                    CONFIG.FLAKE_SIZE_MIN + Math.random() * (CONFIG.FLAKE_SIZE_MAX - CONFIG.FLAKE_SIZE_MIN)));
            flake.speed = Math.max(CONFIG.FALL_SPEED_MIN, 
                Math.min(CONFIG.FALL_SPEED_MAX, 
                    CONFIG.FALL_SPEED_MIN + Math.random() * (CONFIG.FALL_SPEED_MAX - CONFIG.FALL_SPEED_MIN)));
            flake.opacity = Math.max(CONFIG.OPACITY_MIN, 
                Math.min(CONFIG.OPACITY_MAX, 
                    CONFIG.OPACITY_MIN + Math.random() * (CONFIG.OPACITY_MAX - CONFIG.OPACITY_MIN)));
            flake.wind = (Math.random() - 0.5) * CONFIG.WIND_STRENGTH;
            
            return flake;
        } catch (e) {
            // Fallback to safe defaults
            return {
                x: 0,
                y: -50,
                size: CONFIG.FLAKE_SIZE_MIN,
                speed: CONFIG.FALL_SPEED_MIN,
                opacity: CONFIG.OPACITY_MIN,
                wind: 0
            };
        }
    }

    /**
     * Initialize canvas with error handling
     */
    function _initCanvas() {
        if (_canvas) return;

        try {
            // Validate document is ready
            if (!document || !document.body) {
                throw new Error('Document not ready');
            }

            _canvas = document.createElement('canvas');
            if (!_canvas) {
                throw new Error('Failed to create canvas element');
            }
            
            _canvas.id = 'snow-canvas';
            _canvas.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9998;
                mix-blend-mode: screen;
            `;
            
            document.body.appendChild(_canvas);
            
            // Get 2D context with error handling
            _ctx = _canvas.getContext('2d', { 
                alpha: true,
                desynchronized: true, // Better performance on some browsers
                willReadFrequently: false // Optimize for drawing, not reading
            });
            
            if (!_ctx) {
                throw new Error('Failed to get 2D context');
            }

            // Set canvas size
            _resizeCanvas();

            // Handle window resize with debouncing and cleanup
            const handleResize = () => {
                if (_resizeTimeout) {
                    clearTimeout(_resizeTimeout);
                }
                _resizeTimeout = setTimeout(() => {
                    try {
                        _resizeCanvas();
                    } catch (e) {
                        console.warn('[SnowEffect] Resize error:', e);
                    }
                }, 100);
            };
            
            window.addEventListener('resize', handleResize, { passive: true });
            
            // Cleanup function for resize listener
            _cleanupResize = () => {
                if (_resizeTimeout) {
                    clearTimeout(_resizeTimeout);
                    _resizeTimeout = null;
                }
                window.removeEventListener('resize', handleResize);
            };
        } catch (e) {
            console.error('[SnowEffect] Canvas initialization failed:', e);
            _errorCount++;
            if (_errorCount >= CONFIG.MAX_ERROR_COUNT) {
                _isEnabled = false;
            }
            throw e;
        }
    }

    /**
     * Resize canvas to match viewport with safety checks
     */
    function _resizeCanvas() {
        if (!_canvas || !_ctx) return;
        
        try {
            const width = window.innerWidth || 1920;
            const height = window.innerHeight || 1080;
            
            // Clamp to safe maximum to prevent memory issues
            const safeWidth = Math.max(1, Math.min(width, CONFIG.MAX_CANVAS_SIZE));
            const safeHeight = Math.max(1, Math.min(height, CONFIG.MAX_CANVAS_SIZE));
            
            // Only resize if dimensions changed (avoids unnecessary operations)
            if (_canvas.width !== safeWidth || _canvas.height !== safeHeight) {
                _canvas.width = safeWidth;
                _canvas.height = safeHeight;
                
                // Clear canvas after resize
                _ctx.clearRect(0, 0, safeWidth, safeHeight);
            }
        } catch (e) {
            console.warn('[SnowEffect] Canvas resize error:', e);
            _errorCount++;
        }
    }

    /**
     * Update and draw all flakes (ultra-optimized with batch operations)
     * @param {number} deltaTime - Time since last frame (ms)
     */
    function _updateFlakes(deltaTime) {
        if (!_ctx || !_canvas) return;

        try {
            const width = _canvas.width;
            const height = _canvas.height;
            
            // Validate canvas dimensions
            if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
                return;
            }

            // Cache dimensions to avoid repeated property access
            if (_cachedWidth !== width || _cachedHeight !== height) {
                _cachedWidth = width;
                _cachedHeight = height;
            }

            // Clear canvas (use clearRect for better performance than fillRect)
            _ctx.clearRect(0, 0, width, height);

            // Clamp deltaTime to prevent large jumps and ensure stability
            const clampedDelta = Math.max(0, Math.min(deltaTime, CONFIG.MAX_DELTA_TIME));
            const normalizedDelta = clampedDelta / 16.67; // Normalize to 60fps baseline
            _cachedNormalizedDelta = normalizedDelta;

            // Set common properties once (reduces state changes)
            _ctx.fillStyle = '#ffffff';

            // Pre-filter visible flakes to reduce loop iterations
            _visibleFlakes.length = 0;
            const visibleCount = Math.min(_currentFlakeCount, _flakes.length);
            const maxIterations = Math.min(visibleCount, CONFIG.MAX_ITERATIONS);
            
            // Group flakes by opacity for batch drawing (reduces state changes)
            _opacityGroups.clear();
            
            // Update and collect visible flakes in one pass
            for (let i = 0; i < maxIterations; i++) {
                const flake = _flakes[i];
                if (!flake) continue;

                // Validate flake properties
                if (!isFinite(flake.x) || !isFinite(flake.y) || 
                    !isFinite(flake.speed) || !isFinite(flake.wind)) {
                    // Reset invalid flake
                    _flakes[i] = _createFlake();
                    continue;
                }

                // Update position (cached normalizedDelta)
                flake.y += flake.speed * normalizedDelta;
                flake.x += flake.wind * normalizedDelta;

                // Wrap around horizontally (optimized with cached width)
                if (flake.x < 0) {
                    flake.x = width;
                } else if (flake.x > width) {
                    flake.x = 0;
                }

                // Respawn if fallen off screen
                if (flake.y > height + 20) {
                    const oldFlake = _flakes[i];
                    _flakes[i] = _createFlake();
                    _returnFlakeToPool(oldFlake);
                    continue;
                }

                // Only add to visible list if within viewport bounds (with small margin)
                if (flake.y >= -10 && flake.y <= height + 10 && 
                    flake.x >= -10 && flake.x <= width + 10) {
                    _visibleFlakes.push(flake);
                    
                    // Group by opacity (rounded to reduce groups)
                    const opacityKey = Math.round(flake.opacity * 10) / 10;
                    if (!_opacityGroups.has(opacityKey)) {
                        _opacityGroups.set(opacityKey, []);
                    }
                    _opacityGroups.get(opacityKey).push(flake);
                }
            }

            // Batch draw by opacity groups (minimizes state changes)
            const opacityKeys = Array.from(_opacityGroups.keys()).sort((a, b) => b - a);
            for (let keyIdx = 0; keyIdx < opacityKeys.length; keyIdx++) {
                const opacity = opacityKeys[keyIdx];
                const flakes = _opacityGroups.get(opacity);
                
                // Set opacity once per group
                _ctx.globalAlpha = opacity;
                
                // Batch draw flakes with same opacity
                const flakesLength = flakes.length;
                for (let i = 0; i < flakesLength; i++) {
                    const flake = flakes[i];
                    
                    // Use fillRect for very small flakes (faster than arc for 1-2px)
                    if (flake.size <= 1.5) {
                        const x = Math.round(flake.x);
                        const y = Math.round(flake.y);
                        _ctx.fillRect(x, y, 1, 1);
                    } else {
                        // Use arc for larger flakes
                        _ctx.beginPath();
                        _ctx.arc(
                            Math.round(flake.x), 
                            Math.round(flake.y), 
                            flake.size, 
                            0, 
                            Math.PI * 2
                        );
                        _ctx.fill();
                    }
                }
            }
            
            // Reset globalAlpha to default
            if (_ctx.globalAlpha !== 1.0) {
                _ctx.globalAlpha = 1.0;
            }
        } catch (e) {
            console.warn('[SnowEffect] Update error:', e);
            _errorCount++;
            if (_errorCount >= CONFIG.MAX_ERROR_COUNT) {
                _stop();
            }
        }
    }

    /**
     * Check and adjust performance with enhanced monitoring
     * @param {number} currentTime - Current timestamp
     */
    function _checkPerformance(currentTime) {
        try {
            _frameCount++;
            _performanceMonitor.frameCount++;
            
            // Check FPS every second
            const timeSinceCheck = currentTime - _lastFpsCheck;
            if (timeSinceCheck >= CONFIG.PERFORMANCE_CHECK_INTERVAL) {
                const elapsedSeconds = timeSinceCheck / 1000;
                if (elapsedSeconds > 0) {
                    const fps = _frameCount / elapsedSeconds;
                    
                    // Update performance statistics
                    _performanceMonitor.totalTime += elapsedSeconds;
                    _performanceMonitor.minFPS = Math.min(_performanceMonitor.minFPS, fps);
                    _performanceMonitor.maxFPS = Math.max(_performanceMonitor.maxFPS, fps);
                    
                    // Reset counters
                    _frameCount = 0;
                    _lastFpsCheck = currentTime;
                    
                    // Validate FPS value
                    if (!isFinite(fps) || fps <= 0) {
                        return; // Skip adjustment if FPS is invalid
                    }

                    // If FPS is too low, reduce flake count
                    if (fps < CONFIG.MIN_FPS_THRESHOLD && _currentFlakeCount > 20) {
                        const newCount = Math.max(20, Math.floor(_currentFlakeCount * 0.8));
                        if (newCount < _currentFlakeCount) {
                            _currentFlakeCount = newCount;
                            // Remove excess flakes and return to pool
                            const excess = _flakes.length - _currentFlakeCount;
                            for (let i = 0; i < excess; i++) {
                                const flake = _flakes.pop();
                                if (flake) {
                                    _returnFlakeToPool(flake);
                                }
                            }
                        }
                    } else if (fps > CONFIG.ANIMATION_FPS * 0.9 && _currentFlakeCount < CONFIG.MAX_FLAKES) {
                        // If FPS is good (above 90% of target), gradually increase flake count
                        const newCount = Math.min(CONFIG.MAX_FLAKES, Math.floor(_currentFlakeCount * 1.1));
                        if (newCount > _currentFlakeCount) {
                            _currentFlakeCount = newCount;
                            // Add new flakes if needed
                            while (_flakes.length < _currentFlakeCount) {
                                _flakes.push(_createFlake());
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[SnowEffect] Performance check error:', e);
            // Don't increment error count for performance check failures
        }
    }

    /**
     * Animation loop (highly optimized with error handling)
     * @param {number} currentTime - Current timestamp
     */
    function _animate(currentTime) {
        if (!_isEnabled) {
            // Clean up if disabled during animation
            if (_animationId) {
                cancelAnimationFrame(_animationId);
                _animationId = null;
            }
            return;
        }

        try {
            // Validate timestamp
            if (!isFinite(currentTime) || currentTime < 0) {
                currentTime = performance.now();
            }

            const deltaTime = currentTime - _lastFrameTime;
            
            // Validate deltaTime
            if (!isFinite(deltaTime) || deltaTime < 0) {
                _lastFrameTime = currentTime;
                _animationId = requestAnimationFrame(_animate);
                return;
            }

            // Throttle to target FPS
            if (deltaTime >= _frameInterval) {
                _updateFlakes(deltaTime);
                _checkPerformance(currentTime);
                _lastFrameTime = currentTime;
                
                // Reset error count on successful frame
                if (_errorCount > 0) {
                    _errorCount = Math.max(0, _errorCount - 1);
                }
            }

            _animationId = requestAnimationFrame(_animate);
        } catch (e) {
            console.error('[SnowEffect] Animation error:', e);
            _errorCount++;
            
            // Disable if too many errors
            if (_errorCount >= CONFIG.MAX_ERROR_COUNT) {
                console.warn('[SnowEffect] Too many errors, disabling effect');
                _stop();
                return;
            }
            
            // Retry after delay
            setTimeout(() => {
                if (_isEnabled) {
                    _lastFrameTime = performance.now();
                    _animationId = requestAnimationFrame(_animate);
                }
            }, CONFIG.ERROR_RETRY_DELAY);
        }
    }

    /**
     * Start snow animation with enhanced error handling and delayed initialization
     * Delays initialization to not affect LCP (Largest Contentful Paint)
     */
    function _start() {
        if (_isEnabled) return;
        
        // Validate preconditions
        if (!_isHolidayPeriod() || !_isTriggered()) {
            return;
        }

        // Delay initialization to not affect LCP
        // Use requestIdleCallback if available, otherwise setTimeout
        const initFunction = (window.requestIdleCallback || ((cb) => setTimeout(cb, CONFIG.INIT_DELAY)));
        
        initFunction(() => {
            try {
                _initCanvas();
                
                // Validate canvas was created
                if (!_canvas || !_ctx) {
                    throw new Error('Canvas initialization failed');
                }
                
                _isEnabled = true;
                _errorCount = 0; // Reset error count on start

                // Initialize performance monitoring
                _currentFlakeCount = CONFIG.MAX_FLAKES;
                _frameCount = 0;
                _lastFpsCheck = performance.now();
                _performanceMonitor = {
                    lastCheck: performance.now(),
                    frameCount: 0,
                    totalTime: 0,
                    minFPS: Infinity,
                    maxFPS: 0
                };

                // Initialize flakes with validation (batch creation for better performance)
                _flakes = [];
                const batchSize = 10;
                let created = 0;
                
                const createBatch = () => {
                    const end = Math.min(created + batchSize, CONFIG.MAX_FLAKES);
                    for (let i = created; i < end; i++) {
                        const flake = _createFlake();
                        if (flake) {
                            _flakes.push(flake);
                        }
                    }
                    created = end;
                    
                    if (created < CONFIG.MAX_FLAKES) {
                        // Use requestIdleCallback for non-blocking batch creation
                        if (window.requestIdleCallback) {
                            requestIdleCallback(createBatch, { timeout: 100 });
                        } else {
                            setTimeout(createBatch, 0);
                        }
                    } else {
                        // Ensure we have at least some flakes
                        if (_flakes.length === 0) {
                            throw new Error('Failed to create flakes');
                        }

                        _lastFrameTime = performance.now();
                        _animationId = requestAnimationFrame(_animate);
                    }
                };
                
                createBatch();
            } catch (e) {
                console.error('[SnowEffect] Start error:', e);
                _errorCount++;
                _isEnabled = false;
                _stop();
            }
        }, { timeout: CONFIG.INIT_DELAY });
    }

    /**
     * Stop snow animation with cleanup
     */
    function _stop() {
        if (!_isEnabled && !_animationId) return;

        _isEnabled = false;
        
        try {
            if (_animationId) {
                cancelAnimationFrame(_animationId);
                _animationId = null;
            }

            if (_canvas && _ctx) {
                try {
                    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
                } catch (e) {
                    // Ignore clear errors
                }
            }
        } catch (e) {
            console.warn('[SnowEffect] Stop error:', e);
        }
    }

    /**
     * Cleanup canvas and resources
     */
    function _cleanup() {
        _stop();
        
        try {
            // Cleanup resize listener
            if (_cleanupResize) {
                _cleanupResize();
                _cleanupResize = null;
            }
            
            // Remove canvas from DOM
            if (_canvas && _canvas.parentNode) {
                _canvas.parentNode.removeChild(_canvas);
            }
            
            // Clear references
            _canvas = null;
            _ctx = null;
            
            // Return all flakes to pool
            for (let i = 0; i < _flakes.length; i++) {
                _returnFlakeToPool(_flakes[i]);
            }
            _flakes = [];
            _visibleFlakes = [];
            
            // Reset state
            _errorCount = 0;
            _currentFlakeCount = CONFIG.MAX_FLAKES;
            _frameCount = 0;
            _lastFpsCheck = 0;
            _lastFrameTime = 0;
        } catch (e) {
            console.warn('[SnowEffect] Cleanup error:', e);
            // Force clear references even if cleanup fails
            _canvas = null;
            _ctx = null;
            _flakes = [];
            _visibleFlakes = [];
        }
    }

    // Public API
    return {
        /**
         * Enable snow effect
         */
        enable() {
            if (!_isHolidayPeriod() || !_isTriggered()) return;
            _saveEnabledState(true);
            _start();
        },

        /**
         * Disable snow effect
         */
        disable() {
            _saveEnabledState(false);
            _stop();
        },

        /**
         * Toggle snow effect
         * @returns {boolean} New enabled state
         */
        toggle() {
            if (_isEnabled) {
                this.disable();
                return false;
            } else {
                this.enable();
                return true;
            }
        },

        /**
         * Check if snow effect is enabled
         * @returns {boolean}
         */
        isEnabled() {
            return _isEnabled;
        },

        /**
         * Check if we're in the holiday period
         * @returns {boolean}
         */
        isHolidayPeriod() {
            return _isHolidayPeriod();
        },

        /**
         * Check if snow effect has been triggered
         * @returns {boolean}
         */
        isTriggered() {
            return _isTriggered();
        },

        /**
         * Trigger the easter egg (mark as triggered)
         */
        trigger() {
            _markTriggered();
            // Auto-enable if in holiday period
            if (_isHolidayPeriod()) {
                this.enable();
            }
        },

        /**
         * Initialize snow effect (load state and start if enabled)
         * Uses delayed initialization to not affect page load performance
         */
        init() {
            if (!_isHolidayPeriod() || !_isTriggered()) return;

            if (_getEnabledState()) {
                // Delay initialization to not affect LCP
                // Wait for page to be fully loaded
                if (document.readyState === 'complete') {
                    _start();
                } else {
                    window.addEventListener('load', () => {
                        // Additional delay after load to ensure LCP is not affected
                        setTimeout(() => {
                            _start();
                        }, CONFIG.INIT_DELAY);
                    }, { once: true });
                }
            }
        },

        /**
         * Cleanup resources
         */
        destroy() {
            _cleanup();
        }
    };
})();

// Export for global use
window.SnowEffect = SnowEffect;

