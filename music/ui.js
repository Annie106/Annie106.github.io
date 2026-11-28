/* ==================== 音乐模块 · 界面 ====================
 *
 * 这一个文件负责音乐的所有「看得见的部分」：
 *   1. 首页那张卡片（封面 / 标题 / 上一首·播放·下一首 / 进度 / 播放列表）
 *   2. 文章页右下角的迷你播放条（同样带播放列表）
 *   3. 站内 ?view=music 音乐页（曲目列表 + 播放全部 + 播放模式）
 *   4. 播放模块（内容区顶上的一块卡片，点卡片封面或任意一首歌展开）
 *
 * 播放本身不在这里：core.js 里只有一个 <audio>，本文件只是它的几块 UI。
 * 为了让卡片首屏就有封面、标题和歌单，本文件是**首屏加载**的（约 12KB gzip），
 * 真正重的 core.js（播放引擎）、dock.css、player.css 仍然等到用时才下载。
 *
 * 状态来源有两层：
 *   · 引擎没加载前，用本文件里的 state（数据来自 tracks.js）
 *   · 引擎加载后，一切以 AnnieMusic.getState() 为准，本文件只做镜像
 * ======================================================== */
(function () {
    'use strict';

    if (window.AnnieMusicUI) return;

    var TRACKS = (Array.isArray(window.ANNIE_MUSIC_TRACKS) ? window.ANNIE_MUSIC_TRACKS : [])
        .filter(function (track) { return track && track.src && track.title; });

    var MODES = ['list', 'shuffle', 'one'];
    var MODE_TEXT = { list: '顺序播放', shuffle: '随机播放', one: '循环播放' };
    var STORAGE_KEY = 'annie-music-prefs-v1';
    /* core.js 里同名常量 + todayKey() 必须保持一致：引擎是懒加载的，
       首屏读不到它的锁，只能自己看一遍 localStorage。改一处记得同步另一处
       （和 normalizeVolume 一样，是刻意的重复）。 */
    var LOCK_KEY = 'annie-music-lockout';
    var DEFAULT_ACCENT = '#b45f74';

    /* 播放不出来时统一说这句：限流、防盗链、直链过期，对访客来说都是
       「今天听不了了」。具体额度规则不出现在页面上。
       等待期（retryIn > 0）内不显示这句 —— 那会儿说「明天再来」和
       「10 秒后可重试」互相打架，见 errorText()。 */
    var ERROR_TEXT = {
        quota: '当前 IP 今日播放额度已用完，请明天再来',
        blocked: '浏览器拦截了播放，请再点一次',
        play: '播放失败，请稍后再试',
        module: '播放器没加载出来，点一下重试'
    };

    var ICONS = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.2 5.4v13.2L19 12z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5h2.9v13H8zM13.1 5.5H16v13h-2.9z"/></svg>',
        prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5.5h1.8v13H7zM18.5 5.6v12.8L9.6 12z"/></svg>',
        next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.2 5.5H17v13h-1.8zM5.5 5.6v12.8L14.4 12z"/></svg>',
        list: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        modeList: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h11M4 12h11M4 17h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17.4 15.2l2.1 1.8-2.1 1.8M19.5 17H15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        modeShuffle: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h3.2l9.6 10H20M4 17h3.2l2.6-2.7M13.4 9.6L16.8 7H20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.6 4.6L20 7l-2.4 2.4M17.6 14.6L20 17l-2.4 2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        modeOne: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h11M4 12h11M4 17h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17.4 14.4l1.6-1.1v5.9M16.4 19.2h4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        /* 播放页专用：收起（顶部那颗）、音量 */
        chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9.4l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        chevronUp: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 14.6l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        volume: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 9.5h3l3.6-3.1v11.2L8 14.5H5z" fill="currentColor"/><path d="M15 9.2a3.7 3.7 0 010 5.6M17.4 6.9a7 7 0 010 10.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
        volumeOff: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 9.5h3l3.6-3.1v11.2L8 14.5H5z" fill="currentColor"/><path d="M15.4 9.6l4.2 4.8M19.6 9.6l-4.2 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
    };

    /* ---------------- 基础状态 ---------------- */

    var baseUrl = resolveBase();
    var engine = null;
    var engineLoading = null;
    /* 还没开始放就点歌词：起播位置先记着，等音频真正开始（'play'）再补一次 seek。
       元数据没到之前设的 currentTime 只能算「期望位置」，各家浏览器不一定认。 */
    var pendingPlaySeek = null;
    var dockDismissed = false;
    var cardVisible = true;
    var seeking = false;

    /* 首屏就把音量偏好读出来，别等 core.js（点播放才加载）起来后再回推 ——
       否则有历史记录时，卡片会先显示默认 70%、点播放后「跳」到上次的音量。
       ui.js 和 core.js 读的是同一份 localStorage（STORAGE_KEY），且用同一套
       校验回退：无效值一律回退到 0.3，两边永远不会算出不同的初始音量。 */
    var initialPrefs = readPrefs();

    /* 今天已经被锁死（失败阶梯爬到 60 秒）：首屏就说清楚，别让用户先点一下
       才发现听不了。引擎起来后 init() 会再判一次，结论一致。 */
    var lockedOnLoad = readLockedToday();

    function readLockedToday() {
        try {
            var raw = localStorage.getItem(LOCK_KEY);
            if (!raw) return false;
            var date = new Date();
            return raw === date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
        } catch (error) {
            return false;
        }
    }

    var state = {
        index: 0,
        playing: false,
        buffering: false,
        error: lockedOnLoad ? 'quota' : '',
        /* 失败链：failures 是连续失败次数，retryIn 是还剩几秒才能再请求，
           locked 是「今天已经彻底放不出来」（失败阶梯涨到 60 秒就锁到明天）。
           引擎没起来时都是 0 / false，文案自然退回普通状态。 */
        failures: 0,
        retryIn: 0,
        locked: lockedOnLoad,
        currentTime: 0,
        duration: TRACKS[0] ? Number(TRACKS[0].duration) || 0 : 0,
        mode: MODES.indexOf(initialPrefs.mode) >= 0 ? initialPrefs.mode : 'list',
        volume: normalizeVolume(initialPrefs.volume, 0.3),
        muted: initialPrefs.muted === true,
        count: TRACKS.length
    };

    function resolveBase() {
        var self = document.currentScript;
        if (self && self.src) {
            try { return new URL('..', self.src).href; } catch (error) {}
        }
        return document.baseURI;
    }

    function readPrefs() {
        try {
            var prefs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return prefs && typeof prefs === 'object' ? prefs : {};
        } catch (error) {
            return {};
        }
    }

    /* 和 core.js 里同名函数保持一致：数字且在 0~1 之间才认，否则回退默认值。
       两边改一处就要改另一处，不然首屏显示和真实播放音量又会不一致。 */
    function normalizeVolume(value, fallback) {
        var number = Number(value);
        if (typeof value !== 'number' || !isFinite(number) || number < 0 || number > 1) {
            return fallback;
        }
        return number;
    }

    function resolveUrl(path) {
        if (!path) return '';
        if (/^(https?:|data:|blob:)/i.test(path)) return path;
        try { return new URL(String(path).replace(/^\.?\//, ''), baseUrl).href; } catch (error) { return path; }
    }

    function formatTime(seconds) {
        var total = Math.max(0, Math.floor(Number(seconds) || 0));
        return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    }

    function currentTrack() {
        return TRACKS[state.index] || TRACKS[0] || null;
    }

    function subTitle(track) {
        if (!track) return '';
        return [track.artist, track.album].filter(Boolean).join(' · ');
    }

    /* ---------------- 元素 ---------------- */

    var card = document.querySelector('[data-music-card]');
    /* 音乐现在只承载于首页的 #view-music（站内视图）。独立页 /music/ 已经
       撤掉（改成跳转 ?view=music），所以这里只剩一种承载，用不着再区分。
       view 拿的是 #view-music；querySelector('.music-page') 是历史兜底，
       留着无害，万一以后又内嵌到别的静态页也还能复用同一套渲染。 */
    var view = document.getElementById('view-music') || document.querySelector('.music-page');

    var el = {
        cover: document.getElementById('musicEntryCover'),
        art: document.getElementById('musicEntryArt'),
        title: document.getElementById('musicEntryTitle'),
        meta: document.getElementById('musicEntryMeta'),
        toggle: document.getElementById('musicEntryToggle'),
        progress: document.getElementById('musicEntryProgress'),
        bar: document.getElementById('musicEntryBar'),
        fill: document.getElementById('musicEntryFill'),
        time: document.getElementById('musicEntryCurTime'),
        duration: document.getElementById('musicEntryDuration'),
        listToggle: document.getElementById('musicListToggle'),
        volBar: document.getElementById('musicEntryVolBar'),
        volFill: document.getElementById('musicEntryVolFill'),
        volValue: document.getElementById('musicEntryVolValue'),
        mute: document.getElementById('musicEntryMute'),
        back: document.getElementById('musicViewBack'),
        list: document.getElementById('musicEntryList'),
        sheetClose: document.getElementById('musicSheetClose'),
        rows: document.getElementById('musicCardList'),
        viewOpen: document.getElementById('musicViewOpen'),
        viewMode: document.getElementById('musicViewMode'),
        viewModeText: document.getElementById('musicViewModeText'),
        viewCount: document.getElementById('musicViewCount'),
        viewError: document.getElementById('musicViewError'),
        viewLead: document.getElementById('musicViewLead'),
        viewRows: document.getElementById('musicViewList')
    };

    var dock = null;
    var dockEl = null;
    var dockRows = null;

    /* ---------------- 引擎（懒加载） ---------------- */

    function loadStyle(href) {
        return new Promise(function (resolve) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-music-style', '');
            link.onload = function () { resolve(); };
            link.onerror = function () { resolve(); }; /* 样式失败也要继续，否则永远播不了 */
            document.head.appendChild(link);
        });
    }

    function loadScript(href) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = href;
            script.async = false;
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('加载失败：' + href)); };
            document.body.appendChild(script);
        });
    }

    function ensureEngine() {
        if (engine) return Promise.resolve(engine);
        if (engineLoading) return engineLoading;

        var dir = (card && card.getAttribute('data-music-module')) || 'music/';
        var root = new URL(dir, document.baseURI).href;

        engineLoading = loadStyle(root + 'dock.css')
            .then(function () { return loadScript(root + 'core.js'); })
            .then(function () {
                engine = window.AnnieMusic;
                engine.init(TRACKS);
                buildDock();
                /* subscribe 会立刻用当前状态回调一次，所以这里不用再手动 applyState */
                engine.subscribe(applyState);
                return engine;
            })
            .catch(function (error) {
                engineLoading = null;
                state.error = 'module';
                renderAll();
                throw error;
            });

        return engineLoading;
    }

    /* reason 是 core 的 emit 理由（'play' / 'track' / 'time' …），
       只有「点歌词起播」那一条收尾要用到它 */
    function applyState(next, reason) {
        state.playing = next.playing;
        state.buffering = next.buffering;
        state.error = next.error;
        state.failures = Number(next.failures) || 0;
        state.retryIn = Number(next.retryIn) || 0;
        state.locked = next.locked === true;
        state.currentTime = next.currentTime;
        state.duration = next.duration || state.duration;
        state.index = next.index;
        state.mode = next.mode;
        state.volume = next.volume;
        state.muted = next.muted;
        renderAll();

        /* 点歌词起播的收尾：真出声了（'play'）元数据一定到了，这时看真实位置
           有没有落在那一句上，偏了才补一次 seek（位置已经对就别白等一次缓冲）；
           换歌 / 出错就让这个期望位置作废 */
        if (pendingPlaySeek != null) {
            if (reason === 'play') {
                var target = pendingPlaySeek;
                pendingPlaySeek = null;
                if (engine && Math.abs((next.currentTime || 0) - target) > 1) {
                    markLyricSeek();
                    engine.seek(target);
                }
            } else if (reason === 'track' || reason === 'error') {
                pendingPlaySeek = null;
            }
        }
    }

    /* ---------------- 操作 ---------------- */

    function toggle() {
        if (engine) {
            engine.toggle();
            return;
        }
        setCardLoading(true);
        ensureEngine().then(function (instance) {
            setCardLoading(false);
            instance.toggle();
        }).catch(function () { setCardLoading(false); });
    }

    function select(index) {
        if (engine) {
            var current = engine.getState();
            if (current.index === index && current.playing) engine.pause();
            else if (current.index === index) engine.play();
            else engine.play(index);
            return;
        }
        setCardLoading(true);
        ensureEngine().then(function (instance) {
            setCardLoading(false);
            instance.play(index);
        }).catch(function () { setCardLoading(false); });
    }

    function step(direction) {
        ensureEngine().then(function (instance) {
            if (direction === 'next') instance.next();
            else instance.prev();
        }).catch(function () {});
    }

    function cycleMode() {
        ensureEngine().then(function (instance) {
            instance.cycleMode();
        }).catch(function () {});
    }

    function seekRatio(ratio) {
        ensureEngine().then(function (instance) {
            /* 标记要在 seek 之前打：engine 的 emit 是同步的，
               标记放后面的话这一次渲染已经画完了 */
            markLyricSeek();
            instance.seekRatio(ratio);
        }).catch(function () {});
    }

    /* 点歌单里的一首：让它唱起来，再把播放页拉出来。
       点的是正在放的那一首时**不动播放状态**（否则「想进播放页」会变成
       「给暂停了」）；那一首只是暂停着，就接着放。 */
    function playFromRow(index) {
        var current = engine ? engine.getState() : state;
        if (current.index !== index || !current.playing) select(index);
        /* 卡片歌单的窄屏浮层这时候该退场了：播放浮层在它上面，
           留着它等于关掉播放浮层后还挡着一层歌单 */
        if (cardSheet.open) closeCardSheet('tap', true);
        openPlayer();
    }

    /* 跳到一个绝对时间点（歌词点句用）。引擎没起来就先拉起来，
       拉不起来（限流 / 直链坏了）就什么都不做 —— core.js 自己会报错。 */
    function seekSeconds(seconds) {
        ensureEngine().then(function (instance) {
            markLyricSeek();
            instance.seek(seconds);
        }).catch(function () {});
    }

    /* 点歌词那一句。**还没开始放**的时候这一下就等于「从这一句开始听」：
       先起播再跳（顺序不能反 —— core 的 load() 会把 currentTime 归零）。
       已经放过（就算是暂停着）就只跳位置，不替用户按下播放。 */
    function playFromLyric(seconds) {
        ensureEngine().then(function (instance) {
            var current = instance.getState();
            var idle = !current.playing && !(current.currentTime > 0);

            markLyricSeek();
            if (idle) instance.play(current.index);

            /* ⚠️ 这一行必须排在 play() 后面：起播会 emit('track')，
               而 applyState 收到 'track' 就把待补的起播位置作废（见那里）。 */
            pendingPlaySeek = idle ? seconds : null;

            /* 起播可能把 currentTime 归零（load 里做的），这里再跳一次才落到点上。
               两次都是瞬时居中，同一帧里完成，看不到中间位置。 */
            markLyricSeek();
            instance.seek(seconds);
        }).catch(function () {});
    }

    /* 音量条拖到哪就是哪：先把界面刷成目标值（不等引擎，手感才跟手），
       再让引擎跟上。卡片和播放页共用这一份。 */
    function applyVolumeUi(ratio) {
        var value = Math.max(0, Math.min(1, Number(ratio) || 0));
        var percentText = Math.round(value * 100) + '%';
        var width = (value * 100).toFixed(1) + '%';
        if (el.volBar) el.volBar.style.setProperty('--progress', width);
        if (el.volFill) el.volFill.style.width = width;
        if (el.volValue) el.volValue.textContent = percentText;
        if (player) {
            player.volBar.style.setProperty('--progress', width);
            player.volFill.style.width = width;
        }
    }

    function setVolumeRatio(ratio) {
        applyVolumeUi(ratio);
        ensureEngine().then(function (instance) {
            instance.setVolume(Math.max(0, Math.min(1, Number(ratio) || 0)));
        }).catch(function () {});
    }

    function setCardLoading(loading) {
        if (el.toggle) el.toggle.dataset.loading = loading ? 'true' : 'false';
        if (loading && el.meta && !state.error) {
            el.meta.textContent = '正在加载播放器…';
        }
    }

    /* ---------------- 渲染 ---------------- */

    /* 有等待期就先说还剩多少秒 —— 这时候让用户点播放是没用的（引擎会
       直接拦掉），必须把「为什么点了没反应」写出来。等待结束后才回到
       普通失败文案。seconds 由引擎按时间戳算，UI 不自己倒计时。 */
    function errorText() {
        if (!state.error) return '';
        if (state.retryIn > 0 && state.error !== 'blocked') {
            return '请求次数过多，请 ' + state.retryIn + ' 秒后再试';
        }
        return ERROR_TEXT[state.error] || '';
    }

    /* 音乐页的列表和卡片读的是同一份数据，所以没有单独的 renderView：
       renderCard 里顺手把页头的按钮文案、模式、行状态一起刷了。 */
    function renderAll() {
        renderCard();
        renderView();
        renderDock();
        renderPlayer();
    }

    function renderCard() {
        if (!card) return;
        var track = currentTrack();
        if (!track) {
            if (el.title) el.title.textContent = '还没有曲目';
            if (el.meta) el.meta.textContent = '在 music/tracks.js 里加一首';
            return;
        }

        var error = state.error ? errorText() : '';
        var duration = state.duration || Number(track.duration) || 0;
        var percent = duration ? Math.min(100, (state.currentTime / duration) * 100) : 0;

        card.dataset.playing = state.playing ? 'true' : 'false';
        card.dataset.error = error ? 'true' : 'false';

        if (el.title) el.title.textContent = track.title;
        if (el.meta) {
            el.meta.textContent = error
                ? error
                : (track.artist ? track.artist + ' · ' : '') + '共 ' + TRACKS.length + ' 首';
        }

        applyCover(track);

        if (el.fill) el.fill.style.width = percent.toFixed(2) + '%';
        /* 滑块要跟着进度走：把百分比写进 --progress，CSS 用它定位滑块 */
        if (el.bar) el.bar.style.setProperty('--progress', percent.toFixed(2) + '%');
        if (el.time) el.time.textContent = formatTime(state.currentTime);
        if (el.duration) el.duration.textContent = formatTime(duration);
        if (el.bar) {
            el.bar.setAttribute('aria-valuemax', String(Math.round(duration) || 0));
            el.bar.setAttribute('aria-valuenow', String(Math.round(state.currentTime) || 0));
            el.bar.setAttribute('aria-valuetext', formatTime(state.currentTime) + ' / ' + formatTime(duration));
        }
        card.dataset.muted = state.muted ? 'true' : 'false';
        var volumePercent = Math.round((state.muted ? 0 : state.volume) * 100);
        if (el.volFill) el.volFill.style.width = volumePercent + '%';
        if (el.volBar) {
            el.volBar.style.setProperty('--progress', volumePercent + '%');
            el.volBar.setAttribute('aria-valuenow', String(volumePercent));
        }
        if (el.volValue) el.volValue.textContent = volumePercent + '%';

        if (el.toggle) {
            var loading = state.buffering || (!engine && !!engineLoading);
            el.toggle.dataset.playing = state.playing ? 'true' : 'false';
            el.toggle.dataset.loading = loading ? 'true' : 'false';
            el.toggle.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
            el.toggle.setAttribute('aria-label', state.playing
                ? '暂停'
                : (state.locked ? '今日不可再试' : (error ? '重试播放' : '播放')));
        }

        markRows(el.rows);
    }

    /* 独立页 /music/ 没有首页卡片，renderCard 会在开头 return。
       音乐页自己的文案 / 状态必须单独渲染，别塞在 renderCard 里，
       否则独立页的曲目数、错误横幅、播放模式全是静态兜底值。 */
    function renderView() {
        if (!view) return;
        var error = state.error ? errorText() : '';

        markRows(el.viewRows);

        if (el.viewLead) {
            el.viewLead.textContent = TRACKS.length
                ? '共 ' + TRACKS.length + ' 首。点开就放，播放器在第一次点播放时才加载。'
                : '还没有曲目。';
        }
        if (el.viewCount) el.viewCount.textContent = TRACKS.length + ' 首';
        if (el.viewMode) {
            el.viewMode.dataset.mode = state.mode;
            el.viewMode.setAttribute('aria-label', '播放模式：' + MODE_TEXT[state.mode]);
        }
        if (el.viewModeText) el.viewModeText.textContent = MODE_TEXT[state.mode];

        if (el.viewError) {
            el.viewError.hidden = !error;
            if (error) el.viewError.textContent = error;
        }
        view.dataset.error = error ? 'true' : 'false';
    }

    /* ---------------- 封面占位 ----------------
       切歌时封面图往往还没解码完。原来 src 一设就把黑胶藏起来，
       那块圆会空白一下（甚至留着上一首的残影）。现在改成：
       先让黑胶顶着，等 <img> 真的 load 了再淡出黑胶、露出封面。

       loadedCovers 记本次会话里已经成功解码过的封面地址：切回听过的歌时直接
       换图，不再走一遍 260ms 的黑胶淡出（否则来回切歌会一直在闪唱片）。
       浏览器此时手里有缓存，设 src 后基本当帧就能画出来，不会留空白。

       幂等：src 没变且已就绪就什么都不做 ——
       renderCard 跟着 timeupdate 每秒跑好几次，不能每次都把黑胶翻回来。 */
    var loadedCovers = {};

    function setCoverArt(art, img, url, alt) {
        if (!art || !img) return;
        if (!url) {
            img.hidden = true;
            art.dataset.cover = 'false';
            return;
        }
        if (alt) img.alt = alt;
        if (img.getAttribute('src') !== url) {
            /* 换封面：之前成功解码过的直接显示，第一次见的先退回黑胶等 load */
            if (loadedCovers[url]) {
                img.hidden = false;
                art.dataset.cover = 'true';
            } else {
                art.dataset.cover = 'false';
                img.hidden = true;
            }
            img.setAttribute('src', url);
        } else if (loadedCovers[url] && img.complete && img.naturalWidth > 0) {
            /* src 没变、已经就绪：保持显示（timeupdate 每秒都会走到这里） */
            img.hidden = false;
            art.dataset.cover = 'true';
        }
    }

    /* load / error 只绑一次（页面上一共就这两个封面 img）。 */
    function watchCoverArt(art, img) {
        if (!art || !img || img.dataset.coverWatch === '1') return;
        img.dataset.coverWatch = '1';
        img.addEventListener('load', function () {
            var src = img.getAttribute('src');
            if (src) loadedCovers[src] = true;
            img.hidden = false;
            art.dataset.cover = 'true';
        });
        /* 封面挂了就停在那张黑胶上，别露出浏览器的破图图标 */
        img.addEventListener('error', function () {
            var src = img.getAttribute('src');
            if (src) delete loadedCovers[src];
            img.hidden = true;
            art.dataset.cover = 'false';
        });
    }

    function applyCover(track) {
        if (!el.art) return;
        var url = track.cover ? resolveUrl(track.cover) : '';
        setCoverArt(el.art, el.cover, url, track.title + ' 封面');
        if (!url) el.art.style.setProperty('--art-accent', track.accent || DEFAULT_ACCENT);
    }

    function markRows(list) {
        if (!list) return;
        var rows = list.children;
        for (var i = 0; i < rows.length; i += 1) {
            var row = rows[i];
            var isCurrent = Number(row.dataset.index) === state.index;
            row.classList.toggle('is-current', isCurrent);
            row.classList.toggle('is-playing', isCurrent && state.playing);
            var button = row.querySelector('.mt-row-hit');
            if (button) {
                if (isCurrent) button.setAttribute('aria-current', 'true');
                else button.removeAttribute('aria-current');
            }
        }
    }

    /* ---------------- 播放列表行 ---------------- */

    function buildRows(list, variant) {
        if (!list || list.dataset.built === '1' || !TRACKS.length) return;
        list.dataset.built = '1';

        TRACKS.forEach(function (track, index) {
            var item = document.createElement('li');
            item.className = 'mt-row' + (variant === 'lg' ? ' mt-row--lg' : '');
            item.dataset.index = String(index);

            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'mt-row-hit';
            button.setAttribute('aria-label', '播放 ' + track.title);

            var slot = document.createElement('span');
            slot.className = 'mt-slot';
            var num = document.createElement('span');
            num.className = 'mt-num';
            num.textContent = (index + 1 < 10 ? '0' : '') + (index + 1);
            var eq = document.createElement('span');
            eq.className = 'mt-eq';
            eq.setAttribute('aria-hidden', 'true');
            eq.innerHTML = '<i></i><i></i><i></i>';
            /* hover 时序号位置换成播放三角（CSS 控制显隐） */
            var play = document.createElement('span');
            play.className = 'mt-play';
            play.setAttribute('aria-hidden', 'true');
            play.innerHTML = ICONS.play;
            slot.appendChild(num);
            slot.appendChild(play);
            slot.appendChild(eq);

            var art = document.createElement('span');
            art.className = 'mt-art';
            art.setAttribute('aria-hidden', 'true');
            if (track.cover) {
                /* 封面走 <img> 而不是 background-image：只有真实解码完成
                   才能知道「什么时候可以盖掉黑胶」。列表行的 .mt-art 本身
                   就是一张黑胶，图片没就绪之前正好当占位。 */
                var cover = document.createElement('img');
                cover.className = 'mt-cover';
                cover.alt = '';
                cover.decoding = 'async';
                /* 收起的歌单 / 视口外的行先不下载，展开滚到时再取 —— 
                   lazy 的图不会触发 load，正好一直显示黑胶 */
                cover.loading = 'lazy';
                cover.addEventListener('load', function () {
                    cover.classList.add('is-ready');
                });
                cover.addEventListener('error', function () {
                    /* 加载失败就留着黑胶，不要把 <img> 换成破图 */
                    cover.classList.remove('is-ready');
                });
                cover.src = resolveUrl(track.cover);
                art.appendChild(cover);
            } else {
                art.style.setProperty('--row-accent', track.accent || DEFAULT_ACCENT);
            }

            var text = document.createElement('span');
            text.className = 'mt-text';
            var title = document.createElement('span');
            title.className = 'mt-title';
            title.textContent = track.title;
            text.appendChild(title);
            if (subTitle(track)) {
                var sub = document.createElement('span');
                sub.className = 'mt-sub';
                sub.textContent = subTitle(track);
                text.appendChild(sub);
            }

            var time = document.createElement('span');
            time.className = 'mt-time';
            time.textContent = track.duration ? formatTime(track.duration) : '--:--';

            button.appendChild(slot);
            button.appendChild(art);
            button.appendChild(text);
            button.appendChild(time);
            button.addEventListener('click', function () {
                playFromRow(index);
                closeDockPanel();
            });

            item.appendChild(button);
            list.appendChild(item);
        });

        markRows(list);
    }

    /* ---------------- 卡片交互 ---------------- */

    /* ---------------- 卡片歌单 · 窄屏浮层 ----------------
     * ≤640px 时点「播放列表」不再在卡片下方挂个小浮层，而是把整块搬到
     * body 上，做成 404.html「获取联系」那种贴底浮层：背板淡入、面板从下沿
     * 升起来、上圆角，收起 0.22s 落回去。
     * 为什么必须搬家：卡片在 .hero-player 里（带 z-index），position: fixed
     * 待在里头会被那个层叠上下文压住，背板也盖不住整页。
     * 桌面（>640px）还是卡片下方/上方那个小浮层，逻辑一行没动。
     */
    var cardSheet = { open: false, parent: null, anchor: null, backdrop: null, timer: null };

    function isCompactSheet() {
        return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
    }

    function ensureSheetBackdrop() {
        if (cardSheet.backdrop) return cardSheet.backdrop;
        var node = document.createElement('div');
        node.className = 'music-sheet-backdrop';
        node.hidden = true;
        /* 点背板就收。pointerdown 那条在 bindOutsideClose 里（真机点击先来 pointerdown），
           这里补一条 click，指针事件被拦掉的场景 тоже 能关 */
        node.addEventListener('click', function () { closeCardSheet('blur'); });
        document.body.appendChild(node);
        cardSheet.backdrop = node;
        return node;
    }

    function lockSheetScroll() {
        var root = document.documentElement;
        var gap = window.innerWidth - root.clientWidth;
        if (gap > 0) root.style.setProperty('--mm-gap', gap + 'px');
        else root.style.removeProperty('--mm-gap');
        root.classList.add('music-sheet-open');
    }

    function unlockSheetScroll() {
        var root = document.documentElement;
        root.classList.remove('music-sheet-open');
        root.style.removeProperty('--mm-gap');
    }

    function openCardSheet() {
        if (!el.list || cardSheet.open) return;
        var list = el.list;

        if (cardSheet.timer) {
            window.clearTimeout(cardSheet.timer);
            cardSheet.timer = null;
        }

        cardSheet.parent = list.parentNode;
        cardSheet.anchor = list.nextSibling;
        document.body.appendChild(list);

        /* 收起演到一半又被点开：别让它重新从屏幕底下爬一遍，
           给个短一半的进场，看起来像「收回又放出来」而不是「重开」 */
        var wasClosing = list.classList.contains('is-closing');
        list.classList.remove('is-closing');
        list.classList.add('is-sheet', 'is-open');
        if (wasClosing) list.style.setProperty('--me-enter-dur', '0.24s');
        else list.style.removeProperty('--me-enter-dur');
        list.setAttribute('tabindex', '-1');
        el.list.inert = false;
        cardSheet.open = true;

        var backdrop = ensureSheetBackdrop();
        backdrop.hidden = false;
        backdrop.classList.remove('is-closing');
        backdrop.classList.add('is-open');

        if (card) card.classList.add('is-sheet-open');
        if (el.listToggle) el.listToggle.setAttribute('aria-expanded', 'true');
        lockSheetScroll();

        /* 焦点给浮层自己（tabindex=-1，outline:none）：键盘用户的 Tab 才会
           从浮层里开始，而不是在背板背后的卡片上走 */
        try { list.focus({ preventScroll: true }); } catch (error) {}
    }

    function closeCardSheet(reason, immediate) {
        if (!cardSheet.open || !el.list) return;
        cardSheet.open = false;
        var list = el.list;

        if (el.listToggle) el.listToggle.setAttribute('aria-expanded', 'false');
        if (card) card.classList.remove('is-sheet-open');
        list.inert = true;
        unlockSheetScroll();

        function finish() {
            cardSheet.timer = null;
            list.classList.remove('is-sheet', 'is-open', 'is-closing');
            list.removeAttribute('tabindex');
            if (cardSheet.backdrop) {
                cardSheet.backdrop.classList.remove('is-open', 'is-closing');
                cardSheet.backdrop.hidden = true;
            }
            /* 搬回卡片原位：桌面那份样式全靠「在 .music-entry 里面」 */
            if (cardSheet.parent) {
                if (cardSheet.anchor && cardSheet.anchor.parentNode === cardSheet.parent) {
                    cardSheet.parent.insertBefore(list, cardSheet.anchor);
                } else {
                    cardSheet.parent.appendChild(list);
                }
            }
            cardSheet.parent = null;
            cardSheet.anchor = null;
            if (el.listToggle && document.contains(el.listToggle)) {
                try { el.listToggle.focus({ preventScroll: true }); } catch (error) {}
            }
        }

        if (immediate) {
            finish();
            return;
        }

        /* 收起：抽屉整块滑出屏幕，时长跟其它面板共用 --me-exit-dur；
           搬回卡片的时间必须跟动画对齐，否则会在半路上被「抽」回去。 */
        var preset = applyExitMotion(list, reason, 'sheet');
        applyExitMotion(cardSheet.backdrop, reason, 'sheet');

        list.classList.remove('is-open');
        list.classList.add('is-closing');
        if (cardSheet.backdrop) {
            cardSheet.backdrop.classList.remove('is-open');
            cardSheet.backdrop.classList.add('is-closing');
        }
        cardSheet.timer = window.setTimeout(finish, Math.round(preset.dur * 1000) + 24);
    }

    /* ---------------- 收起动效的三档参数 ----------------
     * 同样是「收起」，用户是怎么走的，它就该怎么消失：
     *   tap    再点一下按钮：意图明确，稍微快一点，带一点朝卡片的回缩；
     *   blur   点空白处：视线已经移开，慢半拍、飘一点，不抢注意力；
     *   scroll 滚轮滚走了：页面正在动，越快越好、纯淡出不带位移
     *          （有位移的话面板会像在「追」页面，看着更乱）。
     * 时长 / 缓动 / 位移都写进元素自己的 --me-exit-*，CSS 统一读，
     * 三档只是参数不同，收起的形状始终一致，不会各演各的。
     * dur 是整体（位移 + 高度），fade 略短 —— 让「消失」稍微先于「缩回」。
     * scale 目前只给迷你条面板用，卡片歌单不动缩放（小字经不起缩）。 */
    var EXIT_MOTION = {
        tap: { dur: 0.28, fade: 0.22, ease: 'cubic-bezier(0.4, 0, 0.2, 1)', shift: 6, scale: 0.992 },
        blur: { dur: 0.36, fade: 0.3, ease: 'cubic-bezier(0.4, 0, 0.2, 1)', shift: 3, scale: 0.996 },
        scroll: { dur: 0.2, fade: 0.16, ease: 'cubic-bezier(0.32, 0.72, 0, 1)', shift: 0, scale: 1 }
    };

    /* mode：'down' 卡片下方 / 'up' 卡片上方 / 'side' 右侧停靠 / 'sheet' 贴底抽屉。
       位移方向永远是「朝它弹出来的地方回去」。 */
    function applyExitMotion(root, reason, mode) {
        var preset = EXIT_MOTION[reason] || EXIT_MOTION.tap;
        if (!root) return preset;

        var shift = preset.shift;
        var x = 0;
        var y = 0;
        if (shift) {
            if (mode === 'side') x = -shift;
            else if (mode === 'up' || mode === 'sheet') y = shift;
            else y = -shift;
        }

        root.style.setProperty('--me-exit-dur', preset.dur + 's');
        root.style.setProperty('--me-exit-fade', preset.fade + 's');
        root.style.setProperty('--me-exit-ease', preset.ease);
        root.style.setProperty('--me-exit-x', x + 'px');
        root.style.setProperty('--me-exit-y', y + 'px');
        root.style.setProperty('--me-exit-scale', String(preset.scale));
        return preset;
    }

    /* ---------------- 卡片歌单 · 宽屏右侧停靠 ----------------
     * 容器是 1080 居中，视口一宽，卡片右边就空出一大片（1440 下约 490px）。
     * 与其把列表叠在卡片下面盖住正文，不如让它从卡片右边弹出来，
     * 正好落在「博客右边的空白」里：正文不被遮、下面内容也不用往下顶。
     *
     * 只在右侧真的放得下时才走这条路（见 canDockSide）；
     * 空间不够（1200 左右的窗口）仍然回落到卡片下方/上方那个小浮层。
     * 位置写死在 CSS（left: 100% + 14px），高度按「卡片顶部到视口底」算，
     * 由这里写进 --me-side-max，免得窗口矮的时候面板伸出屏幕。 */
    var SIDE_WIDTH = 320;
    var SIDE_GAP = 14;

    function canDockSide() {
        if (!card) return false;
        var rect = card.getBoundingClientRect();
        /* 留 16px 给页面右边距，别贴着视口边缘 */
        return window.innerWidth - rect.right - SIDE_GAP - 16 >= SIDE_WIDTH;
    }

    function syncSideMax() {
        if (!card) return;
        var rect = card.getBoundingClientRect();
        var avail = window.innerHeight - Math.max(rect.top, 16) - 24;
        card.style.setProperty('--me-side-max', Math.max(240, Math.round(avail)) + 'px');
    }

    /* 停靠与否只在「打开」时决定；收起时不要摘 is-list-side，
       否则面板会在淡出的这 0.18s 里先跳回卡片下面。 */
    function placeCardList() {
        if (!card) return;
        var rect = card.getBoundingClientRect();
        var side = canDockSide();
        card.classList.toggle('is-list-side', side);
        if (side) {
            card.classList.remove('is-list-upward');
            syncSideMax();
            return;
        }
        /* 歌单浮层默认往卡片下面弹；下方空间不够（靠近视口底部 / 页脚）
           就改成往上弹，避免展开后盖住页脚或伸出屏幕外。 */
        card.classList.toggle('is-list-upward', window.innerHeight - rect.bottom < 300);
    }

    function toggleCardList() {
        if (!card || !el.listToggle || !el.list) return;

        if (isCompactSheet()) {
            if (cardSheet.open) closeCardSheet('tap');
            else openCardSheet();
            return;
        }

        /* 已展开 → 收起。走 closeCardList 是为了统一入口，
           场景参数也只有这一个地方需要维护 */
        if (card.classList.contains('is-list-open')) {
            closeCardList('tap');
            return;
        }

        card.classList.add('is-list-open');
        el.listToggle.setAttribute('aria-expanded', 'true');
        el.list.inert = false;
        placeCardList();
    }

    function closeCardList(reason) {
        if (!card || !el.listToggle || !el.list) return;
        if (cardSheet.open) {
            closeCardSheet(reason);
            return;
        }
        /* 已经收起来了就别再动：点空白和滚轮可能在同一帧连着来，
           第二次进来重设动画参数会让正在淡出的面板突然「跳」一下 */
        if (!card.classList.contains('is-list-open')) return;

        applyExitMotion(el.list, reason, card.classList.contains('is-list-side') ? 'side'
            : (card.classList.contains('is-list-upward') ? 'up' : 'down'));

        card.classList.remove('is-list-open');
        el.listToggle.setAttribute('aria-expanded', 'false');
        el.list.inert = true;
    }

    /* 点 / 滚到面板外面 → 收起面板。抽成一份，pointerdown（点）和 wheel（滚）
       共用，免得两边各写一套排除条件、越改越不一致。
       reason 决定收起动画：'blur' 点空白、'scroll' 滚走（见 EXIT_MOTION）。 */
    function dismissOpenPanels(target, reason) {
        /* 窄屏浮层：点背板 / 浮层外面就收（浮层自己已经搬到 body 上了）。
           收起后要挡住紧随其后的那一次 click，否则它会落到背后页面上（见 sheetClickGuard） */
        if (cardSheet.open) {
            if (el.list && el.list.contains(target)) return;
            closeCardSheet(reason);
            armSheetClickGuard();
            return;
        }

        if (card && card.classList.contains('is-list-open')) {
            if (el.listToggle && el.listToggle.contains(target)) return;
            if (el.list && el.list.contains(target)) return;
            closeCardList(reason);
        }

        if (dock && dock.classList.contains('is-list-open')) {
            if (dockEl && dockEl.listBtn && dockEl.listBtn.contains(target)) return;
            if (dockEl && dockEl.panel && dockEl.panel.contains(target)) return;
            closeDockPanel(reason);
        }
    }

    /* 点背板收起浮层的同一次手势，不能再被背景页面收一次。
       pointerdown 一响面板就开始收，背板也可能很快收完（long press 时手指
       抬起来已经晚了几百毫秒）—— 那一次 click 于是落在背板后面的元素上。
       这里记一个短守卫，把它吞掉；新的 pointerdown 会立刻作废守卫，
       所以「收起来之后再点别的」照常生效。 */
    var sheetClickGuard = 0;

    function armSheetClickGuard() {
        sheetClickGuard = Date.now();
    }

    function consumeGuardedClick(event) {
        if (!sheetClickGuard) return;
        var armedAt = sheetClickGuard;
        sheetClickGuard = 0;
        /* 间隔太久说明是另一次点击，放过去 */
        if (Date.now() - armedAt > 1200) return;
        event.preventDefault();
        event.stopPropagation();
    }

    /* 点卡片歌单 / 迷你条歌单之外的地方 → 收起面板。
       用 document 级委托，但要排除开关本身和面板内部，
       否则点面板里的歌曲时刚触发播放就被这里关掉了。 */
    function bindOutsideClose() {
        document.addEventListener('pointerdown', function (event) {
            /* 新的一次按下就是新的一次点击，上一发守卫作废 */
            sheetClickGuard = 0;
            dismissOpenPanels(event.target, 'blur');
        }, true);

        /* 捕获阶段就要拦住：背板自己的 click 是冒泡阶段的监听，
           拦晚了背景页面（以及背板上那个关浮层的监听）都已经收到了 */
        document.addEventListener('click', consumeGuardedClick, true);

        /* 滚轮落在面板外面 → 顺手收起来：鼠标已经滚去别处看了，
           还挂着那块面板只会碍事。这里单独给一档更快的收起（'scroll'），
           页面在动的时候任何拖泥带水的动画都会显得卡。
           passive:true —— 只观察不拦截，绝不能拖慢正文滚动。 */
        document.addEventListener('wheel', function (event) {
            /* 横向滑动（shift + 滚轮、触控板横扫）不算「滚走了」 */
            if (!event.deltaY) return;
            dismissOpenPanels(event.target, 'scroll');
        }, { passive: true });
    }

    /* ---------------- 滚轮 · 只滚面板里的列表 ----------------
     * 面板是悬空的一张卡（右下角的迷你条歌单、宽屏停在右侧的歌单都是），
     * 浏览器默认会把「列表滚到头之后多出来的那点滚动」继续传给 body ——
     * 表现就是列表拉到底、整页跟着往下跑。
     *
     * 只在两种情况下 preventDefault：
     *   · 列表滚不动（歌太少，压根没有 overflow）；
     *   · 已经到顶 / 到底，还要往那个方向滚。
     * 中间状态完全交给浏览器，内部滚动保持原生手感（含触控板惯性）。
     * 落在面板的内边距 / 头部 / 「打开完整曲库」上时，手动把 delta 转给列表，
     * 否则那些地方会直接去滚页面。
     *
     * 必须 passive:false —— 否则 preventDefault 只是个摆设。
     */
    function wheelDelta(event) {
        /* deltaMode: 0 像素 / 1 行 / 2 页。行模式下 deltaY 只有 3，
           当像素加会几乎不动，按 16px 一行折一下 */
        return event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    }

    function bindListWheel(root) {
        if (!root) return;
        root.addEventListener('wheel', function (event) {
            var delta = wheelDelta(event);
            if (!delta) return;

            /* 谁在滚：卡片歌单 / 窄屏浮层是里面的 ul（面板自己 overflow:hidden），
               迷你条歌单是面板自己（max-height + overflow:auto）。
               先看 ul 滚不滚得动；滚不动再看面板的 overflowY ——
               面板也是 hidden 的话就是真的没得滚，别把它的 scrollHeight
               （被 hidden 裁掉的那部分）当成可滚区域。 */
            var list = root.querySelector('.music-tracklist');
            if (!list || list.scrollHeight - list.clientHeight <= 1) {
                var overflowY = window.getComputedStyle(root).overflowY;
                list = /(auto|scroll)/.test(overflowY) ? root : null;
            }

            /* 没得滚：整块吃掉，别漏给正文 */
            if (!list || list.scrollHeight - list.clientHeight <= 1) {
                event.preventDefault();
                return;
            }

            var max = list.scrollHeight - list.clientHeight;

            if (list.contains(event.target)) {
                var atTop = list.scrollTop <= 0;
                var atBottom = list.scrollTop >= max - 1;
                if ((delta < 0 && atTop) || (delta > 0 && atBottom)) event.preventDefault();
                return;
            }

            /* 面板里但不在列表上（内边距、头部、底部链接）：手动转给列表 */
            event.preventDefault();
            list.scrollTop = Math.min(max, Math.max(0, list.scrollTop + delta));
        }, { passive: false });
    }

    function bindCard() {
        if (!card) return;

        /* 封面 <img> 的 load/error 只绑这一次，之后靠 data-cover 切换黑胶 */
        watchCoverArt(el.art, el.cover);

        /* 点封面 / 标题 / 歌手那一块 → 打开播放页（设计稿里红圈标的就是这一块）。
           播放键、上一首/下一首、进度、音量都在自己的按钮/滑杆上，不受影响；
           用 closest('[data-music]') 排除掉它们，免得点播放键反而跳走了。
           标题块额外补上 role/tabindex：原来只有鼠标能点，键盘用户进不去。 */
        var hit = card.querySelector('.music-entry-info');
        var art = card.querySelector('.music-entry-art');
        function openFromHit(event) {
            if (event.target.closest('button, input, a, [data-music]')) return;
            openPlayer();
        }
        if (hit) hit.addEventListener('click', openFromHit);
        if (art) art.addEventListener('click', openFromHit);
        if (hit) {
            hit.setAttribute('role', 'button');
            hit.setAttribute('tabindex', '0');
            hit.setAttribute('aria-label', '打开播放页');
            hit.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openPlayer();
            });
        }

        if (el.toggle) el.toggle.addEventListener('click', toggle);

        var prev = card.querySelector('[data-music="prev"]');
        var next = card.querySelector('[data-music="next"]');
        if (prev) prev.addEventListener('click', function () { step('prev'); });
        if (next) next.addEventListener('click', function () { step('next'); });

        if (el.listToggle && el.list) {
            el.listToggle.addEventListener('click', toggleCardList);
            el.list.inert = true;
            bindListWheel(el.list);
        }

        /* 开着歌单的时候改窗口大小：重新决定「停靠右侧 / 卡片下方 / 上方」，
           并刷新停靠面板的高度上限。rAF 节流，拖一次窗口只算一遍。 */
        var sideRaf = 0;
        window.addEventListener('resize', function () {
            if (!card || !el.list || cardSheet.open) return;
            if (!card.classList.contains('is-list-open')) return;
            if (isCompactSheet()) {
                /* 拉到手机宽度：右侧停靠/下拉都装不下，直接收回卡片 */
                closeCardList();
                return;
            }
            if (sideRaf) return;
            sideRaf = window.requestAnimationFrame(function () {
                sideRaf = 0;
                placeCardList();
            });
        });

        if (el.sheetClose) {
            el.sheetClose.addEventListener('click', function () { closeCardSheet('tap'); });
        }

        document.addEventListener('keydown', function (event) {
            if (!cardSheet.open || event.key !== 'Escape') return;
            event.preventDefault();
            closeCardSheet('tap');
        });

        /* 开着的时候把窗口拉宽了：立刻收回卡片里，
           否则那块会以浮层的定位留在 body 上 */
        if (window.matchMedia) {
            var compactQuery = window.matchMedia('(max-width: 640px)');
            var handleCompactChange = function () {
                if (!compactQuery.matches && cardSheet.open) closeCardSheet('tap', true);
            };
            if (compactQuery.addEventListener) compactQuery.addEventListener('change', handleCompactChange);
            else if (compactQuery.addListener) compactQuery.addListener(handleCompactChange);
        }

        if (el.bar) bindSeek(el.bar, function (ratio) { seekRatio(ratio); });

        /* 音量进度条：点 / 拖到哪就是哪（和播放进度条同一套 bindSeek）。
           拖一下也会顺便把引擎加载起来，符合「点播放才加载」的约定。
           第三个参数是键盘行为：在音量条上按左右键调音量，
           别落到 bindSeek 默认的「快进 5 秒」上（以前就是这么错的）。 */
        if (el.volBar) {
            bindSeek(el.volBar, setVolumeRatio, function (event) {
                var step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 0.05
                    : (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -0.05 : 0);
                if (!step) return;
                event.preventDefault();
                setVolumeRatio((state.muted ? 0 : state.volume) + step);
            });
        }

        if (el.mute) {
            el.mute.addEventListener('click', function () {
                ensureEngine().then(function (instance) {
                    instance.toggleMute();
                }).catch(function () {});
            });
        }

        var more = card.querySelector('[data-music-open-view]');
        if (more) {
            more.addEventListener('click', function (event) {
                event.preventDefault();
                /* 先收起歌单再切视图（收起动画和切页同时跑）。
                   窄屏这块已经搬到 body 上了，不主动收的话它会悬在音乐页上面 ——
                   「打开完整曲库」之后还压着一层播放列表就是这个。
                   桌面那份在卡片里，跟着首页一起隐藏，顺手关掉是为了回到首页时不留尾巴 */
                closeCardList('tap');
                openMusicView();
            });
        }
    }

    /* 进度 / 音量共用的拖动条。
       onKey 可选：给了就由它处理键盘（音量条用它把左右键改成调音量），
       不给就是默认的「左右键 ±5 秒」。 */
    function bindSeek(bar, onSeek, onKey) {
        var dragging = false;

        function ratioOf(event) {
            var rect = bar.getBoundingClientRect();
            if (!rect.width) return 0;
            return (event.clientX - rect.left) / rect.width;
        }

        bar.addEventListener('pointerdown', function (event) {
            dragging = true;
            bar.classList.add('is-dragging');
            if (bar.setPointerCapture) {
                try { bar.setPointerCapture(event.pointerId); } catch (error) {}
            }
            onSeek(ratioOf(event));
            event.preventDefault();
        });
        bar.addEventListener('pointermove', function (event) {
            if (dragging) onSeek(ratioOf(event));
        });
        function stop(event) {
            if (!dragging) return;
            dragging = false;
            bar.classList.remove('is-dragging');
            if (bar.releasePointerCapture && event.pointerId != null) {
                try { bar.releasePointerCapture(event.pointerId); } catch (error) {}
            }
        }
        bar.addEventListener('pointerup', stop);
        bar.addEventListener('pointercancel', stop);

        bar.addEventListener('keydown', function (event) {
            if (onKey) {
                onKey(event);
                return;
            }
            var step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 5
                : (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 0);
            if (!step) return;
            event.preventDefault();
            ensureEngine().then(function (instance) {
                /* 走 seekSeconds：它会把「刚跳过进度」标记打上，
                   播放页里的歌词才会立刻跟着重新居中 */
                seekSeconds(instance.getState().currentTime + step);
            }).catch(function () {});
        });
    }

    /* ---------------- 迷你播放条 ---------------- */

    function buildDock() {
        if (dock || !TRACKS.length) return;

        dock = document.createElement('div');
        dock.className = 'music-dock';
        dock.setAttribute('role', 'region');
        dock.setAttribute('aria-label', '音乐播放条');
        dock.innerHTML = [
            '<span class="music-dock-progress" role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><span class="music-dock-progress-fill"></span></span>',
            '<button class="music-dock-open" type="button" data-music="open-view" aria-label="打开音乐页">',
            '    <span class="music-dock-art" data-cover="false"><img class="music-dock-cover" alt="" hidden><span class="music-dock-disc"></span></span>',
            '</button>',
            '<div class="music-dock-info">',
            '    <p class="music-dock-title"></p>',
            '    <p class="music-dock-artist"></p>',
            '</div>',
            '<div class="music-dock-actions">',
            '    <button class="music-dock-btn" type="button" data-music="list" aria-label="播放列表" aria-expanded="false" aria-controls="musicDockRows">' + ICONS.list + '</button>',
            '    <button class="music-dock-btn" type="button" data-music="prev" aria-label="上一首">' + ICONS.prev + '</button>',
            '    <button class="music-dock-btn is-primary" type="button" data-music="toggle" aria-label="播放">' + ICONS.play + '</button>',
            '    <button class="music-dock-btn" type="button" data-music="next" aria-label="下一首">' + ICONS.next + '</button>',
            '    <button class="music-dock-btn is-quiet" type="button" data-music="close" aria-label="收起播放条">' + ICONS.close + '</button>',
            '</div>',
            '<div class="music-dock-panel" inert>',
            '    <p class="music-dock-panel-title">播放列表</p>',
            '    <ul class="music-tracklist music-tracklist--dock" id="musicDockRows"></ul>',
            '</div>'
        ].join('');
        document.body.appendChild(dock);

        dockEl = {
            fill: dock.querySelector('.music-dock-progress-fill'),
            progress: dock.querySelector('.music-dock-progress'),
            cover: dock.querySelector('.music-dock-cover'),
            art: dock.querySelector('.music-dock-art'),
            title: dock.querySelector('.music-dock-title'),
            artist: dock.querySelector('.music-dock-artist'),
            toggle: dock.querySelector('[data-music="toggle"]'),
            listBtn: dock.querySelector('[data-music="list"]'),
            panel: dock.querySelector('.music-dock-panel')
        };

        dockRows = dock.querySelector('#musicDockRows');
        buildRows(dockRows);
        /* 迷你条歌单同样：滚到头别把正文带着一起滚 */
        bindListWheel(dockEl.panel);
        /* 迷你条的封面同样是「黑胶顶着，加载完再淡入」 */
        watchCoverArt(dockEl.art, dockEl.cover);

        dock.addEventListener('click', function (event) {
            var button = event.target.closest('[data-music]');
            if (!button) return;
            var action = button.getAttribute('data-music');
            if (action === 'prev') step('prev');
            else if (action === 'next') step('next');
            else if (action === 'toggle') toggle();
            /* 迷你条只出现在「卡片看不见」的页面（文章页等）。那里点开播放模块
               要先把人拽到页面顶上，等于把人从正在读的段落里拔出来 ——
               所以这里仍然回曲库页，播放模块只在首页和曲库内部展开。 */
            else if (action === 'open-view') openMusicView();
            else if (action === 'list') toggleDockPanel();
            else if (action === 'close') {
                /* × 只是把播放条藏起来，音乐继续放 —— 用户随时能从卡片 / 音乐页再操作 */
                dockDismissed = true;
                closeDockPanel();
                renderDock();
            }
        });

        bindSeek(dockEl.progress, function (ratio) { seekRatio(ratio); });
        observeCard();
        renderDock();
    }

    function toggleDockPanel() {
        if (!dock || !dockEl) return;
        if (dock.classList.contains('is-list-open')) {
            closeDockPanel('tap');
            return;
        }
        dock.classList.add('is-list-open');
        dockEl.listBtn.setAttribute('aria-expanded', 'true');
        dockEl.panel.inert = false;
    }

    /* 迷你条歌单排在播放条**上方**，收起时朝下缩回去（mode 'up'）。 */
    function closeDockPanel(reason) {
        if (!dock || !dockEl) return;
        if (!dock.classList.contains('is-list-open')) return;
        applyExitMotion(dockEl.panel, reason, 'up');
        dock.classList.remove('is-list-open');
        dockEl.listBtn.setAttribute('aria-expanded', 'false');
        dockEl.panel.inert = true;
    }

    function renderDock() {
        if (!dock || !dockEl) return;
        var track = currentTrack();
        if (!track) return;

        var error = state.error ? errorText() : '';
        var duration = state.duration || Number(track.duration) || 0;
        var percent = duration ? Math.min(100, (state.currentTime / duration) * 100) : 0;

        dockEl.title.textContent = track.title || '';
        dockEl.artist.textContent = error || subTitle(track);
        dock.classList.toggle('is-playing', state.playing);
        dock.classList.toggle('has-error', !!error);
        dockEl.toggle.innerHTML = state.playing ? ICONS.pause : ICONS.play;
        dockEl.toggle.setAttribute('aria-label', state.playing
            ? '暂停'
            : (state.locked ? '今日不可再试' : '播放'));
        dockEl.fill.style.width = percent.toFixed(2) + '%';
        dockEl.progress.setAttribute('aria-valuemax', String(Math.round(duration) || 0));
        dockEl.progress.setAttribute('aria-valuenow', String(Math.round(state.currentTime) || 0));

        var coverUrl = track.cover ? resolveUrl(track.cover) : '';
        setCoverArt(dockEl.art, dockEl.cover, coverUrl, track.title + ' 封面');
        if (!coverUrl) dockEl.art.style.setProperty('--bar-accent', track.accent || DEFAULT_ACCENT);

        markRows(dockRows);
        syncDock();
    }

    function observeCard() {
        if (card && ('IntersectionObserver' in window)) {
            var observer = new IntersectionObserver(function (entries) {
                var entry = entries[0];
                cardVisible = entry.isIntersecting && entry.intersectionRatio > 0.3;
                syncDock();
            }, { threshold: [0, 0.3, 0.6, 1] });
            observer.observe(card);
        }

        /* 手机端：滚到页脚时播放条要自动消失（屏幕小，固定条会盖住页脚内容）。
           桌面端不做页脚避让。scroll 用 passive + rAF 合并，别在回调里直接量布局。 */
        var scheduled = false;
        window.addEventListener('scroll', function () {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(function () {
                scheduled = false;
                syncDock();
            });
        }, { passive: true });
    }

    /* 卡片看得见时不出播放条，否则一屏两个一模一样的控件。
       停在中途（currentTime > 0）或出错时也留着，方便回去接着听 / 重试。
       音乐视图（?view=music）本身就是完整曲库界面，也不出迷你条；
       播放页（全屏浮层）盖着的时候同理 —— 它已经把控件全摆在屏幕上了。 */
    function syncDock() {
        if (!dock) return;
        var started = state.currentTime > 0 || state.playing || !!state.error;
        var visible = started && !dockDismissed && !cardVisible && !playerOpen;

        /* 站在音乐视图里：曲库界面已经是完整播放器，右下角再挂一个会重复 */
        var musicView = document.getElementById('view-music');
        if (visible && musicView && musicView.classList.contains('active-view')) {
            visible = false;
        }

        /* 只在窄屏（手机）滚到页脚时隐藏：页面底部空间有限，固定条会盖住
           页脚的版权/链接。桌面端（鼠标）不避让，保持原位。 */
        if (visible && window.innerWidth <= 600) {
            var footer = document.querySelector('.site-footer');
            if (footer && footer.getBoundingClientRect().top < window.innerHeight - 4) {
                visible = false;
            }
        }

        dock.classList.toggle('is-visible', visible);
        dock.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    /* ---------------- 播放页（对话框） ----------------
     *
     * 版式和动效整体照 404.html 的「获取联系」：
     *   · 桌面：背板 0.24s 淡入，面板 0.34s 从 16px 下方浮起、收到原大
     *   · 窄屏（≤640px）：贴着下沿升起来的一层，上圆角、0.46s
     *   · 收起：`.is-closing` + @keyframes 演 0.2s（窄屏 0.22s），220ms 后 hidden
     * 面板里还是原来那套内容：唱片、歌词、进度、走带控件；
     * 播放列表在面板里就地展开，行样式学 movie.html 的选片条。
     *
     * 参考稿里的 播放器模式 / 全屏 / 收藏 / 评论 / 全景声 / 弹幕 / 百科 /
     * 相似推荐 一律没做，留下的都是真会用到的。
     */

    var player = null;              // 元素引用表
    var modal = null;               // 浮层本体（挂在 body 上）
    var playerOpen = false;
    var playerReturnFocus = null;   // 关掉后把焦点还回打开它的那个元素
    /* 播放页自己压的那层历史是不是还在栈顶：手机返回键 / 系统手势
       应该先收起浮层，而不是把人直接带出站点（和搜索面板同一套约定）。 */
    var playerHistoryActive = false;
    var playerQueueOpen = false;
    var queueScrollRaf = 0;         // 歌单展开/收起时跟着高度走的滚动，见 followQueueScroll
    var queueAnim = null;           // 正在跑的高度动画（连点时要掐掉）
    var queueToken = 0;             // 每次开关自增，作废上一轮动画的收尾回调
    var playerStyleReady = false;
    var playerStylePending = null;
    var playerCoverUrl = '';
    var closeTimer = null;          // 收起动画结束后落 hidden 的定时器

    /* 歌词的三份状态：解析出来的数据、当前高亮行、用户有没有手动滚过。
       「用户手动滚过就先别抢」是为了想往回看两句时不被自动居中拽回来。 */
    var lyric = {
        index: -1,
        timed: false,
        lines: [],
        nodes: [],
        active: -1,
        detached: false,
        idleTimer: null,    /* 滚开之后的回中倒计时（见 scheduleLyricReturn） */
        pendingSeek: false  /* 刚跳过进度：下一次同步不用等换行，立刻定位 */
    };

    /* 用户滚开歌词后，停手满这么久才把正在唱的那句滚回中间。
       期间播放器里任何一次操作都会把这个计时按回 0。 */
    var LYRIC_RETURN_DELAY = 5000;

    /* 读过的 .lrc 文本（url → 文本，读失败记 false），同一次会话不再读第二遍；
       lyricRequest 是「当前这次」的序号，切歌后回来的旧请求直接丢掉 */
    var lyricCache = {};
    var lyricRequest = 0;

    function playerRoot() {
        return new URL((card && card.getAttribute('data-music-module')) || 'music/', document.baseURI).href;
    }

    function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /* player.css 懒加载：和 dock.css 一样（加载失败也 resolve，
       宁可样式没跟上也不能让按钮点了没反应） */
    function ensurePlayerStyle() {
        if (playerStyleReady) return Promise.resolve();
        if (playerStylePending) return playerStylePending;
        playerStylePending = loadStyle(playerRoot() + 'player.css').then(function () {
            playerStyleReady = true;
            playerStylePending = null;
        });
        return playerStylePending;
    }

    /* 一段高度过渡（播放列表展开用）。先把终值写进行内样式，动画只负责「演一遍」：
       动画被取消 / 标签页在后台 / 减弱动效，任何一种情况下版面都要落到终态。 */
    function tweenHeight(node, from, to, duration, done, easing) {
        var settled = false;
        var timer = 0;
        function finish() {
            if (settled) return;
            settled = true;
            if (timer) window.clearTimeout(timer);
            node.classList.remove('is-animating');
            if (done) done();
        }

        node.style.height = to + 'px';
        if (!node.animate || prefersReducedMotion()) {
            finish();
            return null;
        }

        node.classList.add('is-animating');
        var anim = node.animate(
            [{ height: from + 'px' }, { height: to + 'px' }],
            { duration: duration, easing: easing || 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
        );
        anim.onfinish = finish;
        timer = window.setTimeout(finish, duration + 150);
        return anim;
    }

    function buildPlayer() {
        if (modal || !TRACKS.length) return;

        var layer = document.createElement('div');
        layer.className = 'mp-modal';
        layer.id = 'mpModal';
        layer.hidden = true;
        layer.innerHTML = [
            '<div class="mp-backdrop" data-mp-close></div>',
            '<div class="mp-panel" role="dialog" aria-modal="true" aria-labelledby="mpPanelTitle" tabindex="-1">',
            '  <div class="mp-panel-head">',
            '    <h2 class="mp-panel-title" id="mpPanelTitle">正在播放</h2>',
            '    <button class="mp-panel-close" type="button" data-mp="close" aria-label="关闭播放页">' + ICONS.close + '</button>',
            '  </div>',
            '  <div class="mp-panel-body">',
            '    <div class="mp-body">',
            '      <div class="mp-stage">',
            '        <div class="mp-art" data-cover="false">',
            '          <img class="mp-art-img" alt="" hidden>',
            '          <span class="mp-disc" aria-hidden="true"></span>',
            '          <span class="mp-spindle" aria-hidden="true"></span>',
            '        </div>',
            '      </div>',
            '      <div class="mp-info">',
            '        <div class="mp-heading">',
            '          <h3 class="mp-title"></h3>',
            '          <p class="mp-meta"></p>',
            '        </div>',
            '        <p class="mp-error" hidden></p>',
            '        <div class="mp-lyric" role="region" aria-label="歌词"></div>',
            '      </div>',
            '    </div>',
            '    <div class="mp-queue" id="mpQueue" hidden>',
            '      <ul class="music-tracklist mp-queue-list"></ul>',
            '    </div>',
            '  </div>',
            '  <div class="mp-barwrap">',
            '    <div class="mp-progress">',
            '    <span class="mp-time mp-time--cur">00:00</span>',
            '    <span class="mp-bar" role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><span class="mp-bar-fill"></span></span>',
            '    <span class="mp-time mp-time--dur">00:00</span>',
            '    </div>',
            '    <div class="mp-transport">',
            '    <div class="mp-modeslot">',
            '      <button class="mp-btn mp-mode" type="button" data-mp="mode" data-mode="list" aria-label="播放模式：顺序播放" title="播放模式">' + ICONS.modeList + ICONS.modeShuffle + ICONS.modeOne + '</button>',
            '    </div>',
            '    <div class="mp-controls">',
            '      <button class="mp-btn" type="button" data-mp="prev" aria-label="上一首">' + ICONS.prev + '</button>',
            '      <button class="mp-btn mp-play" type="button" data-mp="toggle" aria-label="播放" data-playing="false" data-loading="false">',
            '        <span class="mp-play-icon">' + ICONS.play + '</span>',
            '        <span class="mp-play-icon mp-play-icon--pause">' + ICONS.pause + '</span>',
            '      </button>',
            '      <button class="mp-btn" type="button" data-mp="next" aria-label="下一首">' + ICONS.next + '</button>',
            '    </div>',
            '    <div class="mp-extras">',
            '      <button class="mp-btn mp-vol-btn" type="button" data-mp="mute" aria-label="静音 / 取消静音">',
            '        <span class="mp-vol-on">' + ICONS.volume + '</span>',
            '        <span class="mp-vol-off">' + ICONS.volumeOff + '</span>',
            '      </button>',
            '      <span class="mp-vol" role="slider" tabindex="0" aria-label="音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30" style="--progress:30%"><span class="mp-vol-fill"></span></span>',
            '      <button class="mp-queue-btn" type="button" data-mp="queue" aria-label="播放列表" aria-expanded="false" aria-controls="mpQueue">',
            '        ' + ICONS.list + '<span class="mp-queue-label">播放列表</span>',
            '      </button>',
            '    </div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');

        document.body.appendChild(layer);
        modal = layer;

        player = {
            panel: layer.querySelector('.mp-panel'),
            body: layer.querySelector('.mp-panel-body'),
            close: layer.querySelector('.mp-panel-close'),
            art: layer.querySelector('.mp-art'),
            artImg: layer.querySelector('.mp-art-img'),
            title: layer.querySelector('.mp-title'),
            meta: layer.querySelector('.mp-meta'),
            error: layer.querySelector('.mp-error'),
            lyric: layer.querySelector('.mp-lyric'),
            bar: layer.querySelector('.mp-bar'),
            fill: layer.querySelector('.mp-bar-fill'),
            curTime: layer.querySelector('.mp-time--cur'),
            durTime: layer.querySelector('.mp-time--dur'),
            toggle: layer.querySelector('.mp-play'),
            mode: layer.querySelector('.mp-mode'),
            queueBtn: layer.querySelector('[data-mp="queue"]'),
            queue: layer.querySelector('.mp-queue'),
            rows: layer.querySelector('.mp-queue-list'),
            volBtn: layer.querySelector('.mp-vol-btn'),
            volBar: layer.querySelector('.mp-vol'),
            volFill: layer.querySelector('.mp-vol-fill')
        };

        buildRows(player.rows, 'lg');
        watchCoverArt(player.art, player.artImg);
        bindPlayer();
    }

    function bindPlayer() {
        modal.addEventListener('click', function (event) {
            /* 背板（data-mp-close）点一下就关 */
            if (event.target.hasAttribute('data-mp-close')) {
                requestClosePlayer();
                return;
            }
            var button = event.target.closest('[data-mp]');
            if (!button) return;
            var action = button.getAttribute('data-mp');
            if (action === 'close') requestClosePlayer();
            else if (action === 'toggle') toggle();
            else if (action === 'prev') step('prev');
            else if (action === 'next') step('next');
            else if (action === 'mode') cycleMode();
            else if (action === 'queue') toggleQueue();
            else if (action === 'mute') {
                ensureEngine().then(function (instance) { instance.toggleMute(); }).catch(function () {});
            }
        });

        bindSeek(player.bar, function (ratio) { seekRatio(ratio); });
        bindSeek(player.volBar, setVolumeRatio, function (event) {
            var delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 0.05
                : (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -0.05 : 0);
            if (!delta) return;
            event.preventDefault();
            setVolumeRatio((state.muted ? 0 : state.volume) + delta);
        });

        /* 用户一动滚轮 / 手指就标记「别自动滚了」。
           用 scroll 事件不行：程序自己居中也会触发 scroll。
           标完开始数 5 秒，停手就自己回到正在唱的那句。 */
        ['wheel', 'touchstart', 'pointerdown'].forEach(function (name) {
            player.lyric.addEventListener(name, function () {
                /* 用户自己接管了：正在跑的居中动画立刻停，别跟他抢滚轮 */
                stopLyricScroll();
                lyric.detached = true;
                scheduleLyricReturn();
            }, { passive: true });
        });

        /* 「任何操作都重置 5 秒」：监听整个面板，不只监听歌词区 ——
           点播放键、拖进度条、翻歌单、按方向键都算一次操作，
           只要还在动，就不把歌词抢回来。 */
        ['pointerdown', 'wheel', 'touchstart'].forEach(function (name) {
            modal.addEventListener(name, noteLyricActivity, { passive: true });
        });
        modal.addEventListener('keydown', noteLyricActivity);

        modal.addEventListener('keydown', onPlayerKeydown);

        /* 内容区能不能继续往下滚：控件条上沿那层淡出靠它开关 */
        player.body.addEventListener('scroll', syncBodyFade, { passive: true });

        /* 转屏 / 改窗口大小之后钉住的像素高度会过时，重算一次 */
        window.addEventListener('resize', function () {
            if (playerOpen && playerQueueOpen) pinBodyHeight(true);
        });
    }

    /* 面板内容溢出了才在控件条上沿飘一层淡出 —— 直接量 scrollHeight，
       只有滚动 / 开歌单 / 换歌这几个时机调，不放进每帧的渲染里 */
    function syncBodyFade() {
        if (!player || !player.body || !player.panel) return;
        var body = player.body;
        var more = body.scrollHeight - body.scrollTop - body.clientHeight > 4;
        player.panel.classList.toggle('is-scrollable', more);
    }

    /* Esc 关浮窗、Tab 不许跑到背后的页面上 */
    function onPlayerKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (playerQueueOpen) toggleQueue(false);
            else requestClosePlayer();
            return;
        }
        if (event.key !== 'Tab') return;

        var nodes = modal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
        var items = Array.prototype.filter.call(nodes, function (node) {
            return !node.disabled && node.offsetParent !== null;
        });
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        var active = document.activeElement;

        /* 焦点在面板自己身上（刚打开）或已经跑到浮层外面时，先把它扳回来 */
        if (!modal.contains(active)) {
            event.preventDefault();
            first.focus();
            return;
        }
        if (active === player.panel) {
            event.preventDefault();
            if (event.shiftKey) last.focus();
            else first.focus();
            return;
        }
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /* ---------------- 播放页的返回历史 ----------------
     * 浮层本身不是一条页面记录，手机的系统返回 / 浏览器后退会直接离站。
     * 打开时压一条带标记的记录，返回时 popstate 认出标记没了就收起浮层。
     * history.state 整份复制过去：script.js 靠 annieView / annieScrollTop
     * 记住当前视图和滚动位置，丢掉它们返回后会跳回首页。 */
    function pushPlayerHistory() {
        if (playerHistoryActive) return;
        try {
            var next = Object.assign({}, stampCurrentView(), {
                annieMusicPlayer: true,
                annieScrollTop: Math.round(window.scrollY)
            });
            history.pushState(next, '', window.location.href);
            playerHistoryActive = true;
        } catch (error) {
            playerHistoryActive = false;
        }
    }

    /* 直接打开某个站内视图（书签 / 分享链接，比如 ?view=music）时，
       那一条历史记录里是没有 annieView 的。收起播放页靠 back() 退回它，
       script.js 的 popstate 认不出视图就兜底成首页 —— 于是「关播放页」
       变成「回首页」。所以压播放页记录之前，先给当前这条补上视图名
       （字段和 script.js 压视图记录时一致）。
       ⚠️ article 视图跳过：它的历史靠 annieArticleId + articleHistoryEntryActive
       那一套认，凭空补一个 annieView 会让「前进回文章」落到没渲染内容的文章页。 */
    function stampCurrentView() {
        var current = history.state || null;
        if (current && typeof current.annieView === 'string') return current;
        var active = document.querySelector('.view.active-view');
        var name = active && active.id ? active.id.replace(/^view-/, '') : '';
        if (!name || name === 'article') return current;
        var stamped = Object.assign({}, current || {}, {
            annieView: name,
            annieScrollTop: Math.round(window.scrollY)
        });
        history.replaceState(stamped, '', window.location.href);
        return stamped;
    }

    /* × / 背板 / Esc 也走 history.back()，让历史栈和画面同步：
       否则浮层关了、那条记录还留着，下次按返回会「关一个已经关掉的浮层」。
       popstate 里统一收起；pushState 被浏览器拒绝时直接关。 */
    function requestClosePlayer() {
        if (!playerOpen) return;
        if (!playerHistoryActive) {
            closePlayer();
            return;
        }
        try {
            history.back();
        } catch (error) {
            playerHistoryActive = false;
            closePlayer();
        }
    }

    function bindPlayerHistory() {
        window.addEventListener('popstate', function (event) {
            var state = event.state;
            var isPlayer = !!(state && state.annieMusicPlayer);
            if (!isPlayer) playerHistoryActive = false;
            /* 前进回到播放页那条记录时不自动弹回浮层：
               用户上一次是主动关掉的，不该被「前进」强迫重开。 */
            if (playerOpen && !isPlayer) closePlayer();
        });
    }

    function openPlayer() {
        if (!TRACKS.length) return;
        if (playerOpen) {
            renderPlayer();
            return;
        }

        playerOpen = true;
        playerReturnFocus = document.activeElement;

        /* ⚠️ 先等样式到位再建 DOM：反过来元素会先以「无样式」插进页面，
           样式一到才带着动画演一遍，一打开就能看到它抖。 */
        var ready = modal ? Promise.resolve() : ensurePlayerStyle();

        ready.then(function () {
            if (!playerOpen) return;
            buildPlayer();
            renderPlayer();

            /* 上一轮收起的定时器还在：撤掉，否则它会把刚打开的浮窗 hidden 掉 */
            if (closeTimer) {
                window.clearTimeout(closeTimer);
                closeTimer = null;
            }
            modal.classList.remove('is-closing');
            modal.hidden = false;
            modal.inert = false;
            /* 浮层真要显示了才压历史，别让「样式加载失败」留一条空记录 */
            pushPlayerHistory();
            lockPageScroll();

            /* 焦点给面板本身，不给关闭按钮：程序化聚焦同样会命中 :focus-visible，
               每次打开都在那颗叉外面顶一圈框，看着像被选中了 */
            if (player.panel) {
                try { player.panel.focus({ preventScroll: true }); } catch (error) {}
            }
            syncBodyFade();
            syncDock();
            /* 上次离开时歌词停在用户翻到的位置：回来重新开始数 5 秒，
               不马上抢回去（「离开播放器不触发回中」的另一半） */
            scheduleLyricReturn();
        });
    }

    function closePlayer() {
        if (!playerOpen) return;
        playerOpen = false;
        /* 收起就作废回中计时：离开播放器不该把歌词滚回中间，
           下次打开再重新数 */
        cancelLyricReturn();
        stopLyricScroll();
        toggleQueue(false, true);

        if (!modal) {
            syncDock();
            return;
        }

        modal.inert = true;
        unlockPageScroll();

        function finish() {
            modal.hidden = true;
            modal.classList.remove('is-closing');
            closeTimer = null;
        }

        if (prefersReducedMotion()) {
            finish();
        } else {
            /* 收起靠 .is-closing + @keyframes：同一帧里两次样式变更会被合并，
               transition 会被整条跳过（404.html 里同一个坑） */
            modal.classList.add('is-closing');
            closeTimer = window.setTimeout(finish, 220);
        }

        var back = playerReturnFocus;
        playerReturnFocus = null;
        if (back && back.focus && document.contains(back)) {
            try { back.focus({ preventScroll: true }); } catch (error) {}
        }
        syncDock();
    }

    /* 播放列表：在面板里就地展开（列表项样式学 movie.html 的选片条）。
       immediate = true 时不做动画（关浮窗时顺带关掉）。 */
    function toggleQueue(force, immediate) {
        if (!player) return;
        var open = typeof force === 'boolean' ? force : !playerQueueOpen;
        if (open === playerQueueOpen) return;
        playerQueueOpen = open;
        stopQueueScroll();
        /* 连点两下时上一轮的高度动画还在跑：先掐掉，再作废它的收尾回调。
           不作废的话，上一轮的 done 会把刚展开的 hidden 又设回去 ——
           按钮显示「已展开」而列表是空的，之后连 aria-expanded 都纠正不回来。 */
        if (queueAnim) {
            queueAnim.cancel();
            queueAnim = null;
        }
        var token = ++queueToken;

        player.queueBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        player.queue.inert = !open;

        if (open) {
            player.queue.classList.remove('is-closing');
            pinBodyHeight(true);
            player.queue.hidden = false;
            player.queue.style.height = 'auto';
            var full = player.queue.offsetHeight;
            var body = player.body;
            var zero = body ? body.scrollTop : 0;
            var fit = body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0;
            centerQueueRow();
            queueAnim = tweenHeight(player.queue, 0, full, 300, function () {
                if (token !== queueToken) return;
                player.queue.style.height = '';
                /* ⚠️ 滚动必须等展开动画走完再算：动画途中量到的高度只有一半，
                   滚不到底，300ms 一过歌单就停在视野外，看着像点了没反应。 */
                revealQueue();
                syncBodyFade();
            });
            followQueueScroll(fit, zero, full, 300);
            return;
        }

        if (immediate || prefersReducedMotion()) {
            player.queue.hidden = true;
            player.queue.style.height = '';
            pinBodyHeight(false);
            syncBodyFade();
            return;
        }

        var height = player.queue.offsetHeight;
        var body = player.body;
        var fit = body ? body.scrollTop : 0;
        /* 终点 = 歌单拿掉之后的滚动上限。临时 hidden 一下再放回来量，
           同一个任务里完成，不会闪；按 scrollTop 硬减高度算会漏掉上边距。
           ⚠️ 这一隐会让内容瞬间变短、scrollTop 被浏览器夹到 0，
           量完必须还回去，否则收起的第一帧画面就跳了。 */
        var zero = 0;
        if (body) {
            player.queue.hidden = true;
            zero = Math.max(0, body.scrollHeight - body.clientHeight);
            player.queue.hidden = false;
            body.scrollTop = fit;
        }
        queueAnim = tweenHeight(player.queue, height, 0, 220, function () {
            if (token !== queueToken) return;
            player.queue.hidden = true;
            player.queue.style.height = '';
            pinBodyHeight(false);
            syncBodyFade();
        }, 'cubic-bezier(0.4, 0, 0.9, 1)');
        followQueueScroll(fit, zero, height, 220);
    }

    function stopQueueScroll() {
        if (!queueScrollRaf) return;
        window.cancelAnimationFrame(queueScrollRaf);
        queueScrollRaf = 0;
    }

    /* 让内容区的滚动跟着歌单的高度一起走。
       ⚠️ 只做高度动画是不够的：歌单接在钉死了高度的 .mp-body 下面，
       展开的那 300ms 它整块都在可视区之外（屏幕上什么都没动），动画一结束
       revealQueue 才一次跳到位 —— 看着就是「没有过渡动画」。
       进度取真实渲染高度而不是时间：WAAPI 的缓动和时间进度不是一回事，
       按时间插值会让歌单下沿在动画中途漏到可视区外。
       atFull / atZero 是歌单撑满 / 收到底时 scrollTop 该在的位置，
       展开和收起只是这两个值换个方向，共用一套插值。 */
    function followQueueScroll(atFull, atZero, total, duration) {
        var body = player.body;
        if (!body || !total || Math.abs(atFull - atZero) < 1) return;
        var start = window.performance.now();
        function step() {
            var ratio = Math.max(0, Math.min(1, player.queue.getBoundingClientRect().height / total));
            body.scrollTop = atZero + (atFull - atZero) * ratio;
            queueScrollRaf = window.performance.now() - start < duration + 20
                ? window.requestAnimationFrame(step)
                : 0;
        }
        queueScrollRaf = window.requestAnimationFrame(step);
    }

    /* 歌单展开时把「唱片 + 歌词」这一块钉在「歌单没开时」的高度：
       它原样不动，多出来的高度交给 .mp-panel-body 这一个滚动区去滚。
       不钉的话 flex 会把两块一起压扁 —— 歌词有 min-height 撑着不缩，
       .mp-info 就被顶穿，歌词和它自己的滚动条直接画在歌单上面。
       只在窄屏做：宽屏 .mp-panel-body 不是 flex，本来就不会压扁。 */
    function pinBodyHeight(on) {
        var block = player && player.panel && player.panel.querySelector('.mp-body');
        if (!block) return;
        var narrow = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
        if (!on || !narrow) {
            block.style.height = '';
            block.style.flex = '';
            return;
        }
        var body = player.body;
        var styles = window.getComputedStyle(body);
        var avail = body.clientHeight
            - (parseFloat(styles.paddingTop) || 0)
            - (parseFloat(styles.paddingBottom) || 0);
        if (avail <= 0) return;
        /* 先松回原样再量：内容本身比可用高度还高时（很矮的屏幕 + 出错提示），
           钉成可用高度照样会溢出去压歌单，所以取两者的大值 */
        block.style.height = '';
        block.style.flex = '';
        var pinned = Math.max(avail, block.scrollHeight);
        block.style.flex = '0 0 auto';
        block.style.height = pinned + 'px';
    }

    /* 歌单在面板底部展开，小屏上很可能落在可视区之外：
       把面板内容滚到能看见它为止（只滚面板自己，别动文档）。 */
    function revealQueue() {
        var body = player.body;
        if (!body || !player.queue) return;
        var bodyRect = body.getBoundingClientRect();
        var queueRect = player.queue.getBoundingClientRect();
        if (queueRect.bottom > bodyRect.bottom) {
            body.scrollTop += queueRect.bottom - bodyRect.bottom + 12;
        }
    }

    /* 打开歌单时把当前这首挪进视野（5 首之后才看得出来）。
       ⚠️ 不能用 scrollIntoView：它会连文档一起滚，把整页推走。只滚列表自己。 */
    function centerQueueRow() {
        var list = player.rows;
        if (!list) return;
        var row = list.querySelector('.mt-row.is-current');
        if (!row) return;
        var listRect = list.getBoundingClientRect();
        var rowRect = row.getBoundingClientRect();
        if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
            list.scrollTop += rowRect.top - listRect.top - (list.clientHeight - rowRect.height) / 2;
        }
    }

    /* 浮窗打开时背后不许滚。和搜索面板同一套：锁 html + 把滚动条宽度补回
       body 的内边距里（直接 body{overflow:hidden} 在 iOS 上会把页面顶回顶部） */
    function lockPageScroll() {
        var root = document.documentElement;
        var gap = window.innerWidth - root.clientWidth;
        if (gap > 0) root.style.setProperty('--mp-modal-gap', gap + 'px');
        else root.style.removeProperty('--mp-modal-gap');
        root.classList.add('mp-modal-open');
    }

    function unlockPageScroll() {
        var root = document.documentElement;
        root.classList.remove('mp-modal-open');
        root.style.removeProperty('--mp-modal-gap');
    }

    /* ---------------- 播放页 · 渲染 ---------------- */

    function renderPlayer() {
        if (!player) return;
        var track = currentTrack();
        if (!track) return;

        var error = state.error ? errorText() : '';
        var duration = state.duration || Number(track.duration) || 0;
        var percent = duration ? Math.min(100, (state.currentTime / duration) * 100) : 0;
        var coverUrl = track.cover ? resolveUrl(track.cover) : '';

        player.panel.setAttribute('data-cover', coverUrl ? 'true' : 'false');
        player.panel.setAttribute('data-playing', state.playing ? 'true' : 'false');
        player.panel.setAttribute('data-muted', state.muted ? 'true' : 'false');

        /* 唱片中心标的颜色只在换歌时改一次：timeupdate 每秒跑好几次，
           反复 setProperty 也是在白白触发样式重算 */
        if (coverUrl !== playerCoverUrl) {
            playerCoverUrl = coverUrl;
            player.panel.style.setProperty('--mp-accent', track.accent || DEFAULT_ACCENT);
        }

        setCoverArt(player.art, player.artImg, coverUrl, (track.title || '') + ' 封面');

        player.title.textContent = track.title || '';
        var metaParts = [];
        if (track.artist) metaParts.push('歌手 ' + track.artist);
        if (track.album) metaParts.push('专辑 ' + track.album);
        player.meta.textContent = metaParts.join(' · ');

        player.error.hidden = !error;
        if (error) player.error.textContent = error;

        player.fill.style.width = percent.toFixed(2) + '%';
        player.bar.style.setProperty('--progress', percent.toFixed(2) + '%');
        player.curTime.textContent = formatTime(state.currentTime);
        player.durTime.textContent = formatTime(duration);
        player.bar.setAttribute('aria-valuemax', String(Math.round(duration) || 0));
        player.bar.setAttribute('aria-valuenow', String(Math.round(state.currentTime) || 0));
        player.bar.setAttribute('aria-valuetext', formatTime(state.currentTime) + ' / ' + formatTime(duration));

        var volumePercent = Math.round((state.muted ? 0 : state.volume) * 100);
        player.volFill.style.width = volumePercent + '%';
        player.volBar.style.setProperty('--progress', volumePercent + '%');
        player.volBar.setAttribute('aria-valuenow', String(volumePercent));

        var loading = state.buffering || (!engine && !!engineLoading);
        player.toggle.setAttribute('data-playing', state.playing ? 'true' : 'false');
        player.toggle.setAttribute('data-loading', loading ? 'true' : 'false');
        player.toggle.setAttribute('data-locked', state.locked ? 'true' : 'false');
        player.toggle.setAttribute('aria-label', state.playing
            ? '暂停'
            : (state.locked ? '今日不可再试' : (error ? '重试播放' : '播放')));

        player.mode.setAttribute('data-mode', state.mode);
        player.mode.setAttribute('aria-label', '播放模式：' + MODE_TEXT[state.mode]);

        var queueLabel = player.queueBtn.querySelector('.mp-queue-label');
        if (queueLabel) queueLabel.textContent = '播放列表 ' + TRACKS.length;

        markRows(player.rows);
        syncLyric(false);
    }

    /* ---------------- 播放页 · 歌词 ---------------- */

    /* LRC 行首时间戳：[mm:ss] / [mm:ss.xx] / [mm:ss:xx]，一行可以有好几个。 */
    var LEAD_TIME_TAG = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
    var LEAD_META_TAG = /^\[[a-zA-Z]+:.*\]$/;

    /* 三种写法统一成 { timed, lines: [{ time, text }] }：
       · 数组（time 秒）→ 有时间的就按时间走
       · 字符串里有 [mm:ss] → 当 LRC 解析（[ti:] 这类元信息丢掉）
       · 字符串里没有时间 → 一行一句，只滚动不跟着高亮
       返回 null 表示「这首歌没配歌词」，播放页显示那句提示。 */
    function parseLyric(raw) {
        if (!raw) return null;

        if (Object.prototype.toString.call(raw) === '[object Array]') {
            var list = [];
            raw.forEach(function (item) {
                if (item == null) return;
                if (typeof item === 'string') {
                    list.push({ time: null, text: item });
                    return;
                }
                var seconds = Number(item.time);
                list.push({
                    time: isFinite(seconds) && seconds >= 0 ? seconds : null,
                    text: String(item.text == null ? '' : item.text)
                });
            });
            if (!list.length) return null;
            var allTimed = list.every(function (line) { return line.time != null; });
            if (allTimed) list.sort(function (a, b) { return a.time - b.time; });
            else list = list.filter(function (line) { return line.text || line.time != null; });
            return list.length ? { timed: allTimed, lines: list } : null;
        }

        if (typeof raw !== 'string') return null;

        var lines = [];
        var timed = false;
        raw.replace(/\r\n?/g, '\n').split('\n').forEach(function (row) {
            var rest = row.replace(/^\s+/, '');
            var times = [];
            var match = rest.match(LEAD_TIME_TAG);
            while (match) {
                var minutes = parseInt(match[1], 10) || 0;
                var seconds = parseInt(match[2], 10) || 0;
                var fraction = match[3] ? Number('0.' + match[3]) : 0;
                times.push(minutes * 60 + seconds + fraction);
                rest = rest.slice(match[0].length);
                match = rest.match(LEAD_TIME_TAG);
            }

            if (!times.length) {
                if (LEAD_META_TAG.test(rest)) return;   /* [ti:歌名] 之类，不要 */
                lines.push({ time: null, text: rest.trim() });
                return;
            }

            timed = true;
            var body = rest.trim();
            times.forEach(function (time) {
                lines.push({ time: time, text: body });
            });
        });

        if (!timed) {
            lines = lines.filter(function (line) { return line.text; });
            return lines.length ? { timed: false, lines: lines } : null;
        }
        lines = lines.filter(function (line) { return line.time != null; })
            .sort(function (a, b) { return a.time - b.time; });
        return lines.length ? { timed: true, lines: lines } : null;
    }

    function loadLyric(track, index) {
        lyric.index = index;
        lyric.active = -1;
        lyric.detached = false;
        lyric.pendingSeek = false;
        cancelLyricReturn();

        var raw = track && track.lyric;
        if (!raw && track && track.lyricFile) {
            loadLyricFile(track.lyricFile);
            return;
        }
        applyLyric(raw);
    }

    function applyLyric(raw) {
        var parsed = parseLyric(raw);
        lyric.timed = !!(parsed && parsed.timed);
        lyric.lines = parsed ? parsed.lines : [];
        renderLyric();
    }

    /* .lrc 文件按需读：第一次放到这一首才发请求，读过就留在内存里。
       ⚠️ 走的是 fetch，同源文件，所以本地要起服务器（双击 HTML 打不开）；
       线上是 GitHub Pages，天然没问题。 */
    function loadLyricFile(path) {
        var url = resolveUrl(path);
        var token = ++lyricRequest;

        lyric.timed = false;
        lyric.lines = [];
        showLyricNotice('歌词加载中…');

        if (url in lyricCache) {
            if (lyricCache[url] === false) showLyricNotice('歌词加载失败');
            else applyLyric(lyricCache[url]);
            return;
        }

        if (!window.fetch) {
            showLyricNotice('歌词加载失败');
            return;
        }

        window.fetch(url, { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.arrayBuffer();
            })
            .then(function (buffer) {
                var text = decodeLyric(buffer);
                lyricCache[url] = text;
                /* 期间又切了歌：这份结果回填缓存就够了，不要画到界面上 */
                if (token === lyricRequest) applyLyric(text);
            })
            .catch(function () {
                lyricCache[url] = false;
                if (token === lyricRequest) showLyricNotice('歌词加载失败');
            });
    }

    /* 国内流传的 LRC 十有八九是 GBK：先按 UTF-8 解，出现替换字符（U+FFFD）
       就说明不是 UTF-8，再用 GBK 解一次 */
    function decodeLyric(buffer) {
        var text = '';
        try {
            text = new TextDecoder('utf-8').decode(buffer);
        } catch (error) {
            return '';
        }
        if (text.indexOf('\uFFFD') < 0) return text;
        try {
            return new TextDecoder('gbk').decode(buffer);
        } catch (error) {
            return text;
        }
    }

    /* 歌词区里那行提示：「该歌曲未配置歌词」/「歌词加载中…」/「歌词加载失败」 */
    function showLyricNotice(text) {
        var box = player && player.lyric;
        if (!box) return;
        box.innerHTML = '';
        box.dataset.empty = 'true';
        lyric.nodes = [];
        var note = document.createElement('p');
        note.className = 'mp-lyric-empty';
        note.textContent = text;
        box.appendChild(note);
    }

    function renderLyric() {
        var box = player && player.lyric;
        if (!box) return;

        box.innerHTML = '';
        stopLyricScroll();
        box.scrollTop = 0;
        box.dataset.empty = lyric.lines.length ? 'false' : 'true';
        lyric.nodes = [];
        lyric.active = -1;

        if (!lyric.lines.length) {
            showLyricNotice('该歌曲未配置歌词');
            return;
        }

        lyric.lines.forEach(function (line) {
            var item = document.createElement('p');
            item.className = 'mp-lyric-line';
            if (line.time != null) {
                item.classList.add('is-timed', 'is-seekable');
                item.title = '跳到这一句';

                /* 时间和正文是一个整体（CSS 里整行居中），时间块常驻占位：
                   露出 / 收起都不会推动正文，折行也不变。 */
                var stamp = document.createElement('span');
                stamp.className = 'mp-lyric-time';
                stamp.textContent = formatTime(line.time);
                /* 只做视觉提示，读屏念歌词本身就好，不用每句前都念一遍时间 */
                stamp.setAttribute('aria-hidden', 'true');
                item.appendChild(stamp);

                var text = document.createElement('span');
                text.className = 'mp-lyric-text';
                text.textContent = line.text || '';
                item.appendChild(text);

                /* 点一句跳过去（还没开始放的话就顺带放起来）。不做 Tab 焦点
                   （几十个 Tab 停靠点会把键盘用户困在歌词里） */
                item.addEventListener('click', function () { playFromLyric(line.time); });
            } else {
                item.textContent = line.text || '';
            }
            box.appendChild(item);
            lyric.nodes.push(item);
        });

        /* 歌词是 fetch 回来的，或者是打开播放页那一刻本来就暂停着：
           画完立刻按当前进度认一次「现在唱到哪句」，不然要等下一次
           timeupdate 才有高亮和居中（暂停时永远等不到）。 */
        lyric.active = -1;
        syncLyric(true);
    }

    /* 每帧都可能被叫（timeupdate），所以只在「当前行真的变了」时动 DOM */
    function syncLyric(force) {
        if (!player) return;
        if (lyric.index !== state.index) {
            loadLyric(currentTrack(), state.index);
            force = true;
        }

        /* 跳进度是用户明确要看这一句：不管之前是不是被滚走了都重新居中。
           只在播放页里算数（面板隐藏时量不到尺寸，滚了也没意义）。 */
        var jumped = lyric.pendingSeek && playerOpen;
        lyric.pendingSeek = false;

        if (!lyric.timed || !lyric.lines.length) return;

        var time = state.currentTime + 0.15;
        var active = -1;
        for (var i = 0; i < lyric.lines.length; i += 1) {
            if (lyric.lines[i].time <= time) active = i;
            else break;
        }

        var moved = active !== lyric.active;
        if (moved) {
            lyric.active = active;
            for (var j = 0; j < lyric.nodes.length; j += 1) {
                lyric.nodes[j].classList.toggle('is-active', j === active);
                lyric.nodes[j].classList.toggle('is-past', j < active);
            }
        }

        if (jumped) {
            /* 拖进度条 / 点歌词之后按新进度重新定位（平滑滚动，见 centerLyric） */
            if (active >= 0) centerLyric(active);
            else scrollLyricTo(0);
            return;
        }

        if (active < 0) return;
        /* 正常播放：换行时把新的那句挪到中间；用户刚滚开过就先别抢，
           停手 5 秒后由 scheduleLyricReturn 把他带回来 */
        if (!lyric.detached && (moved || force)) centerLyric(active);
    }

    /* 歌词区的滚动动画状态（同一时刻只有一个）。
       不用原生 scrollTo({behavior:'smooth'})：它的时长由浏览器定（跨几十行要滑一两秒），
       而且连续点击时没法精确接管。这里自己按帧推进，随时可以从「当前位置」改目标。 */
    var lyricScroll = null;   // { frame, from, distance, duration, startAt }

    function stopLyricScroll() {
        if (!lyricScroll) return;
        window.cancelAnimationFrame(lyricScroll.frame);
        lyricScroll = null;
    }

    /* 把所有歌词行挪到指定 scrollTop。
       · 默认 easeOutCubic，时长按距离给（一句 320ms、跨半首歌也不超过 700ms）
       · 动画中途再次调用：从当前滚动位置接着走，不回到起点重新来
       · 减弱动效 / 不支持 rAF：直接落位 */
    function scrollLyricTo(top) {
        var box = player && player.lyric;
        if (!box) return;

        stopLyricScroll();

        var from = box.scrollTop;
        var distance = top - from;
        if (!window.requestAnimationFrame || prefersReducedMotion() || Math.abs(distance) < 1) {
            box.scrollTop = top;
            return;
        }

        var run = {
            frame: 0,
            from: from,
            distance: distance,
            duration: Math.min(700, Math.max(320, Math.abs(distance) * 1.4)),
            startAt: null
        };

        function step(now) {
            /* 已经被新的目标接管 / 被用户停掉了 */
            if (lyricScroll !== run) return;
            if (run.startAt == null) run.startAt = now;
            var progress = Math.min(1, (now - run.startAt) / run.duration);
            var eased = 1 - Math.pow(1 - progress, 3);
            box.scrollTop = run.from + run.distance * eased;
            if (progress < 1) run.frame = window.requestAnimationFrame(step);
            else lyricScroll = null;
        }

        lyricScroll = run;
        run.frame = window.requestAnimationFrame(step);
    }

    /* 歌词区里「正在唱的那句」该落在多高的位置（0~1，0.5 = 正中）。
       数值写在 player.css 的 --mp-lyric-focus：桌面 0.5，窄屏 0.38 ——
       窄屏歌词区一直铺到走带栏，按正中摆会显得偏下。 */
    function lyricFocusRatio(box) {
        var raw = window.getComputedStyle(box).getPropertyValue('--mp-lyric-focus');
        var value = parseFloat(raw);
        if (!isFinite(value) || value <= 0) return 0.5;
        /* 写 38 和写 38% 都认 */
        return value > 1 ? value / 100 : value;
    }

    function centerLyric(index) {
        var box = player && player.lyric;
        var node = lyric.nodes[index];
        if (!box || !node) return;

        var boxRect = box.getBoundingClientRect();
        var nodeRect = node.getBoundingClientRect();
        /* 当前这句的中心离歌词区顶部多远 → 差多少就滚多少 */
        var currentCenter = (nodeRect.top - boxRect.top) + nodeRect.height / 2;
        var targetCenter = box.clientHeight * lyricFocusRatio(box);
        scrollLyricTo(Math.max(0, box.scrollTop + currentCenter - targetCenter));
    }

    /* 用户滚开歌词之后：停手满 LYRIC_RETURN_DELAY 就把正在唱的那句滚回中间。
       「停手」按播放器里最后一次操作算，所以每次都先撤掉旧计时再重挂。 */
    function scheduleLyricReturn() {
        cancelLyricReturn();
        if (!playerOpen || !lyric.detached) return;
        lyric.idleTimer = window.setTimeout(function () {
            lyric.idleTimer = null;
            /* 关掉播放器之后才到点的计时什么也不做 */
            if (!playerOpen || !lyric.detached) return;
            lyric.detached = false;
            if (lyric.active >= 0) centerLyric(lyric.active);
        }, LYRIC_RETURN_DELAY);
    }

    function cancelLyricReturn() {
        if (!lyric.idleTimer) return;
        window.clearTimeout(lyric.idleTimer);
        lyric.idleTimer = null;
    }

    /* 播放器里任意一次操作都从这一刻重新数 5 秒（没滚开就不用管） */
    function noteLyricActivity() {
        if (!lyric.detached) return;
        scheduleLyricReturn();
    }

    /* 拖进度条 / 点歌词 / ←→ 键：先记下「这次跳是用户点的」，
       再让引擎去 seek（engine 的 emit 是同步的，标记必须打在它前面） */
    function markLyricSeek() {
        lyric.pendingSeek = true;
        lyric.detached = false;
        cancelLyricReturn();
    }

    /* ---------------- 站内音乐页 ---------------- */

    function bindView() {
        if (!view) return;
        buildRows(el.viewRows, 'lg');

        /* 音乐页顶部只留「打开播放页面」这一个入口：它把播放浮层拉起来，
           不负责起播（起播是曲目行 / 播放页里那颗播放键的事）。
           翻页、歌词、音量全在播放页里，这里再放一颗「播放全部」等于两处抢同一件事。 */
        if (el.viewOpen) el.viewOpen.addEventListener('click', openPlayer);

        if (el.back) {
            el.back.addEventListener('click', function () {
                /* 站内视图：从音乐页按返回，回退回上一页（script.js 压了历史记录），
                   没有历史（直接打开 ?view=music）就回首页。 */
                if (history.state && history.state.annieView === 'music') history.back();
                else document.dispatchEvent(new CustomEvent('annie:open-view', { detail: { view: 'home' } }));
            });
        }
        if (el.viewMode) {
            /* 三个图标都写在 HTML 里，CSS 按 data-mode 只显示当前那个 */
            el.viewMode.addEventListener('click', cycleMode);
            el.viewMode.dataset.mode = state.mode;
        }
        if (el.viewModeText) el.viewModeText.textContent = MODE_TEXT[state.mode];
    }

    function openMusicView() {
        /* 所有入口统一到站内视图 ?view=music：卡片标题/封面、歌单里那枚
           「打开完整曲库」、迷你条的打开按钮都走这里。
           独立页 /music/ 已经撤掉，改由 script.js 的 SPA 路由切到音乐视图
           （annie:open-view 事件，会压历史记录、按返回能退回原页）。 */
        document.dispatchEvent(new CustomEvent('annie:open-view', { detail: { view: 'music' } }));
    }

    /* ---------------- 启动 ---------------- */

    function init() {
        if (!TRACKS.length) {
            renderCard();
            return;
        }
        if (card) {
            buildRows(el.rows);
            bindCard();
        }
        /* 播放引擎保持懒加载：第一次点播放才拉 core.js + dock.css。
           音乐页的「打开播放页面」只建浮层，不碰引擎；真正起播的是曲目行
           和播放页里那颗播放键，都是用户手势，浏览器不允许自动播。 */
        bindView();
        bindOutsideClose();
        bindPlayerHistory();
        renderAll();
    }

    window.AnnieMusicUI = {
        init: init,
        select: select,
        toggle: toggle,
        openView: openMusicView,
        openPlayer: openPlayer,
        getState: function () { return state; }
    };

    init();
})();
