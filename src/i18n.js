/**
 * i18n.js - Internationalization Module for GenresFox
 * Handles language detection, translation, and localization
 */

const I18n = (function () {
    'use strict';

    // Fallback messages for when Chrome i18n API is unavailable
    const _fallbackMessages = {
        "zh_CN": {
            "appTitle": "GenresFox",
            "searchPlaceholder": "搜索...",
            "searchActionLabel": "搜索",
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
            "shortcutOpenCurrent": "当前页面打开",
            "shortcutOpenNewTab": "新标签页打开",
            "searchBoxSettings": "搜索框设置",
            "searchBoxWidth": "宽度",
            "searchBoxScale": "大小",
            "searchBoxPosition": "垂直位置",
            "searchBoxRadius": "圆角",
            "searchBoxShadow": "阴影强度",
            "showShortcutNames": "显示快捷方式名称",
            "shortcutDragHint": "💡 拖拽快捷方式可调整顺序",
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
            "aboutOpenSource": "GenresFox 是一个开源项目，你可以在 GitHub 上找到源代码！",
            "viewOnGitHub": "在 GitHub 上查看",
            "creditsTitle": "致谢",
            "creditsBingWallpaper": "默认壁纸由 Bing 每日壁纸提供。",
            "processingImage": "正在处理图片...",
            "processingLoading": "加载图片中...",
            "processingOptimizing": "优化中...",
            "processingCompressing": "压缩中...",
            "processingSaving": "保存中...",
            "processingStarting": "开始处理...",
            "errorImageTooLarge": "图片文件过大（最大 50MB）",
            "errorResolutionTooHigh": "图片分辨率过高（最大 5000 万像素）",
            "resetToBing": "已切换到 Bing 每日壁纸",
            "deleteShortcutConfirm": "确认删除快捷方式“%s”？",
            "searchErrorUnsafeUrl": "无法访问此网址，可能不安全。",
            "searchErrorNavigationFailed": "链接打开失败。",
            "searchErrorNoEngine": "没有可用的搜索引擎。"
        },
        "en": {
            "appTitle": "GenresFox",
            "searchPlaceholder": "Search...",
            "searchActionLabel": "Search",
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
            "shortcutOpenCurrent": "Open in current tab",
            "shortcutOpenNewTab": "Open in new tab",
            "searchBoxSettings": "Search Box Settings",
            "searchBoxWidth": "Width",
            "searchBoxScale": "Size",
            "searchBoxPosition": "Vertical Position",
            "searchBoxRadius": "Corner Radius",
            "searchBoxShadow": "Shadow Strength",
            "showShortcutNames": "Show shortcut names",
            "shortcutDragHint": "💡 Drag shortcuts to reorder them",
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
            "aboutOpenSource": "GenresFox is an open-source project. You can find the source code on GitHub!",
            "viewOnGitHub": "View on GitHub",
            "creditsTitle": "Credits",
            "creditsBingWallpaper": "Default wallpaper powered by Bing Daily Wallpaper.",
            "processingImage": "Processing image...",
            "processingLoading": "Loading image...",
            "processingOptimizing": "Optimizing...",
            "processingCompressing": "Compressing...",
            "processingSaving": "Saving...",
            "processingStarting": "Starting...",
            "errorImageTooLarge": "Image file too large (max 50MB)",
            "errorResolutionTooHigh": "Image resolution too high (max 50 megapixels)",
            "resetToBing": "Switched to Bing Daily Wallpaper",
            "deleteShortcutConfirm": "Delete shortcut \"%s\"?",
            "searchErrorUnsafeUrl": "This URL may be unsafe.",
            "searchErrorNavigationFailed": "Failed to open the link.",
            "searchErrorNoEngine": "No available search engine."
        },
        "zh_TW": {
            "appTitle": "GenresFox",
            "searchPlaceholder": "搜尋...",
            "searchActionLabel": "搜尋",
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
            "shortcutOpenCurrent": "在當前頁面開啟",
            "shortcutOpenNewTab": "在新分頁開啟",
            "searchBoxSettings": "搜尋框設定",
            "searchBoxWidth": "寬度",
            "searchBoxScale": "大小",
            "searchBoxPosition": "垂直位置",
            "searchBoxRadius": "圓角",
            "searchBoxShadow": "陰影強度",
            "showShortcutNames": "顯示捷徑名稱",
            "shortcutDragHint": "💡 拖曳捷徑可調整順序",
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
            "aboutOpenSource": "GenresFox 是一個開源專案，你可以在 GitHub 上找到原始碼！",
            "viewOnGitHub": "在 GitHub 上查看",
            "creditsTitle": "致謝",
            "creditsBingWallpaper": "預設桌布由 Bing 每日桌布提供。",
            "processingImage": "正在處理圖片...",
            "processingLoading": "載入圖片中...",
            "processingOptimizing": "優化中...",
            "processingCompressing": "壓縮中...",
            "processingSaving": "儲存中...",
            "processingStarting": "開始處理...",
            "errorImageTooLarge": "圖片檔案過大（最大 50MB）",
            "errorResolutionTooHigh": "圖片解析度過高（最大 5000 萬像素）",
            "resetToBing": "已切換到 Bing 每日桌布",
            "deleteShortcutConfirm": "確認刪除捷徑「%s」？",
            "searchErrorUnsafeUrl": "無法訪問此網址，可能不安全。",
            "searchErrorNavigationFailed": "連結開啟失敗。",
            "searchErrorNoEngine": "沒有可用的搜尋引擎。"
        },
        "ja": {
            "appTitle": "GenresFox",
            "searchPlaceholder": "検索...",
            "searchActionLabel": "検索",
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
            "shortcutOpenCurrent": "現在のタブで開く",
            "shortcutOpenNewTab": "新しいタブで開く",
            "searchBoxSettings": "検索ボックス設定",
            "searchBoxWidth": "幅",
            "searchBoxScale": "サイズ",
            "searchBoxPosition": "垂直位置",
            "searchBoxRadius": "角丸",
            "searchBoxShadow": "影の強さ",
            "showShortcutNames": "ショートカット名を表示",
            "shortcutDragHint": "💡 ショートカットをドラッグして並べ替え",
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
            "aboutOpenSource": "GenresFox はオープンソースプロジェクトです。GitHub でソースコードを見つけることができます！",
            "viewOnGitHub": "GitHub で見る",
            "creditsTitle": "クレジット",
            "creditsBingWallpaper": "デフォルト壁紙は Bing 日替わり壁紙を使用しています。",
            "processingImage": "画像を処理中...",
            "processingLoading": "画像を読み込み中...",
            "processingOptimizing": "最適化中...",
            "processingCompressing": "圧縮中...",
            "processingSaving": "保存中...",
            "processingStarting": "処理を開始...",
            "errorImageTooLarge": "画像ファイルが大きすぎます（最大 50MB）",
            "errorResolutionTooHigh": "画像の解像度が高すぎます（最大 5000 万ピクセル）",
            "resetToBing": "Bing 日替わり壁紙に切り替えました",
            "deleteShortcutConfirm": "ショートカット「%s」を削除しますか？",
            "searchErrorUnsafeUrl": "この URL は安全ではない可能性があります。",
            "searchErrorNavigationFailed": "リンクを開けませんでした。",
            "searchErrorNoEngine": "利用できる検索エンジンがありません。"
        },
        "es": {
            "appTitle": "GenresFox",
            "searchPlaceholder": "Buscar...",
            "searchActionLabel": "Buscar",
            "settingsTitle": "Ajustes",
            "tabWallpaper": "Fondo",
            "tabSearch": "Búsqueda y accesos",
            "tabAccessibility": "Accesibilidad",
            "tabAbout": "Acerca de",
            "uploadWallpaper": "Subir fondo",
            "resetWallpaper": "Restablecer por defecto",
            "customEngines": "Motores de búsqueda personalizados",
            "shortcuts": "Accesos directos",
            "add": "Añadir",
            "dragDropText": "Arrastra una imagen aquí o haz clic para subirla",
            "wallpaperSettings": "Ajustes de fondo",
            "blurAmount": "Desenfoque",
            "vignetteAmount": "Viñeta",
            "resetShortcuts": "Restablecer accesos",
            "shortcutOpenCurrent": "Abrir en la pestaña actual",
            "shortcutOpenNewTab": "Abrir en nueva pestaña",
            "searchBoxSettings": "Ajustes de la caja de búsqueda",
            "searchBoxWidth": "Ancho",
            "searchBoxScale": "Tamaño",
            "searchBoxPosition": "Posición vertical",
            "searchBoxRadius": "Radio de esquina",
            "searchBoxShadow": "Intensidad de sombra",
            "showShortcutNames": "Mostrar nombres de accesos",
            "shortcutDragHint": "💡 Arrastra accesos para reordenar",
            "livePreview": "Vista previa en vivo",
            "a11yDisplay": "Pantalla",
            "a11yTheme": "Tema",
            "a11yThemeStandard": "Estándar",
            "a11yThemeHCDark": "Alto contraste (oscuro)",
            "a11yThemeHCLight": "Alto contraste (claro)",
            "a11yThemeYellowBlack": "Amarillo sobre negro",
            "a11yFontSize": "Tamaño de fuente",
            "a11yFontFamily": "Familia de fuente",
            "a11yFontDefault": "Predeterminado",
            "a11yFontSans": "Sans-serif",
            "a11yFontSerif": "Serif",
            "a11yFontDyslexic": "OpenDyslexic",
            "a11yLineSpacing": "Espaciado de línea",
            "a11ySpacingNormal": "Normal",
            "a11ySpacingRelaxed": "Relajado",
            "a11ySpacingVeryRelaxed": "Muy relajado",
            "a11yMotion": "Movimiento",
            "a11yAnimations": "Animaciones",
            "a11yMotionFull": "Completo",
            "a11yMotionReduced": "Reducido",
            "a11yMotionNone": "Ninguno",
            "a11yFocus": "Foco",
            "a11yFocusIndicator": "Indicador de foco",
            "a11yFocusStandard": "Estándar",
            "a11yFocusEnhanced": "Mejorado",
            "a11yFocusLarge": "Grande",
            "a11yReset": "Restablecer ajustes",
            "aboutDescription": "Extensión de nueva pestaña, abierta, limpia y altamente personalizable.",
            "aboutOpenSource": "GenresFox es un proyecto open source. ¡Encuentra el código en GitHub!",
            "viewOnGitHub": "Ver en GitHub",
            "creditsTitle": "Créditos",
            "creditsBingWallpaper": "Fondo predeterminado de Bing Daily Wallpaper.",
            "processingImage": "Procesando imagen...",
            "processingLoading": "Cargando imagen...",
            "processingOptimizing": "Optimizando...",
            "processingCompressing": "Comprimiendo...",
            "processingSaving": "Guardando...",
            "processingStarting": "Iniciando...",
            "errorImageTooLarge": "Imagen demasiado grande (máx 50MB)",
            "errorResolutionTooHigh": "Resolución demasiado alta (máx 50 megapíxeles)",
            "resetToBing": "Cambiado a fondo diario de Bing",
            "deleteShortcutConfirm": "¿Eliminar acceso directo \"%s\"?",
            "searchErrorUnsafeUrl": "Esta URL puede ser insegura.",
            "searchErrorNavigationFailed": "No se pudo abrir el enlace.",
            "searchErrorNoEngine": "No hay motor de búsqueda disponible."
        },
        "fr": {
            "appTitle": "GenresFox",
            "searchPlaceholder": "Rechercher...",
            "searchActionLabel": "Rechercher",
            "settingsTitle": "Paramètres",
            "tabWallpaper": "Fond d'écran",
            "tabSearch": "Recherche & raccourcis",
            "tabAccessibility": "Accessibilité",
            "tabAbout": "À propos",
            "uploadWallpaper": "Téléverser un fond",
            "resetWallpaper": "Restaurer par défaut",
            "customEngines": "Moteurs de recherche personnalisés",
            "shortcuts": "Raccourcis",
            "add": "Ajouter",
            "dragDropText": "Glissez une image ici ou cliquez pour téléverser",
            "wallpaperSettings": "Paramètres du fond",
            "blurAmount": "Flou",
            "vignetteAmount": "Vignette",
            "resetShortcuts": "Réinitialiser les raccourcis",
            "shortcutOpenCurrent": "Ouvrir dans l’onglet actuel",
            "shortcutOpenNewTab": "Ouvrir dans un nouvel onglet",
            "searchBoxSettings": "Paramètres de la recherche",
            "searchBoxWidth": "Largeur",
            "searchBoxScale": "Taille",
            "searchBoxPosition": "Position verticale",
            "searchBoxRadius": "Rayon des angles",
            "searchBoxShadow": "Intensité de l'ombre",
            "showShortcutNames": "Afficher les noms des raccourcis",
            "shortcutDragHint": "💡 Faites glisser pour réorganiser",
            "livePreview": "Aperçu en direct",
            "a11yDisplay": "Affichage",
            "a11yTheme": "Thème",
            "a11yThemeStandard": "Standard",
            "a11yThemeHCDark": "Contraste élevé (sombre)",
            "a11yThemeHCLight": "Contraste élevé (clair)",
            "a11yThemeYellowBlack": "Jaune sur noir",
            "a11yFontSize": "Taille de police",
            "a11yFontFamily": "Famille de police",
            "a11yFontDefault": "Par défaut",
            "a11yFontSans": "Sans-serif",
            "a11yFontSerif": "Serif",
            "a11yFontDyslexic": "OpenDyslexic",
            "a11yLineSpacing": "Interligne",
            "a11ySpacingNormal": "Normal",
            "a11ySpacingRelaxed": "Détendu",
            "a11ySpacingVeryRelaxed": "Très détendu",
            "a11yMotion": "Mouvements",
            "a11yAnimations": "Animations",
            "a11yMotionFull": "Complet",
            "a11yMotionReduced": "Réduit",
            "a11yMotionNone": "Aucun",
            "a11yFocus": "Focus",
            "a11yFocusIndicator": "Indicateur de focus",
            "a11yFocusStandard": "Standard",
            "a11yFocusEnhanced": "Amélioré",
            "a11yFocusLarge": "Grand",
            "a11yReset": "Restaurer les paramètres",
            "aboutDescription": "Extension d'onglet, open source, épurée et hautement personnalisable.",
            "aboutOpenSource": "GenresFox est open source. Retrouvez le code sur GitHub !",
            "viewOnGitHub": "Voir sur GitHub",
            "creditsTitle": "Crédits",
            "creditsBingWallpaper": "Fond par défaut : Bing Daily Wallpaper.",
            "processingImage": "Traitement de l'image...",
            "processingLoading": "Chargement de l'image...",
            "processingOptimizing": "Optimisation...",
            "processingCompressing": "Compression...",
            "processingSaving": "Enregistrement...",
            "processingStarting": "Démarrage...",
            "errorImageTooLarge": "Fichier trop volumineux (max 50MB)",
            "errorResolutionTooHigh": "Résolution trop élevée (max 50 mégapixels)",
            "resetToBing": "Passé au fond quotidien Bing",
            "deleteShortcutConfirm": "Supprimer le raccourci \"%s\" ?",
            "searchErrorUnsafeUrl": "Cette URL peut être dangereuse.",
            "searchErrorNavigationFailed": "Impossible d'ouvrir le lien.",
            "searchErrorNoEngine": "Aucun moteur de recherche disponible."
        }
    };

    // Supported languages list
    const _supportedLanguages = ['zh_CN', 'zh_TW', 'ja', 'en', 'es', 'fr'];

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

