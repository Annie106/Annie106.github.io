/* ==================== 音乐元数据预加载 ====================
 *
 * 解决的问题
 *   卡片和音乐库的总时长都来自 <audio>.duration。引擎故意不给 audio 设 src
 *   （进站不出声，也不预拉流量），所以用户第一次点播放之前时长永远是 00:00，
 *   点下去还得先等 metadata 到达才知道总长。
 *   这里在**首屏渲染完成之后**、网络空闲时，逐首探测音频的 metadata，
 *   把 duration 记下来：
 *     · 卡片 / 播放器立刻能显示真实总时长，进度条也有分母；
 *     · 浏览器提前和源站建立连接、把能缓存的部分放进 HTTP 缓存，
 *       点播放时少等一段（到底能省多少由源站缓存头决定，见下）。
 *
 * 为什么不做「音频字节缓存」
 *   纯静态站没有 Service Worker；音频是跨域直链，Cache API 需要对方放行
 *   CORS，还要自己处理 Range。硬做只会变成「把整首歌下载两遍」。
 *   所以这里只取 metadata，字节级复用明确交给浏览器 HTTP 缓存 ——
 *   音频放进同源 music/audio/ 时才真正可控（见 js/music-tracks.js 注释）。
 *
 * 带宽闸门（命中任何一条就整批跳过）
 *   · Save-Data: on
 *   · effectiveType 是 slow-2g / 2g
 *   · prefers-reduced-data: reduce
 *   · 首屏 load 之后还要再等 1.2s，再排队到 requestIdleCallback
 *   · 串行探测、每首之间隔 900ms、单首 8s 超时（超时立刻中止这次请求）
 *   · 最多登记 8 首（MAX_TRACKS），列表再长也不无限预加载
 *
 * 状态机
 *   idle → loading → ready | error | skipped
 *   · ready 写进 localStorage（30 天），跨会话复用，下次进站连探测都省；
 *   · error 不落盘，别把一次临时故障记成永久失败，下次进站会重试；
 *   · 用户播放时引擎会把 <audio> 的真实 duration 通过 set() 回写，
 *     这是一条更可靠的缓存来源（真实播放过的歌）。
 *
 * 运行时让位
 *   用户按下播放会调 pause()：后台队列停止，避免和真正的音频抢带宽。
 *   之后再 hover / 点别的曲目，ensure() 会把它单独插队探测 —— 那是用户意图，
 *   不再是后台预加载。页面切到后台（visibilityState=hidden）同样会停。
 *
 * 对外接口（window.MusicPreload）
 *   register(list, {priorityIndex})  登记曲目，等首屏后自动开始
 *   get(src)        → {status, duration}
 *   duration(src)   → number（只读，同步）
 *   set(src, 秒)    → 引擎回写真实时长
 *   ensure(src)     → Promise<number>，插队探测单首（hover / 焦点用）
 *   pause() / resume()
 *   subscribe(fn)   → 订阅状态变化，返回退订函数
 *   stats()         → {ready, failed, loading, pending, skipped}
 * ======================================================== */
(function () {
    'use strict';

    /* 与 background-music.js 用同一套基准：脚本所在目录 → 站点根。
       曲目写相对路径（music/audio/x.mp3）时按站点根解析，
       在首页和 /posts/<id>/ 下都指向同一个文件。 */
    const SCRIPT_BASE = (function () {
        const current = document.currentScript;
        try {
            if (current && current.src) return new URL('./', current.src);
        } catch (e) {
            /* 拿不到就退回当前文档下的 js/ */
        }
        return new URL('js/', document.baseURI);
    })();

    const SITE_ROOT = new URL('../', SCRIPT_BASE);

    const STORE_KEY = 'annie-music-meta-v1';
    const TTL = 30 * 24 * 60 * 60 * 1000;   // 元数据 30 天有效
    const MAX_ENTRIES = 40;                 // localStorage 里最多留 40 条
    const MAX_TRACKS = 8;                   // 单次最多登记 8 首
    const PROBE_TIMEOUT = 8000;             // 单首最长 8s，超时中止请求
    const MAX_ATTEMPTS = 2;                 // 单首最多试 2 次
    const GAP = 900;                        // 两首之间留出的空隙
    const START_DELAY = 1200;               // load 之后再多等一会儿

    /* 弹窗 iframe（music/index.html?embed=1）只读缓存、不探测：
       父页面已经在做同一件事，两边同时请求同一首歌纯属浪费。 */
    const CACHE_ONLY = new URLSearchParams(window.location.search).get('embed') === '1';

    /* key 一律是解析后的绝对 URL，避免 ./a.mp3 和 /a.mp3 被记成两条 */
    const records = new Map();
    const listeners = new Set();

    let backgroundQueue = [];   // 空闲时逐首探测
    let priorityQueue = [];     // hover / 焦点插队，不受 paused 限制
    let pumping = false;
    let backgroundPaused = false;
    let scheduled = false;
    let skipReason = '';

    /* ==================== 工具 ==================== */

    function normalize(src) {
        if (!src) return '';
        try {
            return new URL(src, SITE_ROOT).href;
        } catch (e) {
            return String(src);
        }
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, ms);
        });
    }

    /* ==================== 持久化 ==================== */

    function loadStore() {
        let stored = null;
        try {
            stored = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}');
        } catch (e) {
            return;   // 隐私模式 / 脏数据：当作没有缓存，不影响播放
        }
        if (!stored || typeof stored !== 'object') return;

        const now = Date.now();
        Object.keys(stored).forEach(function (key) {
            const item = stored[key];
            const seconds = Number(item && item.d);
            const at = Number(item && item.t) || 0;
            if (!Number.isFinite(seconds) || seconds <= 0) return;
            if (now - at > TTL) return;
            records.set(key, { status: 'ready', duration: seconds, attempts: 0, at: at });
        });
    }

    /* 只写 ready 的条目：error / skipped 落盘会让一次临时故障变永久。 */
    function saveStore() {
        const entries = [];
        records.forEach(function (record, key) {
            if (record.status !== 'ready') return;
            if (!Number.isFinite(record.duration) || record.duration <= 0) return;
            entries.push({ key: key, d: record.duration, t: record.at || Date.now() });
        });
        entries.sort(function (a, b) { return b.t - a.t; });

        const payload = {};
        entries.slice(0, MAX_ENTRIES).forEach(function (item) {
            payload[item.key] = { d: item.d, t: item.t };
        });

        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify(payload));
        } catch (e) {
            /* 配额满 / 隐私模式：只在本次会话有效 */
        }
    }

    /* ==================== 状态通知 ==================== */

    function emit(key, record) {
        if (!listeners.size) return;
        const detail = {
            key: key,
            status: record.status,
            duration: record.duration || 0
        };
        listeners.forEach(function (listener) {
            try {
                listener(detail);
            } catch (error) {
                console.warn('音乐预加载订阅回调出错:', error);
            }
        });
    }

    function setSkipped(key, reason) {
        const record = records.get(key) || { attempts: 0 };
        record.status = 'skipped';
        record.reason = reason;
        records.set(key, record);
        emit(key, record);
    }

    /* ==================== 网络闸门 ==================== */

    function networkBlockReason() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            if (connection.saveData) return 'save-data';
            const type = String(connection.effectiveType || '');
            if (type === 'slow-2g' || type === '2g') return type;
        }
        try {
            if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return 'reduced-data';
        } catch (e) {
            /* 老浏览器不认这条媒体查询 */
        }
        return '';
    }

    /* ==================== 单首探测 ==================== */

    /* 只拿 metadata：preload='metadata' 下浏览器通常只发 Range 取文件头。
       探完立刻 removeAttribute('src') + load() 中止请求、释放解码器，
       否则元素被 GC 之前会一直占着连接。 */
    function probeOnce(key) {
        return new Promise(function (resolve) {
            const el = new Audio();
            let settled = false;
            let timer = 0;

            function finish(seconds) {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                el.removeEventListener('loadedmetadata', onMeta);
                el.removeEventListener('durationchange', onMeta);
                el.removeEventListener('error', onError);
                try {
                    el.preload = 'none';
                    el.removeAttribute('src');
                    el.load();
                } catch (e) {
                    /* 忽略：清理失败不影响结果 */
                }
                resolve(seconds);
            }

            function onMeta() {
                const seconds = el.duration;
                if (Number.isFinite(seconds) && seconds > 0) {
                    finish(seconds);
                } else if (el.readyState >= 1) {
                    /* 流式源可能先给 Infinity，等不到有穷值就别耗着 */
                    finish(0);
                }
            }

            function onError() {
                finish(0);
            }

            el.preload = 'metadata';
            el.muted = true;
            el.addEventListener('loadedmetadata', onMeta);
            el.addEventListener('durationchange', onMeta);
            el.addEventListener('error', onError);

            timer = window.setTimeout(function () { finish(0); }, PROBE_TIMEOUT);

            try {
                el.src = key;
            } catch (e) {
                finish(0);
            }
        });
    }

    async function runProbe(key) {
        const record = records.get(key) || { status: 'idle', attempts: 0 };
        record.status = 'loading';
        record.duration = 0;
        records.set(key, record);
        emit(key, record);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const seconds = await probeOnce(key);
            if (seconds > 0) {
                record.status = 'ready';
                record.duration = seconds;
                record.attempts = attempt;
                record.at = Date.now();
                saveStore();
                emit(key, record);
                return true;
            }
            record.attempts = attempt;
            if (attempt < MAX_ATTEMPTS) await sleep(1500);
        }

        /* 失败不落盘；下次进站会重新试 */
        record.status = 'error';
        record.duration = 0;
        emit(key, record);
        return false;
    }

    /* ==================== 队列 ==================== */

    async function drain() {
        try {
            while (true) {
                if (document.visibilityState === 'hidden') break;

                let key = priorityQueue.shift();
                if (!key) {
                    if (backgroundPaused) break;
                    key = backgroundQueue.shift();
                }
                if (!key) break;

                const record = records.get(key);
                if (record && (record.status === 'ready' || record.status === 'error')) continue;

                await runProbe(key);
                await sleep(GAP);
            }
        } finally {
            pumping = false;
        }
    }

    function pump() {
        if (pumping || CACHE_ONLY || skipReason) return;
        pumping = true;
        /* 让出当前任务：调用点常常在 load 回调或点击事件里 */
        Promise.resolve().then(drain);
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;

        const start = function () {
            window.setTimeout(function () {
                const idle = window.requestIdleCallback
                    ? function (fn) { window.requestIdleCallback(fn, { timeout: 3000 }); }
                    : function (fn) { window.setTimeout(fn, 400); };

                idle(function () {
                    skipReason = networkBlockReason();
                    if (skipReason) {
                        /* 整批跳过：别留下一堆 pending 让人以为还在等 */
                        backgroundQueue.forEach(function (key) { setSkipped(key, skipReason); });
                        backgroundQueue = [];
                        return;
                    }
                    pump();
                });
            }, START_DELAY);
        };

        if (document.readyState === 'complete') start();
        else window.addEventListener('load', start, { once: true });
    }

    /* ==================== 公开接口 ==================== */

    function register(list, options) {
        if (CACHE_ONLY) return;

        const items = Array.isArray(list) ? list.slice(0, MAX_TRACKS) : [];
        const priorityIndex = options && Number.isInteger(options.priorityIndex)
            ? options.priorityIndex
            : 0;

        const keys = [];
        const seen = new Set();

        items.forEach(function (item) {
            const raw = typeof item === 'string' ? item : (item && item.src);
            const key = normalize(raw);
            if (!key || seen.has(key)) return;
            seen.add(key);

            const record = records.get(key);
            if (record && (record.status === 'ready' || record.status === 'error')) return;
            keys.push(key);
        });

        /* 当前曲目排到最前：用户最可能先点它 */
        const priorityKey = keys[priorityIndex];
        if (priorityKey) {
            keys.splice(keys.indexOf(priorityKey), 1);
            keys.unshift(priorityKey);
        }

        backgroundQueue = keys;
        schedule();
    }

    function get(src) {
        const record = records.get(normalize(src));
        if (!record) return { status: 'idle', duration: 0 };
        return { status: record.status, duration: record.duration || 0 };
    }

    function getDuration(src) {
        const record = records.get(normalize(src));
        if (!record || record.status !== 'ready') return 0;
        return record.duration > 0 ? record.duration : 0;
    }

    function recordDuration(src, seconds) {
        const key = normalize(src);
        const value = Number(seconds);
        if (!key || !Number.isFinite(value) || value <= 0) return;

        const record = records.get(key) || { attempts: 0 };
        if (record.status === 'ready' && Math.abs(record.duration - value) < 0.5) return;

        record.status = 'ready';
        record.duration = value;
        record.at = Date.now();
        records.set(key, record);
        saveStore();
        emit(key, record);
    }

    function ensure(src) {
        const key = normalize(src);
        if (!key) return Promise.resolve(0);

        const cached = records.get(key);
        if (cached && cached.status === 'ready') return Promise.resolve(cached.duration);
        if (CACHE_ONLY) return Promise.resolve(0);

        const blocked = networkBlockReason();
        if (blocked) {
            setSkipped(key, blocked);
            return Promise.resolve(0);
        }

        const settled = new Promise(function (resolve) {
            const off = subscribe(function (detail) {
                if (detail.key !== key) return;
                if (detail.status !== 'ready' && detail.status !== 'error' && detail.status !== 'skipped') return;
                off();
                resolve(detail.duration || 0);
            });
        });

        if (priorityQueue.indexOf(key) === -1) priorityQueue.unshift(key);
        pump();
        return settled;
    }

    function pause() {
        backgroundPaused = true;
    }

    function resume() {
        backgroundPaused = false;
        pump();
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function () {};
        listeners.add(listener);
        return function () {
            listeners.delete(listener);
        };
    }

    function stats() {
        let ready = 0;
        let failed = 0;
        let loading = 0;

        records.forEach(function (record) {
            if (record.status === 'ready') ready++;
            else if (record.status === 'error') failed++;
            else if (record.status === 'loading') loading++;
        });

        return {
            ready: ready,
            failed: failed,
            loading: loading,
            pending: backgroundQueue.length + priorityQueue.length,
            skipped: skipReason
        };
    }

    loadStore();

    window.MusicPreload = {
        register: register,
        get: get,
        duration: getDuration,
        set: recordDuration,
        ensure: ensure,
        pause: pause,
        resume: resume,
        subscribe: subscribe,
        stats: stats
    };

    /* 切回前台继续未完成的队列（后台标签页里不消耗流量） */
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') pump();
    });
})();
