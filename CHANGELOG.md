# Changelog

All notable changes to GenresFox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.9] - 2025-12-22

### Added
- Instant wallpaper preview cache for new tabs (small, low-res snapshot) to eliminate black flashes
- Ultra-short wallpaper-layer fade-in for smoother first-frame experience
- Explicit shortcut icon fallback state with clearer styling and tooltips

### Changed
- Settings modal open/close animation shortened and eased for snappier feel
- Shortcut hover interaction tuned for faster, more responsive lift/highlight
- Bilibili default shortcut icon now uses DuckDuckGo favicon service for better reliability
- International comments in core scripts normalized to English for consistency

### Fixed
- Repeated favicon refetch attempts for problematic sites (GitHub/Bilibili/etc.) by caching failure state
- Intermittent Bing wallpaper processing Worker errors (now using ImageBitmap path robustly)

## [0.3.8] - 2025-12-08

### Added
- Shortcut open-target preference (current tab / new tab) with i18n coverage
- Icon loading robustness: `no-referrer`, lazy/async decode, unified fallback
- UI polish for shortcut option controls (radio/checkbox styling)
- Search icon added; improved shortcut name hover reveal when names are hidden
- Safer search-box handling: stricter URL detection to avoid false URL nav

### Changed
- Wallpaper init no longer blocks first paint; Bing fetch deferred to idle to reduce daily-refresh stutter
- Shortcut hover cards: increased opacity for better contrast

### Fixed
- Shortcut icons intermittently blank due to hotlink issues (fallback + safer loading)
- Daily Bing refresh causing brief freeze (async wallpaper load)

## [0.3.7] - 2025-12-06

### Added
- Search box scale control with smooth focus-up scale
- Shortcut drag-and-drop reordering and name visibility toggle with enhanced drag visuals
- Lightweight notice after resetting to Bing Daily (non-blocking)

### Changed
- Search box scaling now uses overall `scale` for more natural proportions
- Reset button auto-disables when not on custom wallpaper to avoid no-op clicks
- Preview vertical position display uses `vh` to match actual effect

### Fixed
- Cannot re-upload the same image after reset (file input now cleared)
- Reset hanging on Bing request timeout (added timeouts and fallback)
- Status text misaligned/overlapping click area

## [0.3.5] - 2025-12-04

### Added
- **Accessibility Features**: Comprehensive accessibility support for users with disabilities
  - High Contrast Themes: Standard, Dark, Light, Yellow on Black
  - Font Controls: Size (80%-200%), Family (Default, Sans-serif, Serif, OpenDyslexic)
  - Line Spacing: Normal, Relaxed, Very Relaxed
  - Animation Control: Full, Reduced, None
  - Focus Indicator Styles: Standard, Enhanced, Large
- **Bing Daily Wallpaper**: Auto-fetches beautiful daily wallpapers from Bing as default background
- **Multi-language Support**: Added Traditional Chinese (zh_TW) and Japanese (ja)
- **Keyboard Shortcuts**:
  - `Alt + ↑/↓`: Quick switch between search engines
  - `/`: Focus search box
  - `Alt + ,`: Open settings
- **Micro-interactions**: 
  - Ripple effects on buttons
  - Enhanced hover/active states with smooth transitions
- **Wallpaper Settings Preview**: Live preview of search box in wallpaper settings
- **Custom Select Components**: Beautiful styled dropdowns replacing native selects

### Changed
- **Code Architecture**: Modularized codebase for better maintainability
  - Extracted wallpaper logic to `wallpaper.js`
  - Extracted accessibility logic to `accessibility.js`
  - Extracted i18n logic to `i18n.js`
- **Improved Error Handling**: Added robust try-catch blocks for localStorage parsing and module initialization
- **Security Enhancements**:
  - XSS prevention: Replaced innerHTML with safe DOM manipulation
  - URL validation: Block dangerous protocols (javascript:, data:, vbscript:, file:)

### Fixed
- Search bar disappearing when animations set to "None"
- Custom dropdown positioning issues in modals
- Wallpaper settings not displaying after reset
- OpenDyslexic font not applying correctly

## [0.3.0] - 2025-12-03

### Added
- Initial release with core features
- Multi-engine search (Google, Bing, DuckDuckGo)
- Custom search engines support
- Quick shortcuts with auto-fetched favicons
- Custom wallpaper upload with drag-and-drop
- Internationalization (English, Simplified Chinese)
- Icon caching for faster loading
- Glassmorphism dark theme design

---

For more details, visit the [GitHub repository](https://github.com/zayokami/GenresFox).

