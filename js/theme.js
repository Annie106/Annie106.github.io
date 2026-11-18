(function () {
    const STORAGE_KEY = 'annie-theme';
    const root = document.documentElement;
    const btn = document.getElementById('themeToggle');
    const icon = btn ? btn.querySelector('i') : null;

    function getTheme() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') return stored;
        } catch (e) {}
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        /* 手机浏览器地址栏 / 状态栏的颜色跟着实际主题走。
           只用 <meta media="(prefers-color-scheme: dark)"> 是不够的：
           用户手动切过深色之后，系统偏好那套不会跟着变，地址栏会一直是白的。 */
        const themeColorMeta = document.getElementById('themeColorMeta');
        if (themeColorMeta) {
            themeColorMeta.setAttribute('content', theme === 'dark' ? '#0f1115' : '#ffffff');
        }
        if (icon) {
            // 深色模式显示“太阳”图标（点击切回浅色），浅色模式显示“月亮”图标
            icon.className = theme === 'dark' ? 'ri-sun-line' : 'ri-moon-line';
        }
        if (btn) {
            btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
        }
        const embeddedPageFrame = document.getElementById('embeddedPageFrame');
        if (embeddedPageFrame && embeddedPageFrame.contentWindow) {
            embeddedPageFrame.contentWindow.postMessage({ type: 'annie-theme', theme: theme }, '*');
        }
        /* 页面上可能同时挂着两个 giscus iframe（文章正文下那块 + 评论视图那块），
           要全部同步，只取第一个的话另一个会停在旧主题上 */
        document.querySelectorAll('.giscus-frame').forEach(function (giscusFrame) {
            if (!giscusFrame.contentWindow) return;
            giscusFrame.contentWindow.postMessage(
                {
                    giscus: {
                        setConfig: {
                            theme: theme,
                        },
                    },
                },
                'https://giscus.app'
            );
        });
    }

    function init() {
        applyTheme(getTheme());

        const embeddedPageFrame = document.getElementById('embeddedPageFrame');

        if (btn) {
            btn.addEventListener('click', function () {
                const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                applyTheme(next);
                try {
                    localStorage.setItem(STORAGE_KEY, next);
                } catch (e) {}
            });
        }

        // 用户未手动选择主题时，跟随系统主题变化
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                try {
                    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(e.matches ? 'dark' : 'light');
                } catch (err) {}
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
