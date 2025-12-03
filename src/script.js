// Elements
const searchInput = document.getElementById("search");
const enginesList = document.getElementById("enginesList");
const shortcutsList = document.getElementById("shortcutsList");
const shortcutsGrid = document.getElementById("shortcuts");
const settingsBtn = document.querySelector(".settings-btn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.querySelector(".close-btn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const wallpaperUpload = document.getElementById("wallpaperUpload");
const resetWallpaper = document.getElementById("resetWallpaper");
const addEngineBtn = document.getElementById("addEngineBtn");
const addShortcutBtn = document.getElementById("addShortcutBtn");
const engineSelector = document.querySelector(".engine-selector");
const selectedEngineIcon = document.querySelector(".selected-engine");
const engineDropdown = document.querySelector(".engine-dropdown");

// Search box customization elements
const searchWidthSlider = document.getElementById("searchWidthSlider");
const searchPositionSlider = document.getElementById("searchPositionSlider");
const searchWidthValue = document.getElementById("searchWidthValue");
const searchPositionValue = document.getElementById("searchPositionValue");

// Default Data
const defaultEngines = {
    google: {
        name: "Google",
        url: "https://www.google.com/search?q=%s",
        icon: "https://www.google.com/favicon.ico"
    },
    bing: {
        name: "Bing",
        url: "https://www.bing.com/search?q=%s",
        icon: "https://www.bing.com/favicon.ico"
    },
    duckduckgo: {
        name: "DuckDuckGo",
        url: "https://duckduckgo.com/?q=%s",
        icon: "https://duckduckgo.com/favicon.ico"
    }
};

const defaultShortcuts = [
    { name: "GitHub", url: "https://github.com", icon: "https://github.com/favicon.ico" },
    { name: "YouTube", url: "https://youtube.com", icon: "https://www.youtube.com/favicon.ico" },
    { name: "Bilibili", url: "https://bilibili.com", icon: "https://www.bilibili.com/favicon.ico" },
    { name: "Gmail", url: "https://mail.google.com", icon: "https://mail.google.com/favicon.ico" }
];

// State
let engines = JSON.parse(localStorage.getItem("engines")) || defaultEngines;
let currentEngine = localStorage.getItem("preferredEngine") || "google";
let shortcuts = JSON.parse(localStorage.getItem("shortcuts"));

if (!shortcuts || shortcuts.length === 0) {
    shortcuts = defaultShortcuts;
    localStorage.setItem("shortcuts", JSON.stringify(shortcuts));
}

// --- Helper Functions ---
function saveEngines() {
    localStorage.setItem("engines", JSON.stringify(engines));
    renderEnginesList();
    renderEngineDropdown();
}

function saveShortcuts() {
    localStorage.setItem("shortcuts", JSON.stringify(shortcuts));
    renderShortcutsList();
    renderShortcutsGrid();
}

function getFavicon(url) {
    try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
        return "icon.png";
    }
}

// --- Icon Caching Logic ---
async function cacheIcon(key, url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            localStorage.setItem(`icon_cache_${key}`, reader.result);
            updateUI();
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.warn(`Failed to cache icon for ${key}`, error);
    }
}

function getIconSrc(key, url) {
    const cached = localStorage.getItem(`icon_cache_${key}`);
    if (cached) return cached;
    cacheIcon(key, url);
    return url;
}

// --- UI Rendering ---
function updateUI() {
    // Update selected engine icon
    const engine = engines[currentEngine] || engines.google;
    const src = getIconSrc(currentEngine, engine.icon);
    selectedEngineIcon.innerHTML = `<img src="${src}" alt="${engine.name}" width="20" height="20">`;

    renderEngineDropdown();
}

function renderEngineDropdown() {
    engineDropdown.innerHTML = '';
    Object.keys(engines).forEach(key => {
        const engine = engines[key];
        const div = document.createElement("div");
        div.className = "engine-option";
        div.dataset.engine = key;
        div.innerHTML = `
            <img src="${getIconSrc(key, engine.icon)}" width="20" height="20">
            <span>${engine.name}</span>
        `;
        div.addEventListener("click", () => setEngine(key));
        engineDropdown.appendChild(div);
    });
}

function renderEnginesList() {
    enginesList.innerHTML = '';
    Object.keys(engines).forEach(key => {
        const engine = engines[key];
        const div = document.createElement("div");
        div.className = "list-item";

        const spanInfo = document.createElement("span");
        spanInfo.innerHTML = `<img src="${getIconSrc(key, engine.icon)}" width="20" height="20"> ${engine.name}`;
        div.appendChild(spanInfo);

        if (!defaultEngines[key]) {
            const deleteBtn = document.createElement("span");
            deleteBtn.className = "delete-btn";
            deleteBtn.innerHTML = "&times;";
            deleteBtn.addEventListener("click", () => deleteEngine(key));
            div.appendChild(deleteBtn);
        }

        enginesList.appendChild(div);
    });
}

function renderShortcutsList() {
    shortcutsList.innerHTML = '';
    shortcuts.forEach((shortcut, index) => {
        const div = document.createElement("div");
        div.className = "list-item";

        const spanInfo = document.createElement("span");
        spanInfo.innerHTML = `<img src="${shortcut.icon}" width="20" height="20"> ${shortcut.name}`;
        div.appendChild(spanInfo);

        const deleteBtn = document.createElement("span");
        deleteBtn.className = "delete-btn";
        deleteBtn.innerHTML = "&times;";
        deleteBtn.addEventListener("click", () => deleteShortcut(index));
        div.appendChild(deleteBtn);

        shortcutsList.appendChild(div);
    });
}

function renderShortcutsGrid() {
    shortcutsGrid.innerHTML = '';
    shortcuts.forEach(shortcut => {
        const a = document.createElement("a");
        a.href = shortcut.url;
        a.className = "shortcut-item";
        a.innerHTML = `
            <div class="shortcut-icon">
                <img src="${shortcut.icon}" alt="${shortcut.name}">
            </div>
            <div class="shortcut-name">${shortcut.name}</div>
        `;
        shortcutsGrid.appendChild(a);
    });
}

// --- Actions ---
function setEngine(key) {
    if (!engines[key]) return;
    currentEngine = key;
    localStorage.setItem("preferredEngine", key);
    updateUI();
    engineSelector.classList.remove("active");
}

window.deleteEngine = (key) => {
    if (defaultEngines[key]) return;
    delete engines[key];
    if (currentEngine === key) setEngine("google");
    saveEngines();
};

window.deleteShortcut = (index) => {
    shortcuts.splice(index, 1);
    saveShortcuts();
};

// --- Event Listeners ---

// Settings Modal
settingsBtn.addEventListener("click", () => settingsModal.classList.add("active"));
closeSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove("active");
});

// Tabs
tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
});

// --- IndexedDB Helper ---
const dbName = "GenresFoxDB";
const storeName = "wallpapers";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
    });
}

async function saveWallpaperToDB(file) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(file, "currentWallpaper");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getWallpaperFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get("currentWallpaper");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteWallpaperFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete("currentWallpaper");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Wallpaper Logic ---
const dropZone = document.getElementById("dropZone");
const uploadContent = document.getElementById("uploadContent");
const wallpaperPreview = document.getElementById("wallpaperPreview");
const previewImg = document.getElementById("previewImg");
const wallpaperControls = document.getElementById("wallpaperControls");
const blurSlider = document.getElementById("blurSlider");
const vignetteSlider = document.getElementById("vignetteSlider");
const blurValue = document.getElementById("blurValue");
const vignetteValue = document.getElementById("vignetteValue");

// Load saved settings
let wallpaperSettings = JSON.parse(localStorage.getItem("wallpaperSettings")) || {
    blur: 0,
    vignette: 0
};

let searchBoxSettings = JSON.parse(localStorage.getItem("searchBoxSettings")) || {
    width: 600,
    position: 40
};

let currentWallpaperUrl = null;

function setWallpaper(url) {
    // Revoke old URL to prevent memory leaks if it's a blob URL
    if (currentWallpaperUrl && currentWallpaperUrl.startsWith('blob:') && currentWallpaperUrl !== url) {
        URL.revokeObjectURL(currentWallpaperUrl);
    }
    currentWallpaperUrl = url;
    document.documentElement.style.setProperty('--wallpaper-image', `url(${url})`);
}

function applyWallpaperEffects() {
    const blur = wallpaperSettings.blur;
    const vignette = wallpaperSettings.vignette;

    // Set blur using CSS variable
    document.documentElement.style.setProperty('--wallpaper-blur', `${blur / 10}px`);

    // Set vignette using CSS variable
    if (vignette > 0) {
        const vignetteStrength = vignette / 100;
        const vignetteGradient = `radial-gradient(circle, transparent 0%, rgba(0,0,0,${vignetteStrength * 0.7}) 100%)`;
        document.documentElement.style.setProperty('--wallpaper-vignette', vignetteGradient);
    } else {
        document.documentElement.style.setProperty('--wallpaper-vignette', 'transparent');
    }
}

function applySearchBoxSettings() {
    const width = searchBoxSettings.width;
    const position = searchBoxSettings.position;

    document.documentElement.style.setProperty('--search-width', `${width}px`);
    document.documentElement.style.setProperty('--search-position', `${position}vh`);
}

function updatePreview(url) {
    if (!url) return;
    previewImg.src = url;
    uploadContent.style.display = 'none';
    wallpaperPreview.style.display = 'block';
    wallpaperControls.style.display = 'block';
}

async function handleFile(file) {
    if (file) {
        // Limit to 20MB
        if (file.size > 20 * 1024 * 1024) {
            alert("Image too large (max 20MB)");
            return;
        }

        try {
            await saveWallpaperToDB(file);
            // Clear legacy localStorage wallpaper if exists
            localStorage.removeItem("wallpaper");

            const objectUrl = URL.createObjectURL(file);
            setWallpaper(objectUrl);
            updatePreview(objectUrl);
            applyWallpaperEffects();
        } catch (err) {
            console.error("Failed to save wallpaper:", err);
            alert("Failed to save wallpaper.");
        }
    }
}

// Click to upload
dropZone.addEventListener("click", () => wallpaperUpload.click());

// File input change
wallpaperUpload.addEventListener("change", (e) => {
    handleFile(e.target.files[0]);
});

// Drag & Drop
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    handleFile(e.dataTransfer.files[0]);
});

// Blur slider
blurSlider.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    wallpaperSettings.blur = value;
    blurValue.textContent = value;
    localStorage.setItem("wallpaperSettings", JSON.stringify(wallpaperSettings));
    applyWallpaperEffects();
});

// Vignette slider
vignetteSlider.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    wallpaperSettings.vignette = value;
    vignetteValue.textContent = value;
    localStorage.setItem("wallpaperSettings", JSON.stringify(wallpaperSettings));
    applyWallpaperEffects();
});

// Search box width slider
searchWidthSlider.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    searchBoxSettings.width = value;
    searchWidthValue.textContent = `${value}px`;
    localStorage.setItem("searchBoxSettings", JSON.stringify(searchBoxSettings));
    applySearchBoxSettings();
});

// Search box position slider
searchPositionSlider.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    searchBoxSettings.position = value;
    searchPositionValue.textContent = `${value}%`;
    localStorage.setItem("searchBoxSettings", JSON.stringify(searchBoxSettings));
    applySearchBoxSettings();
});

resetWallpaper.addEventListener("click", async () => {
    await deleteWallpaperFromDB();
    localStorage.removeItem("wallpaper"); // Clear legacy
    localStorage.removeItem("wallpaperSettings");

    wallpaperSettings = { blur: 0, vignette: 0 };
    setWallpaper('none');
    document.documentElement.style.setProperty('--wallpaper-blur', '0px');
    document.documentElement.style.setProperty('--wallpaper-vignette', 'transparent');

    uploadContent.style.display = 'flex';
    wallpaperPreview.style.display = 'none';
    wallpaperControls.style.display = 'none';
    blurSlider.value = 0;
    vignetteSlider.value = 0;
    blurValue.textContent = 0;
    vignetteValue.textContent = 0;
});

// Reset Shortcuts
const resetShortcutsBtn = document.getElementById("resetShortcutsBtn");
if (resetShortcutsBtn) {
    resetShortcutsBtn.addEventListener("click", () => {
        if (confirm("Reset shortcuts to default?")) {
            shortcuts = JSON.parse(JSON.stringify(defaultShortcuts)); // Deep copy
            saveShortcuts();
        }
    });
}

// Add Engine
addEngineBtn.addEventListener("click", () => {
    const name = document.getElementById("newEngineName").value.trim();
    let url = document.getElementById("newEngineUrl").value.trim();
    if (name && url) {
        const key = name.toLowerCase().replace(/\s+/g, '_');
        let icon = "icon.png";
        try {
            const cleanUrl = url.replace('%s', '').replace(/=$/, '');
            const domain = new URL(cleanUrl).hostname;
            icon = `https://${domain}/favicon.ico`;
        } catch (e) { }

        engines[key] = { name, url, icon };
        saveEngines();
        document.getElementById("newEngineName").value = "";
        document.getElementById("newEngineUrl").value = "";
    }
});

// Add Shortcut
addShortcutBtn.addEventListener("click", () => {
    const name = document.getElementById("newShortcutName").value.trim();
    let url = document.getElementById("newShortcutUrl").value.trim();
    if (name && url) {
        if (!/^http(s)?:\/\//i.test(url)) url = "https://" + url;
        const icon = getFavicon(url);
        shortcuts.push({ name, url, icon });
        saveShortcuts();
        document.getElementById("newShortcutName").value = "";
        document.getElementById("newShortcutUrl").value = "";
    }
});

// Search Logic
function handleSearch(e) {
    if (e.key === "Enter") {
        let val = searchInput.value.trim();
        if (!val) return;
        const isUrl = /^(http(s)?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/i.test(val);
        if (isUrl) {
            if (!/^http(s)?:\/\//i.test(val)) val = "https://" + val;
            location.href = val;
        } else {
            const engine = engines[currentEngine];
            let searchUrl = engine.url;
            if (searchUrl.includes("%s")) {
                searchUrl = searchUrl.replace("%s", encodeURIComponent(val));
            } else {
                searchUrl += encodeURIComponent(val);
            }
            location.href = searchUrl;
        }
    }
}

// Engine Selector Toggle
selectedEngineIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    engineSelector.classList.toggle("active");
});
document.addEventListener("click", (e) => {
    if (!engineSelector.contains(e.target)) engineSelector.classList.remove("active");
});

// Localization Fallback
const fallbackMessages = {
    "zh": {
        "appTitle": "GenresFox-NEWTAB",
        "searchPlaceholder": "搜索...",
        "settingsTitle": "设置",
        "tabWallpaper": "壁纸",
        "tabSearch": "搜索与快捷方式",
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
        "searchBoxPosition": "垂直位置"
    },
    "en": {
        "appTitle": "GenresFox-NEWTAB",
        "searchPlaceholder": "Search...",
        "settingsTitle": "Settings",
        "tabWallpaper": "Wallpaper",
        "tabSearch": "Search & Shortcuts",
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
        "searchBoxPosition": "Vertical Position"
    }
};

function localize() {
    if (typeof chrome !== 'undefined' && chrome.i18n) {
        document.querySelectorAll('[data-i18n]').forEach(elem => {
            const msg = chrome.i18n.getMessage(elem.dataset.i18n);
            if (msg) elem.textContent = msg;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
            const msg = chrome.i18n.getMessage(elem.dataset.i18nPlaceholder);
            if (msg) elem.placeholder = msg;
        });
        return;
    }

    const lang = navigator.language.startsWith("zh") ? "zh" : "en";
    const messages = fallbackMessages[lang];

    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.dataset.i18n;
        if (messages[key]) elem.textContent = messages[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
        const key = elem.dataset.i18nPlaceholder;
        if (messages[key]) elem.placeholder = messages[key];
    });
}

// Init
async function init() {
    // Try to load from IndexedDB first
    try {
        const dbData = await getWallpaperFromDB();
        if (dbData) {
            // Check if it's a Blob (new format) or Base64 string (old format)
            let objectUrl;
            if (dbData instanceof Blob) {
                objectUrl = URL.createObjectURL(dbData);
            } else {
                // It's a base64 string from previous migration, use it directly
                objectUrl = dbData;
            }
            setWallpaper(objectUrl);
            updatePreview(objectUrl);
        } else {
            // Fallback to localStorage (legacy support)
            const savedWallpaper = localStorage.getItem("wallpaper");
            if (savedWallpaper) {
                setWallpaper(savedWallpaper);
                updatePreview(savedWallpaper);
                // We don't migrate automatically here to avoid blocking, 
                // user will migrate when they upload a new one.
            }
        }
    } catch (e) {
        console.error("Error initializing wallpaper:", e);
    }

    // Load saved wallpaper settings
    if (wallpaperSettings.blur > 0 || wallpaperSettings.vignette > 0) {
        blurSlider.value = wallpaperSettings.blur;
        vignetteSlider.value = wallpaperSettings.vignette;
        blurValue.textContent = wallpaperSettings.blur;
        vignetteValue.textContent = wallpaperSettings.vignette;
        applyWallpaperEffects();
    }

    // Load saved search box settings
    searchWidthSlider.value = searchBoxSettings.width;
    searchPositionSlider.value = searchBoxSettings.position;
    searchWidthValue.textContent = `${searchBoxSettings.width}px`;
    searchPositionValue.textContent = `${searchBoxSettings.position}%`;
    applySearchBoxSettings();

    // Ensure shortcuts exist (Double check)
    if (!shortcuts || shortcuts.length === 0) {
        shortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
        saveShortcuts();
    }

    localize();
    updateUI();
    renderEnginesList();
    renderShortcutsList();
    renderShortcutsGrid();
    searchInput.addEventListener("keydown", handleSearch);
    searchInput.focus();
}

init();
