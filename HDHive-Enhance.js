// ==UserScript==
// @name         HDHive-Enhance
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  1.列表页：隐藏轮播、筛选。 2.详情页：隐藏Header，自动定位。 3.点击标题自动复制。 4.翻页器：苹果液体玻璃风格重构，统一纯净线性图标，支持完美的水平/垂直布局切换。
// @author       Gemini
// @match        https://hdhive.com/*
// @match        https://www.hdhive.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ================= [ 配置读取与菜单 ] =================
    let currentLayout = GM_getValue('layoutMode', 'horizontal');
    const isVertical = currentLayout === 'vertical';

    GM_registerMenuCommand(isVertical ? "⚙️ 切换为 水平(底部居中) 玻璃态" : "⚙️ 切换为 垂直(右下角) 玻璃态", () => {
        GM_setValue('layoutMode', isVertical ? 'horizontal' : 'vertical');
        location.reload();
    });
    // ========================================================

    const TOP_GAP = 10;
    const MAX_WAIT_TIME = 2000;
    const HOVER_DELAY = 300;
    const originalScrollTo = window.scrollTo;
    let pagingLock = false;
    let hasScrolledToInfo = false;
    let hoverTimer = null;

    const path = window.location.pathname;
    const isListPage = path === '/' || path === '/movie' || path === '/movie/' || path === '/tv' || path === '/tv/';
    const isDetailPage = (path.startsWith('/movie/') && path.length > 7) || (path.startsWith('/tv/') && path.length > 4);

    window.scrollTo = function (x, y) {
        if (pagingLock) return;
        return originalScrollTo.apply(this, arguments);
    };

    // --- 1. 注入 CSS (苹果玻璃态核心视觉) ---
    const style = document.createElement('style');
    const globalBlacklist = `footer, .mui-1rov361, .MuiBox-root.mui-1rov361, .MuiBox-root.mui-10p0yis, main ~ div[class*="MuiBox-root"]`;

    let cssRules = `
        html { scroll-behavior: smooth !important; }
        .mui-1tlztda, .MuiContainer-root h1 { cursor: pointer !important; }
        #gm-copy-toast {
            position: fixed; z-index: 10001; background: rgba(0, 0, 0, 0.75);
            color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
            pointer-events: none; transition: opacity 0.3s ease; opacity: 0;
            backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        /* 1. 玻璃态容器基底 */
        div[class*="mui-jt6puj"] {
            position: fixed !important; z-index: 10000 !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
            
            /* 苹果毛玻璃核心参数 */
            background: rgba(255, 255, 255, 0.65) !important;
            backdrop-filter: blur(24px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
            border: 1px solid rgba(255, 255, 255, 0.8) !important;
            box-shadow: 0 10px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.6) !important;
            
            width: auto !important; min-width: max-content !important;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }

        /* 2. 动态布局样式 (JS 注入 Class 控制) */
        .gm-layout-horizontal {
            bottom: 30px !important; left: 50% !important; transform: translateX(-50%) !important;
            flex-direction: row !important;
            padding: 8px 12px !important; 
            border-radius: 40px !important; /* 大胶囊 */
            gap: 6px !important;
        }

        .gm-layout-vertical {
            bottom: 30px !important; right: 30px !important; left: auto !important; transform: none !important;
            flex-direction: column !important;
            padding: 14px 10px !important; 
            border-radius: 24px !important; /* iOS 圆角矩形 */
            gap: 10px !important;
        }
        
        /* 3. 彻底隐藏原生带文字的页码组件 */
        .gm-hidden-native { display: none !important; }

        /* 4. 我们自建的纯净版页码 */
        #gm-custom-page {
            order: 1 !important;
            flex: 0 0 36px !important; width: 36px !important; height: 36px !important;
            text-align: center !important; font-size: 16px !important; font-weight: 600 !important;
            color: #1a1a1a !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
            user-select: none !important;
        }

        /* 5. 元素顺序排布 */
        #btn-go-movie { order: 2 !important; }
        #btn-go-tv { order: 3 !important; }
        #btn-trigger-search { order: 4 !important; }
        .gm-native-btn { order: 5 !important; display: flex !important; margin: 0 !important; padding: 0 !important; }
        .gm-layout-horizontal .gm-native-btn { flex-direction: row !important; gap: 4px !important; }
        .gm-layout-vertical .gm-native-btn { flex-direction: column !important; gap: 8px !important; }

        /* 6. 高级按钮交互系统 (统配自建按钮和原生按钮) */
        .custom-nav-btn, .gm-native-btn button {
            min-width: 36px !important; width: 36px !important; height: 36px !important; 
            border-radius: 50% !important; /* 正圆形悬停区 */
            border: none !important; background: transparent !important; cursor: pointer !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            transition: all 0.2s ease !important; padding: 0 !important; margin: 0 !important;
            color: #333 !important; /* 图标主色调 */
        }
        
        .custom-nav-btn:hover, .gm-native-btn button:hover { 
            background: rgba(0, 0, 0, 0.06) !important; 
        }
        .custom-nav-btn:active, .gm-native-btn button:active { 
            transform: scale(0.85) !important; 
            background: rgba(0, 0, 0, 0.1) !important;
        }

        /* 统一所有 SVG 图标的视觉重量 */
        .custom-nav-btn svg, .gm-native-btn button svg { 
            width: 20px !important; height: 20px !important; display: block !important; 
            stroke-width: 2px !important; fill: none !important; stroke: currentColor !important;
        }
        
        /* 覆盖原生按钮的奇怪阴影和背景 */
        .gm-native-btn button { box-shadow: none !important; color: #555 !important; }
        .gm-native-btn button.Mui-disabled { opacity: 0.3 !important; cursor: not-allowed !important; background: transparent !important; }

        /* 7. 暗黑模式适配 (Dark Mode Glassmorphism) */
        @media (prefers-color-scheme: dark) {
            div[class*="mui-jt6puj"] { 
                background: rgba(30, 30, 30, 0.6) !important; 
                border: 1px solid rgba(255, 255, 255, 0.12) !important; 
                box-shadow: 0 10px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.08) !important; 
            }
            #gm-custom-page { color: #f5f5f5 !important; }
            .custom-nav-btn, .gm-native-btn button { color: #e0e0e0 !important; }
            .custom-nav-btn:hover, .gm-native-btn button:hover { background: rgba(255, 255, 255, 0.1) !important; }
            .custom-nav-btn:active, .gm-native-btn button:active { background: rgba(255, 255, 255, 0.15) !important; }
        }

        body::after { content: ""; display: block; height: 80px; } /* 底部留白防止遮挡 */
        ${globalBlacklist} { display: none !important; height: 0 !important; visibility: hidden !important; }
    `;

    if (isDetailPage) {
        cssRules += `header.MuiAppBar-root { display: none !important; }`;
    } else {
        cssRules += `header.MuiAppBar-root { position: relative !important; transform: none !important; margin-bottom: ${TOP_GAP}px !important; }`;
        cssRules += `.MuiBox-root.mui-10suvi3, .MuiBox-root.mui-1fwzste, .react-multi-carousel-list, .swiper, .swiper-container { display: none !important; }`;
    }

    style.innerHTML = cssRules;
    document.documentElement.appendChild(style);

    // --- 2. 提示框逻辑 ---
    const toast = document.createElement('div');
    toast.id = 'gm-copy-toast';
    document.documentElement.appendChild(toast);

    function hideToast() { toast.style.opacity = '0'; }
    function showToast(text, x, y, duration = 1500) {
        toast.innerText = text;
        const posX = (x + 15 + 100 > window.innerWidth) ? x - 100 : x + 15;
        toast.style.left = `${posX}px`;
        toast.style.top = `${y + 15}px`;
        toast.style.opacity = '1';
        if (duration > 0) {
            clearTimeout(window.toastHideTimer);
            window.toastHideTimer = setTimeout(hideToast, duration);
        }
    }

    // --- 3. 详情页定位 ---
    function scrollToInfoContainer() {
        if (!isDetailPage || hasScrolledToInfo) return;
        const target = document.querySelector('.MuiContainer-root.mui-8dw06s');
        if (target) {
            hasScrolledToInfo = true;
            const offset = target.getBoundingClientRect().top + window.scrollY - TOP_GAP;
            originalScrollTo.call(window, { top: offset, behavior: 'smooth' });
        }
    }

    // --- 4. 列表页翻页逻辑 ---
    function startScrollSequence() {
        if (!isListPage || pagingLock) return;
        pagingLock = true;
        const doScroll = () => {
            originalScrollTo.call(window, { top: 0, behavior: 'smooth' });
            setTimeout(() => { pagingLock = false; }, 800);
        };
        const mainContent = document.querySelector('main') || document.body;
        let triggered = false;
        const scrollObserver = new MutationObserver(() => {
            if (!triggered) {
                triggered = true;
                scrollObserver.disconnect();
                setTimeout(doScroll, 100);
            }
        });
        scrollObserver.observe(mainContent, { childList: true, subtree: true });
        setTimeout(() => { if (!triggered) { triggered = true; scrollObserver.disconnect(); doScroll(); } }, MAX_WAIT_TIME);
    }

    // --- 5. 核心逻辑重构 ---
    function fixLayout() {
        const container = document.querySelector('div[class*="mui-jt6puj"]');
        if (container) {

            // 赋予玻璃态布局 Class
            if (!container.classList.contains('gm-layout-horizontal') && !container.classList.contains('gm-layout-vertical')) {
                container.classList.add(isVertical ? 'gm-layout-vertical' : 'gm-layout-horizontal');
            }

            // 1. 提取数值 & 隐藏原生组件
            let nativeInput = container.querySelector('input');
            let currentPage = '1';

            if (nativeInput) {
                currentPage = nativeInput.value || '1';
                let parent = nativeInput;
                while (parent && parent.parentElement && parent.parentElement !== container) {
                    parent = parent.parentElement;
                }
                if (parent && parent !== container) {
                    parent.classList.add('gm-hidden-native');
                } else if (parent === container) {
                    nativeInput.classList.add('gm-hidden-native');
                }
            }

            Array.from(container.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') { node.nodeValue = ''; }
            });

            // 2. 渲染纯净版页码
            let customPage = document.getElementById('gm-custom-page');
            if (!customPage) {
                customPage = document.createElement('div');
                customPage.id = 'gm-custom-page';
                container.appendChild(customPage);
            }
            if (customPage.innerText !== currentPage) {
                customPage.innerText = currentPage;
            }

            // 3. 原生换页按钮打标签
            Array.from(container.children).forEach(child => {
                if (!child.classList.contains('custom-nav-btn') && child.id !== 'gm-custom-page' && !child.classList.contains('gm-hidden-native')) {
                    child.classList.add('gm-native-btn');
                }
            });

            // 4. 注入全新线性精美图标
            if (!document.getElementById('btn-trigger-search')) {
                const createBtn = (id, title, iconHtml, clickFn) => {
                    const btn = document.createElement('button');
                    btn.id = id;
                    btn.className = 'custom-nav-btn';
                    btn.title = title;
                    btn.innerHTML = iconHtml;
                    btn.onclick = clickFn;
                    return btn;
                };

                // 统一线性风格的精美图标 (Feather Icons Style)
                const movieSvg = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
                const tvSvg = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`;
                const searchSvg = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

                container.appendChild(createBtn('btn-go-movie', '跳转电影', movieSvg, () => { location.href = 'https://hdhive.com/movie'; }));
                container.appendChild(createBtn('btn-go-tv', '跳转剧集', tvSvg, () => { location.href = 'https://hdhive.com/tv'; }));
                container.appendChild(createBtn('btn-trigger-search', '开启搜索', searchSvg, (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const nativeSearchBtn = document.evaluate("/html/body/header/div/div/div[1]/button", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (nativeSearchBtn) {
                        nativeSearchBtn.click();
                    } else {
                        originalScrollTo.call(window, { top: 0, behavior: 'instant' });
                        setTimeout(() => {
                            const retryBtn = document.evaluate("/html/body/header/div/div/div[1]/button", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            if (retryBtn) retryBtn.click();
                        }, 50);
                    }
                }));
            }
        }

        if (isDetailPage && !hasScrolledToInfo) {
            scrollToInfoContainer();
        }
    }

    // --- 6. 事件监听 ---
    window.addEventListener('mousemove', (e) => {
        const isTitle = e.target.closest('.mui-1tlztda') || e.target.closest('.MuiContainer-root h1');
        if (isTitle) {
            if (toast.innerText === '片名已复制' && toast.style.opacity === '1') return;
            if (!hoverTimer && toast.style.opacity === '0') {
                hoverTimer = setTimeout(() => {
                    showToast('复制片名', e.clientX, e.clientY, 1500);
                }, HOVER_DELAY);
            }
        } else {
            clearTimeout(hoverTimer);
            hoverTimer = null;
            if (toast.innerText === '复制片名') hideToast();
        }
    });

    window.addEventListener('click', (e) => {
        const titleElem = e.target.closest('.mui-1tlztda') || e.target.closest('.MuiContainer-root h1');
        if (titleElem) {
            e.preventDefault(); e.stopPropagation();
            clearTimeout(hoverTimer);

            let text = titleElem.innerText.trim();
            text = text.replace(/\s*\(\d{4}\)$/, '');

            navigator.clipboard.writeText(text).then(() => {
                showToast('片名已复制', e.clientX, e.clientY, 1500);
            });
            return;
        }
        if (isListPage) {
            const btn = e.target.closest('.gm-native-btn button') || e.target.closest('div[class*="mui-ch5dqf"] button');
            if (btn && !pagingLock) { startScrollSequence(); }
        }
    }, true);

    window.addEventListener('keydown', (e) => {
        if (!isListPage || ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
        const navButtons = document.querySelectorAll('.gm-native-btn button, div[class*="mui-ch5dqf"] button');
        if (navButtons.length < 2) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); startScrollSequence(); navButtons[0].click(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); startScrollSequence(); navButtons[navButtons.length - 1].click(); }
    }, true);

    const observer = new MutationObserver(fixLayout);
    if (document.documentElement) {
        fixLayout();
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
