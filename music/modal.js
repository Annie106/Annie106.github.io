/* ==================== 音乐库弹窗 ====================
 *
 * 首次点击首页音乐卡片的列表图标时，background-music.js 才加载本文件 +
 * modal.css。播放器页面仍是 music/index.html，通过 ?embed=1 装进 iframe：
 * 页面里只留播放器，不重复渲染站点头部/页脚。
 *
 * 播放引擎在父页面（BackgroundMusic），iframe 只做 UI，通过 postMessage
 * 读写。关闭弹窗音乐继续播，卡片标题/进度/音量保持同步。
 * ================================================== */
(function () {
    'use strict';

    if (window.MusicModal) return;

    const BASE = (function () {
        const current = document.currentScript;
        try {
            if (current && current.src) return new URL('./', current.src);
        } catch (e) {}
        return new URL('music/', document.baseURI);
    })();

    const PAGE_URL = new URL('index.html?embed=1', BASE).href;
    const SITE_ROOT = new URL('../', BASE);

    const root = document.getElementById('musicModal');
    if (!root) return;

    const panel = root.querySelector('.music-modal-panel');
    const bodyBox = document.getElementById('musicModalBody');
    const closeBtn = document.getElementById('musicModalClose');
    const loading = document.getElementById('musicModalLoading');

    let frame = null;
    let ready = false;
    let isOpen = false;
    let lastFocus = null;
    let unsubscribe = null;
    let closeTimer = 0;
    /* 上一次发过去的曲目指纹。列表时长是异步探出来的，
       指纹变了就得把 tracks 一起重发，否则 iframe 里的列表一直挂 --:--。 */
    let tracksSignature = '';

    function resolveAsset(value) {
        if (!value) return '';
        try {
            return new URL(value, SITE_ROOT).href;
        } catch (e) {
            return value;
        }
    }

    function setExpanded(value) {
        const button = document.getElementById('musicCardLibrary');
        if (!button) return;
        button.setAttribute('aria-expanded', value ? 'true' : 'false');
    }

    /* ==================== iframe ==================== */

    function mountFrame() {
        if (frame) return;

        frame = document.createElement('iframe');
        frame.className = 'music-modal-frame';
        frame.title = '音乐库播放器';

        frame.addEventListener('load', function () {
            /* 给播放器一点时间量高度 / 发 ready，再撤骨架 */
            window.setTimeout(function () {
                if (loading) loading.hidden = true;
                frame.classList.add('is-ready');
            }, 60);
            postTheme();
        });

        bodyBox.appendChild(frame);

        /* 监听必须在设 src 之前挂好：iframe 里的脚本可能很快 postMessage('ready')。 */
        window.addEventListener('message', onMessage);
        frame.src = PAGE_URL;
    }

    /* ==================== 状态 ==================== */

    function getTracksMeta() {
        const engine = window.BackgroundMusic;
        if (!engine) return [];
        return engine.getTracks().map(function (track) {
            return {
                title: track.title || '',
                artist: track.artist || '',
                cover: track.cover ? resolveAsset(track.cover) : '',
                /* 预加载器提前探到的时长；0 表示还没探到，列表显示 --:-- */
                duration: Number(track.duration) || 0
            };
        });
    }

    function getStateMeta() {
        const engine = window.BackgroundMusic;
        if (!engine) return null;

        const state = engine.getState();
        const track = state.track;
        return {
            index: state.index,
            playing: state.playing,
            time: state.time,
            duration: state.duration,
            volume: state.volume,
            muted: state.muted,
            shuffle: state.shuffle,
            repeat: state.repeat,
            count: state.count,
            track: track ? {
                title: track.title || '',
                artist: track.artist || '',
                cover: track.cover ? resolveAsset(track.cover) : ''
            } : null
        };
    }

    function postState(includeTracks) {
        if (!ready || !frame || !frame.contentWindow) return;
        const state = getStateMeta();
        if (!state) return;

        const message = {
            type: 'annie-music-host',
            action: 'state',
            state: state
        };

        if (includeTracks) {
            message.tracks = getTracksMeta();
            tracksSignature = signatureOf(message.tracks);
        } else if (window.MusicPreload) {
            /* 时长为 0 的曲目被探出来了 → 这次顺带把 tracks 重发一遍 */
            const tracks = getTracksMeta();
            const signature = signatureOf(tracks);
            if (signature !== tracksSignature) {
                message.tracks = tracks;
                tracksSignature = signature;
            }
        }

        frame.contentWindow.postMessage(message, '*');
    }

    function signatureOf(tracks) {
        return tracks.map(function (track) {
            return [track.title, track.artist, track.cover, Math.round(track.duration || 0)].join('\u0001');
        }).join('\u0002');
    }

    function postTheme() {
        if (!ready || !frame || !frame.contentWindow) return;
        frame.contentWindow.postMessage({
            type: 'annie-music-host',
            action: 'theme',
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
        }, '*');
    }

    function startSync() {
        const engine = window.BackgroundMusic;
        if (!engine || unsubscribe) return;

        postState(true);
        unsubscribe = engine.subscribe(function () {
            postState(false);
        });
    }

    function stopSync() {
        if (!unsubscribe) return;
        unsubscribe();
        unsubscribe = null;
    }

    /* ==================== 指令 / 高度 / 消息 ==================== */

    function handleCommand(message) {
        const engine = window.BackgroundMusic;
        if (!engine) return;

        const payload = message.payload || {};
        try {
            switch (message.command) {
                case 'toggle': engine.toggle(); break;
                case 'next': engine.next(); break;
                case 'prev': engine.prev(); break;
                case 'select': engine.select(Number(payload.index), true); break;
                case 'seek': engine.seek(Number(payload.time)); break;
                case 'volume': engine.setVolume(Number(payload.value)); break;
                case 'shuffle': engine.setShuffle(!!payload.value); break;
                case 'repeat': engine.setRepeat(payload.value); break;
                case 'cycleRepeat': engine.cycleRepeat(); break;
                case 'toggleMute': engine.toggleMute(); break;
            }
        } catch (error) {
            console.warn('音乐库指令执行失败:', error);
        }
    }

    function onMessage(event) {
        if (!frame || event.source !== frame.contentWindow) return;

        const data = event.data;
        if (!data || data.type !== 'annie-music-embed') return;

        if (data.action === 'ready') {
            ready = true;
            if (loading) loading.hidden = true;
            if (frame) frame.classList.add('is-ready');
            postTheme();
            postState(true);
            if (isOpen) startSync();
            return;
        }

        if (data.action === 'resize') {
            const height = Math.round(Number(data.height));
            if (Number.isFinite(height) && height > 0 && frame) {
                /* 曲目多时播放器会很长；上限放高一点，让 modal 外层自己滚，
                   不要把 iframe 内容裁掉 */
                frame.style.height = Math.min(height, 8000) + 'px';
            }
            return;
        }

        if (data.action === 'command') {
            handleCommand(data);
            return;
        }

        if (data.action === 'close') {
            close();
            return;
        }

        if (data.action === 'request-state') {
            postTheme();
            postState(true);
        }
    }

    /* ==================== 打开 / 关闭 ==================== */

    function lockScroll() {
        const rootEl = document.documentElement;
        const gap = window.innerWidth - rootEl.clientWidth;
        if (gap > 0) {
            rootEl.style.setProperty('--music-scrollbar-gap', gap + 'px');
        } else {
            rootEl.style.removeProperty('--music-scrollbar-gap');
        }
        rootEl.classList.add('music-modal-open');
    }

    function unlockScroll() {
        const rootEl = document.documentElement;
        rootEl.classList.remove('music-modal-open');
        rootEl.style.removeProperty('--music-scrollbar-gap');
    }

    function focusables() {
        const nodes = panel.querySelectorAll('button, iframe, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        return Array.prototype.filter.call(nodes, function (el) {
            return !el.disabled && el.offsetParent !== null;
        });
    }

    function onKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;

        const list = focusables();
        if (!list.length) return;

        const first = list[0];
        const last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function open(trigger) {
        if (isOpen) return;

        isOpen = true;
        lastFocus = trigger instanceof HTMLElement
            ? trigger
            : (document.activeElement instanceof HTMLElement ? document.activeElement : null);

        clearTimeout(closeTimer);
        closeTimer = 0;
        root.classList.remove('is-closing');
        mountFrame();

        root.hidden = false;
        if (bodyBox) bodyBox.scrollTop = 0;
        lockScroll();
        setExpanded(true);
        startSync();

        try {
            closeBtn.focus({ preventScroll: true });
        } catch (e) {}

        document.addEventListener('keydown', onKeydown, true);
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;

        document.removeEventListener('keydown', onKeydown, true);
        stopSync();
        setExpanded(false);

        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            root.hidden = true;
            unlockScroll();
            restoreFocus();
            return;
        }

        root.classList.add('is-closing');
        clearTimeout(closeTimer);
        closeTimer = window.setTimeout(function () {
            root.classList.remove('is-closing');
            root.hidden = true;
            unlockScroll();
            restoreFocus();
        }, 220);
    }

    function restoreFocus() {
        const target = lastFocus;
        lastFocus = null;
        if (target && target.isConnected && typeof target.focus === 'function') {
            target.focus({ preventScroll: true });
        }
    }

    root.addEventListener('click', function (event) {
        if (event.target.hasAttribute('data-music-close')) close();
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('annie:themechange', postTheme);

    window.MusicModal = {
        open: open,
        close: close,
        isOpen: function () { return isOpen; }
    };
})();
