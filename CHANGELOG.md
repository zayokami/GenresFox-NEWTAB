# Changelog

All notable changes to GenresFox-NEWTAB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

For more details, visit the [GitHub repository](https://github.com/zayokami/GenresFox-NEWTAB).

