/**
 * Inline initialization script
 * Must execute before DOM parsing to prevent wallpaper flicker
 * Sets CSS variables for wallpaper preview, effects, and accent color from localStorage
 * 
 * Features:
 * - Wallpaper preview image (dataUrl)
 * - Blur and vignette effects from wallpaperSettings
 * - Accent color from wallpaper (if available)
 * - Data validation and expiration checks
 * - Graceful error handling
 */
(function () {
    'use strict';
    
    // Constants
    var STORAGE_KEYS = {
        PREVIEW: 'wallpaperPreviewSmall',
        SETTINGS: 'wallpaperSettings'
    };
    
    var CSS_VARS = {
        WALLPAPER_IMAGE: '--wallpaper-image',
        WALLPAPER_BLUR: '--wallpaper-blur',
        WALLPAPER_VIGNETTE: '--wallpaper-vignette',
        ACCENT_COLOR: '--accent-color'
    };
    
    // Cache expiration: 7 days (in milliseconds)
    var PREVIEW_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000;
    
    /**
     * Validate data URL format
     * @param {string} dataUrl
     * @returns {boolean}
     */
    function isValidDataUrl(dataUrl) {
        if (typeof dataUrl !== 'string' || !dataUrl) return false;
        // Check for common data URL patterns: data:image/jpeg;base64, data:image/png;base64, etc.
        return /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(dataUrl);
    }
    
    /**
     * Validate and parse preview data
     * @param {*} data
     * @returns {boolean}
     */
    function validatePreviewData(data) {
        if (!data || typeof data !== 'object') return false;
        if (!isValidDataUrl(data.dataUrl)) return false;
        
        // Check expiration (if timestamp exists)
        if (data.ts && typeof data.ts === 'number') {
            var age = Date.now() - data.ts;
            if (age < 0 || age > PREVIEW_CACHE_EXPIRY) {
                // Expired or invalid timestamp
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Apply wallpaper preview image
     * @param {string} dataUrl
     */
    function applyWallpaperImage(dataUrl) {
        try {
            document.documentElement.style.setProperty(
                CSS_VARS.WALLPAPER_IMAGE,
                'url(' + dataUrl + ')'
            );
        } catch (e) {
            // Silently fail if CSS property cannot be set
        }
    }
    
    /**
     * Apply wallpaper effects (blur and vignette)
     * @param {Object} settings
     */
    function applyWallpaperEffects(settings) {
        if (!settings || typeof settings !== 'object') return;
        
        try {
            // Apply blur effect
            var blur = typeof settings.blur === 'number' ? settings.blur : 0;
            if (blur < 0) blur = 0;
            if (blur > 100) blur = 100;
            document.documentElement.style.setProperty(
                CSS_VARS.WALLPAPER_BLUR,
                (blur / 10) + 'px'
            );
            
            // Apply vignette effect
            var vignette = typeof settings.vignette === 'number' ? settings.vignette : 0;
            if (vignette < 0) vignette = 0;
            if (vignette > 100) vignette = 100;
            
            if (vignette > 0) {
                var vignetteStrength = vignette / 100;
                var vignetteGradient = 'radial-gradient(circle, transparent 0%, rgba(0,0,0,' + 
                    (vignetteStrength * 0.7) + ') 100%)';
                document.documentElement.style.setProperty(
                    CSS_VARS.WALLPAPER_VIGNETTE,
                    vignetteGradient
                );
            } else {
                document.documentElement.style.setProperty(
                    CSS_VARS.WALLPAPER_VIGNETTE,
                    'transparent'
                );
            }
        } catch (e) {
            // Silently fail if CSS properties cannot be set
        }
    }
    
    /**
     * Apply accent color from wallpaper
     * @param {string} accentColor
     */
    function applyAccentColor(accentColor) {
        if (!accentColor || typeof accentColor !== 'string') return;
        
        // Validate hex color format (#RRGGBB or #RRGGBBAA)
        var hexColorPattern = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
        if (!hexColorPattern.test(accentColor)) return;
        
        try {
            document.documentElement.style.setProperty(
                CSS_VARS.ACCENT_COLOR,
                accentColor
            );
        } catch (e) {
            // Silently fail if CSS property cannot be set
        }
    }
    
    /**
     * Main initialization function
     */
    function init() {
        try {
            // Load wallpaper preview
            var previewRaw = localStorage.getItem(STORAGE_KEYS.PREVIEW);
            if (previewRaw) {
                try {
                    var previewData = JSON.parse(previewRaw);
                    if (validatePreviewData(previewData)) {
                        applyWallpaperImage(previewData.dataUrl);
                        
                        // Apply accent color if available
                        if (previewData.accentColor) {
                            applyAccentColor(previewData.accentColor);
                        }
                    }
                } catch (e) {
                    // Invalid JSON or data structure, skip preview
                }
            }
            
            // Load wallpaper settings (blur and vignette)
            var settingsRaw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
            if (settingsRaw) {
                try {
                    var settings = JSON.parse(settingsRaw);
                    if (settings && typeof settings === 'object') {
                        applyWallpaperEffects(settings);
                    }
                } catch (e) {
                    // Invalid JSON or data structure, skip settings
                }
            }
        } catch (e) {
            // Silently fail if localStorage is unavailable or any other error occurs
            // This ensures the page can still load even if initialization fails
        }
    }
    
    // Execute initialization immediately
    init();
})();

