# GenresFox

<div align="center">

![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/chrome-manifest%20v3-orange.svg)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/zayokami/GenresFox)

**A fully open-source, extremely clean, and highly customizable new tab page extension.**

[English](#english) | [中文](#中文)

![Home - Dark](assets/Screenshots/Show-1.png)
</div>

---

## English

### ✨ Features

- **🎨 Modern Dark Theme**: Beautiful glassmorphism design with smooth animations
- **🔍 Multi-Engine Search**: Built-in support for Google, Bing, and DuckDuckGo
- **⚙️ Custom Search Engines**: Add your own search engines with custom URLs
- **🔖 Quick Shortcuts**: Create shortcuts to your favorite websites with auto-fetched favicons
- **🖼️ Custom Wallpapers**: Upload your own background images (up to 50MB, 50MP) with drag-and-drop support
- **🌅 Bing Daily Wallpaper**: Beautiful daily wallpapers from Bing with smart 24-hour caching and preloading
- **⚡ High-Performance Image Processing**: Web Worker support, WebAssembly acceleration, progressive preview, and intelligent compression
- **🌍 Multi-language**: English, Simplified Chinese, Traditional Chinese, Japanese, Spanish, French, German, Russian
- **♿ Accessibility**: High contrast themes, font controls, animation settings, keyboard shortcuts
- **⌨️ Keyboard Shortcuts**: Quick engine switching (Alt+↑↓), focus search (/), open settings (Alt+,)
- **💾 Smart Caching**: Icon caching, wallpaper caching, and processing result caching for faster loading
- **🎯 Clean & Minimal**: Distraction-free interface focused on what matters


### 🚀 Installation

#### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/zayokami/GenresFox.git
   ```

2. Open Chrome/Edge and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the `src` folder

5. Enjoy your new tab page!

#### From Chrome Web Store

> Coming soon...

### 🛠️ Usage

#### Search
- Simply type in the search box and press Enter
- Click the search engine icon to switch between different engines
- URLs are automatically detected and opened directly

#### Custom Search Engines
1. Click the settings icon (⚙️) in the bottom right
2. Go to "Search & Shortcuts" tab
3. Enter the engine name and URL (use `%s` as the search query placeholder)
   - Example: `https://kagi.com/search?q=%s`
4. Click "Add"

#### Shortcuts
1. Open settings and go to "Search & Shortcuts" tab
2. Scroll to the "Shortcuts" section
3. Enter the name and URL of your favorite website
4. The favicon will be automatically fetched

#### Custom Wallpaper
1. Open settings and go to "Wallpaper" tab
2. Drag and drop an image or click to upload
3. Maximum file size: 50MB, maximum resolution: 50 megapixels
4. Images are automatically optimized and compressed for storage efficiency
5. Click "Reset to Default" to restore the original background

### 🔧 Development

#### Project Structure
```
GenresFox/
├── src/
│   ├── _locales/           # Internationalization files
│   │   ├── en/
│   │   ├── es/
│   │   ├── fr/
│   │   ├── de/
│   │   ├── ru/
│   │   ├── ja/
│   │   ├── zh_CN/
│   │   └── zh_TW/
│   ├── icon.png            # Extension icon
│   ├── manifest.json       # Extension manifest
│   ├── newtab.html         # Main HTML file
│   ├── script.js           # Main JavaScript logic
│   ├── search.js           # Search bar & search button logic
│   ├── i18n.js             # Internationalization module
│   ├── wallpaper.js        # Wallpaper management module
│   ├── accessibility.js    # Accessibility features module
│   ├── image-processor.js  # High-performance image processing module
│   ├── image-worker.js     # Web Worker for background image processing
│   ├── resize.wasm         # Pre-compiled WASM module for image resizing
│   ├── wasm-resize/        # WASM source code (Rust) - only for developers
│   ├── styles.css          # Main styles
│   ├── search.css          # Search bar styles
│   └── accessibility.css   # Accessibility styles
├── CHANGELOG.md
└── README.md
```

#### Technologies Used
- **Manifest V3**: Latest Chrome extension standard
- **Vanilla JavaScript**: Pure performance
- **CSS3**: Modern styling with glassmorphism effects
- **Web Workers**: Background image processing without blocking UI
- **WebAssembly**: High-performance image resizing for large images
- **IndexedDB**: For storing large wallpaper files and cache
- **LocalStorage**: For persistent settings and metadata caching
- **Chrome Extension APIs**: For internationalization and browser integration

#### Adding New Languages
1. Create a new folder in `src/_locales/` with the language code (e.g., `fr` for French)
2. Copy `messages.json` from `en` folder
3. Translate all message values
4. Add the language to `_fallbackMessages` in `src/i18n.js`
5. Update `_supportedLanguages` array and `_detectLanguage()` function
6. Add a language switch entry if needed in UI

### 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 👤 Author

**zayoka**

- GitHub: [@zayoka](https://github.com/zayokami)

### Contributor

**KafuuChino**

- GitHub: [@KafuuChino](https://github.com/lian5727557)

### 🔒 Security & Transparency

The WASM module (`resize.wasm`) is **100% open source and auditable**:

- ✅ **No backdoors** - All source code is available in `src/wasm-resize/src/lib.rs`
- ✅ **Zero external dependencies** - Verified: `cargo tree` shows only the project itself, no third-party crates
- ✅ **No build-time dependencies** - No `cargo fetch` needed, uses only Rust standard library (already included with Rust)
- ✅ **Fully auditable** - You can review, compile, and verify the code yourself
- ✅ **No network requests** - The WASM module only performs image resizing, no data transmission
- ✅ **No file system access** - Operates entirely in memory
- 📄 See `src/wasm-resize/SECURITY.md` for complete security statement and dependency list

**For end users**: Pre-compiled WASM is included - no Rust or compilation needed!

**For developers**: After installing Rust, you can build immediately - zero dependencies to download.

### 🙏 Acknowledgments

- Inspired by modern web design trends
- Icons from Google Material Design
- Favicon service by DuckDuckGo (primary) and Google s2 (fallback)
- Daily wallpapers by Bing

---

## 中文

### ✨ 功能特性

- **🎨 现代深色主题**: 精美的玻璃态设计，流畅的动画效果
- **🔍 多引擎搜索**: 内置支持 Google、Bing 和 DuckDuckGo
- **⚙️ 自定义搜索引擎**: 添加您自己的搜索引擎和自定义 URL
- **🔖 快捷方式**: 创建常用网站的快捷方式，自动获取网站图标
- **🖼️ 自定义壁纸**: 上传您自己的背景图片（最大 50MB，5000万像素），支持拖放上传
- **🌅 必应每日壁纸**: 来自必应的精美每日壁纸，支持智能24小时缓存和预加载
- **⚡ 高性能图片处理**: Web Worker 支持、WebAssembly 加速、渐进式预览、智能压缩
- **🌍 多语言支持**: 简体中文、繁体中文、日语、英语、西班牙语、法语、德语、俄语
- **♿ 无障碍功能**: 高对比度主题、字体控制、动画设置、键盘快捷键
- **⌨️ 键盘快捷键**: 快速切换搜索引擎 (Alt+↑↓)、聚焦搜索框 (/)、打开设置 (Alt+,)
- **💾 智能缓存**: 图标缓存、壁纸缓存、处理结果缓存，加快加载速度
- **🎯 简洁极简**: 无干扰界面，专注于重要内容


### 🚀 安装

#### 从源码安装

1. 克隆此仓库：
   ```bash
   git clone https://github.com/zayokami/GenresFox.git
   ```

2. 打开 Chrome/Edge 浏览器，访问 `chrome://extensions/`

3. 在右上角启用"开发者模式"

4. 点击"加载已解压的扩展程序"，选择 `src` 文件夹

5. 开始使用吧！

#### 从 Chrome 网上应用店安装

> 即将推出...

### 🛠️ 使用方法

#### 搜索
- 在搜索框中输入内容并按回车
- 点击搜索引擎图标可切换不同的搜索引擎
- 网址会被自动识别并直接打开

#### 自定义搜索引擎
1. 点击右下角的设置图标（⚙️）
2. 进入"搜索与快捷方式"标签页
3. 输入引擎名称和 URL（使用 `%s` 作为搜索关键词占位符）
   - 示例：`https://kagi.com/search?q=%s`
4. 点击"添加"

#### 快捷方式
1. 打开设置，进入"搜索与快捷方式"标签页
2. 滚动到"快捷方式"部分
3. 输入您喜欢的网站名称和 URL
4. 网站图标会自动获取

#### 自定义壁纸
1. 打开设置，进入"壁纸"标签页
2. 拖放图片或点击上传
3. 最大文件大小：50MB，最大分辨率：5000万像素
4. 图片会自动优化和压缩以提高存储效率
5. 点击"恢复默认"可还原原始背景

### 🔧 开发

#### 项目结构
```
GenresFox/
├── src/
│   ├── _locales/           # 国际化文件
│   │   ├── en/
│   │   ├── es/
│   │   ├── fr/
│   │   ├── de/
│   │   ├── ru/
│   │   ├── ja/
│   │   ├── zh_CN/
│   │   └── zh_TW/
│   ├── icon.png            # 扩展图标
│   ├── manifest.json       # 扩展清单
│   ├── newtab.html         # 主 HTML 文件
│   ├── script.js           # 主 JavaScript 逻辑
│   ├── search.js           # 搜索栏与搜索按钮逻辑
│   ├── i18n.js             # 国际化模块
│   ├── wallpaper.js        # 壁纸管理模块
│   ├── accessibility.js    # 无障碍功能模块
│   ├── image-processor.js  # 高性能图片处理模块
│   ├── image-worker.js     # Web Worker 后台图片处理
│   ├── resize.wasm         # 预编译的 WASM 图片缩放模块
│   ├── wasm-resize/        # WASM 源代码（Rust）- 仅开发者需要
│   ├── styles.css          # 主样式文件
│   ├── search.css          # 搜索栏样式文件
│   └── accessibility.css   # 无障碍样式文件
├── CHANGELOG.md
└── README.md
```

#### 技术栈
- **Manifest V3**: 最新的 Chrome 扩展标准
- **原生 JavaScript**: 纯粹的性能
- **CSS3**: 现代样式与玻璃态效果
- **Web Workers**: 后台图片处理，不阻塞 UI
- **WebAssembly**: 大图片高性能缩放处理
- **IndexedDB**: 用于存储大型壁纸文件和缓存
- **LocalStorage**: 用于持久化设置和元数据缓存
- **Chrome 扩展 API**: 用于国际化和浏览器集成

#### 添加新语言
1. 在 `src/_locales/` 中创建新文件夹，使用语言代码命名（如 `fr` 表示法语）
2. 从 `en` 文件夹复制 `messages.json`
3. 翻译所有消息值
4. 在 `src/i18n.js` 的 `_fallbackMessages` 中添加该语言
5. 更新 `_supportedLanguages` 数组和 `_detectLanguage()` 函数
6. 如需在界面中显示语言切换入口，请同步新增

### 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本项目
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

### 📝 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

### 👤 作者

**zayoka**

- GitHub: [@zayoka](https://github.com/zayokami)

### 贡献者

**KafuuChino**

- GitHub: [@KafuuChino](https://github.com/lian5727557)

### 🔒 安全与透明度

WASM 模块 (`resize.wasm`) **100% 开源且可审计**：

- ✅ **无后门** - 所有源代码位于 `src/wasm-resize/src/lib.rs`
- ✅ **零外部依赖** - 已验证：`cargo tree` 仅显示项目本身，无第三方依赖
- ✅ **无构建时依赖** - 无需 `cargo fetch`，仅使用 Rust 标准库（已随 Rust 安装包含）
- ✅ **完全可审计** - 您可以审查、编译和验证代码
- ✅ **无网络请求** - WASM 模块仅执行图片缩放，不传输任何数据
- ✅ **无文件系统访问** - 完全在内存中运行
- 📄 完整安全声明和依赖列表请查看 `src/wasm-resize/SECURITY.md`

**对于最终用户**：已包含预编译的 WASM 文件 - 无需 Rust 或编译！

**对于开发者**：安装 Rust 后即可立即构建 - 零依赖需要下载。

### 🙏 致谢

- 灵感来自现代网页设计趋势
- 图标来自 Google Material Design
- Favicon 服务由 DuckDuckGo（主）与 Google s2（备）提供
- 每日壁纸由 Bing 提供

---

<div align="center">

**如果这个项目对您有帮助，请给它一个 ⭐️！**

**If this project has been helpful to you, please give it a ⭐️!**

Made with ❤️ by zayoka

</div>
