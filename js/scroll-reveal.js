/* 独立页 / 内嵌页的「滚动出现」。
   首页那套在 js/script.js 里（SPA 专用），article_14_baidu / manor_photo /
   guide 这些页面不引 script.js，所以各带一份这个。用法只有一行：

     <script src="../../js/scroll-reveal.js"
             data-reveal-targets=".post-head, .post-body > *"></script>

   三条和主站一致的规矩：
   1. 隐藏态 .is-reveal-hidden 只在本脚本里加。脚本没跑到 / 报错 / 访客禁了 JS，
      页面就是普通的全可见页面，不会白屏。
   2. 只有「整个元素都在视口下方」才藏；首屏露出一像素就算已出现，首屏永远立刻可读。
   3. 出现过就打 data-reveal="in"，不再观察，来回滚动不重播。

   ⚠️ 内嵌模式（被文章页用 iframe 打开）要单独算：iframe 的高度就是整篇内容的高度，
      它自己的 viewport 等于全文高度，用 IntersectionObserver 会「全部已在视口内」。
      所以这里用「父窗口滚到哪儿」换算：元素在本文档里的绝对位置 vs
      父视口下沿映射进本文档的位置。跨域拿不到 frameElement 就退回独立页逻辑
      （结果是全部直接可见，不会坏）。 */
(function () {
    'use strict';

    var script = document.currentScript;
    var selector = script && script.getAttribute('data-reveal-targets');
    if (!selector) return;

    if (!document.querySelector) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var DISTANCE = 18;
    var DURATION = 520;
    /* 和主站 rootMargin 的 -6% 对齐：元素要越过视口下沿往上 6% 才开始淡入 */
    var INSET_RATIO = 0.06;

    var embedded = false;
    var parentWin = null;
    try {
        if (window.self !== window.top && window.frameElement) {
            embedded = true;
            parentWin = window.parent;
        }
    } catch (err) {
        embedded = false;
    }

    function scrollTop() {
        return window.scrollY || window.pageYOffset || 0;
    }

    /* 视口下沿在「本文档坐标系」里的位置 */
    function viewportBottom() {
        if (embedded) {
            var rect = window.frameElement.getBoundingClientRect();
            return -rect.top + (parentWin.innerHeight || 0);
        }
        return scrollTop() + window.innerHeight;
    }

    function viewportHeight() {
        return embedded ? (parentWin.innerHeight || 0) : window.innerHeight;
    }

    function docTop(el) {
        return el.getBoundingClientRect().top + scrollTop();
    }

    function threshold() {
        return viewportBottom() - viewportHeight() * INSET_RATIO;
    }

    var targets = Array.prototype.slice.call(document.querySelectorAll(selector));
    if (!targets.length) return;

    var pending = [];
    var cut = threshold();
    targets.forEach(function (el) {
        if (el.getAttribute('data-reveal')) return;
        if (docTop(el) < cut) {
            el.setAttribute('data-reveal', 'in');
            return;
        }
        el.classList.add('is-reveal-hidden');
        el.setAttribute('data-reveal', 'pending');
        pending.push(el);
    });
    if (!pending.length) return;

    function reveal(el) {
        el.classList.remove('is-reveal-hidden');
        el.setAttribute('data-reveal', 'in');
        if (typeof el.animate !== 'function') return;
        var animation = el.animate([
            { opacity: 0, transform: 'translate3d(0, ' + DISTANCE + 'px, 0)' },
            { opacity: 1, transform: 'none' }
        ], {
            duration: DURATION,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both'
        });
        /* 播完撤掉动画：留着 fill:both 会把 transform 钉成 none，
           卡片 / 按钮自己的悬停位移就压不过它 */
        animation.onfinish = function () { animation.cancel(); };
    }

    var ticking = false;
    function tick() {
        ticking = false;
        if (!pending.length) return;
        var now = threshold();
        var hits = [];
        for (var i = 0; i < pending.length; i += 1) {
            if (docTop(pending[i]) < now) hits.push(pending[i]);
        }
        for (var j = 0; j < hits.length; j += 1) {
            var idx = pending.indexOf(hits[j]);
            if (idx >= 0) pending.splice(idx, 1);
            reveal(hits[j]);
        }
    }

    function schedule() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(tick);
    }

    if (embedded) {
        parentWin.addEventListener('scroll', schedule, { passive: true });
        parentWin.addEventListener('resize', schedule);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    /* 图片是懒加载的，load 之后位置会变，再量一次 */
    window.addEventListener('load', schedule);
    schedule();
})();
