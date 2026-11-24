// ==================== 后台音乐 / 音乐库播放引擎 ====================
/*
 * 这个文件有两份职责：
 *
 * 1. **首页那张音乐卡片**：播放 / 暂停、进度、音量、折叠。首屏必须可用，
 *    所以它保持常驻，不依赖任何额外请求。
 * 2. **播放引擎**：整站只用一个 <audio>。首页卡片的列表图标会拦成弹窗，
 *    弹窗 iframe 加载 music/index.html?embed=1；直接访问 music/index.html
 *    则是带站点头部的完整页面。弹窗外壳在 music/modal.js + modal.css，
 *    第一次点入口才加载。
 *
 * 曲目数据统一放在 js/music-tracks.js（window.MUSIC_TRACKS），加歌只改那一处。
 * 卡片和音乐库共享同一份状态，所以从音乐库换歌，卡片标题 / 进度会跟着变。
 *
 * 进站绝不出声：只有卡片播放按钮、音乐库播放按钮或 BackgroundMusic.play()
 * 能起播。别再挂「首次交互即播放」的 document 监听（以前试过，用户否掉了）。
 */
(function () {
    'use strict';

    /* 本脚本所在目录。拼音乐库地址时不能拿 location.href 当基准：
       文章页的地址是 /posts/<id>/，相对路径会被解析到文章目录下。 */
    const SCRIPT_BASE = (function () {
        const current = document.currentScript;
        try {
            if (current && current.src) return new URL('./', current.src);
        } catch (e) {
            /* 拿不到就退回当前文档下的 js/，至少本地预览能用 */
        }
        return new URL('js/', document.baseURI);
    })();

    /* 站点根。曲目 src 如果写成相对路径（比如 music/audio/x.mp3），
       统一按站点根解析 —— 否则从 /posts/<id>/ 打开时会变成
       /posts/<id>/music/audio/…。绝对 URL 不受影响。 */
    const SITE_ROOT = new URL('../', SCRIPT_BASE);

    function resolveTrackSrc(src) {
        try {
            return new URL(src, SITE_ROOT).href;
        } catch (e) {
            return src;
        }
    }

    /* 兜底曲目：正常情况下读 js/music-tracks.js。
       这里保留一份是防止有人误删配置文件 —— 卡片至少还能播原来那首。 */
    const FALLBACK_TRACKS = [{
        title: '2020中秋节-活动BGM',
        artist: '第五人格',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/46339020#'
    }];

    const configuredTracks = Array.isArray(window.MUSIC_TRACKS) && window.MUSIC_TRACKS.length
        ? window.MUSIC_TRACKS
        : FALLBACK_TRACKS;

    /* 没有 src 的条目直接丢掉：留着会在切歌时抛 NotSupportedError，
       表现成「点了下一首就没声」，很难查。 */
    const musicList = configuredTracks.filter(function (track) {
        return track && typeof track.src === 'string' && track.src.trim();
    });

    const PREF_KEY = 'backgroundMusicEnabled';
    const VOLUME_KEY = 'annie-music-volume';
    const MODE_KEY = 'annie-music-modes';

    // 播放状态
    let currentIndex = 0;
    let isPlaying = false;
    /* 只当记账用：记住「上次是播着还是停着的」，不参与要不要起播的判断。
       起播判断一律看 isPlaying —— 见 toggleMusic。 */
    let isEnabled = false;
    /* 用户有没有主动按下过播放。切歌 / 重试靠它决定要不要接着播。 */
    let hasUserInteracted = false;
    let retryCount = 0;
    const maxRetries = 3;

    /* 上一档非零音量。静音后点「取消静音」恢复到它。 */
    let lastVolume = 30;

    // 播放模式
    let shuffleEnabled = false;
    let repeatMode = 'all'; // 'all' 列表循环 | 'one' 单曲循环 | 'off' 播完即停

    // 卡片 DOM
    let musicCardToggle = null;
    let musicCardCollapse = null;
    let musicVolumeToggle = null;
    let musicVolumeSlider = null;
    let musicPlayerPercent = null;
    let musicProgressBar = null;
    let musicCurrentTime = null;
    let musicDuration = null;
    let musicPlayerCard = null;
    let musicCardTitle = null;
    let musicCardArtist = null;
    let isCollapsed = false;

    // 播放引擎只创建一个 audio，卡片和音乐库共用
    const audio = new Audio();
    audio.volume = 0.3;
    /* 循环交给 repeatMode 处理（单曲循环 / 列表循环 / 不循环），
       这里不再开 audio.loop —— 开了之后 ended 事件不会触发，模式就失效了。 */
    audio.loop = false;
    /* 不预加载：默认 preload='auto' + 进页面就赋值，会让每个访客先拉一遍音频
       （实测首页两个音频请求），而真正要听的人才会按下播放。
       改成第一次要播时才设 src —— 见 ensureAudioSrc()。

       缓存：这里**不做**自定义 blob / Cache API 缓存。音频的缓存由浏览器按
       源站的 HTTP 缓存头决定；跨域直链（尤其是没有 Cache-Control 的网盘直链）
       没法可靠地本地缓存。能确定省下的流量是「进站不预加载」这一笔；
       想进一步省，把音频放 music/audio/ 走同源缓存（见 music-tracks.js 注释）。 */
    audio.preload = 'none';

    /* ==================== 状态与订阅 ==================== */

    function getState() {
        const track = musicList[currentIndex] || null;
        const duration = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : cachedDuration(track);
        return {
            index: currentIndex,
            track: track,
            playing: isPlaying,
            enabled: isEnabled,
            time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
            duration: duration,
            volume: audio.muted ? 0 : Math.round(audio.volume * 100),
            muted: audio.muted,
            shuffle: shuffleEnabled,
            repeat: repeatMode,
            count: musicList.length
        };
    }

    const stateListeners = new Set();

    /* 订阅播放状态。回调签名 (type, state)，type 是 'init' | 'state' | 'time'。
       返回取消订阅的函数。音乐库打开时订阅、关闭时退订，平时零开销。 */
    function subscribe(listener) {
        if (typeof listener !== 'function') return function () {};
        stateListeners.add(listener);
        try {
            listener('init', getState());
        } catch (error) {
            console.warn('音乐状态订阅回调出错:', error);
        }
        return function () {
            stateListeners.delete(listener);
        };
    }

    /* 统一出口：先把卡片 UI 补齐，再通知音乐库。
       卡片可能被音乐库的操作影响（换歌、调音量），所以非时间类事件都要重刷卡片。 */
    function notify(type) {
        if (type !== 'time') {
            updateMusicCard();
            updateToggleButtons();
            syncVolumeUI();
            updatePlaybackProgress();
        }
        if (!stateListeners.size) return;
        const state = getState();
        stateListeners.forEach(function (listener) {
            try {
                listener(type, state);
            } catch (error) {
                console.warn('音乐状态订阅回调出错:', error);
            }
        });
    }

    /* ==================== 预加载联动 ==================== */

    /* 预加载模块（js/music-preload.js）只负责「首屏后把每首的时长拿到」，
       播放仍然走这里唯一那个 audio 元素。
       它不在时（例如独立页没来得及引、或者被拦截）全部退化成原来的行为。 */
    function preloadModule() {
        return window.MusicPreload || null;
    }

    /* audio 还没设 src 时 duration 是 NaN，这时用预加载记下的时长兜底，
       卡片和音乐库才不至于一直显示 00:00。 */
    function cachedDuration(track) {
        const preload = preloadModule();
        if (!preload || !track) return 0;
        return preload.duration(track.src);
    }

    function registerPreload() {
        const preload = preloadModule();
        if (!preload || typeof preload.register !== 'function') return;

        /* 当前曲目优先；其余等首屏后由模块自己串行探 */
        preload.register(musicList, { priorityIndex: currentIndex });

        /* 探到一首就把卡片时长补上。只在 audio 还给不出真实时长时才刷新，
           播放开始后 audio.duration 才是唯一来源。 */
        preload.subscribe(function (detail) {
            if (!detail || detail.status !== 'ready') return;
            if (Number.isFinite(audio.duration) && audio.duration > 0) return;
            const track = musicList[currentIndex];
            if (!track) return;
            if (preload.get(track.src).status !== 'ready') return;
            updatePlaybackProgress();
            notify('state');
        });
    }

    /* 用户真播了以后，把 <audio> 拿到的真实时长回写给预加载器 ——
       比后台探测可靠，下次进站连探测都省了。 */
    function recordRealDuration() {
        const preload = preloadModule();
        const track = musicList[currentIndex];
        if (!preload || !track) return;
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        preload.set(track.src, audio.duration);
    }

    /* 悬停 / 聚焦播放键 = 即将播放，插队把这首先探出来，别等后台轮次。 */
    function preloadCurrentSoon() {
        const preload = preloadModule();
        const track = musicList[currentIndex];
        if (!preload || !track || typeof preload.ensure !== 'function') return;
        preload.ensure(track.src);
    }

    /* ==================== 音频源 ==================== */

    /* 第一次播之前必须调一次：没有 src 直接 play() 会抛 NotSupportedError。
       已经有 src 就什么都不做（切歌走 loadTrack，那里自己会换）。 */
    function ensureAudioSrc() {
        if (audio.getAttribute('src')) return;
        const track = musicList[currentIndex];
        if (!track) return;
        audio.src = resolveTrackSrc(track.src);
    }

    /* 切到指定曲目。
       autoplay=true 表示「切过去就播」（列表点击、播完自动下一首）；
       false 表示只换歌、保持暂停（暂停状态下按下一首）。 */
    function loadTrack(index, autoplay) {
        const count = musicList.length;
        if (!count) return;

        /* 用户开始操作音乐了：后台预加载让位，别和真正的播放抢带宽 */
        const preload = preloadModule();
        if (preload && preload.pause) preload.pause();

        currentIndex = ((index % count) + count) % count;
        retryCount = 0;

        const track = musicList[currentIndex];
        audio.src = resolveTrackSrc(track.src);

        /* 先落状态再通知，否则卡片会先闪一下「播放」再变成「暂停」 */
        if (autoplay) {
            hasUserInteracted = true;
            isEnabled = true;
            saveUserPreference();
        }

        updateMusicCard();
        notify('state');

        if (!autoplay) return;

        audio.play().then(function () {
            hideAudioError();
        }).catch(function (error) {
            console.warn('播放失败:', error);
            handlePlayRejection(error);
        });
    }

    /* 随机时避开当前这首；只有一首时直接返回 0。 */
    function pickNextIndex(step) {
        const count = musicList.length;
        if (count <= 1) return 0;
        if (shuffleEnabled) {
            let next = currentIndex;
            while (next === currentIndex) {
                next = Math.floor(Math.random() * count);
            }
            return next;
        }
        return (currentIndex + step + count) % count;
    }

    /* 下一首。autoplay 省略时跟随当前是否在播。 */
    function playNext(autoplay) {
        if (!musicList.length) return;
        const shouldPlay = autoplay === undefined ? isPlaying : !!autoplay;
        loadTrack(pickNextIndex(1), shouldPlay);
    }

    /* 上一首。播放超过 3 秒时先回到本首开头（和常见播放器一致）。 */
    function playPrev() {
        if (!musicList.length) return;
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            updatePlaybackProgress();
            notify('time');
            return;
        }
        loadTrack(pickNextIndex(-1), isPlaying);
    }

    function playMusic() {
        if (!musicList.length) return;
        hasUserInteracted = true;
        isEnabled = true;
        saveUserPreference();
        audio.muted = false;

        /* 用户按下播放，后台预加载就此停手：剩下的曲目不再往下探，
           把带宽全留给这一首。hover 别首时仍会单点插队（见 preloadCurrentSoon）。 */
        const preload = preloadModule();
        if (preload && preload.pause) preload.pause();

        /* 上次把音量拖到 0 时会记住 0，直接 play 是没声音的；
           按「取消静音」的语义恢复到上一档。 */
        if (audio.volume === 0) {
            audio.volume = (lastVolume || 30) / 100;
        }
        ensureAudioSrc();
        audio.play().then(function () {
            hideAudioError();
        }).catch(function (error) {
            console.warn('开启音乐失败:', error);
            handlePlayRejection(error);
        });
        updateToggleButtons();
        notify('state');
    }

    function pauseMusic() {
        isEnabled = false;
        saveUserPreference();
        audio.pause();
        updateToggleButtons();
        notify('state');
    }

    /* 播放按钮只有一个含义：没在播就播，在播就停。
       别用 isEnabled 反推 —— 它只是「上次停在哪」的记账，
       拿它当条件的话，刷新后第一次点按钮会变成「关」而不是「播」。 */
    function toggleMusic() {
        if (isPlaying) {
            pauseMusic();
            return;
        }
        playMusic();
    }

    /* ==================== 卡片 UI ==================== */

    function cacheCardDom() {
        musicCardToggle = document.getElementById('musicCardToggle');
        musicCardCollapse = document.getElementById('musicCardCollapse');
        musicVolumeToggle = document.getElementById('musicVolumeToggle');
        musicVolumeSlider = document.getElementById('musicVolumeSlider');
        musicPlayerPercent = document.getElementById('musicPlayerPercent');
        musicProgressBar = document.getElementById('musicProgressBar');
        musicCurrentTime = document.getElementById('musicCurrentTime');
        musicDuration = document.getElementById('musicDuration');
        musicPlayerCard = document.getElementById('musicPlayerCard');
        musicCardTitle = document.getElementById('musicCardTitle');
        musicCardArtist = document.getElementById('musicCardArtist');
    }

    function applyCollapseState() {
        if (!musicPlayerCard || !musicCardCollapse) return;
        musicPlayerCard.classList.toggle('collapsed', isCollapsed);
        const icon = musicCardCollapse.querySelector('i');
        if (icon) {
            icon.className = isCollapsed ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line';
        }
        musicCardCollapse.setAttribute('aria-label', isCollapsed ? '展开播放器' : '收起播放器');
    }

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
        applyCollapseState();
    }

    function updateMusicCard() {
        const track = musicList[currentIndex];
        if (!track) return;
        if (musicCardTitle) musicCardTitle.textContent = track.title || '未知曲目';
        if (musicCardArtist) musicCardArtist.textContent = track.artist || '';
    }

    function updateToggleButtons() {
        if (musicCardToggle) {
            const icon = musicCardToggle.querySelector('i');
            if (icon) {
                icon.className = (isEnabled && isPlaying) ? 'ri-pause-line' : 'ri-play-line';
            }
            musicCardToggle.setAttribute('aria-label', (isEnabled && isPlaying) ? '暂停音乐' : '播放音乐');
        }

        if (musicPlayerCard) {
            musicPlayerCard.classList.toggle('playing', isEnabled && isPlaying);
        }
    }

    /* ==================== 进度 / 时间 ==================== */

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    function updatePlaybackProgress() {
        if (!musicProgressBar || !musicCurrentTime || !musicDuration) return;

        /* 播放前 audio.duration 是 NaN，用预加载记下的时长兜底，
           卡片上就不会一直挂着 00:00 */
        const audioDuration = audio.duration;
        const duration = Number.isFinite(audioDuration) && audioDuration > 0
            ? audioDuration
            : cachedDuration(musicList[currentIndex]);
        const currentTime = audio.currentTime || 0;
        const progress = Number.isFinite(duration) && duration > 0
            ? Math.min((currentTime / duration) * 100, 100)
            : 0;

        musicProgressBar.style.width = `${progress}%`;
        musicCurrentTime.textContent = formatTime(currentTime);
        musicDuration.textContent = formatTime(duration);
    }

    /* ==================== 音量 ==================== */

    function syncVolumeUI() {
        if (!musicVolumeSlider || !musicVolumeToggle || !musicPlayerPercent) return;

        const volumeValue = audio.muted ? 0 : Math.round(audio.volume * 100);
        musicVolumeSlider.value = String(volumeValue);
        musicVolumeSlider.style.setProperty('--volume-percent', `${volumeValue}%`);
        musicPlayerPercent.textContent = `${volumeValue}%`;

        const icon = musicVolumeToggle.querySelector('i');
        if (!icon) return;

        if (volumeValue === 0 || audio.muted) {
            icon.className = 'ri-volume-mute-line';
            musicVolumeToggle.setAttribute('aria-label', '开启声音');
        } else if (volumeValue < 50) {
            icon.className = 'ri-volume-down-line';
            musicVolumeToggle.setAttribute('aria-label', '静音');
        } else {
            icon.className = 'ri-volume-up-line';
            musicVolumeToggle.setAttribute('aria-label', '静音');
        }
    }

    function saveVolume() {
        try {
            const value = Math.round(audio.volume * 100);
            localStorage.setItem(VOLUME_KEY, String(value));
        } catch (e) {
            console.warn('无法保存音量设置:', e);
        }
    }

    /* 音乐库的音量滑块和卡片的滑块都走这里，保证两边一致。 */
    function setVolumePercent(value, options) {
        const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        const shouldMute = (options && options.muted === true) || percent === 0;

        if (percent > 0) lastVolume = percent;
        audio.volume = percent / 100;
        audio.muted = shouldMute;

        if (musicVolumeSlider) {
            musicVolumeSlider.dataset.lastVolume = String(lastVolume || 30);
        }
        saveVolume();
        syncVolumeUI();
        notify('state');
    }

    function toggleMute() {
        if (audio.muted || audio.volume === 0) {
            setVolumePercent(lastVolume || 30, { muted: false });
        } else {
            lastVolume = Math.round(audio.volume * 100) || lastVolume;
            setVolumePercent(0, { muted: true });
        }
    }

    function handleVolumeChange(event) {
        const value = Number(event.target.value || 0);
        setVolumePercent(value);
        if (event.target) {
            event.target.dataset.lastVolume = String(value === 0 ? (lastVolume || 30) : value);
        }
    }

    /* ==================== 播放模式 ==================== */

    function saveModes() {
        try {
            localStorage.setItem(MODE_KEY, JSON.stringify({
                shuffle: shuffleEnabled,
                repeat: repeatMode
            }));
        } catch (e) {
            /* 存不了就算了，模式只在本次会话有效 */
        }
    }

    function setShuffle(enabled) {
        shuffleEnabled = !!enabled;
        saveModes();
        notify('state');
    }

    function setRepeat(mode) {
        if (mode !== 'all' && mode !== 'one' && mode !== 'off') return;
        repeatMode = mode;
        saveModes();
        notify('state');
    }

    function cycleRepeat() {
        repeatMode = repeatMode === 'all' ? 'one' : (repeatMode === 'one' ? 'off' : 'all');
        saveModes();
        notify('state');
    }

    /* ==================== 偏好 ==================== */

    function saveUserPreference() {
        try {
            localStorage.setItem(PREF_KEY, isEnabled.toString());
        } catch (e) {
            console.warn('无法保存音乐设置:', e);
        }
    }

    /* 只读回「音量 / 播放模式 / 上次是否播着」这类偏好，不负责起播。 */
    function loadUserPreference() {
        try {
            const saved = localStorage.getItem(PREF_KEY);
            if (saved !== null) {
                isEnabled = saved === 'true';
            }

            const volumeRaw = localStorage.getItem(VOLUME_KEY);
            if (volumeRaw !== null) {
                const volume = Number(volumeRaw);
                if (Number.isFinite(volume) && volume >= 0 && volume <= 100) {
                    audio.volume = volume / 100;
                    audio.muted = volume === 0;
                    if (volume > 0) lastVolume = volume;
                }
            }

            const modesRaw = localStorage.getItem(MODE_KEY);
            if (modesRaw) {
                const modes = JSON.parse(modesRaw);
                if (modes && typeof modes === 'object') {
                    shuffleEnabled = !!modes.shuffle;
                    if (modes.repeat === 'all' || modes.repeat === 'one' || modes.repeat === 'off') {
                        repeatMode = modes.repeat;
                    }
                }
            }
        } catch (e) {
            console.warn('无法加载音乐设置:', e);
        }
    }

    /* ==================== 音频事件 ==================== */

    /* play() 的 Promise 在「用户又点了下一首」时会被拒绝（AbortError），
       这不是播放失败，不能弹「流量限制」—— 快速切歌很容易触发。 */
    function handlePlayRejection(error) {
        if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
            console.warn('本次播放被新的加载或浏览器策略打断:', error.name);
            return;
        }
        handleAudioError(error);
    }

    function handleAudioError(event) {
        console.warn('音乐播放失败:', event);

        /* 用户主动切歌 / 暂停会让正在进行的加载中止，这不是错误。 */
        if (event && (event.name === 'AbortError' || event.name === 'NotAllowedError')) return;

        const errorCode = event && event.target && event.target.error
            ? event.target.error.code
            : null;

        // MEDIA_ERR_ABORTED：加载被主动中止，同样不用提示
        if (errorCode === 1) return;

        // 网络 / 解码 / 源不支持：可能是临时限流，重试几次
        if (errorCode === 2 || errorCode === 3 || errorCode === 4) {
            retryCount++;
            if (retryCount <= maxRetries) {
                console.log(`尝试重试播放 (${retryCount}/${maxRetries})`);
                setTimeout(function () {
                    audio.load();
                    if (hasUserInteracted && isEnabled) {
                        audio.play().catch(handlePlayRejection);
                    }
                }, 2000);
            } else {
                showTrafficLimitMessage();
            }
            return;
        }

        showTrafficLimitMessage();
    }

    function showTrafficLimitMessage() {
        if (document.getElementById('trafficLimitMsg')) return;

        const message = document.createElement('div');
        message.id = 'trafficLimitMsg';
        message.className = 'audio-error-toast';
        message.innerHTML = `
            <button type="button" class="audio-error-close" aria-label="关闭错误提示">
                <i class="ri-close-line"></i>
            </button>
            <p class="audio-error-message">
                <i class="ri-error-warning-line" aria-hidden="true"></i>
                <span>音乐无法播放：直链可能已失效或被限流，请换一首或稍后重试</span>
            </p>
        `;

        message.querySelector('.audio-error-close').addEventListener('click', function () {
            message.remove();
        });
        document.body.appendChild(message);

        setTimeout(function () {
            if (message.parentElement) message.remove();
        }, 50000);
    }

    function hideAudioError() {
        const message = document.getElementById('trafficLimitMsg');
        if (message) message.remove();
    }

    function onEnded() {
        if (!musicList.length) return;

        if (repeatMode === 'one') {
            audio.currentTime = 0;
            if (hasUserInteracted) {
                audio.play().catch(handlePlayRejection);
            }
            return;
        }

        if (repeatMode === 'off' && !shuffleEnabled && currentIndex >= musicList.length - 1) {
            isPlaying = false;
            isEnabled = false;
            saveUserPreference();
            updateToggleButtons();
            notify('state');
            return;
        }

        playNext(true);
    }

    function setupAudioEvents() {
        audio.addEventListener('ended', onEnded);

        audio.addEventListener('play', function () {
            isPlaying = true;
            hideAudioError();
            notify('state');
        });

        audio.addEventListener('pause', function () {
            isPlaying = false;
            notify('state');
        });

        audio.addEventListener('timeupdate', function () {
            updatePlaybackProgress();
            notify('time');
        });

        audio.addEventListener('loadedmetadata', function () {
            recordRealDuration();
            updatePlaybackProgress();
            notify('state');
        });

        audio.addEventListener('durationchange', function () {
            recordRealDuration();
            updatePlaybackProgress();
            notify('state');
        });

        audio.addEventListener('volumechange', function () {
            saveVolume();
            syncVolumeUI();
            notify('state');
        });

        audio.addEventListener('error', handleAudioError);
    }

    function setupCardEvents() {
        if (musicCardToggle) {
            musicCardToggle.addEventListener('click', toggleMusic);
            /* 鼠标移上播放键 = 即将要播，插队把这首先探出来。
               只认鼠标：触屏的 pointerenter 会在点击前触发，白跑一趟。 */
            musicCardToggle.addEventListener('pointerenter', function (event) {
                if (event.pointerType && event.pointerType !== 'mouse') return;
                preloadCurrentSoon();
            });
            musicCardToggle.addEventListener('focus', preloadCurrentSoon);
        }
        if (musicCardCollapse) musicCardCollapse.addEventListener('click', toggleCollapse);
        if (musicVolumeToggle) musicVolumeToggle.addEventListener('click', toggleMute);
        if (musicVolumeSlider) musicVolumeSlider.addEventListener('input', handleVolumeChange);

        /* 列表图标是真实链接（no-JS 时去独立页面）；JS 在时拦成弹窗。 */
        const libraryEntry = document.getElementById('musicCardLibrary');
        if (libraryEntry) {
            libraryEntry.addEventListener('click', function (event) {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                openMusicModal(libraryEntry);
            });
        }
    }

    /* ==================== 音乐库弹窗按需加载 ==================== */

    const MODAL_SCRIPT_URL = new URL('../music/modal.js', SCRIPT_BASE).href;
    const MODAL_STYLE_URL = new URL('../music/modal.css', SCRIPT_BASE).href;
    let modalPromise = null;
    let modalStylePromise = null;

    function loadModalStyle() {
        if (modalStylePromise) return modalStylePromise;
        modalStylePromise = new Promise(function (resolve, reject) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = MODAL_STYLE_URL;
            link.setAttribute('data-music-modal-style', '');
            link.onload = function () { resolve(); };
            link.onerror = function () { reject(new Error('音乐库弹窗样式加载失败')); };
            document.head.appendChild(link);
        }).catch(function (error) {
            modalStylePromise = null;
            throw error;
        });
        return modalStylePromise;
    }

    function loadModalScript(src) {
        return new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.setAttribute('data-music-modal-script', '');
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('音乐库弹窗脚本加载失败：' + src)); };
            document.head.appendChild(script);
        });
    }

    function ensureMusicModal() {
        if (window.MusicModal) return Promise.resolve(window.MusicModal);
        if (modalPromise) return modalPromise;

        modalPromise = Promise.all([
            loadModalStyle(),
            loadModalScript(MODAL_SCRIPT_URL)
        ]).then(function () {
            if (!window.MusicModal) throw new Error('音乐库弹窗未注册 window.MusicModal');
            return window.MusicModal;
        }).catch(function (error) {
            modalPromise = null;
            throw error;
        });

        return modalPromise;
    }

    function openMusicModal(trigger) {
        /* 打开音乐库说明用户想挑歌了，后台预加载可以继续（换首时同样会插队） */
        const preload = preloadModule();
        if (preload && preload.resume) preload.resume();

        ensureMusicModal().then(function (modal) {
            modal.open(trigger);
        }).catch(function (error) {
            /* 弹窗资源挂了就退回独立页面，别让人点在原地没反应 */
            console.warn('音乐库弹窗加载失败，改用独立页面:', error);
            const href = trigger && trigger.getAttribute ? trigger.getAttribute('href') : '';
            if (href) window.location.href = href;
        });
    }

    /* ==================== 初始化 ==================== */

    function initBackgroundMusic() {
        cacheCardDom();
        setupCardEvents();

        if (!musicList.length) {
            console.warn('音乐列表为空：检查 js/music-tracks.js 里的 src 是否填写。');
            return;
        }

        loadUserPreference();
        updateMusicCard();
        syncVolumeUI();
        applyCollapseState();
        setupAudioEvents();
        updateToggleButtons();

        /* 卡片初始的 00:00 先用上次探测到的时长填上 */
        updatePlaybackProgress();

        /* 把曲目交给预加载器：首屏 load 之后它才会动，这里只是登记 */
        registerPreload();

        /* 这里**不**设 audio.src。音频推迟到真要播的时候才加载，见 ensureAudioSrc()。 */
        console.log('🎵 后台音乐系统已加载');
    }

    /* ==================== 公开接口 ==================== */

    window.BackgroundMusic = {
        play: playMusic,
        pause: pauseMusic,
        toggle: toggleMusic,

        next: function () { playNext(isPlaying); },
        prev: playPrev,
        select: function (index, autoplay) { loadTrack(index, autoplay !== false); },
        seek: function (seconds) {
            const duration = audio.duration;
            if (!Number.isFinite(duration) || duration <= 0) return;
            audio.currentTime = Math.max(0, Math.min(duration, Number(seconds) || 0));
            updatePlaybackProgress();
            notify('time');
        },

        setVolume: setVolumePercent,
        setMuted: function (muted) {
            setVolumePercent(muted ? 0 : (lastVolume || 30), { muted: !!muted });
        },
        toggleMute: toggleMute,

        setShuffle: setShuffle,
        setRepeat: setRepeat,
        cycleRepeat: cycleRepeat,

        /* 返回浅拷贝并补上预加载到的时长：
           直接把 musicList 的元素抛出去的话，调用方往上加字段会污染曲目数据。 */
        getTracks: function () {
            const preload = preloadModule();
            return musicList.map(function (track) {
                const copy = Object.assign({}, track);
                copy.duration = preload ? preload.duration(track.src) : 0;
                return copy;
            });
        },
        getState: getState,
        subscribe: subscribe,

        getCurrentTrack: function () { return musicList[currentIndex]; },
        isPlaying: function () { return isPlaying; },
        isEnabled: function () { return isEnabled; }
    };

    window.addEventListener('message', function (event) {
        const movieFrame = document.getElementById('movieFrame');
        if (event.source !== movieFrame?.contentWindow ||
            event.data?.type !== 'background-music-pause') {
            return;
        }

        window.BackgroundMusic.pause();
    });

    initBackgroundMusic();
})();
