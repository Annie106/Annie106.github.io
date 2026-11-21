/* ==================== 外链确认弹窗（全站通用） ====================

   用法就两步：

     1. 页面里引一行（路径按页面层级写，页面照常引 css/style.css 就有样式）：
          <script src="js/leave-confirm.js"></script>
        index.html 里放在 script.js 之前就行。

     2. 给要拦的外链加属性：
          <a href="https://github.com/Annie106" target="_blank" rel="noopener noreferrer"
             data-confirm-leave="GitHub">GitHub</a>

        data-confirm-leave 的值 = 弹窗里出现的站点名（省略就当「外部网站」）；
        data-confirm-title / data-confirm-desc 可选，用来覆盖整句文案。

   为什么单独拆一个文件：这套逻辑以前长在 script.js 里，只有引了 script.js 的
   首页能用。guide.html、contact.html 这类独立页也写了 data-confirm-leave，
   结果属性静默失效 —— 点了直接跳走，看不出错。现在全站只有这一份实现，
   SPA 和独立页都引它。样式仍在 css/style.css 的「离开本站前的确认弹窗」一节。

   ⚠️ 弹窗建在「最顶层的同源文档」里，不是当前脚本所在的文档。
   guide.html 会被 ?view=embed 用 iframe 内嵌，而那个 iframe 的高度等于整篇
   文章，position: fixed 相对它 → 弹窗会落到半篇文章以外。和目录
   （initGuideToc）踩的是同一个坑，处理方式也一样：挂到父文档去。

   ⚠️ 确认后靠「重放点击」跳转，href / target 一个字符不改，所以还是原来的
   跳转、还是新标签页。重放的那一次点击要在元素上挂 __leaveConfirmPass 让本
   文件的监听放行 —— 跨文档时（父页的弹窗点「继续」、链接在子文档里）只有
   挂在元素上的标记是两边都看得见的。

   ⚠️ Ctrl / Cmd / Shift / Alt 和中键不拦：那是用户明确要新窗口/新标签，
   交回浏览器自己处理（和文章里「问题反馈」的约定一致）。

   ================================================================= */
(function () {
    'use strict';

    // 同一个文档重复加载时直接退出，别绑两遍监听（会弹两次窗）
    if (window.LeaveConfirm) return;

    /* 淡出时长（ms），必须和 css/style.css 里 .leave-confirm 的
       --leave-confirm-fade 对齐：这边等动画走完才真正 hidden */
    var FADE_MS = 180;

    /* 最顶层的同源窗口。跨域、或父页文档还没就绪，就停在当前这一层 */
    function topWindow() {
        var win = window;
        while (win.parent && win.parent !== win) {
            try {
                // 跨域时读 parent.document 会抛异常，借这一下判断能不能挂过去
                if (!win.parent.document.body) break;
            } catch (error) {
                break;
            }
            win = win.parent;
        }
        return win;
    }

    var hostWin = topWindow();
    var hostDoc = hostWin.document;

    /* 外层已经有一份（guide.html 被 SPA 内嵌时就是这种）：共用同一份，
       不再在父文档里建第二个弹窗，也不再各记一套状态 */
    if (hostWin !== window && hostWin.LeaveConfirm) {
        window.LeaveConfirm = hostWin.LeaveConfirm;
        bindDocument(window.document);
        return;
    }

    var els = null;
    var trigger = null;
    var hideTimer = null;
    var closing = false;
    /* 这一次是键盘点开的还是鼠标点开的：决定焦点落在「继续」上还是卡片上 */
    var openedByKeyboard = false;

    function ensureDialog() {
        if (els) return els;

        var wrap = hostDoc.createElement('div');
        wrap.className = 'leave-confirm';
        wrap.hidden = true;
        wrap.innerHTML = [
            '<div class="leave-confirm-backdrop" data-leave-cancel></div>',
            /* tabindex="-1" 是给「鼠标点开」时用的焦点落点：
               焦点必须在浮层里，否则 Tab 会跑到背后页面上；
               但落在卡片上又不会画出聚焦环（CSS 里把它的 outline 关了） */
            '<div class="leave-confirm-card" role="dialog" aria-modal="true" tabindex="-1"',
            '     aria-labelledby="leaveConfirmTitle" aria-describedby="leaveConfirmDesc">',
            '<h2 class="leave-confirm-title" id="leaveConfirmTitle"></h2>',
            '<p class="leave-confirm-desc" id="leaveConfirmDesc"></p>',
            '<div class="leave-confirm-actions">',
            '<button type="button" class="leave-confirm-btn is-ghost" data-leave-cancel>取消</button>',
            '<button type="button" class="leave-confirm-btn is-primary" data-leave-continue>继续</button>',
            '</div>',
            '</div>'
        ].join('');
        hostDoc.body.appendChild(wrap);

        els = {
            wrap: wrap,
            card: wrap.querySelector('.leave-confirm-card'),
            title: wrap.querySelector('#leaveConfirmTitle'),
            desc: wrap.querySelector('#leaveConfirmDesc'),
            continueBtn: wrap.querySelector('[data-leave-continue]'),
            cancelBtn: wrap.querySelector('[data-leave-cancel]:not(.leave-confirm-backdrop)')
        };

        wrap.addEventListener('click', function (event) {
            if (event.target.closest('[data-leave-continue]')) {
                close(true);
                return;
            }
            if (event.target.closest('[data-leave-cancel]')) close(false);
        });

        /* 焦点只在这两个按钮之间转：浮层是 aria-modal，焦点跑到背后页面上
           时读屏软件会念错内容（同搜索面板的处理）。
           ⚠️ 这里必须用 hostDoc.activeElement：弹窗可能挂在父文档里，
           而这段闭包活在子文档的 realm 里，document.activeElement 是错的。 */
        wrap.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
                return;
            }
            if (event.key !== 'Tab') return;
            var list = [els.cancelBtn, els.continueBtn];
            var index = list.indexOf(hostDoc.activeElement);
            event.preventDefault();
            if (index === -1) {
                list[0].focus();
            } else if (event.shiftKey) {
                list[(index - 1 + list.length) % list.length].focus();
            } else {
                list[(index + 1) % list.length].focus();
            }
        });

        return els;
    }

    /* 关窗前先播一段淡出，动画走完才真正 hidden */
    function playOut() {
        closing = true;
        els.wrap.classList.add('is-closing');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () {
            hideTimer = null;
            closing = false;
            els.wrap.classList.remove('is-closing');
            els.wrap.hidden = true;
        }, FADE_MS);
    }

    function open(node, name, byKeyboard) {
        var dialog = ensureDialog();
        var site = name || '外部网站';
        /* 默认文案就够用；个别链接（比如 RSS）想说得具体一点，
           用 data-confirm-title / data-confirm-desc 覆盖，
           这样不用为每个按钮单开一套弹窗逻辑 */
        var customTitle = node && node.getAttribute('data-confirm-title');
        var customDesc = node && node.getAttribute('data-confirm-desc');
        dialog.title.textContent = customTitle || ('即将前往 ' + site);
        dialog.desc.textContent = customDesc || ('即将离开当前页面，前往 ' + site + '，是否继续？');
        trigger = node || null;
        openedByKeyboard = Boolean(byKeyboard);
        // 上一轮如果还在淡出（快速点了取消又马上再点），先清掉收尾任务，
        // 否则新弹窗会接着往下演
        clearTimeout(hideTimer);
        hideTimer = null;
        closing = false;
        dialog.wrap.classList.remove('is-closing');
        dialog.wrap.hidden = false;
        /* 键盘点开的（Enter / 空格）：焦点直接落到「继续」上，顺手有一圈
           聚焦环，键盘用户靠它知道回车会去哪儿；
           鼠标点开的只把焦点兜在卡片上（不然 Tab 会跑到背后页面），
           不往那枚深色实心按钮上放 —— 它外面顶一圈同色描边，看着就是
           「按钮旁边多了一条黑边」，用户报过。 */
        if (openedByKeyboard) {
            dialog.continueBtn.focus();
        } else {
            dialog.card.focus({ preventScroll: true });
        }
    }

    function close(confirmed) {
        // 淡出过程中再点一下（比如连点取消）直接忽略，
        // 否则会重复起动画、还会把「继续」的跳转吞掉
        if (!els || els.wrap.hidden || closing) return;
        var node = trigger;
        var byKeyboard = openedByKeyboard;
        trigger = null;

        if (confirmed && node && node.href) {
            /* 继续：重放「刚才那一次点击」。href / target 都没动过，
               所以还是原来的跳转、还是新标签页。这里必须是同步调用
               （不在 Promise 里），否则部分移动浏览器会认为已经不是
               用户手势，把新标签页拦掉。 */
            node.__leaveConfirmPass = true;
            try {
                node.click();
            } finally {
                node.__leaveConfirmPass = false;
            }
        }

        // 焦点还给触发链接：键盘用户不用等动画走完才能继续。
        // 鼠标点开的就不还了 —— 焦点回到外链图标上，图标又会顶一圈聚焦环
        if (byKeyboard && node && typeof node.focus === 'function') {
            node.focus({ preventScroll: true });
        }
        playOut();
    }

    window.LeaveConfirm = { open: open, close: close };
    // 让父页（以及后续加载的兄弟文档）认这一份，避免一个文档里俩弹窗
    if (hostWin !== window) hostWin.LeaveConfirm = window.LeaveConfirm;

    bindDocument(window.document);

    /* 监听挂在「当前文档」上（不是 hostDoc）：guide.html 被内嵌时，
       它自己的链接还得由它自己这一层拦下来 */
    function bindDocument(doc) {
        doc.addEventListener('click', function (event) {
            var target = event.target;
            var link = target && target.closest ? target.closest('[data-confirm-leave]') : null;
            if (!link) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            if (link.__leaveConfirmPass) {
                link.__leaveConfirmPass = false;
                return;
            }
            event.preventDefault();
            /* detail === 0 是键盘触发的点击（Enter / 空格），
               真实的鼠标点击会带上点击次数（1、2…） */
            window.LeaveConfirm.open(link, link.getAttribute('data-confirm-leave') || '', event.detail === 0);
        });
    }
})();
