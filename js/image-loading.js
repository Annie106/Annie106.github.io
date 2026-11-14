(function () {
    'use strict';

    if (window.AnnieImageLoading) return;

    // ==================================================================
    // 高速 / 慢速直链策略（2026-11-14 起）
    //   · 默认优先高速直链（data-fast-src）
    //   · 每张图每天最多只走 1 次高速直链；用掉之后当天都走慢速（data-slow-src）
    //   · 没配高速直链、或高速直链加载失败 → 立刻回退慢速直链
    //   · 失败不占用当天额度：这次不算"用过"，下次进来还能再试一次高速
    //   · 每次选链、成功、回退都会在控制台打日志（前缀 [图片加载·高速直链] /
    //     [图片加载·慢速直链] / [图片加载·回退]），方便核对到底走了哪条
    // 记录以「本地日期 + 图片地址」为粒度，存在 localStorage：
    //   { "date": "2026-11-14", "images": ["<data-fast-src 的值>", ...] }
    // 过一天自动作废（date 不匹配即视为新的一天），不会无限增长。
    // localStorage 不可用（隐私模式等）时依次退回 sessionStorage、内存。
    // ==================================================================
    // 不在本策略里的图片（不占额度、也不打日志）：
    //   · 头像 .avatar（首页/文章作者头像，走的是媒体 CDN，跟高速直链无关）
    //   · 音乐播放器区域（音频是 <audio>，本来就不会进这里；封面图同样放过）
    //   · 任何显式标了 data-image-loading="off" / data-fast-quota="off" 的区域
    var EXCLUDED_SELECTOR = '.avatar, .music-player-card, .music-enable-hint, ' +
        '[data-image-loading="off"], [data-fast-quota="off"]';
    var FAST_DAILY_KEY = 'annie-image-fast-daily';

    var managedImages = new WeakSet();
    var slowPreviewImages = new WeakMap();
    var fastDailyState = null;              // 当天的高速使用记录，每个页面只读一次
    var fastInFlight = Object.create(null); // 本页正在请求高速的图片，避免同一张图重复消耗额度
    var storageName = 'localStorage';

    var STYLE_FAST = 'color:#37b24d;font-weight:600;';
    var STYLE_SLOW = 'color:#f08c00;font-weight:600;';
    var STYLE_FALLBACK = 'color:#e03131;font-weight:600;';
    var STYLE_INFO = 'color:#8a8a8a;';

    function logFast(message, url) {
        console.info('%c[图片加载·高速直链] ' + message, STYLE_FAST, url || '');
    }

    function logSlow(message, url) {
        console.info('%c[图片加载·慢速直链] ' + message, STYLE_SLOW, url || '');
    }

    function logFallback(message, url) {
        console.warn('%c[图片加载·回退] ' + message, STYLE_FALLBACK, url || '');
    }

    function logFail(message, url) {
        console.warn('%c[图片加载·失败] ' + message, STYLE_FALLBACK, url || '');
    }

    function logInfo(message, url) {
        console.info('%c[图片加载] ' + message, STYLE_INFO, url || '');
    }

    function pad2(value) {
        return value < 10 ? '0' + value : String(value);
    }

    // 用本地日期，不用 toISOString()（那是 UTC，晚上 8 点后会跳成"明天"）
    function todayKey() {
        var now = new Date();
        return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    }

    function parseFastDaily(raw, today) {
        if (!raw) return null;
        try {
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.date !== today || !Array.isArray(parsed.images)) return null;
            return { date: today, images: parsed.images.slice() };
        } catch (error) {
            return null;
        }
    }

    function loadFastDaily() {
        var today = todayKey();
        var empty = { date: today, images: [] };
        try {
            var local = parseFastDaily(window.localStorage.getItem(FAST_DAILY_KEY), today);
            storageName = 'localStorage';
            return local || empty;
        } catch (localError) {
            // 隐私模式下连访问 localStorage 都可能抛错，往下退
        }
        try {
            var session = parseFastDaily(window.sessionStorage.getItem(FAST_DAILY_KEY), today);
            storageName = 'sessionStorage';
            return session || empty;
        } catch (sessionError) {
            storageName = 'memory';
            console.warn('[图片加载] 无法读取高速直链使用记录，当天额度只在当前页面内生效。');
            return empty;
        }
    }

    function persistFastDaily(state) {
        var raw = JSON.stringify(state);
        try {
            window.localStorage.setItem(FAST_DAILY_KEY, raw);
            storageName = 'localStorage';
            return;
        } catch (localError) {
            // 落到 sessionStorage
        }
        try {
            window.sessionStorage.setItem(FAST_DAILY_KEY, raw);
            storageName = 'sessionStorage';
            return;
        } catch (sessionError) {
            storageName = 'memory';
            console.warn('[图片加载] 无法持久化高速直链使用记录，当天额度只在当前标签页内生效。');
        }
    }

    function getFastDaily() {
        if (!fastDailyState) fastDailyState = loadFastDaily();
        return fastDailyState;
    }

    function hasUsedFastToday(fastSrc) {
        return getFastDaily().images.indexOf(fastSrc) !== -1;
    }

    function rememberFastUse(fastSrc) {
        var state = getFastDaily();
        if (state.images.indexOf(fastSrc) === -1) state.images.push(fastSrc);
        persistFastDaily(state);
    }

    // 每张图（以 data-fast-src 的地址区分）决定这次走哪条链接
    function chooseSource(fastSrc, slowSrc) {
        if (!fastSrc) {
            logSlow('未配置高速直链，使用慢速直链', slowSrc);
            return { src: slowSrc, fast: false };
        }
        if (hasUsedFastToday(fastSrc)) {
            logSlow('今日这张图的高速直链额度已用完，改用慢速直链', slowSrc);
            return { src: slowSrc, fast: false };
        }
        if (fastInFlight[fastSrc]) {
            logSlow('同一张图的高速直链正在加载中，本次改用慢速直链', slowSrc);
            return { src: slowSrc, fast: false };
        }
        logFast('今日首次加载，优先使用高速直链（记录存储：' + storageName + '）', fastSrc);
        return { src: fastSrc, fast: true };
    }

    function installStyles(doc) {
        if (!doc.head || doc.getElementById('annie-image-loading-styles')) return;
        var style = doc.createElement('style');
        style.id = 'annie-image-loading-styles';
        style.textContent =
            '.annie-image-loading{' +
                'background-color:var(--annie-image-tone,#e8e4de);' +
                'background-size:cover;background-position:center;background-repeat:no-repeat;' +
                'filter:blur(20px);transform:scale(1.04);' +
            '}' +
            '@keyframes annie-image-reveal{' +
                'from{filter:blur(20px);transform:scale(1.04)}' +
                'to{filter:blur(0);transform:scale(1)}' +
            '}' +
            '.annie-image-revealing{' +
                'animation:annie-image-reveal .5s cubic-bezier(.22,.61,.36,1) both;' +
            '}' +
            '@media(prefers-reduced-motion:reduce){' +
                '.annie-image-revealing{animation:none}' +
            '}';
        doc.head.appendChild(style);
    }

    function startSlowPreview(img, slowSrc) {
        var existing = slowPreviewImages.get(img);
        if (existing) return existing;

        var doc = img.ownerDocument;
        var preview = doc.createElement('img');
        preview.decoding = 'async';
        if ('fetchPriority' in preview) preview.fetchPriority = 'low';
        preview.addEventListener('load', function () {
            logSlow('大图已在后台预加载完成', slowSrc);
        }, { once: true });
        preview.addEventListener('error', function () {
            logSlow('大图后台预加载失败', slowSrc);
        }, { once: true });
        slowPreviewImages.set(img, preview);
        preview.src = slowSrc;
        return preview;
    }

    function configurePlaceholder(img) {
        var tone = img.getAttribute('data-tone');
        var lqip = img.getAttribute('data-lqip');
        if (tone) img.style.setProperty('--annie-image-tone', tone);
        if (lqip) {
            img.style.backgroundImage = 'url("' + lqip.replace(/"/g, '\\"') + '")';
            img.style.backgroundSize = 'cover';
            img.style.backgroundPosition = 'center';
        }
    }

    function settleImage(img, loaded, animate) {
        img.classList.remove('annie-image-loading');
        var reduceMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (loaded && animate && !reduceMotion) {
            img.classList.add('annie-image-revealing');
            img.addEventListener('animationend', function () {
                img.classList.remove('annie-image-revealing');
            }, { once: true });
            window.setTimeout(function () {
                img.classList.remove('annie-image-revealing');
            }, 600);
        } else {
            img.classList.remove('annie-image-revealing');
        }

        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'annie-embedded-height',
                height: Math.ceil(
                    img.ownerDocument.body.getBoundingClientRect().bottom +
                    (img.ownerDocument.defaultView.scrollY || 0)
                )
            }, '*');
        }
    }

    function initializeImage(img) {
        if (managedImages.has(img) || img.closest(EXCLUDED_SELECTOR)) {
            return;
        }
        managedImages.add(img);

        var fastSrc = (img.getAttribute('data-fast-src') || '').trim();
        var slowSrc = (img.getAttribute('data-slow-src') || '').trim();
        var currentSrc = img.getAttribute('src') || '';
        if (!slowSrc && currentSrc) {
            slowSrc = currentSrc;
            if (fastSrc) img.setAttribute('data-slow-src', slowSrc);
        }
        if (!slowSrc && fastSrc) {
            console.warn('[图片加载] 配置了高速直链但缺少 data-slow-src，已跳过该图片。', fastSrc);
            return;
        }
        if (!slowSrc) return;

        configurePlaceholder(img);

        var decision = chooseSource(fastSrc, slowSrc);
        var useFast = decision.fast;
        var selectedSrc = decision.src;
        var settled = false;
        var reported = false;

        function reportResult(ok, url) {
            if (reported) return;
            reported = true;
            if (!ok) {
                logFail('高速直链与慢速直链都加载失败', url);
                return;
            }
            if (img.getAttribute('data-fast-active') === 'true') {
                logFast('加载成功', url);
            } else {
                logSlow('加载成功', url);
            }
        }

        // 只有"这一次真的用过高速"才结算，且只结算一次：
        // 成功 → 记进当天额度；失败 → 不记，下次还能再试
        function settleFastAttempt(success) {
            if (!useFast || !fastInFlight[fastSrc]) return;
            delete fastInFlight[fastSrc];
            if (success) rememberFastUse(fastSrc);
        }

        function fallbackToSlow() {
            settleFastAttempt(false);
            img.removeAttribute('data-fast-active');
            img.setAttribute('data-slow-active', 'true');
            logFallback('高速直链加载失败，回退到慢速直链（本次不占用当天额度）', fastSrc);
            img.src = slowSrc;
        }

        if (useFast) {
            fastInFlight[fastSrc] = true;
            img.setAttribute('data-fast-active', 'true');
        } else {
            img.removeAttribute('data-fast-active');
            img.setAttribute('data-slow-active', 'true');
        }

        img.addEventListener('load', function () {
            if (img.getAttribute('data-fast-active') === 'true') settleFastAttempt(true);
            reportResult(true, img.currentSrc || img.src);
            if (settled) return;
            settled = true;
            settleImage(img, true, true);
        });

        img.addEventListener('error', function () {
            if (img.getAttribute('data-fast-active') === 'true' && slowSrc) {
                fallbackToSlow();
                return;
            }
            settleFastAttempt(false);
            reportResult(false, img.currentSrc || img.src || selectedSrc);
            if (settled) return;
            settled = true;
            img.setAttribute('data-load-failed', 'true');
            settleImage(img, false, false);
        });

        img.classList.add('annie-image-loading');

        // 打开页面即开始加载：视口外的图片不再等待滚动，改为后台低优先级加载
        if ((img.getAttribute('loading') || '').toLowerCase() === 'lazy') {
            var rect = img.getBoundingClientRect();
            var viewH = img.ownerDocument.defaultView.innerHeight || 0;
            var inView = rect.bottom > -100 && rect.top < viewH + 100;
            if (!inView && 'fetchPriority' in img) img.fetchPriority = 'low';
            img.loading = 'eager';
        }

        if (selectedSrc && currentSrc !== selectedSrc) img.src = selectedSrc;

        if (img.complete && img.naturalWidth > 0) {
            if (img.getAttribute('data-fast-active') === 'true') settleFastAttempt(true);
            reportResult(true, img.currentSrc || img.src || selectedSrc);
            settled = true;
            settleImage(img, true, false);
        } else if (img.complete && img.getAttribute('data-fast-active') === 'true' && slowSrc) {
            // 缓存里就是一条失败记录：直接回退慢速
            fallbackToSlow();
        } else if (img.complete && selectedSrc) {
            reportResult(false, selectedSrc);
            settled = true;
            img.setAttribute('data-load-failed', 'true');
            settleImage(img, false, false);
        }

        // 走了高速就把慢速大图在后台预加载好，点开大图/预览时不用再等
        // （已经回退慢速的就不用预热了：慢速图正是当前这张，再请求一次是白跑
        //   一趟。所以下面两个分支都要先确认这一次高速是成功的）
        function previewUseful() {
            return img.getAttribute('data-fast-active') === 'true' &&
                img.getAttribute('data-load-failed') !== 'true';
        }

        if (useFast) {
            var doc = img.ownerDocument;
            if ('IntersectionObserver' in doc.defaultView) {
                var observer = new doc.defaultView.IntersectionObserver(function (entries) {
                    if (!img.isConnected) {
                        observer.disconnect();
                        return;
                    }
                    if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
                    observer.disconnect();
                    if (!previewUseful()) return;
                    startSlowPreview(img, slowSrc);
                }, { rootMargin: '200px 0px' });
                observer.observe(img);
            } else {
                if (previewUseful()) startSlowPreview(img, slowSrc);
            }
        }

        window.setTimeout(function () {
            if (settled) return;
            settled = true;
            settleImage(img, false, false);
        }, 2500);
    }

    function initialize(root) {
        var doc = root.nodeType === 9 ? root : root.ownerDocument;
        var childApi = doc.defaultView && doc.defaultView.AnnieImageLoading;
        if (childApi && childApi !== api) {
            childApi.initialize(root);
            return;
        }
        installStyles(doc);

        if (root.nodeType === 1 && root.matches('img')) initializeImage(root);
        root.querySelectorAll('img').forEach(initializeImage);

        if (doc.__annieImageLoadingObserver) return;
        var Observer = doc.defaultView.MutationObserver;
        if (!Observer || !doc.documentElement) return;
        doc.__annieImageLoadingObserver = new Observer(function (records) {
            records.forEach(function (record) {
                record.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) initialize(node);
                });
            });
        });
        doc.__annieImageLoadingObserver.observe(doc.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function describeDailyQuota() {
        var state = getFastDaily();
        return {
            date: state.date,
            used: state.images.slice(),
            storage: storageName
        };
    }

    var api = {
        initialize: initialize,
        getPreviewImage: function (img) {
            var slowSrc = (img.getAttribute('data-slow-src') || '').trim();
            if (!slowSrc) return null;
            return startSlowPreview(img, slowSrc);
        },
        // 调试用：在控制台敲 AnnieImageLoading.getDailyQuota() 看今天哪些图用过高速
        getDailyQuota: describeDailyQuota,
        // 调试用：把当天记录清空（比如想重新验证一次高速直链）
        resetDailyQuota: function () {
            fastDailyState = { date: todayKey(), images: [] };
            persistFastDaily(fastDailyState);
            logInfo('已清空当天高速直链使用记录（存储：' + storageName + '）');
            return describeDailyQuota();
        }
    };
    window.AnnieImageLoading = api;

    initialize(document);
})();
