/**
 * Inline initialization script
 * Must execute before DOM parsing to prevent wallpaper flicker
 * Sets CSS variable for wallpaper preview from localStorage
 */
(function () {
    'use strict';
    try {
        var raw = localStorage.getItem('wallpaperPreviewSmall');
        if (!raw) return;
        var data = JSON.parse(raw);
        if (!data || !data.dataUrl) return;
        document.documentElement.style.setProperty('--wallpaper-image', 'url(' + data.dataUrl + ')');
    } catch (e) {
        // Silently fail if localStorage is unavailable or data is invalid
    }
})();

