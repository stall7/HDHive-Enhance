// ==UserScript==
// @name         Jasond - HDHive
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  适配 HDHive 新版页面、分页和固定悬浮工具条
// @author       Gemini
// @match        https://hdhive.com/*
// @match        https://www.hdhive.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const SITE_ORIGIN = window.location.origin;
    const TOP_GAP = 10;
    const HOVER_DELAY = 300;
    function getPagePath() {
        return window.location.pathname.replace(/\/+$/, '') || '/';
    }

    function isListPage() {
        const currentPath = getPagePath();
        return currentPath === '/' || currentPath === '/movie' || currentPath === '/tv';
    }

    function isDetailPage() {
        return /^\/(movie|tv)\/[^/]+/.test(getPagePath());
    }
    const originalScrollTo = window.scrollTo.bind(window);
    let pagingLock = false;
    let hasScrolledToInfo = false;
    let hoverTimer = null;
    let fixTimer = null;

    // Prevent the site's restoration scroll from fighting a list-page change.
    window.scrollTo = function (...args) {
        if (pagingLock) return;
        return originalScrollTo(...args);
    };

    const style = document.createElement('style');
    style.textContent = `
        html { scroll-behavior: smooth !important; }
        #gm-copy-toast {
            position: fixed; z-index: 10001; background: rgba(0, 0, 0, .75);
            color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 13px;
            font-weight: 500; pointer-events: none; opacity: 0;
            transition: opacity .3s ease; backdrop-filter: blur(10px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, .15);
        }
        #gm-pagination-toolbar {
            position: fixed !important; z-index: 10000 !important;
            display: flex !important; justify-content: center !important;
            align-items: center !important; width: auto !important;
            right: 30px !important; bottom: 30px !important; left: auto !important;
            transform: none !important; flex-direction: column !important;
            min-width: max-content !important; padding: 8px 12px !important;
            background: rgba(255, 255, 255, .65) !important;
            backdrop-filter: blur(24px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
            border: 1px solid rgba(255, 255, 255, .8) !important;
            box-shadow: 0 10px 32px rgba(0, 0, 0, .08),
                inset 0 1px 0 rgba(255, 255, 255, .6) !important;
            transition: all .4s cubic-bezier(.16, 1, .3, 1) !important;
        }
        #gm-pagination-toolbar.gm-toolbar-hidden {
            display: none !important;
        }
        #gm-pagination-toolbar.gm-layout-vertical {
            padding: 14px 10px !important; border-radius: 24px !important;
            gap: 10px !important;
        }
        .gm-hidden-native, .gm-hidden-page-input { display: none !important; }
        .gm-hidden-pagination-source { display: none !important; }
        #gm-custom-page {
            order: 1 !important; flex: 0 0 36px !important; width: 36px !important;
            height: 36px !important; display: flex !important;
            justify-content: center !important; align-items: center !important;
            color: #1a1a1a !important; font: 600 16px -apple-system,
                BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            user-select: none !important;
        }
        #btn-go-movie { order: 2 !important; }
        #btn-go-tv { order: 3 !important; }
        #btn-trigger-search { order: 4 !important; }
        #btn-page-previous { order: 5 !important; }
        #btn-page-next { order: 6 !important; }
        .gm-native-pagination { order: 5 !important; display: flex !important;
            margin: 0 !important; padding: 0 !important; list-style: none !important; }
        #gm-pagination-toolbar .gm-native-pagination { flex-direction: column !important; gap: 8px !important; }
        .custom-nav-btn, .gm-native-pagination button, button.gm-native-pagination,
        .gm-native-pagination > [data-ui-pagination-link],
        [data-ui-pagination-link].gm-native-pagination {
            min-width: 36px !important; width: 36px !important; height: 36px !important;
            border-radius: 50% !important; border: none !important;
            background: transparent !important; cursor: pointer !important;
            display: flex !important; align-items: center !important;
            justify-content: center !important; padding: 0 !important;
            margin: 0 !important; color: #333 !important;
            transition: all .2s ease !important;
        }
        .custom-nav-btn:hover, .gm-native-pagination button:hover,
        button.gm-native-pagination:hover, .gm-native-pagination > [data-ui-pagination-link]:hover,
        [data-ui-pagination-link].gm-native-pagination:hover { background: rgba(0, 0, 0, .06) !important; }
        .custom-nav-btn:disabled { opacity: .35 !important; cursor: not-allowed !important; }
        .custom-nav-btn:active, .gm-native-pagination button:active,
        button.gm-native-pagination:active, .gm-native-pagination > [data-ui-pagination-link]:active,
        [data-ui-pagination-link].gm-native-pagination:active { transform: scale(.85) !important; }
        .custom-nav-btn svg, .gm-native-pagination button svg,
        button.gm-native-pagination svg, .gm-native-pagination > [data-ui-pagination-link] svg,
        [data-ui-pagination-link].gm-native-pagination svg {
            width: 20px !important; height: 20px !important; display: block !important;
            fill: none !important; stroke: currentColor !important; stroke-width: 2px !important;
        }
        .gm-native-pagination button[disabled], .gm-native-pagination button[aria-disabled="true"],
        .gm-native-pagination > [data-ui-pagination-link][aria-disabled="true"],
        [data-ui-pagination-link].gm-native-pagination[aria-disabled="true"] {
            opacity: .3 !important; cursor: not-allowed !important;
        }
        .gm-site-header { transition: none !important; }
        .gm-detail-page .gm-site-header { display: none !important; }
        .gm-list-page .gm-site-header {
            position: relative !important; top: auto !important; transform: none !important;
            margin-bottom: 0 !important;
        }
        .gm-list-page [class*="CatalogLanding_hero__"],
        .gm-list-page [data-ui="media-hero-card"],
        .gm-list-page .gm-hidden-hero-shell {
            display: none !important; height: 0 !important; min-height: 0 !important;
            margin: 0 !important; padding: 0 !important;
        }
        .gm-list-page [class*="CatalogLanding_content__"] {
            box-sizing: border-box !important; width: calc(100% - 48px) !important;
            max-width: 1536px !important; margin: 0 auto !important;
            padding: 24px 0 64px !important; border: 0 !important;
            border-radius: 0 !important; background: transparent !important;
            box-shadow: none !important;
        }
        .gm-list-page main { min-width: 0 !important; overflow-x: clip !important; }
        .gm-list-page .gm-media-grid,
        .gm-list-page [class*="List_grid__"],
        .gm-list-page [class*="ContentSkeleton_mediaGrid__"] {
            grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)) !important;
            gap: 28px 20px !important; margin-top: 20px !important;
        }
        .gm-list-page .gm-media-grid > [class*="MediaCard_card__"] {
            min-width: 0 !important;
        }
        .gm-list-page [class*="MediaCard_title__"] {
            cursor: pointer !important; user-select: none !important;
        }
        .gm-list-page [class*="MediaCard_copy__"] { padding-top: 9px !important; }
        .gm-list-page [class*="MediaCard_meta__"] { margin-top: 4px !important; }
        @media (max-width: 760px) {
            .gm-list-page [class*="CatalogLanding_content__"] {
                width: calc(100% - 28px) !important; padding-top: 16px !important;
            }
            .gm-list-page .gm-media-grid,
            .gm-list-page [class*="List_grid__"],
            .gm-list-page [class*="ContentSkeleton_mediaGrid__"] {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 22px 14px !important;
            }
        }
        .gm-detail-page .gm-detail-scroll-target { scroll-margin-top: 10px; }
        footer, [class*="Footer_"] { display: none !important; height: 0 !important; visibility: hidden !important; }
        .mui-1tlztda, .MuiContainer-root h1 { cursor: pointer !important; }
        @media (prefers-color-scheme: dark) {
            #gm-pagination-toolbar { background: rgba(30, 30, 30, .6) !important;
                border-color: rgba(255, 255, 255, .12) !important;
                box-shadow: 0 10px 32px rgba(0, 0, 0, .3),
                    inset 0 1px 0 rgba(255, 255, 255, .08) !important; }
            #gm-custom-page, .custom-nav-btn, .gm-native-pagination button,
            button.gm-native-pagination, .gm-native-pagination > [data-ui-pagination-link],
            [data-ui-pagination-link].gm-native-pagination { color: #e0e0e0 !important; }
            .custom-nav-btn:hover, .gm-native-pagination button:hover,
            button.gm-native-pagination:hover, .gm-native-pagination > [data-ui-pagination-link]:hover,
            [data-ui-pagination-link].gm-native-pagination:hover { background: rgba(255, 255, 255, .1) !important; }
        }
        html.dark #gm-pagination-toolbar {
            background: rgba(30, 30, 30, .6) !important;
            border-color: rgba(255, 255, 255, .12) !important;
            box-shadow: 0 10px 32px rgba(0, 0, 0, .3),
                inset 0 1px 0 rgba(255, 255, 255, .08) !important;
        }
        html.dark #gm-custom-page, html.dark .custom-nav-btn,
        html.dark .gm-native-pagination button,
        html.dark button.gm-native-pagination, html.dark .gm-native-pagination > [data-ui-pagination-link],
        html.dark [data-ui-pagination-link].gm-native-pagination { color: #e0e0e0 !important; }
        html.dark .custom-nav-btn:hover, html.dark .gm-native-pagination button:hover,
        html.dark button.gm-native-pagination:hover,
        html.dark .gm-native-pagination > [data-ui-pagination-link]:hover,
        html.dark [data-ui-pagination-link].gm-native-pagination:hover { background: rgba(255, 255, 255, .1) !important; }
    `;
    document.documentElement.appendChild(style);

    const toast = document.createElement('div');
    toast.id = 'gm-copy-toast';
    document.documentElement.appendChild(toast);

    function hideToast() {
        toast.style.opacity = '0';
    }

    function showToast(text, x, y, duration = 1500) {
        toast.textContent = text;
        const posX = x + 115 > window.innerWidth ? x - 100 : x + 15;
        toast.style.left = `${Math.max(4, posX)}px`;
        toast.style.top = `${Math.max(4, y + 15)}px`;
        toast.style.opacity = '1';
        clearTimeout(window.gmToastHideTimer);
        if (duration > 0) window.gmToastHideTimer = setTimeout(hideToast, duration);
    }

    function markPageType() {
        const root = document.documentElement;
        root.classList.toggle('gm-list-page', isListPage());
        root.classList.toggle('gm-detail-page', isDetailPage());
        const toolbar = document.querySelector('[aria-label="HDHive 顶部工具栏"]');
        const header = toolbar?.closest('header');
        if (header) header.classList.add('gm-site-header');
    }

    function findPaginationInput() {
        return document.querySelector('input[aria-label="跳转到页码"]') ||
            document.querySelector('input[aria-label="页码"]') ||
            document.querySelector('div[class*="mui-jt6puj"] input');
    }

    function findPaginationButtons(root = document, includeGeneric = false) {
        const selector = 'button[aria-label="第一页"], button[aria-label="上一页"], ' +
            'button[aria-label="下一页"], button[aria-label="最后一页"], ' +
            '[data-ui-pagination-link]';
        const stable = [];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) stable.push(root);
        stable.push(...root.querySelectorAll(selector));
        if (stable.length) return stable;
        const oldButtons = Array.from(root.querySelectorAll('div[class*="mui-ch5dqf"] button'));
        if (oldButtons.length || !includeGeneric) return oldButtons;
        return Array.from(root.querySelectorAll('button'));
    }

    function findPaginationContainer() {
        const input = findPaginationInput();
        const paginationNodes = Array.from(document.querySelectorAll(
            'nav, [data-ui="pagination"], [data-ui-pagination], ' +
            '[data-slot="pagination"], [aria-label="分页"]'
        ));
        const semanticContainer = paginationNodes.find((node) =>
            findPaginationButtons(node).length >= 2 ||
            (input && node.contains(input) && findPaginationButtons(node).length >= 1)
        );
        if (semanticContainer) return semanticContainer;

        const inputContainer = input?.closest(
            'nav, [data-ui="pagination"], [data-ui-pagination], ' +
            '[data-slot="pagination"], [aria-label="分页"]'
        );
        if (inputContainer) return inputContainer;

        // The current movie/TV list uses an unlabeled pair of icon buttons
        // next to the page input instead of the shared pagination component.
        if (input) {
            let node = input;
            for (let depth = 0; node && node !== document.body && depth < 10; depth += 1) {
                const buttons = Array.from(node.querySelectorAll('button'));
                if (buttons.length >= 2 && !node.matches('main, section, article')) return node;
                node = node.parentElement;
            }
        }

        const stableButton = document.querySelector(
            'button[aria-label="上一页"], button[aria-label="下一页"], [data-ui-pagination-link]'
        );
        let node = input || stableButton;
        for (let depth = 0; node && node !== document.body && depth < 12; depth += 1) {
            const buttons = findPaginationButtons(node);
            if (buttons.length >= 2 && !node.matches('main, section, article')) return node;
            node = node.parentElement;
        }
        return document.querySelector('div[class*="mui-jt6puj"]') ||
            document.querySelector('div[class*="mui-ch5dqf"]');
    }

    function hideListDecorations() {
        if (!isListPage()) return;
        const hero = document.querySelector('[data-ui="media-hero-card"]');
        let heroShell = hero;
        for (let depth = 0; heroShell && depth < 8; depth += 1) {
            const className = typeof heroShell.className === 'string' ? heroShell.className : '';
            if (/carousel/i.test(className) || /(?:^|\s)swiper(?:\s|$)/i.test(className)) break;
            if (heroShell.parentElement === document.body || heroShell.parentElement === document.documentElement) break;
            heroShell = heroShell.parentElement;
        }
        if (heroShell && heroShell !== hero) heroShell.classList.add('gm-hidden-hero-shell');
        document.querySelectorAll('[data-legacy-tabs-container="true"]').forEach((filter) => {
            const group = filter.closest('[class*="CatalogFilterTabs_group__"]') ||
                filter.closest('div[class*="group"]');
            if (group) group.classList.add('gm-hidden-native');
            else filter.classList.add('gm-hidden-native');
        });
        document.querySelectorAll('[class*="CatalogFilterTabs_group__"]').forEach((group) => {
            group.classList.add('gm-hidden-native');
        });
        markMediaGrids();
    }

    function markMediaGrids() {
        const cards = Array.from(document.querySelectorAll('[class*="MediaCard_card__"]'));
        const parents = new Set(cards.map((card) => card.parentElement).filter(Boolean));
        parents.forEach((parent) => {
            const cardCount = parent.querySelectorAll(':scope > [class*="MediaCard_card__"]').length;
            if (cardCount > 1) parent.classList.add('gm-media-grid');
        });
    }

    function openSearch() {
        window.location.href = `${SITE_ORIGIN}/search`;
    }

    function createNavButton(id, title, iconHtml, clickFn) {
        const button = document.createElement('button');
        button.id = id;
        button.className = 'custom-nav-btn';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.type = 'button';
        button.innerHTML = iconHtml;
        button.addEventListener('click', clickFn);
        return button;
    }

    function getNativePaginationButton(container, direction) {
        if (!container) return null;
        const selector = direction === 'previous'
            ? 'button[aria-label="上一页"], [data-ui-pagination-link][aria-label="上一页"]'
            : 'button[aria-label="下一页"], [data-ui-pagination-link][aria-label="下一页"]';
        const labeled = container.querySelector(selector);
        if (labeled) return labeled;
        const input = findPaginationInput();
        const buttons = findPaginationButtons(container, Boolean(input && container.contains(input)));
        return direction === 'previous' ? buttons[0] : buttons[buttons.length - 1];
    }

    function createPaginationToolbar() {
        const movieSvg = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
        const tvSvg = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>';
        const searchSvg = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
        const previousSvg = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        const nextSvg = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        let toolbar = document.getElementById('gm-pagination-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'gm-pagination-toolbar';
            toolbar.className = 'gm-layout-vertical';
            (document.body || document.documentElement).appendChild(toolbar);
        }
        const add = (id, title, icon, fn) => {
            if (!toolbar.querySelector(`#${id}`)) toolbar.appendChild(createNavButton(id, title, icon, fn));
        };
        add('btn-go-movie', '跳转电影', movieSvg, () => { window.location.href = `${SITE_ORIGIN}/movie`; });
        add('btn-go-tv', '跳转剧集', tvSvg, () => { window.location.href = `${SITE_ORIGIN}/tv`; });
        add('btn-trigger-search', '开启搜索', searchSvg, (event) => {
            event.preventDefault();
            event.stopPropagation();
            openSearch();
        });
        add('btn-page-previous', '上一页', previousSvg, () => {
            const button = getNativePaginationButton(findPaginationContainer(), 'previous');
            if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
                startScrollSequence();
                button.click();
            }
        });
        add('btn-page-next', '下一页', nextSvg, () => {
            const button = getNativePaginationButton(findPaginationContainer(), 'next');
            if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
                startScrollSequence();
                button.click();
            }
        });
        if (!toolbar.querySelector('#gm-custom-page')) {
            const page = document.createElement('div');
            page.id = 'gm-custom-page';
            toolbar.insertBefore(page, toolbar.firstChild);
        }
        return toolbar;
    }

    function fixPagination() {
        const toolbar = createPaginationToolbar();
        toolbar.classList.remove('gm-toolbar-hidden');
        if (!isListPage()) {
            toolbar.querySelector('#gm-custom-page').textContent = '';
            toolbar.querySelector('#btn-page-previous').disabled = true;
            toolbar.querySelector('#btn-page-next').disabled = true;
            return;
        }
        const container = findPaginationContainer();
        if (!container) {
            toolbar.querySelector('#gm-custom-page').textContent = '1';
            toolbar.querySelector('#btn-page-previous').disabled = true;
            toolbar.querySelector('#btn-page-next').disabled = true;
            return;
        }
        container.classList.add('gm-hidden-pagination-source');
        const input = findPaginationInput();
        const currentPage = input?.value ||
            container.querySelector('[aria-current="page"]')?.textContent.trim() || '1';
        if (input) {
            input.classList.add('gm-hidden-page-input');
            let field = input.closest(
                '[data-ui="text-field"], [data-ui="number-field"], .MuiFormControl-root'
            );
            if (field && field !== container) field.classList.add('gm-hidden-native');
        }
        const page = toolbar.querySelector('#gm-custom-page');
        if (page.textContent !== String(currentPage)) page.textContent = currentPage;
        ['previous', 'next'].forEach((direction) => {
            const custom = toolbar.querySelector(`#btn-page-${direction}`);
            const native = getNativePaginationButton(container, direction);
            custom.disabled = !native || native.disabled || native.getAttribute('aria-disabled') === 'true';
        });
    }

    function scrollToInfoContainer() {
        if (!isDetailPage() || hasScrolledToInfo) return;
        const target = document.querySelector('[data-resource-card-action]')?.closest('section') ||
            document.querySelector('[data-cloud-website]')?.closest('section') ||
            document.querySelector('[data-media-comment-dock]')?.closest('section') ||
            document.querySelector('[data-media-theme] main section:not([aria-busy="true"])');
        if (!target) return;
        target.classList.add('gm-detail-scroll-target');
        hasScrolledToInfo = true;
        const offset = target.getBoundingClientRect().top + window.scrollY - TOP_GAP;
        originalScrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
    }

    function startScrollSequence() {
        if (!isListPage() || pagingLock) return;
        pagingLock = true;
        originalScrollTo({ top: 0, behavior: 'smooth' });
        const mainContent = document.querySelector('main') || document.body;
        let finished = false;
        let waitTimer = null;
        const finish = () => {
            if (finished) return;
            finished = true;
            observer.disconnect();
            clearTimeout(waitTimer);
            originalScrollTo({ top: 0, behavior: 'smooth' });
            window.setTimeout(() => { pagingLock = false; }, 900);
        };
        const observer = new MutationObserver(finish);
        observer.observe(mainContent, { childList: true, subtree: true });
        waitTimer = window.setTimeout(finish, 2000);
    }

    function fixLayout() {
        markPageType();
        hideListDecorations();
        fixPagination();
        scrollToInfoContainer();
    }

    function queueFixLayout() {
        if (fixTimer) return;
        fixTimer = window.setTimeout(() => {
            fixTimer = null;
            fixLayout();
        }, 0);
    }

    function findTitleElement(target) {
        if (!(target instanceof Element)) return null;
        if (isListPage()) {
            return target.closest(
                '[class*="MediaCard_title__"], [data-media-title], [data-ui="media-title"]'
            );
        }
        if (!isDetailPage()) return null;
        return target.closest(
            '[data-media-theme] h1, [data-ui="media-title"], [data-media-title], ' +
            '[class*="detailTitle__"], [class*="MediaCard_heroTitle__"], ' +
            '.mui-1tlztda, .MuiContainer-root h1, main h1'
        );
    }

    function copyTitle(titleElem, event) {
        const text = titleElem.textContent.trim().replace(/\s*[（(]\d{4}[)）]\s*$/, '');
        const copy = navigator.clipboard?.writeText
            ? navigator.clipboard.writeText(text)
            : Promise.reject(new Error('clipboard unavailable'));
        copy.then(() => showToast('片名已复制', event.clientX, event.clientY))
            .catch(() => showToast('复制失败，请检查浏览器权限', event.clientX, event.clientY));
    }

    window.addEventListener('mousemove', (event) => {
        const titleElem = findTitleElement(event.target);
        if (titleElem) {
            if (toast.textContent === '片名已复制' && toast.style.opacity === '1') return;
            if (!hoverTimer && toast.style.opacity === '0') {
                hoverTimer = window.setTimeout(() => {
                    showToast('复制片名', event.clientX, event.clientY, 1500);
                    hoverTimer = null;
                }, HOVER_DELAY);
            }
        } else {
            clearTimeout(hoverTimer);
            hoverTimer = null;
            if (toast.textContent === '复制片名') hideToast();
        }
    });

    window.addEventListener('click', (event) => {
        const titleElem = findTitleElement(event.target);
        if (titleElem) {
            event.preventDefault();
            event.stopPropagation();
            clearTimeout(hoverTimer);
            hoverTimer = null;
            copyTitle(titleElem, event);
            return;
        }
        if (isListPage() && event.target.closest(
            'button[aria-label="上一页"], button[aria-label="下一页"], ' +
            '[data-ui-pagination-link], .gm-native-pagination button, ' +
            'button.gm-native-pagination, ' +
            'div[class*="mui-ch5dqf"] button'
        )) startScrollSequence();
    }, true);

    window.addEventListener('keydown', (event) => {
        if (!isListPage() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        const container = findPaginationContainer();
        const genericButtons = container
            ? findPaginationButtons(container, true).filter((button) =>
                !button.id.startsWith('btn-') && button.id !== 'gm-custom-page'
            )
            : [];
        const previous = document.querySelector('button[aria-label="上一页"], [data-ui-pagination-link][aria-label="上一页"]') ||
            document.querySelector('div[class*="mui-ch5dqf"] button') || genericButtons[0];
        const next = document.querySelector('button[aria-label="下一页"], [data-ui-pagination-link][aria-label="下一页"]') ||
            Array.from(document.querySelectorAll('div[class*="mui-ch5dqf"] button')).pop() ||
            genericButtons[genericButtons.length - 1];
        const button = event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : null;
        if (!button) return;
        event.preventDefault();
        startScrollSequence();
        button.click();
    }, true);

    function handleNavigation() {
        hasScrolledToInfo = false;
        clearTimeout(hoverTimer);
        hoverTimer = null;
        hideToast();
        markPageType();
        queueFixLayout();
    }

    ['pushState', 'replaceState'].forEach((method) => {
        const original = window.history[method];
        window.history[method] = function (...args) {
            const result = original.apply(this, args);
            window.dispatchEvent(new Event('gm:navigation'));
            return result;
        };
    });
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('gm:navigation', handleNavigation);

    const observer = new MutationObserver(queueFixLayout);
    markPageType();
    fixLayout();
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
