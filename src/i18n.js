/**
 * i18n.js - Internationalization Module for GenresFox-NEWTAB
 * Handles language detection, translation, and localization
 */

const I18n = (function () {
    'use strict';

    // Fallback messages for when Chrome i18n API is unavailable
    const _fallbackMessages = {
        "zh_CN": {
            "appTitle": "GenresFox-NEWTAB",
            "searchPlaceholder": "搜索...",
            "settingsTitle": "设置",
            "tabWallpaper": "壁纸",
            "tabSearch": "搜索与快捷方式",
            "tabAccessibility": "无障碍",
            "tabAbout": "关于",
            "uploadWallpaper": "上传壁纸",
            "resetWallpaper": "恢复默认",
            "customEngines": "自定义搜索引擎",
            "shortcuts": "快捷方式",
            "add": "添加",
            "dragDropText": "拖拽图片到此处或点击上传",
            "wallpaperSettings": "壁纸设置",
            "blurAmount": "模糊程度",
            "vignetteAmount": "暗角程度",
            "resetShortcuts": "重置快捷方式",
            "searchBoxSettings": "搜索框设置",
            "searchBoxWidth": "宽度",
            "searchBoxPosition": "垂直位置",
            "livePreview": "实时预览",
            "a11yDisplay": "显示",
            "a11yTheme": "主题",
            "a11yThemeStandard": "标准",
            "a11yThemeHCDark": "高对比度 (深色)",
            "a11yThemeHCLight": "高对比度 (浅色)",
            "a11yThemeYellowBlack": "黄底黑字",
            "a11yFontSize": "字体大小",
            "a11yFontFamily": "字体",
            "a11yFontDefault": "默认",
            "a11yFontSans": "无衬线",
            "a11yFontSerif": "衬线",
            "a11yFontDyslexic": "阅读障碍友好",
            "a11yLineSpacing": "行间距",
            "a11ySpacingNormal": "正常",
            "a11ySpacingRelaxed": "宽松",
            "a11ySpacingVeryRelaxed": "很宽松",
            "a11yMotion": "动画",
            "a11yAnimations": "动画效果",
            "a11yMotionFull": "完整",
            "a11yMotionReduced": "减少",
            "a11yMotionNone": "无",
            "a11yFocus": "焦点",
            "a11yFocusIndicator": "焦点指示器",
            "a11yFocusStandard": "标准",
            "a11yFocusEnhanced": "增强",
            "a11yFocusLarge": "大型",
            "a11yReset": "恢复默认设置",
            "aboutDescription": "一个完全开源、极简、高度可定制的新标签页扩展。",
            "aboutOpenSource": "GenresFox-NEWTAB 是一个开源项目，你可以在 GitHub 上找到源代码！",
            "viewOnGitHub": "在 GitHub 上查看",
            "creditsTitle": "致谢",
            "creditsBingWallpaper": "默认壁纸由 Bing 每日壁纸提供。"
        },
        "en": {
            "appTitle": "GenresFox-NEWTAB",
            "searchPlaceholder": "Search...",
            "settingsTitle": "Settings",
            "tabWallpaper": "Wallpaper",
            "tabSearch": "Search & Shortcuts",
            "tabAccessibility": "Accessibility",
            "tabAbout": "About",
            "uploadWallpaper": "Upload Wallpaper",
            "resetWallpaper": "Reset to Default",
            "customEngines": "Custom Search Engines",
            "shortcuts": "Shortcuts",
            "add": "Add",
            "dragDropText": "Drag & Drop image here or click to upload",
            "wallpaperSettings": "Wallpaper Settings",
            "blurAmount": "Blur Amount",
            "vignetteAmount": "Vignette Amount",
            "resetShortcuts": "Reset Shortcuts",
            "searchBoxSettings": "Search Box Settings",
            "searchBoxWidth": "Width",
            "searchBoxPosition": "Vertical Position",
            "livePreview": "Live Preview",
            "a11yDisplay": "Display",
            "a11yTheme": "Theme",
            "a11yThemeStandard": "Standard",
            "a11yThemeHCDark": "High Contrast (Dark)",
            "a11yThemeHCLight": "High Contrast (Light)",
            "a11yThemeYellowBlack": "Yellow on Black",
            "a11yFontSize": "Font Size",
            "a11yFontFamily": "Font Family",
            "a11yFontDefault": "Default",
            "a11yFontSans": "Sans-serif",
            "a11yFontSerif": "Serif",
            "a11yFontDyslexic": "OpenDyslexic",
            "a11yLineSpacing": "Line Spacing",
            "a11ySpacingNormal": "Normal",
            "a11ySpacingRelaxed": "Relaxed",
            "a11ySpacingVeryRelaxed": "Very Relaxed",
            "a11yMotion": "Motion",
            "a11yAnimations": "Animations",
            "a11yMotionFull": "Full",
            "a11yMotionReduced": "Reduced",
            "a11yMotionNone": "None",
            "a11yFocus": "Focus",
            "a11yFocusIndicator": "Focus Indicator",
            "a11yFocusStandard": "Standard",
            "a11yFocusEnhanced": "Enhanced",
            "a11yFocusLarge": "Large",
            "a11yReset": "Reset to Defaults",
            "aboutDescription": "A fully open-source, extremely clean, and highly customizable new tab page extension.",
            "aboutOpenSource": "GenresFox-NEWTAB is an open-source project. You can find the source code on GitHub!",
            "viewOnGitHub": "View on GitHub",
            "creditsTitle": "Credits",
            "creditsBingWallpaper": "Default wallpaper powered by Bing Daily Wallpaper."
        },
        "zh_TW": {
            "appTitle": "GenresFox-NEWTAB",
            "searchPlaceholder": "搜尋...",
            "settingsTitle": "設定",
            "tabWallpaper": "桌布",
            "tabSearch": "搜尋與捷徑",
            "tabAccessibility": "無障礙",
            "tabAbout": "關於",
            "uploadWallpaper": "上傳桌布",
            "resetWallpaper": "恢復預設",
            "customEngines": "自訂搜尋引擎",
            "shortcuts": "捷徑",
            "add": "新增",
            "dragDropText": "拖曳圖片到此處或點擊上傳",
            "wallpaperSettings": "桌布設定",
            "blurAmount": "模糊程度",
            "vignetteAmount": "暗角程度",
            "resetShortcuts": "重設捷徑",
            "searchBoxSettings": "搜尋框設定",
            "searchBoxWidth": "寬度",
            "searchBoxPosition": "垂直位置",
            "livePreview": "即時預覽",
            "a11yDisplay": "顯示",
            "a11yTheme": "主題",
            "a11yThemeStandard": "標準",
            "a11yThemeHCDark": "高對比 (深色)",
            "a11yThemeHCLight": "高對比 (淺色)",
            "a11yThemeYellowBlack": "黃底黑字",
            "a11yFontSize": "字型大小",
            "a11yFontFamily": "字型",
            "a11yFontDefault": "預設",
            "a11yFontSans": "無襯線",
            "a11yFontSerif": "襯線",
            "a11yFontDyslexic": "閱讀障礙友善",
            "a11yLineSpacing": "行距",
            "a11ySpacingNormal": "正常",
            "a11ySpacingRelaxed": "寬鬆",
            "a11ySpacingVeryRelaxed": "非常寬鬆",
            "a11yMotion": "動畫",
            "a11yAnimations": "動畫效果",
            "a11yMotionFull": "完整",
            "a11yMotionReduced": "減少",
            "a11yMotionNone": "無",
            "a11yFocus": "焦點",
            "a11yFocusIndicator": "焦點指示器",
            "a11yFocusStandard": "標準",
            "a11yFocusEnhanced": "增強",
            "a11yFocusLarge": "大型",
            "a11yReset": "恢復預設設定",
            "aboutDescription": "一個完全開源、極簡、高度可自訂的新分頁擴充功能。",
            "aboutOpenSource": "GenresFox-NEWTAB 是一個開源專案，你可以在 GitHub 上找到原始碼！",
            "viewOnGitHub": "在 GitHub 上查看",
            "creditsTitle": "致謝",
            "creditsBingWallpaper": "預設桌布由 Bing 每日桌布提供。"
        },
        "ja": {
            "appTitle": "GenresFox-NEWTAB",
            "searchPlaceholder": "検索...",
            "settingsTitle": "設定",
            "tabWallpaper": "壁紙",
            "tabSearch": "検索とショートカット",
            "tabAccessibility": "アクセシビリティ",
            "tabAbout": "について",
            "uploadWallpaper": "壁紙をアップロード",
            "resetWallpaper": "デフォルトに戻す",
            "customEngines": "カスタム検索エンジン",
            "shortcuts": "ショートカット",
            "add": "追加",
            "dragDropText": "画像をドラッグ＆ドロップまたはクリックしてアップロード",
            "wallpaperSettings": "壁紙設定",
            "blurAmount": "ぼかし量",
            "vignetteAmount": "ビネット量",
            "resetShortcuts": "ショートカットをリセット",
            "searchBoxSettings": "検索ボックス設定",
            "searchBoxWidth": "幅",
            "searchBoxPosition": "垂直位置",
            "livePreview": "ライブプレビュー",
            "a11yDisplay": "表示",
            "a11yTheme": "テーマ",
            "a11yThemeStandard": "標準",
            "a11yThemeHCDark": "ハイコントラスト (ダーク)",
            "a11yThemeHCLight": "ハイコントラスト (ライト)",
            "a11yThemeYellowBlack": "黄色に黒",
            "a11yFontSize": "フォントサイズ",
            "a11yFontFamily": "フォント",
            "a11yFontDefault": "デフォルト",
            "a11yFontSans": "サンセリフ",
            "a11yFontSerif": "セリフ",
            "a11yFontDyslexic": "ディスレクシア対応",
            "a11yLineSpacing": "行間",
            "a11ySpacingNormal": "標準",
            "a11ySpacingRelaxed": "広め",
            "a11ySpacingVeryRelaxed": "とても広め",
            "a11yMotion": "モーション",
            "a11yAnimations": "アニメーション",
            "a11yMotionFull": "フル",
            "a11yMotionReduced": "軽減",
            "a11yMotionNone": "なし",
            "a11yFocus": "フォーカス",
            "a11yFocusIndicator": "フォーカスインジケーター",
            "a11yFocusStandard": "標準",
            "a11yFocusEnhanced": "強調",
            "a11yFocusLarge": "大",
            "a11yReset": "デフォルトに戻す",
            "aboutDescription": "完全オープンソース、シンプル、高度にカスタマイズ可能な新しいタブページ拡張機能。",
            "aboutOpenSource": "GenresFox-NEWTAB はオープンソースプロジェクトです。GitHub でソースコードを見つけることができます！",
            "viewOnGitHub": "GitHub で見る",
            "creditsTitle": "クレジット",
            "creditsBingWallpaper": "デフォルト壁紙は Bing 日替わり壁紙を使用しています。"
        }
    };

    // Supported languages list
    const _supportedLanguages = ['zh_CN', 'zh_TW', 'ja', 'en'];

    // Current language
    let _currentLanguage = null;

    /**
     * Detect user's preferred language based on browser settings
     * @returns {string} Language code
     */
    function _detectLanguage() {
        const saved = localStorage.getItem('preferredLanguage');
        if (saved && _supportedLanguages.includes(saved)) {
            return saved;
        }

        const browserLang = navigator.language || navigator.userLanguage;

        // Check for Traditional Chinese (Taiwan, Hong Kong, Macau, etc.)
        if (browserLang === 'zh-TW' || browserLang === 'zh-HK' || browserLang === 'zh-MO' || browserLang === 'zh-Hant') {
            return 'zh_TW';
        }
        // Check for Simplified Chinese (Mainland China, Singapore, etc.)
        if (browserLang.startsWith('zh')) {
            return 'zh_CN';
        }
        // Check for Japanese
        if (browserLang.startsWith('ja')) {
            return 'ja';
        }
        // Default to English
        return 'en';
    }

    /**
     * Get a translated message by key
     * @param {string} key - Message key
     * @returns {string} Translated message or empty string
     */
    function getMessage(key) {
        // Try Chrome i18n API first
        if (typeof chrome !== 'undefined' && chrome.i18n) {
            const msg = chrome.i18n.getMessage(key);
            if (msg) return msg;
        }

        // Fallback to local messages
        const messages = _fallbackMessages[_currentLanguage] || _fallbackMessages['en'];
        return messages[key] || '';
    }

    /**
     * Apply translations to all elements with data-i18n attributes
     * @param {string} [lang] - Optional language code to switch to
     */
    function localize(lang = null) {
        if (lang && _supportedLanguages.includes(lang)) {
            _currentLanguage = lang;
            localStorage.setItem('preferredLanguage', lang);
        }

        const fallback = _fallbackMessages[_currentLanguage] || _fallbackMessages['en'];

        if (typeof chrome !== 'undefined' && chrome.i18n && !localStorage.getItem('preferredLanguage')) {
            // Use Chrome's i18n only if user hasn't manually set a language
            document.querySelectorAll('[data-i18n]').forEach(elem => {
                let msg = chrome.i18n.getMessage(elem.dataset.i18n);
                if (!msg && fallback && fallback[elem.dataset.i18n]) {
                    msg = fallback[elem.dataset.i18n];
                }
                if (msg) elem.textContent = msg;
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
                let msg = chrome.i18n.getMessage(elem.dataset.i18nPlaceholder);
                if (!msg && fallback && fallback[elem.dataset.i18nPlaceholder]) {
                    msg = fallback[elem.dataset.i18nPlaceholder];
                }
                if (msg) elem.placeholder = msg;
            });
        } else {
            // Use fallback messages with selected language
            const messages = _fallbackMessages[_currentLanguage] || _fallbackMessages['en'];
            document.querySelectorAll('[data-i18n]').forEach(elem => {
                const key = elem.dataset.i18n;
                if (messages[key]) elem.textContent = messages[key];
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
                const key = elem.dataset.i18nPlaceholder;
                if (messages[key]) elem.placeholder = messages[key];
            });
        }

        // Update HTML lang attribute
        const langMap = {
            'zh_CN': 'zh-Hans',
            'zh_TW': 'zh-Hant',
            'ja': 'ja',
            'en': 'en'
        };
        document.documentElement.lang = langMap[_currentLanguage] || 'en';
    }

    /**
     * Get current language code
     * @returns {string} Current language code
     */
    function getCurrentLanguage() {
        return _currentLanguage;
    }

    /**
     * Get list of supported languages
     * @returns {string[]} Array of supported language codes
     */
    function getSupportedLanguages() {
        return [..._supportedLanguages];
    }

    /**
     * Initialize the i18n module
     */
    function init() {
        _currentLanguage = _detectLanguage();
    }

    // Public API
    return {
        init,
        localize,
        getMessage,
        getCurrentLanguage,
        getSupportedLanguages
    };
})();

