    // ==================== 复制提示 ====================
    // 复制成功 / 失败都用页面顶部的轻提示（.site-toast）显示，
    // 不再弹浏览器原生的 alert 对话框。
    //
    // 样式在 css/style.css 的「顶部轻提示」一节，和「链接已复制」
    // 那个提示完全一致：白底卡片、绿色勾图标、导航下方居中、3.6 秒后淡出。
    //
    // 有些页面（比如按指南改出来的子页面）没有 #siteToast 节点，
    // 这里按需创建一个，保证 copyToClipboard() 在哪儿都能用。
    var copyToastTimer = null;
    var copyToastCleanupTimer = null;

    function ensureCopyToast() {
        var toast = document.getElementById('siteToast');
        if (toast) return toast;

        toast = document.createElement('div');
        toast.className = 'site-toast';
        toast.id = 'siteToast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.hidden = true;

        var icon = document.createElement('i');
        icon.className = 'ri-checkbox-circle-line';
        icon.setAttribute('aria-hidden', 'true');

        var text = document.createElement('span');
        text.id = 'siteToastText';

        toast.appendChild(icon);
        toast.appendChild(text);
        document.body.appendChild(toast);
        return toast;
    }

    function showCopyToast(message, isError) {
        var toast = ensureCopyToast();
        var text = document.getElementById('siteToastText');
        if (!toast || !text) return;

        text.textContent = message;
        toast.classList.toggle('is-error', !!isError);
        // 图标要跟着结果换：成功是勾，失败是感叹号
        //（只靠 .is-error 改颜色的话，失败还挂着一个勾，语义是反的）
        var icon = toast.querySelector('i');
        if (icon) {
            icon.className = isError ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
        }

        clearTimeout(copyToastTimer);
        clearTimeout(copyToastCleanupTimer);

        // 上一条还在屏幕上（比如点了微信紧接着点 QQ）：
        // 只换文案会硬切，这里把入场动画重头播一遍。
        // 判断必须放在 hidden = false 之前，否则永远是 false。
        var replaying = !toast.hidden && toast.classList.contains('visible');

        // 先让元素变成 display:flex，并强制一次样式重算，
        // 否则 display:none → flex 和 opacity:0 → 1 会被合并进同一次
        // 样式计算，淡入动画就被跳过了（会硬闪出来）。
        toast.hidden = false;
        void toast.offsetHeight;
        toast.classList.add('visible');

        if (replaying) {
            // 摘类 → 强制重排 → 加回来，@keyframes 才会跳回 0% 重播
            toast.classList.remove('is-replaying');
            void toast.offsetWidth;
            toast.classList.add('is-replaying');
        }

        copyToastTimer = setTimeout(function () {
            toast.classList.remove('visible');
            // 动画类是 fill: both，留着会把 opacity 钉在 1、收不起来
            toast.classList.remove('is-replaying');
            // 等淡出过渡走完再真正隐藏，否则会被 display:none 打断
            copyToastCleanupTimer = setTimeout(function () {
                toast.hidden = true;
            }, 300);
        }, 3600);
    }

    function copyToClipboard(text, message) {
        // 方法一：现代浏览器 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () {
                showCopyToast(message || '已复制', false);
            }).catch(function () {
                fallbackCopy(text, message);
            });
        } else {
            // 方法二：兼容老浏览器 / 非 HTTPS 环境
            fallbackCopy(text, message);
        }
    }

    function fallbackCopy(text, message) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        // execCommand 失败时不一定抛异常，可能只返回 false，
        // 两种都要当成失败，否则会误报「已复制」
        var ok = false;
        try {
            ok = document.execCommand('copy') !== false;
        } catch (err) {
            ok = false;
        }
        document.body.removeChild(textarea);

        if (ok) {
            showCopyToast(message || '已复制', false);
        } else {
            showCopyToast('复制失败，请手动复制：' + text, true);
        }
    }
