// search.js
// Encapsulated search input + action button logic
const SearchBar = (function () {
    'use strict';

    function _isUrl(value) {
        return /^(http(s)?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/i.test(value);
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

            if (!engine || !engine.url) return;

            if (_isUrl(val)) {
                if (!/^http(s)?:\/\//i.test(val)) val = 'https://' + val;
                location.href = val;
            } else {
                let searchUrl = engine.url;
                if (searchUrl.includes('%s')) {
                    searchUrl = searchUrl.replace('%s', encodeURIComponent(val));
                } else {
                    searchUrl += encodeURIComponent(val);
                }
                location.href = searchUrl;
            }
        };

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    runSearch();
                }
            });
        }

        if (actionBtn) {
            actionBtn.addEventListener('click', runSearch);
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

