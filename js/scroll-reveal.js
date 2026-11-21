/* 独立页 / 内嵌页的「滚动出现」。
   首页那套在 js/script.js 里（SPA 专用），article_14_baidu / manor_photo /
   guide 这些页面不引 script.js，所以各带一份这个。用法：

     <script src="../../js/scroll-reveal.js"
             data-reveal-targets=".post-head, .post-body > *"
             data-reveal-stagger="60"></script>

   三条和主站一致的规矩：
   1. 隐藏态 .is-reveal-hidden 只在本脚本里加。脚本没跑到 / 报错 / 访客禁了 JS，
      页面就是普通的全可见页面，不会白屏。
   2. 只有「整个元素都在视口下方」才藏；首屏露出一像素就算已出现，首屏永远立刻可读。
   3. 出现过就打 data-reveal="in"，不再观察，来回滚动不重播。

   参数都是整页一套，好让每个独立页各调各的：
   - data-reveal-targets  必填，逗号分隔的选择器
   - data-reveal-stagger  同一批一起越过阈值的元素依次错开多少毫秒，默认 0（同时出现）
   - data-reveal-distance 入场时上移多少像素，默认 18
   - data-reveal-duration 单块动画时长（不含错开延迟），默认 520ms
   - data-reveal-inset    视口下沿内缩百分之几才开始淡入，默认 6（和主站 rootMargin 对齐）

   ⚠️ 内嵌模式（被文章页用 iframe 打开）要单独算：iframe 的高度就是整篇内容的高度，
      它自己的 viewport 等于全文高度，用 IntersectionObserver 会「全部已在视口内」。
      所以这里用「父窗口滚到哪儿」换算：元素在本文档里的绝对位置 vs
      父视口下沿映射进本文档的位置。跨域拿不到 frameElement 就退回独立页逻辑
      （结果是全部直接可见，不会坏）。

   ⚠️ 元素位置只在初始化 / resize / 资源 load 之后重新量。滚动时只做纯数值比较，
      不然 guide 那种几百个目标的长文每帧都 getBoundingClientRect 会卡。 */
(function () {
    'use strict';

    var script = document.currentScript;
    var selector = script && script.getAttribute('data-reveal-targets');
    if (!selector) return;

    if (!document.querySelector) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function readNumber(name, fallback, min, max) {
        var raw = script.getAttribute(name);
        if (raw === null || raw === '') return fallback;
        var value = parseFloat(raw);
        if (!isFinite(value) || value < min) return fallback;
        return value > max ? max : value;
    }

    var DISTANCE = readNumber('data-reveal-distance', 18, 0, 80);
    var DURATION = readNumber('data-reveal-duration', 520, 120, 2400);
    var STAGGER = readNumber('data-reveal-stagger', 0, 0, 400);
    var INSET_RATIO = readNumber('data-reveal-inset', 6, 0, 40) / 100;

    /* 同一批最多错开几档：再后面的共用最后一档，否则一屏十块会越等越久 */
    var STAGGER_STEPS = 5;
    /* 一次命中超过这么多，多半是快速滚动 / 锚点跳转，整批立刻出现，不做错开 */
    var STAGGER_BATCH_MAX = 9;

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

    /* pending 里存 {el, top}，top 是文档坐标，滚动时不必再量 */
    var pending = [];
    var cut = threshold();
    targets.forEach(function (el) {
        if (el.getAttribute('data-reveal')) return;
        var top = docTop(el);
        if (top < cut) {
            el.setAttribute('data-reveal', 'in');
            return;
        }
        el.classList.add('is-reveal-hidden');
        el.setAttribute('data-reveal', 'pending');
        pending.push({ el: el, top: top });
    });
    if (!pending.length) return;

    function measure() {
        for (var i = 0; i < pending.length; i += 1) {
            pending[i].top = docTop(pending[i].el);
        }
    }

    /* 延迟期间靠 fill: 'both' 顶着第一帧（透明），所以隐藏类要等播完再撤，
       否则延迟那几百毫秒里元素会先可见、再消失、再淡入 */
    function reveal(el, delay) {
        el.setAttribute('data-reveal', 'in');
        if (typeof el.animate !== 'function') {
            el.classList.remove('is-reveal-hidden');
            return;
        }
        var animation = el.animate([
            { opacity: 0, transform: 'translate3d(0, ' + DISTANCE + 'px, 0)' },
            { opacity: 1, transform: 'none' }
        ], {
            duration: DURATION,
            delay: delay,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both'
        });
        /* 播完撤掉动画：留着 fill:both 会把 transform 钉成 none，
           卡片 / 按钮自己的悬停位移就压不过它 */
        animation.onfinish = function () {
            el.classList.remove('is-reveal-hidden');
            animation.cancel();
        };
        /* 动画被取消 / 元素被移出文档时的兜底，别让内容永远停在透明 */
        animation.oncancel = function () {
            el.classList.remove('is-reveal-hidden');
        };
    }

    function play(hits) {
        var step = (STAGGER > 0 && hits.length <= STAGGER_BATCH_MAX) ? STAGGER : 0;
        for (var i = 0; i < hits.length; i += 1) {
            var rank = i < STAGGER_STEPS ? i : STAGGER_STEPS;
            reveal(hits[i].el, step * rank);
        }
    }

    var ticking = false;
    function tick() {
        ticking = false;
        if (!pending.length) return;
        var now = threshold();
        var hits = [];
        for (var i = 0; i < pending.length; i += 1) {
            if (pending[i].top < now) hits.push(pending[i]);
        }
        if (!hits.length) return;
        for (var j = 0; j < hits.length; j += 1) {
            var idx = pending.indexOf(hits[j]);
            if (idx >= 0) pending.splice(idx, 1);
        }
        play(hits);
    }

    function schedule() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(tick);
    }

    /* 布局变了（宽度变化、懒加载图片落地、字体替换）就重新量一遍坐标 */
    function remeasure() {
        if (!pending.length) return;
        measure();
        schedule();
    }

    if (embedded) {
        parentWin.addEventListener('scroll', schedule, { passive: true });
        parentWin.addEventListener('resize', remeasure);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    /* 图片是懒加载的，load 之后位置会变，再量一次（capture 才收得到 img 的 load） */
    window.addEventListener('load', remeasure, true);
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(remeasure);
    }
    schedule();
})();