/* ==================== 音乐库页面逻辑 ====================
 *
 * 同一份 UI 服务两种打开方式：
 *
 * 1. 弹窗（music/index.html?embed=1，装在首页 musicModal 的 iframe 里）
 *    —— 不建自己的 <audio>，通过 postMessage 调父页面的 BackgroundMusic，
 *       所以关闭弹窗后音乐继续播，卡片状态也同步。
 * 2. 独立页面（直接访问 music/index.html）
 *    —— 动态加载 ../js/music-tracks.js + ../js/background-music.js，
 *       自己起引擎，方便单独调试。
 *
 * 加歌去 ../js/music-tracks.js；改结构去 index.html / music.css。
 * ================================================== */
(function () {
    'use strict';

    const root = document.getElementById('musicLibrary');
    if (!root) return;

    const els = {
        art: root.querySelector('[data-mlib-art]'),
        title: root.querySelector('[data-mlib-title]'),
        artist: root.querySelector('[data-mlib-artist]'),
        progress: root.querySelector('[data-mlib-progress]'),
        current: root.querySelector('[data-mlib-current]'),
        duration: root.querySelector('[data-mlib-duration]'),
        play: root.querySelector('[data-mlib-play]'),
        prev: root.querySelector('[data-mlib-prev]'),
        next: root.querySelector('[data-mlib-next]'),
        shuffle: root.querySelector('[data-mlib-shuffle]'),
        repeat: root.querySelector('[data-mlib-repeat]'),
        mute: root.querySelector('[data-mlib-mute]'),
        volume: root.querySelector('[data-mlib-volume]'),
        volumeLabel: root.querySelector('[data-mlib-volume-label]'),
        list: root.querySelector('[data-mlib-list]'),
        count: root.querySelector('[data-mlib-count]')
    };

    const EMBEDDED = new URLSearchParams(window.location.search).get('embed') === '1';
    let mode = EMBEDDED ? 'embedded' : 'standalone';
    let engine = null;
    let hostTimer = 0;
    let currentState = null;
    let currentTracks = [];
    let tracksSignature = null;
    let activeIndex = -1;
    let isSeeking = false;
    let heightRaf = 0;

    /* ==================== 宿主通信 ==================== */

    function postToHost(payload) {
        if (mode !== 'embedded') return;
        try {
            window.parent.postMessage(Object.assign({ type: 'annie-music-embed' }, payload), '*');
        } catch (e) {
            console.warn('音乐库无法联系父页面:', e);
        }
    }

    function command(name, payload) {
        if (mode === 'embedded') {
            postToHost({ action: 'command', command: name, payload: payload || {} });
            return;
        }
        if (!engine) return;

        const data = payload || {};
        switch (name) {
            case 'toggle': engine.toggle(); break;
            case 'next': engine.next(); break;
            case 'prev': engine.prev(); break;
            case 'select': engine.select(data.index, true); break;
            case 'seek': engine.seek(data.time); break;
            case 'volume': engine.setVolume(data.value); break;
            case 'shuffle': engine.setShuffle(!!data.value); break;
            case 'cycleRepeat': engine.cycleRepeat(); break;
            case 'toggleMute': engine.toggleMute(); break;
        }
    }

    /* ==================== 格式化 ==================== */

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const rest = Math.floor(seconds % 60);
        return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
    }

    function resolveCover(cover) {
        if (!cover) return '';
        try {
            return new URL(cover, new URL('../', window.location.href)).href;
        } catch (e) {
            return cover;
        }
    }

    function mapTracks(list) {
        return list.map(function (track) {
            return {
                title: track.title,
                artist: track.artist,
                cover: track.cover,
                /* 由父页面的预加载器提供；0 就是还没探到 */
                duration: Number(track.duration) > 0 ? Number(track.duration) : 0
            };
        });
    }

    /* ==================== 渲染 ==================== */

    function renderPlaylist(tracks) {
        if (!tracks.length) {
            els.count.textContent = '0 首';
            els.list.innerHTML = '<li class="mlib-empty">还没有曲目。在 js/music-tracks.js 里添加音频直链即可。</li>';
            [els.play, els.prev, els.next, els.shuffle, els.repeat, els.progress].forEach(function (control) {
                control.disabled = true;
            });
            return;
        }

        els.count.textContent = tracks.length + ' 首';
        [els.play, els.prev, els.next, els.shuffle, els.repeat, els.progress].forEach(function (control) {
            control.disabled = false;
        });

        els.list.innerHTML = tracks.map(function (track, index) {
            const title = escapeHtml(track.title || '未命名曲目');
            const artist = escapeHtml(track.artist || '未知作者');
            const seconds = Number(track.duration) > 0 ? Number(track.duration) : 0;
            return `
                <li>
                    <button class="mlib-track" type="button" data-mlib-index="${index}"
                            aria-label="播放 ${title} - ${artist}">
                        <span class="mlib-track-no" aria-hidden="true">
                            <span class="mlib-no">${String(index + 1).padStart(2, '0')}</span>
                            <span class="mlib-eq"><i></i><i></i><i></i></span>
                        </span>
                        <span class="mlib-track-info">
                            <span class="mlib-track-name">${title}</span>
                            <span class="mlib-track-artist">${artist}</span>
                        </span>
                        <span class="mlib-track-tail">
                            <span class="mlib-track-time">${seconds ? formatTime(seconds) : '--:--'}</span>
                            <span class="mlib-track-badge">播放中</span>
                        </span>
                    </button>
                </li>
            `;
        }).join('');

        activeIndex = -1;
    }

    /* 预加载是异步完成的：列表已经画好、时长后来才到。
       这种情况下不重建列表（会丢焦点），只改对应行的时间文字。 */
    function syncTrackDurations(tracks) {
        const rows = root.querySelectorAll('.mlib-track-time');
        if (!rows.length) return;

        Array.prototype.forEach.call(rows, function (row) {
            const button = row.closest('[data-mlib-index]');
            if (!button) return;
            const track = tracks[Number(button.dataset.mlibIndex)];
            const seconds = track && Number(track.duration) > 0 ? Number(track.duration) : 0;
            const next = seconds ? formatTime(seconds) : '--:--';
            if (row.textContent !== next) row.textContent = next;
        });
    }

    function sync(state, tracks) {
        if (!state) return;
        currentState = state;

        if (Array.isArray(tracks)) {
            const signature = tracks.map(function (track) {
                return [track.title || '', track.artist || '', track.cover || ''].join('\u0001');
            }).join('\u0002');

            if (signature !== tracksSignature) {
                tracksSignature = signature;
                currentTracks = tracks;
                renderPlaylist(currentTracks);
            }
            /* 时长不走签名：它会在列表画好之后才探出来，
               重渲染反而丢焦点，单独补文字就行 */
            syncTrackDurations(tracks);
        }

        const track = state.track || currentTracks[state.index] || null;

        els.title.textContent = track ? (track.title || '未命名曲目') : '暂无曲目';
        els.artist.textContent = track ? (track.artist || '') : '';

        const cover = track && track.cover ? (mode === 'embedded' ? track.cover : resolveCover(track.cover)) : '';
        if (cover) {
            els.art.classList.add('has-cover');
            els.art.style.setProperty('--mlib-cover', 'url("' + String(cover).replace(/"/g, '\\"') + '")');
        } else {
            els.art.classList.remove('has-cover');
            els.art.style.removeProperty('--mlib-cover');
        }

        root.classList.toggle('is-playing', !!state.playing);

        const duration = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
        const time = Number.isFinite(state.time) && state.time > 0 ? state.time : 0;
        const percent = duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;

        if (!isSeeking) {
            els.progress.value = String(Math.round(percent * 10));
            els.progress.style.setProperty('--progress', percent + '%');
            els.current.textContent = formatTime(time);
        }
        els.duration.textContent = formatTime(duration);
        els.progress.disabled = !(duration > 0) || !currentTracks.length;

        els.play.setAttribute('aria-label', state.playing ? '暂停' : '播放');
        els.play.title = state.playing ? '暂停' : '播放';

        const volume = Math.max(0, Math.min(100, Math.round(Number(state.volume) || 0)));
        els.volume.value = String(volume);
        els.volume.style.setProperty('--volume', volume + '%');
        els.volumeLabel.textContent = volume + '%';
        const muted = state.muted || volume === 0;
        els.mute.classList.toggle('is-muted', muted);
        els.mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
        els.mute.title = muted ? '取消静音' : '静音';

        els.shuffle.classList.toggle('is-on', !!state.shuffle);
        els.shuffle.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');

        const repeatLabels = { all: '列表循环', one: '单曲循环', off: '不循环' };
        const repeatLabel = repeatLabels[state.repeat] || '列表循环';
        els.repeat.dataset.mode = state.repeat;
        els.repeat.classList.toggle('is-on', state.repeat !== 'off');
        els.repeat.setAttribute('aria-label', '播放模式：' + repeatLabel);
        els.repeat.title = repeatLabel;

        if (activeIndex !== state.index) {
            Array.prototype.forEach.call(root.querySelectorAll('.mlib-track'), function (row) {
                const isActive = Number(row.dataset.mlibIndex) === state.index;
                row.classList.toggle('is-active', isActive);
                if (isActive) {
                    row.setAttribute('aria-current', 'true');
                } else {
                    row.removeAttribute('aria-current');
                }
            });
            activeIndex = state.index;
        }

        scheduleHeight();
    }

    /* ==================== 高度 / 主题 ==================== */

    function scheduleHeight() {
        if (mode !== 'embedded') return;
        if (heightRaf) cancelAnimationFrame(heightRaf);

        heightRaf = window.requestAnimationFrame(function () {
            heightRaf = 0;
            const height = Math.ceil(root.getBoundingClientRect().height);
            if (height > 0) postToHost({ action: 'resize', height: height });
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    }

    /* ==================== 交互 ==================== */

    function previewSeek() {
        isSeeking = true;
        const percent = Number(els.progress.value) / 10;
        els.progress.style.setProperty('--progress', percent + '%');
        if (currentState && currentState.duration > 0) {
            els.current.textContent = formatTime(currentState.duration * percent / 100);
        }
    }

    function commitSeek() {
        const duration = currentState && currentState.duration > 0 ? currentState.duration : 0;
        isSeeking = false;
        if (duration > 0) {
            command('seek', { time: duration * Number(els.progress.value) / 1000 });
        }
    }

    function bindEvents() {
        els.play.addEventListener('click', function () { command('toggle'); });
        els.prev.addEventListener('click', function () { command('prev'); });
        els.next.addEventListener('click', function () { command('next'); });

        els.shuffle.addEventListener('click', function () {
            command('shuffle', { value: !(currentState && currentState.shuffle) });
        });
        els.repeat.addEventListener('click', function () { command('cycleRepeat'); });
        els.mute.addEventListener('click', function () { command('toggleMute'); });

        els.volume.addEventListener('input', function (event) {
            command('volume', { value: Number(event.target.value) });
        });

        els.progress.addEventListener('pointerdown', function () { isSeeking = true; });
        els.progress.addEventListener('input', previewSeek);
        els.progress.addEventListener('change', commitSeek);
        els.progress.addEventListener('blur', function () {
            if (isSeeking) commitSeek();
        });

        els.list.addEventListener('click', function (event) {
            const row = event.target.closest('[data-mlib-index]');
            if (!row) return;
            const index = Number(row.dataset.mlibIndex);
            if (currentState && index === currentState.index) {
                command('toggle');
            } else {
                command('select', { index: index });
            }
        });

        document.addEventListener('keydown', function (event) {
            if (mode !== 'embedded' || event.key !== 'Escape') return;
            event.preventDefault();
            postToHost({ action: 'close' });
        });
    }

    /* ==================== 启动 ==================== */

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('脚本加载失败：' + src)); };
            document.head.appendChild(script);
        });
    }

    function initStandalone() {
        loadScript('../js/music-tracks.js')
            /* 预加载器必须在引擎之前：background-music 初始化时会向它登记曲目。
               已经有人引过（比如从弹窗降级过来）就不重复加载。 */
            .then(function () {
                return window.MusicPreload ? null : loadScript('../js/music-preload.js');
            })
            .then(function () { return loadScript('../js/background-music.js'); })
            .then(function () {
                engine = window.BackgroundMusic;
                if (!engine) throw new Error('BackgroundMusic 未就绪');
                engine.subscribe(function () {
                    sync(engine.getState(), mapTracks(engine.getTracks()));
                });
            })
            .catch(function (error) {
                console.warn('音乐库独立页启动失败:', error);
                els.title.textContent = '音乐库加载失败';
                els.artist.textContent = '请刷新页面重试';
            });
    }

    function initEmbedded() {
        window.addEventListener('message', function (event) {
            if (mode !== 'embedded') return;
            if (event.source !== window.parent) return;

            const data = event.data;
            if (!data || data.type !== 'annie-music-host') return;

            if (hostTimer) {
                clearTimeout(hostTimer);
                hostTimer = 0;
            }

            if (data.action === 'state') {
                sync(data.state, data.tracks);
            } else if (data.action === 'theme') {
                applyTheme(data.theme);
            } else if (data.action === 'measure') {
                scheduleHeight();
            }
        });

        postToHost({ action: 'ready' });
        scheduleHeight();

        /* 直接访问 ?embed=1（没有宿主）时，1.5s 后自己起引擎并显示完整页面，
           避免停在只有一个播放器的空壳上。 */
        hostTimer = window.setTimeout(function () {
            hostTimer = 0;
            if (mode !== 'embedded') return;
            mode = 'standalone';
            document.documentElement.classList.remove('is-modal');
            initStandalone();
        }, 1500);
    }

    bindEvents();
    if (mode === 'embedded') {
        document.documentElement.classList.add('is-modal');
        if (window.ResizeObserver) new ResizeObserver(scheduleHeight).observe(root);
        window.addEventListener('resize', scheduleHeight);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleHeight).catch(function () {});
        }
        initEmbedded();
    } else {
        initStandalone();
    }

    window.requestAnimationFrame(scheduleHeight);
})();
