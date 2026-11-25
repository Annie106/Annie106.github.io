/* ==================== 音乐模块 · 界面 ====================
 *
 * 这一个文件负责音乐的所有「看得见的部分」：
 *   1. 首页那张卡片（封面 / 标题 / 上一首·播放·下一首 / 进度 / 播放列表）
 *   2. 文章页右下角的迷你播放条（同样带播放列表）
 *   3. 站内 ?view=music 音乐页（曲目列表 + 播放全部 + 播放模式）
 *
 * 播放本身不在这里：core.js 里只有一个 <audio>，本文件只是它的三块 UI。
 * 为了让卡片首屏就有封面、标题和歌单，本文件是**首屏加载**的（约 5KB gzip），
 * 真正重的 core.js（播放引擎）和 dock.css 仍然要等第一次点播放才下载。
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
    var DEFAULT_ACCENT = '#b45f74';

    /* 播放不出来时统一说这句：限流、防盗链、直链过期，对访客来说都是
       「今天听不了了」。具体额度规则不出现在页面上。 */
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
        modeOne: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h11M4 12h11M4 17h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17.4 14.4l1.6-1.1v5.9M16.4 19.2h4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };

    /* ---------------- 基础状态 ---------------- */

    var baseUrl = resolveBase();
    var engine = null;
    var engineLoading = null;
    var dockDismissed = false;
    var cardVisible = true;
    var seeking = false;

    /* 首屏就把音量偏好读出来，别等 core.js（点播放才加载）起来后再回推 ——
       否则有历史记录时，卡片会先显示默认 70%、点播放后「跳」到上次的音量。
       ui.js 和 core.js 读的是同一份 localStorage（STORAGE_KEY），且用同一套
       校验回退：无效值一律回退到 0.3，两边永远不会算出不同的初始音量。 */
    var initialPrefs = readPrefs();

    var state = {
        index: 0,
        playing: false,
        buffering: false,
        error: '',
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
        rows: document.getElementById('musicCardList'),
        viewPlay: document.getElementById('musicViewPlay'),
        viewPlayText: document.getElementById('musicViewPlayText'),
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

    function applyState(next) {
        state.playing = next.playing;
        state.buffering = next.buffering;
        state.error = next.error;
        state.currentTime = next.currentTime;
        state.duration = next.duration || state.duration;
        state.index = next.index;
        state.mode = next.mode;
        state.volume = next.volume;
        state.muted = next.muted;
        renderAll();
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

    function playAll() {
        ensureEngine().then(function (instance) {
            var current = instance.getState();
            if (current.playing) instance.pause();
            else if (current.index === 0 && current.currentTime > 0) instance.play();
            else instance.play(0);
        }).catch(function () {});
    }

    function cycleMode() {
        ensureEngine().then(function (instance) {
            instance.cycleMode();
        }).catch(function () {});
    }

    function seekRatio(ratio) {
        ensureEngine().then(function (instance) {
            instance.seekRatio(ratio);
        }).catch(function () {});
    }

    function setCardLoading(loading) {
        if (el.toggle) el.toggle.dataset.loading = loading ? 'true' : 'false';
        if (loading && el.meta && !state.error) {
            el.meta.textContent = '正在加载播放器…';
        }
    }

    /* ---------------- 渲染 ---------------- */

    function errorText() {
        return ERROR_TEXT[state.error] || '';
    }

    /* 音乐页的列表和卡片读的是同一份数据，所以没有单独的 renderView：
       renderCard 里顺手把页头的按钮文案、模式、行状态一起刷了。 */
    function renderAll() {
        renderCard();
        renderView();
        renderDock();
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
            el.toggle.setAttribute('aria-label', state.playing ? '暂停' : (error ? '重试播放' : '播放'));
        }

        markRows(el.rows);
    }

    /* 独立页 /music/ 没有首页卡片，renderCard 会在开头 return。
       音乐页自己的文案 / 状态必须单独渲染，别塞在 renderCard 里，
       否则独立页的曲目数、错误横幅、播放/暂停按钮全是静态兜底值。 */
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
        var nextPlayLabel = state.playing ? '暂停' : '播放全部';
        /* 只有文案真的变了才重放淡入动画 —— timeupdate 每秒好几次，
           每次都加 class 会让文字一直在抖。 */
        if (el.viewPlayText && el.viewPlayText.textContent !== nextPlayLabel) {
            el.viewPlayText.textContent = nextPlayLabel;
            el.viewPlayText.classList.remove('is-switching');
            void el.viewPlayText.offsetWidth; /* 强制重排，让同一动画能重新播放 */
            el.viewPlayText.classList.add('is-switching');
        }
        if (el.viewPlay) el.viewPlay.dataset.playing = state.playing ? 'true' : 'false';
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

    function applyCover(track) {
        if (!el.art) return;
        var url = track.cover ? resolveUrl(track.cover) : '';
        if (url && el.cover) {
            if (el.cover.getAttribute('src') !== url) el.cover.setAttribute('src', url);
            el.cover.hidden = false;
            el.cover.alt = track.title + ' 封面';
            el.art.dataset.cover = 'true';
        } else {
            if (el.cover) el.cover.hidden = true;
            el.art.dataset.cover = 'false';
            el.art.style.setProperty('--art-accent', track.accent || DEFAULT_ACCENT);
        }
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
                art.classList.add('has-cover');
                art.style.backgroundImage = 'url("' + resolveUrl(track.cover) + '")';
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
                select(index);
                closeDockPanel();
            });

            item.appendChild(button);
            list.appendChild(item);
        });

        markRows(list);
    }

    /* ---------------- 卡片交互 ---------------- */

    function toggleCardList() {
        if (!card || !el.listToggle || !el.list) return;
        var open = !card.classList.contains('is-list-open');
        card.classList.toggle('is-list-open', open);
        el.listToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        el.list.inert = !open;

        /* 歌单浮层默认往卡片下面弹；如果下方空间不够（靠近视口底部 / 页脚），
           就改成往上弹，避免展开后盖住页脚或伸出屏幕外。 */
        if (open) {
            var rect = card.getBoundingClientRect();
            var spaceBelow = window.innerHeight - rect.bottom;
            var upward = spaceBelow < 300;
            card.classList.toggle('is-list-upward', upward);
        }
    }

    function closeCardList() {
        if (!card || !el.listToggle || !el.list) return;
        card.classList.remove('is-list-open');
        el.listToggle.setAttribute('aria-expanded', 'false');
        el.list.inert = true;
    }

    /* 点卡片歌单 / 迷你条歌单之外的地方 → 收起面板。
       用 document 级委托，但要排除开关本身和面板内部，
       否则点面板里的歌曲时刚触发播放就被这里关掉了。 */
    function bindOutsideClose() {
        document.addEventListener('pointerdown', function (event) {
            var target = event.target;

            if (card && card.classList.contains('is-list-open')) {
                if (el.listToggle && el.listToggle.contains(target)) return;
                if (el.list && el.list.contains(target)) return;
                closeCardList();
            }

            if (dock && dock.classList.contains('is-list-open')) {
                if (dockEl && dockEl.listBtn && dockEl.listBtn.contains(target)) return;
                if (dockEl && dockEl.panel && dockEl.panel.contains(target)) return;
                closeDockPanel();
            }
        }, true);
    }

    function bindCard() {
        if (!card) return;

        /* 点封面 / 标题 / 歌手那一块 → 打开完整曲库。
           播放键、上一首/下一首、进度、音量都在自己的按钮/滑杆上，不受影响；
           用 closest('[data-music]') 排除掉它们，免得点播放键反而跳走了。 */
        var hit = card.querySelector('.music-entry-info');
        var art = card.querySelector('.music-entry-art');
        function openFromHit(event) {
            if (event.target.closest('button, input, a, [data-music]')) return;
            openMusicView();
        }
        if (hit) hit.addEventListener('click', openFromHit);
        if (art) art.addEventListener('click', openFromHit);

        if (el.toggle) el.toggle.addEventListener('click', toggle);

        var prev = card.querySelector('[data-music="prev"]');
        var next = card.querySelector('[data-music="next"]');
        if (prev) prev.addEventListener('click', function () { step('prev'); });
        if (next) next.addEventListener('click', function () { step('next'); });

        if (el.listToggle && el.list) {
            el.listToggle.addEventListener('click', toggleCardList);
            el.list.inert = true;
        }

        if (el.bar) bindSeek(el.bar, function (ratio) { seekRatio(ratio); });

        /* 音量进度条：点 / 拖到哪就是哪（和播放进度条同一套 bindSeek）。
           拖一下也会顺便把引擎加载起来，符合「点播放才加载」的约定。 */
        if (el.volBar) {
            bindSeek(el.volBar, function (ratio) {
                var value = Math.max(0, Math.min(1, ratio));
                el.volBar.style.setProperty('--progress', (value * 100).toFixed(1) + '%');
                if (el.volFill) el.volFill.style.width = (value * 100).toFixed(1) + '%';
                if (el.volValue) el.volValue.textContent = Math.round(value * 100) + '%';
                ensureEngine().then(function (instance) {
                    instance.setVolume(value);
                }).catch(function () {});
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
                openMusicView();
            });
        }
    }

    function bindSeek(bar, onSeek) {
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
            var step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 5
                : (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 0);
            if (!step) return;
            event.preventDefault();
            ensureEngine().then(function (instance) {
                var current = instance.getState();
                instance.seek(current.currentTime + step);
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

        dock.addEventListener('click', function (event) {
            var button = event.target.closest('[data-music]');
            if (!button) return;
            var action = button.getAttribute('data-music');
            if (action === 'prev') step('prev');
            else if (action === 'next') step('next');
            else if (action === 'toggle') toggle();
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
        var open = !dock.classList.contains('is-list-open');
        dock.classList.toggle('is-list-open', open);
        dockEl.listBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        dockEl.panel.inert = !open;
    }

    function closeDockPanel() {
        if (!dock || !dockEl) return;
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
        dockEl.toggle.setAttribute('aria-label', state.playing ? '暂停' : '播放');
        dockEl.fill.style.width = percent.toFixed(2) + '%';
        dockEl.progress.setAttribute('aria-valuemax', String(Math.round(duration) || 0));
        dockEl.progress.setAttribute('aria-valuenow', String(Math.round(state.currentTime) || 0));

        if (track.cover) {
            dockEl.cover.setAttribute('src', resolveUrl(track.cover));
            dockEl.cover.hidden = false;
            dockEl.art.dataset.cover = 'true';
        } else {
            dockEl.cover.hidden = true;
            dockEl.art.dataset.cover = 'false';
            dockEl.art.style.setProperty('--bar-accent', track.accent || DEFAULT_ACCENT);
        }

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
       音乐视图（?view=music）本身就是完整曲库界面，也不出迷你条 ——
       那是从独立页 /music/ 内嵌回来之后新增的场景。 */
    function syncDock() {
        if (!dock) return;
        var started = state.currentTime > 0 || state.playing || !!state.error;
        var visible = started && !dockDismissed && !cardVisible;

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

    /* ---------------- 站内音乐页 ---------------- */

    function bindView() {
        if (!view) return;
        buildRows(el.viewRows, 'lg');

        if (el.viewPlay) el.viewPlay.addEventListener('click', playAll);

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
           站内音乐视图里的「播放全部」同样走 playAll() → ensureEngine()，
           仍要用户手势，浏览器不允许自动播。 */
        bindView();
        bindOutsideClose();
        renderAll();
    }

    window.AnnieMusicUI = {
        init: init,
        select: select,
        toggle: toggle,
        openView: openMusicView,
        getState: function () { return state; }
    };

    init();
})();
