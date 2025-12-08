// search.js
// Encapsulated search input + action button logic
const SearchBar = (function () {
    'use strict';

    function _isUrl(value) {
        if (typeof value !== 'string') return false;
        const trimmed = value.trim();
        if (!trimmed || /\s/.test(trimmed)) return false;

        // Fast heuristics: only treat as URL when it has a clear URL shape
        const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
        const isIp = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(\/|$)/.test(trimmed);
        const isLocalhost = /^localhost(:\d+)?(\/|$)/i.test(trimmed);
        const hasDotDomain = /[a-z0-9-]+\.[a-z0-9.-]{2,}/i.test(trimmed);

        if (!hasProtocol && !isIp && !isLocalhost && !hasDotDomain) {
            // Looks more like a query (e.g., 单个词/短语无点号)
            return false;
        }

        const ensureProtocol = (v) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);

        try {
            const url = new URL(ensureProtocol(trimmed));
            const proto = (url.protocol || '').toLowerCase();
            if (proto !== 'http:' && proto !== 'https:') return false;
            return Boolean(url.hostname);
        } catch (e) {
            return false;
        }
    }

    function _isSafeUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        // Reject control chars and dangerous schemes
        if (/[^\x20-\x7E]/.test(trimmed)) return false;
        const dangerous = /^(javascript:|data:|vbscript:|file:|blob:|mailto:|tel:)/i;
        if (dangerous.test(trimmed)) return false;
        return true;
    }

    function _getMessage(key, fallback) {
        if (window.I18n && typeof I18n.getMessage === 'function') {
            const msg = I18n.getMessage(key);
            if (msg) return msg;
        }
        return fallback;
    }

    function _showError(key, fallback) {
        const msg = _getMessage(key, fallback);
        if (msg) alert(msg);
    }

    function _navigateTo(url) {
        if (!_isSafeUrl(url)) {
            console.warn('Blocked unsafe URL:', url);
            _showError('searchErrorUnsafeUrl', 'This URL may be unsafe.');
            return false;
        }
        try {
            const a = document.createElement('a');
            a.href = url;
            a.rel = 'noopener noreferrer';
            a.target = '_self';
            a.click();
            return true;
        } catch (error) {
            console.error('Navigation failed:', error);
            _showError('searchErrorNavigationFailed', 'Failed to open the link.');
            return false;
        }
    }

    function _getElements({ searchInputId, actionBtnId, actionLabelId }) {
        return {
            searchInput: document.getElementById(searchInputId),
            actionBtn: document.getElementById(actionBtnId),
            actionLabel: document.getElementById(actionLabelId)
        };
    }

    function _updateButtonWidth(actionBtn, actionLabel) {
        if (!actionBtn || !actionLabel) return;
        const labelWidth = actionLabel.scrollWidth;
        const base = 44; // collapsed width
        const padding = 32; // padding and gap
        const expanded = Math.max(base + padding + labelWidth, 112);
        actionBtn.style.setProperty('--search-action-expand', `${expanded}px`);
    }

    function _wireEvents({ searchInput, actionBtn, getEngines, getCurrentEngine }) {
        const runSearch = () => {
            if (!searchInput) return;
            let val = searchInput.value.trim();
            if (!val) return;
            const engines = typeof getEngines === 'function' ? getEngines() : null;
            const currentKey = typeof getCurrentEngine === 'function' ? getCurrentEngine() : null;
            const engine = (engines && currentKey && engines[currentKey]) || (engines && engines.google);

            if (!engine || !engine.url) {
                _showError('searchErrorNoEngine', 'No available search engine.');
                return;
            }

            if (_isUrl(val)) {
                if (!/^http(s)?:\/\//i.test(val)) val = 'https://' + val;
                _navigateTo(val);
            } else {
                let searchUrl = engine.url;
                if (searchUrl.includes('%s')) {
                    searchUrl = searchUrl.replace('%s', encodeURIComponent(val));
                } else {
                    searchUrl += encodeURIComponent(val);
                }
                _navigateTo(searchUrl);
            }
        };

        if (searchInput && !searchInput.dataset.searchInit) {
            const handler = (e) => {
                if (e.key === 'Enter') {
                    runSearch();
                }
            };
            searchInput.addEventListener('keydown', handler);
            searchInput.dataset.searchInit = 'true';
        }

        if (actionBtn && !actionBtn.dataset.searchInit) {
            actionBtn.addEventListener('click', runSearch);
            actionBtn.dataset.searchInit = 'true';
        }
    }

    function init(options = {}) {
        const {
            searchInputId = 'search',
            actionBtnId = 'searchActionBtn',
            actionLabelId = 'searchActionLabel',
            getEngines,
            getCurrentEngine
        } = options;

        const { searchInput, actionBtn, actionLabel } = _getElements({ searchInputId, actionBtnId, actionLabelId });

        _updateButtonWidth(actionBtn, actionLabel);
        window.addEventListener('resize', () => _updateButtonWidth(actionBtn, actionLabel));
        _wireEvents({ searchInput, actionBtn, getEngines, getCurrentEngine });
    }

    return { init };
})();

// Expose globally
window.SearchBar = SearchBar;

/**
 * To boldly split infinitives that no man had split before.
 * — From Douglas Adams' novel, "The Hitchhiker's Guide to the Galaxy".
*/