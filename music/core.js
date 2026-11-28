/* ==================== 音乐模块 · 播放核心 ====================
 *
 * 全站只有一个 <audio>，就在这个文件里。首页卡片、右下角迷你播放条、
 * 站内音乐页（?view=music）都只是它的 UI（在 music/ui.js），不各自建播放器 ——
 * 两个 <audio> 会同时出声，而且暂停一个另一个还在走。
 *
 * 用法：
 *   AnnieMusic.init(window.ANNIE_MUSIC_TRACKS);
 *   AnnieMusic.subscribe(function (state, reason) { ... });
 *   AnnieMusic.toggle() / next() / prev() / seek(秒) / setVolume(0~1) / cycleMode()
 *
 * 设计上的几条硬规则：
 *   1. **绝不自播**。进站、加载模块、切歌都不会主动出声，
 *      只有 toggle() / play() 被真实点击调用才播。
 *   2. **preload 永远是 'none'**，直到真的要播才设 src。
 *      首页首屏因此不会因为「卡片上有个播放器」就偷偷下 7MB 音频。
 *   3. **状态唯一的来源是 audio 元素**：UI 只读 subscribe 推过来的快照，
 *      不自己记 isPlaying —— 否则浏览器暂停（比如来电、系统媒体键）
 *      之后按钮会停在「暂停」图标上，点了没反应。
 *   4. 播放失败不抛异常、不静默：state.error 变成 'blocked' / 'quota' / 'play'，
 *      UI 直接在卡片上写一句人话。
 *   5. **失败必须退避**：连续放不出来时下一次请求要等够时间（规则见下面
 *      「失败重试门禁」那一段）。等待期内任何入口（播放键、换歌、上一首/
 *      下一首、播放全部、系统媒体键）都不会碰 audio.src / audio.play()。
 *
 * reason 取值（UI 按它决定要不要重排）：
 *   'init' 'track' 'play' 'pause' 'time' 'duration' 'loading' 'error' 'volume' 'mode'
 *   'retry'（等待期每秒刷新倒计时、到期解除）—— UI 不需要特殊处理，和 'error' 一样重画即可
 * ======================================================== */
(function (global) {
    'use strict';

    /* 已经挂过就不再挂第二份：理论上只会加载一次，但动态注入的脚本
       一旦被重复调用，两个 audio 同时响会很难查。 */
    if (global.AnnieMusic) return;

    var STORAGE_KEY = 'annie-music-prefs-v1';
    var MODES = ['list', 'shuffle', 'one'];

    var tracks = [];
    var listeners = [];
    var audio = null;
    var baseUrl = resolveBaseUrl();
    var prefs = readPrefs();

    var state = {
        ready: false,
        /* 首页 / 曲库页打开时一律从第一首开始（用户要求「默认显示第一首歌」）。
           音量、静音、播放模式仍然记住 —— 那些是偏好，不是进度。 */
        index: 0,
        playing: false,
        buffering: false,
        error: '',
        currentTime: 0,
        duration: 0,
        /* 首次（无历史记录）默认 30%。有历史就直接用存下来的值 ——
           ui.js 首屏也读同一份 localStorage，两边拿到的是同一个数，不会跳变。 */
        volume: normalizeVolume(prefs.volume, 0.3),
        muted: prefs.muted === true,
        mode: MODES.indexOf(prefs.mode) >= 0 ? prefs.mode : 'list'
    };

    /* ---------------- 失败重试门禁 ----------------
     *
     * 一次「失败」= 浏览器明确告诉我们放不出来：<audio> 的 error 事件，
     * 或者 play() 返回的 promise 被 reject（AbortError 是我们自己切歌打断的，不算）。
     *
     * 失败次数 → 下一次请求要等多久（n = 刚刚失败的是第几次请求）：
     *
     *   n = 1  →  第 2 次请求   等 0 秒（立刻可以再点一次，给一次瞬断的机会）
     *   n = 2  →  第 3 次请求   等 10 秒
     *   n = 3  →  第 4 次请求   等 20 秒
     *   n = 4  →  第 5 次请求   等 20 秒（和上一档一样，不是 30）
     *   n = 5  →  第 6 次请求   等 30 秒
     *   n = 6  →  第 7 次请求   等 40 秒
     *   n = 7  →  第 8 次请求   等 50 秒
     *   n = 8  →  阶梯本该涨到 60 秒 —— **不再等待，今天到此为止**
     *
     * 即 delay(n) = 0（n≤1）/ 10 秒（n=2）/ max(20, (n-2)×10) 秒（n≥3），
     * 而这个值一旦 >= 60 就直接锁到明天：连续失败 8 次、试了 7 档，
     * 再点基本是徒劳，还白白打音频服务器。锁定按自然日记（本地时区），
     * 存在 localStorage 里，刷新 / 关掉再开也还是锁着，跨天自动解开。
     *
     * 计时起点是「这一次失败被确认的那一刻」，不是请求发出的那一刻：
     * 网络很慢、请求发了 8 秒才报错，那 10 秒就从报错那一秒重新数。
     *
     * 放行只认时间戳（now >= retryAt），绝不靠定时器计数：后台标签页的
     * 定时器会被节流到一分钟一次，靠计数就会提前发起请求。下面那个
     * setInterval 只负责让界面上的秒数跳动，删掉它也不会多发一次请求。
     */
    var LOCKOUT_SECONDS = 60;          // 等待阶梯涨到这个数就停止重试
    var LOCK_KEY = 'annie-music-lockout';

    var failureCount = 0;      // 连续失败次数，真正放出声（playing）后清零
    var retryAt = 0;           // 时间戳，早于它一律不发请求；0 表示不禁
    var retryTimer = null;     // 只刷新倒计时文案，不参与放行判定
    var retryShown = -1;       // 上一次推给 UI 的剩余秒数，避免每 250ms 重画
    var attemptOpen = false;   // 有一次请求已发出、结果还没回来（用于给重复报告去重）
    var lastFailureAt = 0;
    var lastFailureSrc = '';
    var lockedDate = readLockedDate(); // 已锁死的日期（'YYYY-M-D'），空串表示没锁

    /* ---------------- 小工具 ---------------- */

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    /* 从 localStorage 读出来的音量可能被人改坏 / 是字符串 / 旧版本遗留，
       统一走这里校验：数字且在 0~1 之间才认，否则回退到默认值（0.3）。
       ui.js 里有一份一模一样的逻辑 —— 改这里记得同步那边。 */
    function normalizeVolume(value, fallback) {
        var number = Number(value);
        if (typeof value !== 'number' || !isFinite(number) || number < 0 || number > 1) {
            return fallback;
        }
        return number;
    }

    function clampIndex(value) {
        var index = parseInt(value, 10);
        if (isNaN(index) || index < 0 || index >= tracks.length) return 0;
        return index;
    }

    function readPrefs() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? (JSON.parse(raw) || {}) : {};
        } catch (error) {
            return {};
        }
    }

    function savePrefs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                volume: state.volume,
                muted: state.muted,
                mode: state.mode
            }));
        } catch (error) { /* 隐私模式下写不进去，不影响播放 */ }
    }

    /* 相对路径按站点根解析。core.js 自己的地址就是最可靠的基准：
       它永远在 <站点根>/music/core.js，向上一级就是站点根，
       不用去猜当前页面在 /posts/<id>/ 还是 /music/。 */
    function resolveBaseUrl() {
        /* document.currentScript 只在脚本执行的那一瞬间有值，
           正好够用 —— 它返回的是**绝对地址**，向上一级就是站点根。
           ⚠️ 别用 querySelector('script[src$="music/core.js"]')：属性选择器
           比的是 HTML 里写的那个值（本页写的是 core.js），不是解析后的 URL，
           在 /music/ 页会匹配不到，接着 share_cover.jpg 就变成 /music/share_cover.jpg。 */
        var self = document.currentScript;
        if (self && self.src) {
            try { return new URL('..', self.src).href; } catch (error) {}
        }
        var path = window.location.pathname;
        if (/\/music\/[^/]*$/.test(path)) {
            try { return new URL('../', window.location.href).href; } catch (error) {}
        }
        return document.baseURI;
    }

    function resolveSrc(src) {
        if (!src) return '';
        if (/^(https?:|blob:|data:)/i.test(src)) return src;
        try { return new URL(String(src).replace(/^\.?\//, ''), baseUrl).href; } catch (error) { return src; }
    }

    function formatTime(seconds) {
        var total = Math.max(0, Math.floor(Number(seconds) || 0));
        var minutes = Math.floor(total / 60);
        var rest = total % 60;
        return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
    }

    function currentTrack() {
        return tracks[state.index] || null;
    }

    function emit(reason) {
        var snapshot = getState();
        listeners.slice().forEach(function (listener) {
            try { listener(snapshot, reason); } catch (error) { /* 一块 UI 出错不能拖垮播放 */ }
        });
    }

    /* ---------------- 失败重试门禁（逻辑） ---------------- */

    /* 第 count 次失败之后要等多久才能发下一次请求，单位**秒**。
       规则表在文件上半部分的注释里，改这里就等于改规则，别在别处再算一遍。 */
    function retryDelaySeconds(count) {
        if (count <= 1) return 0;
        if (count === 2) return 10;
        return Math.max(20, (count - 2) * 10);
    }

    /* 本地日期，形如 '2026-11-27'。不用 toISOString()：那是 UTC，
       东八区晚上 8 点之后就会算成「明天」，锁定会提前解开。 */
    function todayKey() {
        var date = new Date();
        return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
    }

    function readLockedDate() {
        try { return localStorage.getItem(LOCK_KEY) || ''; } catch (error) { return ''; }
    }

    /* 今天已经锁过一次：一进页面就该说清楚，不用等用户点了才发现。
       锁的是「日期字符串」，所以刷新、关页面再开都还在，跨天自动失效。 */
    function isLockedOut() {
        if (!lockedDate) return false;
        if (lockedDate === todayKey()) return true;
        clearLock();   /* 已经是新的一天，顺手把缓存清掉 */
        return false;
    }

    function clearLock() {
        if (!lockedDate) return;
        lockedDate = '';
        /* 换了一天就重新从「立即重试」开始数：否则昨天攒到的 8 次会让
           今天第一次失败就直接又锁死 */
        failureCount = 0;
        try { localStorage.removeItem(LOCK_KEY); } catch (error) { /* 隐私模式 */ }
    }

    function lockForToday() {
        lockedDate = todayKey();
        retryAt = 0;
        clearRetryTick();
        try { localStorage.setItem(LOCK_KEY, lockedDate); } catch (error) { /* 存不下就只锁本次会话 */ }
    }

    /* 剩余等待秒数，向上取整：剩 0.4 秒也算 1 秒，界面上不会出现
       「已显示 0 秒却不能点」。判定放行时用的是毫秒时间戳，不是这个值。 */
    function retryWaitSeconds() {
        if (!retryAt) return 0;
        var remain = retryAt - Date.now();
        return remain > 0 ? Math.ceil(remain / 1000) : 0;
    }

    function canRequest() {
        if (isLockedOut()) return false;
        return !retryAt || Date.now() >= retryAt;
    }

    function clearRetryTick() {
        if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
        }
        retryShown = -1;
    }

    function scheduleRetryTick() {
        if (!retryAt || retryTimer) return;
        retryTimer = setInterval(function () {
            if (canRequest()) {
                clearRetryTick();
                emit('retry');   /* 等待结束，文案回到普通失败态 */
                return;
            }
            var seconds = retryWaitSeconds();
            if (seconds === retryShown) return;
            retryShown = seconds;
            emit('retry');
        }, 250);
    }

    function resetFailureChain() {
        failureCount = 0;
        retryAt = 0;
        attemptOpen = false;
        lastFailureAt = 0;
        lastFailureSrc = '';
        clearRetryTick();
        /* 能放出声说明根本没被锁，跨天残留的标记顺手清掉 */
        clearLock();
    }

    /* 等待期内有人想播：一个请求都不发，只把剩余秒数推给 UI。 */
    function reportCooldown() {
        if (!state.error) state.error = 'quota';
        retryShown = -1;
        emit('retry');
    }

    /* 所有失败最终都从这里进：state.error、失败次数、等待截止时间三件事
       必须一次算完，散在各自的事件回调里迟早会对不上。 */
    function registerFailure(reason) {
        var now = Date.now();
        var src = audio ? (audio.getAttribute('src') || audio.currentSrc || '') : '';

        if (attemptOpen) {
            attemptOpen = false;
        } else if (src && src === lastFailureSrc && now - lastFailureAt < 1000) {
            /* 同一次失败的第二次报告（error 事件和 play() 的 reject 说的是
               同一件事）。不吞掉的话失败次数会翻倍，等待时间也跟着翻倍。 */
            return;
        }
        lastFailureAt = now;
        lastFailureSrc = src;

        state.playing = false;
        state.buffering = false;

        /* 浏览器因为「没有用户手势」拦下来的，不是音源的问题：
           再点一次通常就过了。算进失败链会让「被拦一次就要等 10 秒」
           变得莫名其妙，所以它不进等待期。 */
        if (reason === 'blocked') {
            state.error = 'blocked';
            syncMediaSessionState();
            emit('error');
            return;
        }

        failureCount += 1;
        var seconds = retryDelaySeconds(failureCount);

        /* 阶梯涨到 60 秒这一档：不再等待、不再发请求，直接锁到明天。
           到这里已经是连续第 8 次失败（0/10/20/20/30/40/50 都试过了），
           继续点既听不到歌，也一直在打音频服务器。 */
        if (seconds >= LOCKOUT_SECONDS) {
            lockForToday();
            state.error = reason;
            syncMediaSessionState();
            emit('error');
            return;
        }

        /* 计时起点 = 这一次失败被确认的时刻 */
        retryAt = seconds > 0 ? now + seconds * 1000 : 0;

        state.error = reason;
        syncMediaSessionState();
        emit('error');
        scheduleRetryTick();
    }

    /* ---------------- 音频元素 ---------------- */

    function ensureAudio() {
        if (audio) return audio;
        audio = new Audio();
        /* 关键：直到真要播才允许联网。见文件头第 2 条。 */
        audio.preload = 'none';
        audio.volume = state.volume;
        audio.muted = state.muted;
        bindAudio();
        return audio;
    }

    function bindAudio() {
        audio.addEventListener('playing', function () {
            state.playing = true;
            state.buffering = false;
            state.error = '';
            /* 起播这一刻的真实位置（状态以 audio 为准）。UI 拿它判断
               「点了某一句再起播」有没有真的落在那一句上，落偏了才补一次 seek。 */
            state.currentTime = audio.currentTime || 0;
            /* 真的放出声了：失败链结束，下一次失败重新从「立即重试」开始数 */
            resetFailureChain();
            syncMediaSessionState();
            emit('play');
        });

        audio.addEventListener('pause', function () {
            state.playing = false;
            state.buffering = false;
            syncMediaSessionState();
            emit('pause');
        });

        audio.addEventListener('waiting', function () {
            state.buffering = true;
            emit('loading');
        });

        audio.addEventListener('canplay', function () {
            if (!state.buffering) return;
            state.buffering = false;
            emit('loading');
        });

        audio.addEventListener('loadedmetadata', function () {
            if (!isFinite(audio.duration) || audio.duration <= 0) return;
            state.duration = audio.duration;
            emit('duration');
        });

        audio.addEventListener('timeupdate', function () {
            state.currentTime = audio.currentTime || 0;
            emit('time');
        });

        audio.addEventListener('ended', handleEnded);

        /* 直链失效（403 / 404 / 防盗链 / 当日流量用完）都走这里。
           浏览器只给一个笼统的 MEDIA_ERR_SRC_NOT_SUPPORTED，
           页面上统一说成「今日播放额度已用完」，让用户明天再来。
           失败计数 / 等待期在 registerFailure 里统一处理。 */
        audio.addEventListener('error', function () {
            if (!audio || !audio.getAttribute('src')) return;
            registerFailure('quota');
        });
    }

    function syncMediaSessionState() {
        if (!('mediaSession' in navigator)) return;
        try { navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused'; } catch (error) {}
    }

    function syncMediaSessionTrack() {
        if (!('mediaSession' in navigator)) return;
        var track = currentTrack();
        if (!track) return;
        try {
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: track.title || '',
                artist: track.artist || '',
                album: track.album || '',
                artwork: [{
                    src: track.cover ? resolveSrc(track.cover) : new URL('share_cover.jpg', baseUrl).href,
                    sizes: '512x512',
                    type: 'image/jpeg'
                }]
            });
        } catch (error) { /* 老浏览器没有 MediaMetadata 构造器 */ }
    }

    function bindMediaSessionActions() {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setActionHandler) return;
        var handlers = {
            play: function () { play(); },
            pause: function () { pause(); },
            previoustrack: function () { prev(); },
            nexttrack: function () { next(); },
            seekbackward: function () { seek(state.currentTime - 10); },
            seekforward: function () { seek(state.currentTime + 10); },
            seekto: function (details) {
                if (details && details.seekTime != null) seek(details.seekTime);
            }
        };
        Object.keys(handlers).forEach(function (name) {
            try { navigator.mediaSession.setActionHandler(name, handlers[name]); } catch (error) {}
        });
    }

    /* ---------------- 装载 / 播放 ---------------- */

    function load(index, autoplay) {
        if (!tracks.length) return;
        var nextIndex = ((index % tracks.length) + tracks.length) % tracks.length;
        var track = tracks[nextIndex];

        /* 等待期内一个字节都不发：连 index / src 都不动，避免出现
           「界面已经换了歌、audio 还停在上一次失败的地址」这种半截状态。
           代价是这期间点别的歌没反应 —— 卡片上那句倒计时就是解释。 */
        if (!canRequest()) {
            reportCooldown();
            return;
        }

        state.index = nextIndex;
        state.error = '';
        state.currentTime = 0;
        state.duration = Number(track.duration) || 0;

        var element = ensureAudio();
        element.src = resolveSrc(track.src);
        savePrefs();
        syncMediaSessionTrack();
        emit('track');

        if (autoplay) startPlayback();
    }

    function startPlayback() {
        if (!canRequest()) {
            reportCooldown();
            return;
        }
        var element = ensureAudio();
        var promise;
        attemptOpen = true;
        try {
            promise = element.play();
        } catch (error) {
            registerFailure('play');
            return;
        }
        /* 浏览器可能因为「没有用户手势」或音源不可用拒绝播放。
           AbortError 是我们自己切歌打断的，不算错误。 */
        if (promise && typeof promise.catch === 'function') {
            promise.catch(function (error) {
                if (error && error.name === 'AbortError') return;
                /* NotAllowedError：没手势 / 被拦；NotSupportedError：
                   直链打不开或不是音频（挡掉域名的实测就是这一条）。 */
                if (error && error.name === 'NotAllowedError') registerFailure('blocked');
                else if (error && error.name === 'NotSupportedError') registerFailure('quota');
                else registerFailure('play');
            });
        }
    }

    function play(index) {
        if (!tracks.length) return;
        /* 门禁放在最前面：等待期内连 load 都不进，更不会碰 audio.src */
        if (!canRequest()) {
            reportCooldown();
            return;
        }
        if (typeof index === 'number' && index !== state.index) {
            load(index, true);
            return;
        }
        if (!audio || !audio.getAttribute('src') || state.error) {
            load(state.index, true);
            return;
        }
        startPlayback();
    }

    function pause() {
        if (!audio) return;
        audio.pause();
    }

    function toggle() {
        if (!tracks.length) return;
        if (state.playing) {
            pause();
            return;
        }
        play();
    }

    function handleEnded() {
        if (state.mode === 'one') {
            if (!audio) return;
            try { audio.currentTime = 0; } catch (error) {}
            startPlayback();
            return;
        }
        /* 列表模式走到底回到第一首继续放：这是背景音乐，
           停在一片安静里比多放一遍更奇怪。 */
        next();
    }

    function next() {
        if (!tracks.length) return;
        if (tracks.length === 1) {
            load(0, true);
            return;
        }
        var target;
        if (state.mode === 'shuffle') {
            do { target = Math.floor(Math.random() * tracks.length); } while (target === state.index);
        } else {
            target = state.index + 1;
        }
        load(target, true);
    }

    function prev() {
        if (!tracks.length) return;
        /* 播过 3 秒以上先回到本曲开头 —— 和主流播放器一致，
           不然想重听前奏只能去拖进度条。 */
        if (audio && audio.currentTime > 3) {
            seek(0);
            return;
        }
        load(state.index - 1, true);
    }

    function seek(seconds) {
        if (!audio) return;
        var limit = isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
        var target = Math.max(0, Number(seconds) || 0);
        if (limit) target = Math.min(limit, target);
        try {
            audio.currentTime = target;
            state.currentTime = target;
            emit('time');
        } catch (error) { /* 元数据还没到，拖不动是正常的 */ }
    }

    function seekRatio(ratio) {
        if (!state.duration) {
            /* 时长未知时按比例拖没有意义，先触发一次元数据加载。
               等待期内不发 —— audio.load() 会重新走一遍网络。 */
            if (audio && audio.getAttribute('src') && canRequest()) {
                try { audio.load(); } catch (error) {}
            }
            return;
        }
        seek(state.duration * clamp01(ratio));
    }

    function setVolume(value, silent) {
        var volume = clamp01(Number(value));
        state.volume = volume;
        if (audio) audio.volume = volume;
        if (volume > 0 && state.muted) {
            state.muted = false;
            if (audio) audio.muted = false;
        }
        savePrefs();
        if (!silent) emit('volume');
    }

    function toggleMute() {
        state.muted = !state.muted;
        if (audio) audio.muted = state.muted;
        savePrefs();
        emit('volume');
    }

    function setMode(mode) {
        if (MODES.indexOf(mode) < 0) return;
        state.mode = mode;
        savePrefs();
        emit('mode');
    }

    function cycleMode() {
        setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]);
    }

    /* ---------------- 对外接口 ---------------- */

    /* movie.html 开始放视频时会往父页面 postMessage 一条 'background-music-pause'。
       以前那个引擎就在父页面里，换成这个模块之后这条约定还得接着守，
       否则电影和背景音乐一起响。 */
    if (global.addEventListener) {
        global.addEventListener('message', function (event) {
            if (!event.data || event.data.type !== 'background-music-pause') return;
            pause();
        });
    }

    function init(list) {
        tracks = (Array.isArray(list) ? list : []).filter(function (track) {
            return track && track.src && track.title;
        });
        state.ready = true;
        state.index = clampIndex(state.index);
        if (audio) {
            audio.volume = state.volume;
            audio.muted = state.muted;
        }
        /* 今天已经被锁死过（localStorage 里记着）：一进页面就把话说清楚，
           否则用户会先点一下没反应，才知道今天听不了。 */
        if (isLockedOut()) state.error = 'quota';
        syncMediaSessionTrack();
        bindMediaSessionActions();
        emit('init');
        return api;
    }

    function getState() {
        /* isLockedOut() 在跨天时会顺手清掉失败计数，必须先判一次再读 failures。
           否则「刚跨过零点」的这一帧会给出 locked=false 却 failures=8 的
           不自洽快照，界面要再等下一次 emit 才恢复正常。 */
        var locked = isLockedOut();
        return {
            ready: state.ready,
            index: state.index,
            track: currentTrack(),
            count: tracks.length,
            playing: state.playing,
            buffering: state.buffering,
            error: state.error,
            /* 失败链的三个可读量：UI 只用来写倒计时文案 / 置灰播放键 */
            failures: failureCount,
            retryIn: retryWaitSeconds(),
            locked: locked,
            currentTime: state.currentTime,
            duration: state.duration || (currentTrack() ? Number(currentTrack().duration) || 0 : 0),
            volume: state.volume,
            muted: state.muted,
            mode: state.mode
        };
    }

    function getTracks() {
        return tracks.map(function (track) {
            return {
                id: track.id,
                title: track.title,
                artist: track.artist || '',
                album: track.album || '',
                duration: Number(track.duration) || 0,
                accent: track.accent || '',
                cover: track.cover || ''
            };
        });
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function () {};
        listeners.push(listener);
        listener(getState(), 'init');
        return function () {
            var position = listeners.indexOf(listener);
            if (position >= 0) listeners.splice(position, 1);
        };
    }

    var api = {
        init: init,
        getState: getState,
        getTracks: getTracks,
        subscribe: subscribe,
        play: play,
        pause: pause,
        toggle: toggle,
        next: next,
        prev: prev,
        seek: seek,
        seekRatio: seekRatio,
        setVolume: setVolume,
        toggleMute: toggleMute,
        setMode: setMode,
        cycleMode: cycleMode,
        formatTime: formatTime,
        resolveSrc: resolveSrc
    };

    global.AnnieMusic = api;
})(window);
