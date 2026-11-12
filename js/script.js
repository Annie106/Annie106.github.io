        (function() {
            // ==================== ★★★ 在这里修改你的博客内容 ★★★ ====================
            // 文章数据在 js/posts-data.js（window.BLOG_POSTS），
            // 首页和归档页共用同一份，增删改只改那个文件。
            const blogPosts = Array.isArray(window.BLOG_POSTS) ? window.BLOG_POSTS : [];

            // ==================== 统一管理文章卡片的二级菜单 ====================
            // 使用文章 id 对应菜单项；未配置的文章默认显示“评论”入口。
            // 菜单项支持这些类型：
            //   article      打开站内文章
            //   link         打开指定网址或 HTML 页面
            //   externalPage 打开该文章数据中的独立页面
            //   share        复制这篇文章的链接
            //   comments     站内切到评论视图（?view=comments）
            //   feedback     站内切到问题反馈视图（?view=feedback）

            const articleMenus = {
                // 新增指南文章
                //10: [
                    //{ label: '返回文章列表', type: 'link', url: 'index.html#blog' },
                //],
            };

            // ==================== ★★★ 修改个人信息 ★★★ ====================
            const siteConfig = {
                authorName: 'Annie',              // 你的名字
                subtitle: '思考 · 记录 · 创造',
                bio: '敏感、真实、讨厌冷暴力与敷衍',
                location: '辽宁',
                occupation: '自由撰稿',
                blogStartYear: '2026',
                email: 'anniedv106@gmail.com',
                aboutText: `
                        <p>我是 Annie，一个用文字整理思绪的人。</p>
                        <p>这个博客是我记录阅读、成长和日常灵感的地方。相信简单的记录也可以汇聚成光。</p>
                    `,
            };

            // ==================== DOM 引用 ====================
            const $ = (sel) => document.querySelector(sel);
            const $$ = (sel) => document.querySelectorAll(sel);

            const siteHeader = $('.site-header');
            const siteNav = $('#siteNav');
            const navPill = $('.nav-pill');
            const navLinks = $('#navLinks');
            const homeLink = $('#homeLink');
            const viewHome = $('#view-home');
            const viewBlog = $('#view-blog');
            const viewArchive = $('#view-archive');
            const viewTweaks = $('#view-tweaks');
            const viewMovie = $('#view-movie');
            const viewAbout = $('#view-about');
            const movieFrame = $('#movieFrame');
            const movieSubmissionPanel = $('#movieSubmissionPanel');
            const movieSubmissionFrame = $('#movieSubmissionFrame');
            const movieSubmissionClose = $('#movieSubmissionClose');
            const viewArticle = $('#view-article');
            const viewFeedback = $('#view-feedback');
            const viewThanks = $('#view-thanks');
            const viewComments = $('#view-comments');
            const postsListHome = $('#postsListHome');
            const postsListBlog = $('#postsListBlog');
            const tagFilterHome = $('#tagFilterHome');
            const tagFilterBlog = $('#tagFilterBlog');
            const searchOverlay = $('#searchOverlay');
            const searchBackdrop = $('#searchBackdrop');
            const searchPanel = $('#searchPanel');
            const searchInput = $('#searchInput');
            const searchClear = $('#searchClear');
            const searchSpinner = $('#searchSpinner');
            const searchMeta = $('#searchMeta');
            const searchBody = $('#searchBody');
            const searchSuggest = $('#searchSuggest');
            const searchResults = $('#searchResults');
            const searchClose = $('#searchClose');
            const searchBack = $('#searchBack');
            const searchHistoryBlock = $('#searchHistoryBlock');
            const searchHistoryChips = $('#searchHistoryChips');
            const searchHistoryClear = $('#searchHistoryClear');
            const searchTriggers = $$('[data-search-open]');
            const searchMobile = window.matchMedia('(max-width: 600px)');
            const searchDesktop = window.matchMedia('(min-width: 601px)');
            const articleTitle = $('#articleTitle');
            const articleMeta = $('#articleMeta');
            const articleContent = $('#articleContent');
            const articleUnavailableNotice = $('#articleUnavailableNotice');
            const articleUnavailableMount = $('#articleUnavailableMount');
            const articleCommentsDivider = $('#articleCommentsDivider');
            const articleCommentsSection = $('#articleCommentsSection');
            const articleComments = $('#articleComments');
            const articleCommentsStage = $('#articleCommentsStage');
            const embeddedArticleNormalMount = $('#embeddedArticleNormalMount');
            const embeddedPageFrame = $('#embeddedPageFrame');
            const embeddedArticleWrap = $('#embeddedArticleWrap');
            const backBtn = $('#backBtn');
            const backBtn2 = $('#backBtn2');
            const articleShare = $('#articleShare');
            const articleFeedback = $('#articleFeedback');
            const wechatShareGuide = $('#wechatShareGuide');
            const wechatShareGuideCopy = $('#wechatShareGuideCopy');
            const wechatShareGuideClose = $('#wechatShareGuideClose');

            let currentView = 'home';
            /* 首页和文章页各记各的标签：
               在文章页选了「教程」，回到首页不该被这个选择带走——
               首页默认永远是「最新」。两行标签互不影响。 */
            let homeTag = 'all';
            let blogTag = 'all';
            // 某个视图对应的筛选项
            function tagOfView(viewName) {
                return viewName === 'blog' ? blogTag : homeTag;
            }
            function setTagOfView(viewName, tag) {
                if (viewName === 'blog') blogTag = tag;
                else homeTag = tag;
            }
            let currentArticleId = null;
            /* 上一次真正写进 DOM 的是哪篇文章。
               从文章返回首页、再点开同一篇时，正文可以原样留着——
               重新写 innerHTML 会把图片、内嵌内容全部重建一遍，
               图片的「模糊 → 清晰」淡入也跟着重播，看上去就是闪一下。 */
            let renderedArticleId = null;
            let renderedArticleUnavailable = false;
            let embeddedPageObserver = null;
            let embeddedPageResizeHandler = null;
            let embeddedPageFallbackTimer = null;
            // 上一次量出的 iframe 高度：内容没变就不重复写 height，
            // 避免「改高度 → 触发 ResizeObserver → 再改高度」的循环
            let embeddedFrameHeight = 0;
            let articleReturnView = 'home';
            let articleReturnScroll = 0;
            /* 问题反馈视图要带的那篇文章。地址栏用 fa / ft 两个参数传，
               不能复用 ?article= —— 那个参数的含义是「直接打开这篇文章」。 */
            let feedbackContext = { id: '', title: '' };
            /* 评论视图要带的那篇文章（ca / ct），同一个道理 */
            let commentsContext = { id: '', title: '' };
            let commentsEntryActive = false;
            // 感谢页的倒计时句柄，切走视图时要清掉
            let thanksCountdownTimer = null;
            // ==================== 搜索状态 ====================
            // 当前关键词始终以输入框的值为准，不另存一份，避免两边不一致。
            let searchOpen = false;
            let searchComposing = false;
            // 每次输入都清掉上一个定时器，只有停下来才真正检索（防抖）
            let searchDebounceTimer = null;
            let searchPendingTimer = null;
            // 搜索请求标识：异步回调回来时用它判断这次结果是不是已经过期
            let searchRequestId = null;
            // 最近一次渲染出来的结果（用于 ↑↓ 选中和 Enter 打开）
            let searchHits = [];
            let searchActiveIndex = -1;
            // 打开搜索前的焦点，关闭时还回去
            let searchReturnFocus = null;
            // 键盘高度追踪：用 visualViewport 判断键盘是否弹起
            let searchViewportHeight = 0;
            let searchKeyboardVisible = false;
            // 搜索面板是否往历史里压了一条记录。
            // 打开搜索时压一条，手机的返回键 / 手势、浏览器的后退按钮
            // 就会先收起面板，而不是直接离开站点。
            let searchHistoryEntryActive = false;
            // 我们自己调用的 history.back() 会异步触发 popstate。
            // 这里记一个待忽略的次数，避免那次 popstate 被当成
            // 「用户按了返回」而多退一页（在文章页按 Ctrl+K 时尤其明显）。
            let searchPendingHistoryBack = 0;
            // 后退真正落地后要补做的收尾（比如重新同步地址栏）。
            // 退回到的那条历史记录带着旧 URL，而视图已经变了，
            // 不同步一次的话地址栏会和当前视图对不上。
            let searchHistoryBackCallback = null;
            let articleHistoryEntryActive = false;
            let returningFromArticleButton = false;
            const viewScrollPositions = {
                home: 0, blog: 0, movie: null, about: 0,
                archive: 0, tweaks: 0, feedback: 0, thanks: 0, comments: 0,
            };
            /* 快速来回切换视图（首页 ⇄ 文章）时，每次切换都会让入场动画
               从 opacity:0 重新开始。间隔比 350ms 的动画还短的话，页面
               几乎一直停在半透明状态，看起来就是在「闪」。
               这里记下上次切换的时刻，间隔太短就干脆不播动画。 */
            let lastViewSwitchAt = 0;
            const VIEW_ENTER_ANIM_GAP = 420;
            /* 滚动恢复任务的「世代号」。切视图时递增，之前排着队的
               恢复定时器就全部作废——否则上一个视图的恢复逻辑会在
               新视图上继续把滚动条拽回旧位置，表现就是来回切时画面乱跳。 */
            let scrollRestoreToken = 0;

            function centerMovieFrame(behavior = 'smooth') {
                const frameRect = movieFrame.getBoundingClientRect();
                const headerBottom = $('.site-header').getBoundingClientRect().bottom;
                const viewportHeight = window.visualViewport?.height || window.innerHeight;
                const visibleCenter = headerBottom + (viewportHeight - headerBottom) / 2;
                const targetTop = window.scrollY + frameRect.top + frameRect.height / 2 - visibleCenter;
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                const scrollTop = Math.max(0, Math.min(maxScroll, targetTop));
                window.scrollTo({ top: scrollTop, behavior });
                viewScrollPositions.movie = scrollTop;
            }

            function restoreViewScroll(viewName) {
                const scrollTop = viewScrollPositions[viewName] || 0;
                window.scrollTo({ top: scrollTop, behavior: 'instant' });
            }

            /* 切视图后复原滚动位置：在一个很短的窗口里反复校正。
               单帧不够用——图片/字体可能还没把高度撑开，浏览器在 popstate 后
               还会按自己的账本再回填一次滚动位置（值可能是另一个视图的），
               任何一次都能把结果冲掉，表现就是「返回后停在页面底部」。
               窗口只有 ~300ms，且用户一旦自己滚动（滚轮/触摸/按键）立刻停手，
               不会跟他抢控制权。 */
            function restoreViewScrollSettled(viewName) {
                const target = Math.max(0, viewScrollPositions[viewName] || 0);
                // 每次调用都拿一个新世代号，旧的恢复任务随之失效
                const token = ++scrollRestoreToken;
                let cancelled = false;
                const stop = () => { cancelled = true; };
                const events = ['wheel', 'touchstart', 'keydown'];
                events.forEach(name => window.addEventListener(name, stop, { passive: true, once: true }));
                const cleanup = () => events.forEach(name => window.removeEventListener(name, stop));
                const isStale = () => cancelled || token !== scrollRestoreToken;

                const apply = () => {
                    if (isStale()) {
                        cleanup();
                        return;
                    }
                    if (Math.abs(window.scrollY - target) > 1) {
                        window.scrollTo({ top: target, behavior: 'instant' });
                    }
                };
                window.requestAnimationFrame(() => {
                    if (isStale()) { cleanup(); return; }
                    apply();
                    window.requestAnimationFrame(apply);
                    window.setTimeout(apply, 90);
                    window.setTimeout(apply, 200);
                    window.setTimeout(() => { apply(); cleanup(); }, 320);
                });
            }

            /* 切视图时把还没跑完的滚动恢复全部作废。
               快速来回切的时候，离开首页那一刻排上的恢复任务会在文章页
               才醒过来，把页面往下拽一下，再被文章页自己滚回顶部——
               一上一下就是那道闪。 */
            function cancelScrollRestore() {
                scrollRestoreToken += 1;
            }

            // ==================== 离开时的界面记忆 ====================
            // 点击文章跳到独立 HTML 页面后，返回本站时恢复离开时所在的界面：
            // 视图（首页 / 文章列表 / 文章详情 / 电影 / 关于）、当前标签、滚动位置。
            const VIEW_STATE_KEY = 'annie-view-state';
            const VALID_VIEWS = ['home', 'blog', 'archive', 'tweaks', 'movie', 'about', 'article', 'feedback', 'thanks', 'comments'];

            function saveViewState() {
                if (!VALID_VIEWS.includes(currentView)) return;
                if (currentView !== 'article') {
                    viewScrollPositions[currentView] = window.scrollY;
                }
                try {
                    sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
                        // 感谢页是一次性的：下次进来还原到首页，别让人再看一遍倒计时
                        view: currentView === 'thanks' ? 'home' : currentView,
                        articleId: currentArticleId,
                        tag: homeTag,
                        homeTag: homeTag,
                        blogTag: blogTag,
                        scroll: window.scrollY,
                        scrollPositions: viewScrollPositions,
                        returnView: articleReturnView,
                        returnScroll: articleReturnScroll,
                        feedbackArticle: feedbackContext.id,
                        feedbackTitle: feedbackContext.title,
                    }));
                } catch (e) {}
            }

            function readViewState() {
                try {
                    const state = JSON.parse(sessionStorage.getItem(VIEW_STATE_KEY) || 'null');
                    return state && VALID_VIEWS.includes(state.view) ? state : null;
                } catch (e) {
                    return null;
                }
            }

            // 从快照（sessionStorage / history.state）里还原两行标签各自的选择。
            // 旧数据里只有一个 tag 字段，那就两边都按它走。
            function restoreTagsFromSnapshot(snapshot) {
                if (!snapshot) return;
                const allTags = getAllTags();
                const pick = value => (typeof value === 'string' && allTags.includes(value) ? value : null);
                const legacy = pick(snapshot.tag);
                homeTag = pick(snapshot.homeTag) || legacy || homeTag;
                blogTag = pick(snapshot.blogTag) || legacy || blogTag;
            }

            // ==================== 分享链接 ====================
            // 文章地址统一用 ?article=<id> 表示，这样复制出去的链接
            // 在别人的浏览器里也能直接打开对应文章（sessionStorage 只在本机有效）。
            const ARTICLE_PARAM = 'article';
            const VIEW_PARAM = 'view';
            /* 反馈页的「针对哪篇文章」用单独的短参数名（fa = feedback article，
               ft = feedback title）。之所以不直接用 article / title：
               ?article=N 的含义是「打开第 N 篇文章」，init() 会先按它进文章视图，
               两个语义撞在一起就没法区分「看文章」和「给这篇文章提意见」。 */
            const FEEDBACK_ARTICLE_PARAM = 'fa';
            const FEEDBACK_TITLE_PARAM = 'ft';
            /* 评论视图同理，用 ca / ct（ca = comments article，ct = comments title），
               也不能和 ?article= 混用 */
            const COMMENTS_ARTICLE_PARAM = 'ca';
            const COMMENTS_TITLE_PARAM = 'ct';

            function buildArticleUrl(id) {
                const url = new URL(window.location.href);
                url.searchParams.set(ARTICLE_PARAM, String(id));
                url.hash = '';
                return url.href;
            }

            // 读地址栏里的文章 id；没有或不是有效数字时返回 null
            function readArticleIdFromUrl() {
                try {
                    const raw = new URL(window.location.href).searchParams.get(ARTICLE_PARAM);
                    if (raw === null || raw === '') return null;
                    const id = parseInt(raw, 10);
                    return Number.isFinite(id) ? id : null;
                } catch (e) {
                    return null;
                }
            }

            // 把地址栏同步成当前状态：打开文章写入 ?article=id，返回时清掉。
            // 用 replaceState 而不是 pushState，避免污染历史记录
            //（文章的前进/后退由已有的 history.state 机制负责）。
            function syncUrlWithView() {
                const url = new URL(window.location.href);
                if (currentView === 'article' && currentArticleId !== null) {
                    url.searchParams.set(ARTICLE_PARAM, String(currentArticleId));
                } else {
                    url.searchParams.delete(ARTICLE_PARAM);
                }
                if (currentView === 'about' || currentView === 'archive' || currentView === 'tweaks'
                    || currentView === 'feedback' || currentView === 'thanks'
                    || currentView === 'comments') {
                    url.searchParams.set(VIEW_PARAM, currentView);
                } else {
                    url.searchParams.delete(VIEW_PARAM);
                }
                /* 反馈页的文章上下文只在反馈视图里留在地址栏：
                   离开时一并清掉，别让首页也拖着 ?fa=3&ft=… */
                if (currentView === 'feedback' && feedbackContext.id) {
                    url.searchParams.set(FEEDBACK_ARTICLE_PARAM, String(feedbackContext.id));
                } else {
                    url.searchParams.delete(FEEDBACK_ARTICLE_PARAM);
                }
                if (currentView === 'feedback' && feedbackContext.title) {
                    url.searchParams.set(FEEDBACK_TITLE_PARAM, feedbackContext.title);
                } else {
                    url.searchParams.delete(FEEDBACK_TITLE_PARAM);
                }
                // 评论视图的 ca / ct 同理，切走就清掉
                if (currentView === 'comments' && commentsContext.id) {
                    url.searchParams.set(COMMENTS_ARTICLE_PARAM, String(commentsContext.id));
                } else {
                    url.searchParams.delete(COMMENTS_ARTICLE_PARAM);
                }
                if (currentView === 'comments' && commentsContext.title) {
                    url.searchParams.set(COMMENTS_TITLE_PARAM, commentsContext.title);
                } else {
                    url.searchParams.delete(COMMENTS_TITLE_PARAM);
                }
                url.hash = '';
                const next = url.pathname + url.search;
                const current = window.location.pathname + window.location.search;
                if (next !== current) {
                    history.replaceState(history.state, '', next);
                }
            }

            // ==================== 视图历史记录 ====================
            /* 切到「文章 / 电影 / 关于」时往历史里压一条记录，
               手机返回键 / 侧滑返回、桌面后退才有「上一级」可退。
               没有这条记录时，用户在这些页面按返回会被直接带出站点，
               而他的预期是回到首页。 */
            let pendingViewHistoryPush = null;

            /* 滚动位置完全由我们自己管。popstate 时浏览器也会按它账本里的位置
               再还原一次，而那个值往往是「另一个视图」的（切视图时页面高度差很多），
               落回来就会把页面甩到最底部。交给 restoreViewScroll 单独负责。 */
            if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

            /* 离开某个视图前，把「当下」的界面状态写进当前这条历史记录：
               滚动位置、两行标签。popstate 回来时直接用它，不必依赖闭包里
               的变量有没有被别处改过。

               还要顺着更新 annieViewSnapshot —— 那条快照是打开文章时留下的，
               回来过一次之后它的 view/scroll/tag 就过期了；如果不刷新，
               之后再从首页去文章页、按返回，popstate 会优先走快照分支，
               把页面还原成「很久以前那一次」的滚动位置（表现就是在底部）。 */
            function rememberEntryScroll() {
                if (currentView === 'article') return;
                const top = Math.round(window.scrollY);
                try {
                    const next = Object.assign({}, history.state);
                    const snapshot = next.annieViewSnapshot;
                    if (snapshot && snapshot.view === currentView) {
                        snapshot.scroll = top;
                        snapshot.scrollPositions = snapshot.scrollPositions || {};
                        snapshot.scrollPositions[currentView] = top;
                        snapshot.homeTag = homeTag;
                        snapshot.blogTag = blogTag;
                    }
                    next.annieScrollTop = top;
                    history.replaceState(next, '', window.location.href);
                } catch (e) {}
            }

            function pushViewHistoryEntry(viewName, force) {
                if (viewName === 'home') return false;
                // 已经在这个视图的记录上了，别重复压，否则返回键要按两次才有反应
                if (history.state && history.state.annieView === viewName) return false;
                if (!force && currentView === viewName) return false;
                try {
                    // URL 交给 switchView 里的 syncUrlWithView 统一同步
                    history.pushState({ annieView: viewName }, '', window.location.href);
                    return true;
                } catch (e) {
                    return false;
                }
            }

            // 所有「点导航 / 点入口切视图」的地方都走这里：先记历史，再切视图
            function navigateToView(viewName) {
                // 正在读文章时点导航：不新增记录，直接把那条文章记录改掉。
                // 否则返回键会先弹回刚才那篇文章，看起来像「点了没反应」
                if (currentView === 'article') {
                    articleHistoryEntryActive = false;
                    returningFromArticleButton = false;
                    try {
                        history.replaceState({ annieView: viewName }, '', window.location.href);
                    } catch (e) {}
                    switchView(viewName);
                    return;
                }
                // 搜索面板收起时会自己 history.back() 退掉那条搜索记录。
                // 这时立刻 pushState 会和队列里的后退打架（落点会错位），
                // 先记下来，等 popstate 落定之后再补这条视图记录
                if (searchPendingHistoryBack > 0) {
                    pendingViewHistoryPush = viewName;
                    switchView(viewName);
                    return;
                }
                rememberEntryScroll();
                pushViewHistoryEntry(viewName);
                switchView(viewName);
            }

            // 顶部轻提示（复制成功等），样式复用 .site-toast
            let toastHideTimer = null;
            let toastCleanupTimer = null;
            // 留多久：原来 3.2s，提到 3.6s —— 提示改成从导航下方落下来之后，
            // 用户的视线要先「找」到它，多给半秒才读得完一句话
            const TOAST_DURATION = 3600;
            function showToast(message, isError) {
                const toast = document.getElementById('siteToast');
                const text = document.getElementById('siteToastText');
                if (!toast || !text) return;
                text.textContent = message;
                // 图标跟结果走：成功是勾、失败是感叹号。
                // 只在 CSS 里给 .is-error 换色不够，图标本身也得换，
                // 不然「复制失败」配一个勾会自相矛盾
                const icon = toast.querySelector('i');
                if (icon) {
                    icon.className = isError ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
                }
                toast.classList.toggle('is-error', !!isError);
                clearTimeout(toastHideTimer);
                clearTimeout(toastCleanupTimer);

                // 已经在屏幕上（上一条还没消失）：这时候只换文案是硬切，
                // 得把入场动画重头播一遍，才算「又来了一条」。
                // 判断要放在 hidden=false 之前，否则永远是 false。
                const replaying = !toast.hidden && toast.classList.contains('visible');

                // 关键：先让元素变成 display:flex，并强制一次样式重算，
                // 把 opacity:0 变成"已经生效的起始状态"。
                // 否则 display:none → flex 和 opacity:0 → 1 会被合并进
                // 同一次样式计算，浏览器找不到起始值，过渡动画就被跳过
                //（表现就是第一次点「复制链接」时弹窗是硬闪出来的）。
                toast.hidden = false;
                void toast.offsetHeight;
                toast.classList.add('visible');

                if (replaying) {
                    // 先摘类再强制重排，动画才会真的从 0% 重播，而不是原地不动
                    toast.classList.remove('is-replaying');
                    void toast.offsetWidth;
                    toast.classList.add('is-replaying');
                }

                toastHideTimer = setTimeout(() => {
                    toast.classList.remove('visible');
                    // 连带动画类一起摘：animation-fill 是 both，留着会把 opacity 钉住
                    toast.classList.remove('is-replaying');
                    // 等淡出过渡走完再真正隐藏，否则会被 display:none 打断
                    toastCleanupTimer = setTimeout(() => { toast.hidden = true; }, 300);
                }, TOAST_DURATION);
            }

            // 把链接写入剪贴板。优先 Clipboard API，失败则退回 execCommand。
            // 两者都不行时返回 false，由调用方用页面提示告诉用户手动复制，
            // 不弹浏览器原生 prompt（会打断阅读，样式也跟站点不一致）。
            function copyLink(url) {
                if (navigator.clipboard && window.isSecureContext) {
                    return navigator.clipboard.writeText(url).then(
                        () => true,
                        () => legacyCopy(url)
                    );
                }
                return Promise.resolve(legacyCopy(url));
            }

            function legacyCopy(url) {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.top = '-9999px';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                let ok = false;
                try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
                document.body.removeChild(textarea);
                return ok;
            }

            // 复制文章链接（总是走复制，不弹系统分享面板）
            function copyArticleLink(post) {
                const url = buildArticleUrl(post.id);
                Promise.resolve(copyLink(url)).then(function (ok) {
                    // 失败时不再弹原生 prompt，统一用顶部轻提示告诉用户手动复制
                    showToast(ok
                        ? '链接已复制，打开连接可查看此文章'
                        : '复制失败，可长按地址栏手动复制', !ok);
                });
            }

            // 是否在微信内置浏览器里打开。
            // 微信各端的 UA 都会追加自己的标记：iOS / Android / Windows / Mac /
            // 鸿蒙 NEXT 版都是 MicroMessenger，部分 Android 版本还会同时带
            // WeChat/arm64，企业微信带 wxwork。
            //
            // 鸿蒙 NEXT（HarmonyOS 5）的微信换成了 ArkWeb 内核，UA 里会出现
            // ArkWeb 标记，个别版本可能不再保留 MicroMessenger。这里做一层
            // 兜底：只要是 ArkWeb 内核的嵌入网页、又拿不到系统分享面板
            //（navigator.share 不可用），就按微信内处理，同样走
            //「复制链接 + 引导浮层」，至少不会点了没反应。
            //
            // 注意用 ArkWeb 而不是 OpenHarmony / HarmonyOS 作为判断依据：
            // 后两个标记在鸿蒙自带的华为浏览器里也有，会把普通浏览器误判成微信。
            //
            // 但光靠 ArkWeb 还不够：鸿蒙上的**华为浏览器**也是 ArkWeb 内核，
            // UA 同样带 ArkWeb、也没有 navigator.share，于是手机上用普通浏览器
            // 打开也会弹出「点右上角 ···」的引导浮层（华为/鸿蒙手机尤其常见）。
            // 所以这里再排除一批已知的普通浏览器 / App 内置浏览器标记，
            // 只有「ArkWeb 内核 + 不是这些浏览器 + 没有系统分享面板」才当微信。
            //
            // 其中 /Browser/ 是通用兜底：国内手机浏览器的 UA 基本都带 Browser
            // 字样（HuaweiBrowser / MiuiBrowser / VivoBrowser / OppoBrowser /
            // SamsungBrowser / UCBrowser / QQBrowser / baidubrowser…），
            // 而微信各端的 UA 都不带这个词。
            const NON_WECHAT_APP_BROWSER = /Browser|Quark|Firefox|FxiOS|CriOS|EdgiOS|OPR\/|Weibo|AlipayClient|DingTalk|aweme|BytedanceWebview|Xiaohongshu|NewsArticle/i;

            function isWeChatBrowser() {
                const ua = navigator.userAgent || '';
                if (/MicroMessenger|Weixin|wxwork/i.test(ua)) return true;
                // 微信注入的 JS 桥：有它就一定是微信（比 UA 更可靠）
                if (window.WeixinJSBridge || window.__wxjs_environment) return true;
                // 非 ArkWeb 内核：不可能是鸿蒙版微信
                if (!/ArkWeb/i.test(ua)) return false;
                // 已知的普通浏览器 / 其它 App 内置浏览器：不是微信
                if (NON_WECHAT_APP_BROWSER.test(ua)) return false;
                // 鸿蒙微信目前仍拿不到 navigator.share；能拿到就说明是普通浏览器
                return typeof navigator.share !== 'function';
            }

            // 微信内置浏览器既不支持 Web Share API，也没有让网页主动唤起
            // 「分享给朋友」面板的接口（官方 JS-SDK 也只能改分享卡片的标题/
            // 缩略图，不能代替用户点）。所以这里只能：先复制链接，
            // 再弹引导浮层指向分享入口，让用户自己完成分享。
            let wechatGuideHideTimer = null;

            // Windows / macOS 桌面版微信的分享入口在窗口左上角（「···」在左边），
            // 手机端（iOS / Android / 鸿蒙）才在右上角。这里按 UA 区分，
            // 把气泡和文案的指向一起换掉，避免桌面端点错方向。
            function isWeChatDesktop() {
                const ua = navigator.userAgent || '';
                // Windows 微信带 WindowsWechat，macOS 微信带 MacWechat
                if (/WindowsWechat|MacWechat/i.test(ua)) return true;
                // 兜底：UA 是桌面系统、又不是手机/平板，就按桌面端处理。
                // iPadOS 13+ 的 Safari 会伪装成 Macintosh（带 Mobile），
                // 所以 "Mobile" 也要算进移动端，否则 iPad 会被当成桌面微信。
                const isDesktopOS = /Windows NT|Macintosh|X11|Linux x86_64/i.test(ua);
                const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony|Tablet/i.test(ua);
                return isDesktopOS && !isMobile;
            }

            // 按平台切换引导浮层的指向：手机 → 右上角，桌面 → 左上角
            function applyWechatGuideDirection() {
                const desktop = isWeChatDesktop();
                const arrowText = $('#wechatShareGuideArrowText');
                const arrowIcon = $('#wechatShareGuideArrowIcon');
                const titleText = $('#wechatShareGuideTitleText');
                const arrow = $('#wechatShareGuideArrow');

                if (arrow) {
                    arrow.classList.toggle('is-left', desktop);
                }
                if (arrowText) {
                    arrowText.textContent = desktop ? '分享入口在左上角' : '分享入口在这里';
                }
                if (arrowIcon) {
                    arrowIcon.className = desktop
                        ? 'ri-arrow-left-up-line'
                        : 'ri-arrow-right-up-line';
                }
                if (titleText) {
                    titleText.textContent = desktop ? '点击左上角' : '点击右上角';
                }
                if (wechatShareGuide) {
                    wechatShareGuide.classList.toggle('is-desktop', desktop);
                }
            }

            function openWechatShareGuide() {
                if (!wechatShareGuide) return;
                clearTimeout(wechatGuideHideTimer);
                wechatShareGuide.hidden = false;
                applyWechatGuideDirection();
                document.documentElement.classList.add('wechat-guide-open');
                document.body.classList.add('wechat-guide-open');
                // 强制一次样式重算，否则 opacity 0 → 1 会被合并进同一次
                // 样式计算，淡入动画会被跳过（和 showToast 同样的坑）
                void wechatShareGuide.offsetHeight;
                wechatShareGuide.classList.add('visible');
                if (wechatShareGuideClose) wechatShareGuideClose.focus({ preventScroll: true });
            }

            function closeWechatShareGuide() {
                if (!wechatShareGuide || wechatShareGuide.hidden) return;
                wechatShareGuide.classList.remove('visible');
                document.documentElement.classList.remove('wechat-guide-open');
                document.body.classList.remove('wechat-guide-open');
                // 等淡出过渡走完再隐藏，否则会被 display:none 打断
                clearTimeout(wechatGuideHideTimer);
                wechatGuideHideTimer = setTimeout(function () {
                    wechatShareGuide.hidden = true;
                }, 240);
            }

            // 微信内分享：复制链接 + 引导浮层
            function shareInWeChat(post) {
                const url = buildArticleUrl(post.id);
                Promise.resolve(copyLink(url)).then(function (ok) {
                    openWechatShareGuide();
                    // 复制失败时不谎称「已复制」，浮层里还有「再次复制链接」可以补救
                    if (!ok) showToast('链接复制失败，可长按地址栏手动复制', true);
                });
            }

            // 分享文章：微信内走引导浮层，其它浏览器优先唤起系统分享面板；
            // 面板不可用、或被浏览器拒绝时，自动退回「复制链接」，
            // 避免点了没反应。用户主动取消（AbortError）则什么都不做。
            function shareArticle(post) {
                if (isWeChatBrowser()) {
                    shareInWeChat(post);
                    return;
                }
                const url = buildArticleUrl(post.id);
                if (typeof navigator.share === 'function') {
                    let settled = false;
                    try {
                        const result = navigator.share({ title: post.title, url: url });
                        if (result && typeof result.then === 'function') {
                            result.then(function () { settled = true; }, function (error) {
                                settled = true;
                                if (error && error.name === 'AbortError') return;
                                copyArticleLink(post);
                            });
                            return;
                        }
                        settled = true;
                    } catch (e) {
                        settled = true;
                    }
                    if (settled) return;
                }
                copyArticleLink(post);
            }

            function isArticlePublic(post) {
                return post.isPublic !== false;
            }

            function restoreViewState(state) {
                if (!state) return false;
                if (typeof state.returnView === 'string' && VALID_VIEWS.includes(state.returnView)) {
                    articleReturnView = state.returnView;
                }
                if (typeof state.returnScroll === 'number') articleReturnScroll = state.returnScroll;
                // 反馈页要还原「针对哪篇文章」的上下文，否则顶部那张卡片会空着
                if (state.view === 'feedback') {
                    applyFeedbackContext({ id: state.feedbackArticle, title: state.feedbackTitle });
                }

                const post = state.view === 'article'
                    ? blogPosts.find(p => p.id === state.articleId)
                    : null;
                if (post && (!post.externalPage || post.embeddedPage || !isArticlePublic(post))) {
                    articleHistoryEntryActive = true;
                    renderArticle(post);
                    switchView('article');
                } else {
                    switchView(state.view === 'article' ? 'home' : state.view);
                }

                // switchView 会把上一个视图的滚动位置记成 0，这里用离开时的记录覆盖回来
                const savedScrolls = state.scrollPositions || {};
                Object.keys(viewScrollPositions).forEach(key => {
                    if (typeof savedScrolls[key] === 'number') viewScrollPositions[key] = savedScrolls[key];
                });

                if (typeof state.scroll === 'number' && state.scroll > 0) {
                    // 关掉浏览器自带的滚动还原，避免和这里的恢复互相打架
                    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
                    window.requestAnimationFrame(() => {
                        window.scrollTo({ top: state.scroll, behavior: 'instant' });
                    });
                }
                return true;
            }

            // 跳转到独立 HTML 页面 / 切到后台 / 关闭标签页之前记录界面状态
            window.addEventListener('pagehide', saveViewState);
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'hidden') saveViewState();
            });
            // 从子页面返回时补播一次入场动画。
            // 只切 class 不管用：.view.active-view / .article-detail 本身已经声明了同名的
            // fadeSlideIn，remove 再 add 不会让动画重新开始，会直接停在 finished 状态。
            // 所以这里用 Web Animations API 显式播一遍，数值与 CSS 里的 fadeSlideIn 对齐。
            function replayViewEnterAnimation(el) {
                if (!el || typeof el.animate !== 'function') return;
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                // 元素自带的 CSS fadeSlideIn 有时会自己跑起来，先撤掉，
                // 避免两段动画叠在同一个 opacity 上，淡入会变慢、发灰
                el.getAnimations().forEach(function(item) {
                    if (item.animationName) item.cancel();
                });
                const anim = el.animate(
                    [
                        { opacity: 0, transform: 'translateY(14px)' },
                        { opacity: 1, transform: 'translateY(0)' }
                    ],
                    { duration: 350, easing: 'ease', fill: 'both' }
                );
                // 播完就撤掉，避免 fill 一直盖着，影响下次站内切换的 CSS 动画
                anim.addEventListener('finish', function() { anim.cancel(); }, { once: true });
            }

            // 判断这次加载是不是「从站内其它页面返回」：
            //   1) 浏览器后退导致的整页重载（bfcache 没命中）→ navigation type 是 back_forward；
            //   2) 子页面点「返回」链接跳回来 → referrer 是同源的另一个页面。
            function isReturningFromPage() {
                const entries = performance.getEntriesByType
                    ? performance.getEntriesByType('navigation')
                    : null;
                const navType = entries && entries[0] ? entries[0].type : '';
                if (navType === 'back_forward') return true;
                if (!document.referrer) return false;
                try {
                    const ref = new URL(document.referrer);
                    if (ref.origin !== window.location.origin) return false;
                    // 同源同路径说明是自己刷新，不算返回
                    return ref.pathname !== window.location.pathname;
                } catch (e) {
                    return false;
                }
            }

            // 返回后的首帧先把目标视图藏住，等首帧画完再淡入；
            // 否则会先看到完整内容、再闪一下重新淡入。
            function playReturnEnterAnimation() {
                if (!isReturningFromPage()) return;
                const activeView = document.querySelector('.view.active-view, .article-detail.active');
                if (!activeView) return;
                activeView.style.opacity = '0';
                window.requestAnimationFrame(function() {
                    window.requestAnimationFrame(function() {
                        activeView.style.opacity = '';
                        replayViewEnterAnimation(activeView);
                    });
                });
            }

            window.addEventListener('pageshow', function(event) {
                if (!event.persisted) return;
                const activeView = document.querySelector('.view.active-view, .article-detail.active');
                if (!activeView) return;
                replayViewEnterAnimation(activeView);
            });

            function sizeMovieFrame() {
                if (currentView !== 'movie') return;
                if (window.innerWidth <= 700) {
                    const frameWidth = movieFrame.getBoundingClientRect().width;
                    movieFrame.style.height = `${Math.round(frameWidth * window.innerHeight / window.innerWidth)}px`;
                } else {
                    movieFrame.style.height = '';
                }
            }

            window.addEventListener('resize', function() {
                if (currentView !== 'movie') return;
                sizeMovieFrame();
                if (window.innerWidth <= 700) {
                    window.requestAnimationFrame(() => centerMovieFrame());
                }
            });

            movieFrame.addEventListener('load', function() {
                const movieDocument = movieFrame.contentDocument;
                if (!movieDocument) return;
                const handleFullscreenChange = function() {
                    if (movieDocument.fullscreenElement || movieDocument.webkitFullscreenElement) return;
                    if (currentView !== 'movie' || window.innerWidth > 700) return;
                    window.requestAnimationFrame(() => {
                        sizeMovieFrame();
                        centerMovieFrame();
                    });
                };
                movieDocument.addEventListener('fullscreenchange', handleFullscreenChange);
                movieDocument.addEventListener('webkitfullscreenchange', handleFullscreenChange);
                    movieDocument.querySelector('#player')?.addEventListener('webkitendfullscreen', handleFullscreenChange);
                movieDocument.querySelector('#player')?.addEventListener('webkitendfullscreen', handleFullscreenChange);
            });

            let movieSubmissionUrl = '';
            function isMovieSubmissionMessageFromPage(event) {
                return event.origin === window.location.origin
                    || (window.location.protocol === 'file:' && event.origin === 'null');
            }

            function closeMovieSubmission(restoreFocus = true) {
                if (!movieSubmissionPanel || movieSubmissionPanel.hidden) return;
                movieSubmissionPanel.classList.remove('is-open');
                movieSubmissionPanel.setAttribute('aria-hidden', 'true');
                window.setTimeout(function() {
                    if (!movieSubmissionPanel.classList.contains('is-open')) {
                        movieSubmissionPanel.hidden = true;
                    }
                }, 300);
                if (restoreFocus) movieFrame.focus({ preventScroll: true });
            }

            function openMovieSubmission(data) {
                const url = new URL('project_subpage/blog/submission.html', window.location.href);
                url.searchParams.set('embedded', '1');
                if (data.movie) url.searchParams.set('movie', String(data.movie));
                if (data.title) url.searchParams.set('title', String(data.title));

                if (movieSubmissionUrl !== url.href) {
                    movieSubmissionUrl = url.href;
                    movieSubmissionFrame.src = movieSubmissionUrl;
                }

                movieSubmissionPanel.hidden = false;
                movieSubmissionPanel.setAttribute('aria-hidden', 'false');
                window.requestAnimationFrame(function() {
                    movieSubmissionPanel.classList.add('is-open');
                });
                movieSubmissionClose.focus({ preventScroll: true });
            }

            movieSubmissionClose.addEventListener('click', closeMovieSubmission);
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape' && movieSubmissionPanel
                    && !movieSubmissionPanel.hidden) {
                    closeMovieSubmission();
                }
            });

            window.addEventListener('message', function(event) {
                const data = event.data;
                if (!data || data.type !== 'annie-movie-submission') return;

                if (event.source === movieFrame.contentWindow
                    && isMovieSubmissionMessageFromPage(event)
                    && data.action === 'open') {
                    openMovieSubmission(data);
                    return;
                }

                if (event.source === movieSubmissionFrame.contentWindow
                    && isMovieSubmissionMessageFromPage(event)
                    && data.action === 'close') {
                    closeMovieSubmission();
                }
            });

            // ==================== 内嵌文章高度上报 ====================
            // 内嵌页面会把自己的内容高度 postMessage 上来，这里直接采用。
            // 比外层测量更可靠：内嵌页自己最清楚内容到哪里结束，不会把
            // 继承来的 body { min-height: 100vh } 也算成内容高度。
            window.addEventListener('message', function(event) {
                const data = event.data;
                if (!data || data.type !== 'annie-embedded-height') return;
                if (currentView !== 'article') return;
                const frameWindow = embeddedPageFrame.contentWindow;
                if (!frameWindow || event.source !== frameWindow) return;
                const height = Number(data.height);
                if (!isFinite(height) || height <= 0) return;
                const contentHeight = Math.ceil(height);
                // 和内层量到的一致就不再重复写 height，避免来回振荡
                if (contentHeight === embeddedFrameHeight) return;
                embeddedFrameHeight = contentHeight;
                embeddedPageFrame.style.height = `${contentHeight}px`;
                revealEmbeddedPage();
            });

            // ==================== 工具函数 ====================
            function getAllTags() {
                const tagSet = new Set();
                blogPosts.forEach(p => p.tags.forEach(t => tagSet.add(t)));
                return ['all', ...Array.from(tagSet)];
            }

            /* 标签 + 统计，给文章页的标签栏用：篇数、该标签下最近一次更新的日期。
               排序依次是「篇数多的在前 → 更新晚的在前 → 拼音首字母」，
               最常用、最近还在写的标签会浮到左边，不用在一长排里找。
               中文按拼音比较靠 Intl.Collator('zh-Hans-CN')，不用手写映射表。 */
            function getTagStats() {
                const stats = new Map();
                blogPosts.forEach(p => {
                    const date = postDisplayDate(p);
                    (p.tags || []).forEach(t => {
                        const item = stats.get(t) || { name: t, count: 0, latest: '' };
                        item.count += 1;
                        if (date > item.latest) item.latest = date;
                        stats.set(t, item);
                    });
                });
                const collator = new Intl.Collator('zh-Hans-CN');
                return Array.from(stats.values()).sort((a, b) => {
                    if (b.count !== a.count) return b.count - a.count;
                    if (a.latest !== b.latest) return a.latest < b.latest ? 1 : -1;
                    return collator.compare(a.name, b.name);
                });
            }

            function escapeHtml(value) {
                return String(value).replace(/[&<>"']/g, character => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[character]);
            }

            // ==================== 全站搜索：检索核心 ====================
            // 检索范围：标题、摘要、标签、正文（正文只用于排序与生成命中片段，
            // 不直接把整段正文塞进结果行，避免列表被长文撑开）。
            //
            // 打分是「字段权重 × 命中质量」的加法：
            //   - 整串出现在标题里（0 位置命中）权重最高，用户多半就是在找这篇；
            //   - 多个关键词全部命中 > 只命中一部分，命中全部关键词的会排在前面；
            //   - 标签命中给中等权重，让「按主题找」也能有结果；
            //   - 正文命中权重最低，只用于把相关文章捞出来并生成片段。
            const SEARCH_FIELD_LABELS = {
                title: '标题',
                excerpt: '摘要',
                tag: '标签',
                content: '正文',
            };
            const SEARCH_FIELD_WEIGHT = {
                title: 120,
                tag: 46,
                excerpt: 34,
                content: 12,
            };
            // 结果里最多展示多少条，避免一次性铺满一屏
            const SEARCH_RESULT_LIMIT = 24;
            // 输入停顿多久才真正检索。搜索本身是同步的，这个值只影响手感：
            // 太短会在中文输入法里频繁打断，太长会显得迟钝。
            const SEARCH_DEBOUNCE = 180;
            // 骨架屏至少停留的时间。检索是本地瞬时完成的，
            // 不留一点过渡会「闪一下」反而显得廉价，也会让人以为没响应。
            const SEARCH_MIN_PENDING = 240;
            const SEARCH_HISTORY_KEY = 'annie-search-history';
            const SEARCH_HISTORY_LIMIT = 6;

            // 去掉首尾空白并把连续空白压成一个空格，
            // 这样输入法里的全角空格、换行也不会把关键词切碎
            function normalizeQuery(value) {
                return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
            }

            // 把 HTML 正文压成纯文本：去标签、解常见实体、压空白、转小写。
            // 只用于检索和生成片段，不参与渲染。
            function normalizeText(value) {
                return String(value == null ? '' : value)
                    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/&nbsp;/gi, ' ')
                    .replace(/&amp;/gi, '&')
                    .replace(/&lt;/gi, '<')
                    .replace(/&gt;/gi, '>')
                    .replace(/&quot;/gi, '"')
                    .replace(/&#39;/gi, "'")
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();
            }

            // 拆关键词：空格分词 + 转小写。
            // 中文没有词边界，所以整串也会作为一个词保留，
            // 输入「第五人格 归宿」时两个词都要命中。
            function getKeywords(query) {
                return normalizeQuery(query)
                    .toLowerCase()
                    .split(' ')
                    .filter(Boolean);
            }

            // 每篇文章的检索缓存。正文正则去标签不算便宜，
            // 而文章数据在页面生命周期内不会变，算一次就够了。
            const searchIndexCache = new Map();

            function getSearchIndex(post) {
                const cached = searchIndexCache.get(post.id);
                if (cached && cached.source === post) return cached;
                const index = {
                    source: post,
                    title: normalizeText(post.title),
                    excerpt: normalizeText(post.excerpt),
                    tags: (post.tags || []).map(tag => normalizeText(tag)),
                    tagLine: (post.tags || []).map(tag => normalizeText(tag)).join(' '),
                    // 正文只在需要时才算：embeddedPage 是 iframe，
                    // 外站内容读不到，只能靠标题/摘要/标签匹配。
                    content: normalizeText(post.content),
                    date: String(post.date || ''),
                };
                searchIndexCache.set(post.id, index);
                return index;
            }

            function countHits(text, keywords) {
                if (!text) return 0;
                let hits = 0;
                keywords.forEach(keyword => {
                    let from = 0;
                    while (true) {
                        const at = text.indexOf(keyword, from);
                        if (at === -1) break;
                        hits += 1;
                        from = at + keyword.length;
                    }
                });
                return hits;
            }

            // 用「所有关键词都出现」做门槛，但允许分别落在不同字段。
            // 例如「阅读 工作流」：一个在标题、一个在摘要，也算命中。
            function matchesAllKeywords(index, keywords) {
                const haystack = `${index.title} ${index.excerpt} ${index.tagLine} ${index.content}`;
                return keywords.every(keyword => haystack.includes(keyword));
            }

            // 命中质量：0 位置命中（前缀）额外加权，整词等于字段内容再加权。
            function fieldScore(text, keywords, weight) {
                if (!text) return 0;
                let score = 0;
                keywords.forEach(keyword => {
                    const at = text.indexOf(keyword);
                    if (at === -1) return;
                    score += weight;
                    if (at === 0) score += weight * 0.55;
                    else if (/[\s，。、,.!?！？:：;；\-—]/.test(text.charAt(at - 1))) {
                        // 落在词边界上，比句中偶然出现更相关
                        score += weight * 0.2;
                    }
                    // 同一个词出现多次只给一点递减的加成，防止刷分
                    const extra = countHits(text, [keyword]) - 1;
                    if (extra > 0) score += Math.min(extra, 3) * weight * 0.08;
                });
                return score;
            }

            // 生成命中片段：优先取第一个关键词出现的位置，
            // 前后各截一段，让用户一眼看到「为什么这条被搜出来」。
            function buildSearchSnippet(index, keywords) {
                const source = index.content || index.excerpt;
                if (!source) return index.excerpt;
                const at = keywords
                    .map(keyword => source.indexOf(keyword))
                    .filter(pos => pos >= 0)
                    .sort((a, b) => a - b)[0];
                if (at == null || at < 0) return index.excerpt;
                // 正文里命中点可能离摘要很远，截 40 字上下文
                const start = Math.max(0, at - 26);
                const end = Math.min(source.length, at + 78);
                return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
            }

            // 搜索并按相关度排序。返回 [{ post, score, fields, snippet }]。
            function searchPosts(query) {
                const keywords = getKeywords(query);
                if (keywords.length === 0) return [];
                const results = [];

                blogPosts.forEach(post => {
                    // 未开放的文章不出现在搜索结果里：
                    // 搜得到却点不进去，比搜不到更让人困惑。
                    if (!isArticlePublic(post)) return;
                    const index = getSearchIndex(post);
                    if (!matchesAllKeywords(index, keywords)) return;

                    const fields = [];
                    let score = 0;

                    const titleScore = fieldScore(index.title, keywords, SEARCH_FIELD_WEIGHT.title);
                    if (titleScore > 0) {
                        score += titleScore;
                        fields.push('title');
                    }
                    const tagScore = fieldScore(index.tagLine, keywords, SEARCH_FIELD_WEIGHT.tag);
                    if (tagScore > 0) {
                        score += tagScore;
                        fields.push('tag');
                    }
                    const excerptScore = fieldScore(index.excerpt, keywords, SEARCH_FIELD_WEIGHT.excerpt);
                    if (excerptScore > 0) {
                        score += excerptScore;
                        fields.push('excerpt');
                    }
                    const contentScore = fieldScore(index.content, keywords, SEARCH_FIELD_WEIGHT.content);
                    if (contentScore > 0) {
                        score += contentScore;
                        fields.push('content');
                    }

                    // 整串（含空格）在标题里原样出现，几乎可以肯定就是要找的那篇
                    const phrase = normalizeQuery(query).toLowerCase();
                    if (phrase.includes(' ') && index.title.includes(phrase)) score += 90;

                    // 命中的关键词个数：全中的排前面，部分命中的往后放
                    const hitKeywordCount = keywords.filter(keyword =>
                        `${index.title} ${index.excerpt} ${index.tagLine} ${index.content}`.includes(keyword)
                    ).length;
                    score += hitKeywordCount * 6;

                    results.push({
                        post,
                        score,
                        fields: fields.sort((a, b) => SEARCH_FIELD_WEIGHT[b] - SEARCH_FIELD_WEIGHT[a]),
                        snippet: buildSearchSnippet(index, keywords),
                    });
                });

                results.sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    // 分数相同：置顶优先，再按 id 新的在前
                    const pinnedDiff = Number(Boolean(b.post.pinned)) - Number(Boolean(a.post.pinned));
                    if (pinnedDiff !== 0) return pinnedDiff;
                    return b.post.id - a.post.id;
                });

                return results.slice(0, SEARCH_RESULT_LIMIT);
            }

            // 把命中的关键词包成 <mark>。先转义再替换，
            // 这样用户输入 <script> 之类的字符不会变成真的标签。
            function highlightKeyword(value, query, extraClass) {
                const text = String(value == null ? '' : value);
                const keywords = getKeywords(query);
                if (keywords.length === 0) return escapeHtml(text);
                const escaped = keywords
                    .map(keyword => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .sort((a, b) => b.length - a.length);
                const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
                const cls = extraClass ? `search-hl ${extraClass}` : 'search-hl';
                return escapeHtml(text).replace(pattern, `<mark class="${cls}">$1</mark>`);
            }

            // 首页标签行固定展示的筛选项（「最新」「全部」由代码单独处理）
            const HOME_TAGS = ['置顶', '随笔'];

            /* 首页标签云显示几个标签。想多显示几个就改这个数字（比如 6），
               标签会自动换行，不用管样式。 */
            const TAG_CLOUD_LIMIT = 4;

            function renderTagPills(containerId) {
                const container = document.getElementById(containerId);
                if (!container) return;
                const isHome = containerId === 'tagFilterHome';
                const tag = isHome ? homeTag : blogTag;
                if (isHome) {
                    // 首页这一行：「最新」= 当下展示的最近几篇，默认选中；
                    // 「全部」不是筛选，点了直接去文章页看完整列表
                    container.innerHTML = [
                        `<span class="tag-pill${tag === 'all' ? ' active' : ''}" data-tag="all">最新</span>`,
                        `<span class="tag-pill" data-tag-jump="blog" title="去文章页看全部文章">全部</span>`,
                        ...HOME_TAGS.map(t =>
                            `<span class="tag-pill${t === tag ? ' active' : ''}" data-tag="${t}">${t}</span>`
                        ),
                    ].join('');
                } else {
                    /* 标签后面跟篇数，但只在 2 篇以上才显示：大部分标签只有一篇，
                       每个都挂个「1」既啰嗦又把标签栏撑成两行。
                       数字前面加 #，和标签名拉开一眼能分清的层次。 */
                    const withCount = (tagName, label, count, isActive) =>
                        `<span class="tag-pill${isActive ? ' active' : ''}" data-tag="${escapeHtml(tagName)}">${escapeHtml(label)}${count >= 2 ? `<span class="tag-pill-count">#${count}</span>` : ''}</span>`;
                    container.innerHTML = [
                        withCount('all', '全部', blogPosts.length, tag === 'all'),
                        ...getTagStats().map(item => withCount(item.name, item.name, item.count, item.name === tag)),
                    ].join('');
                }
                container.querySelectorAll('.tag-pill').forEach(pill => {
                    pill.addEventListener('click', function() {
                        // 「全部」：首页回到「最新」，文章页也一并清空筛选，然后跳过去
                        if (this.getAttribute('data-tag-jump')) {
                            homeTag = 'all';
                            blogTag = 'all';
                            renderTagPills('tagFilterHome');
                            renderTagPills('tagFilterBlog');
                            renderPostsList('postsListHome', true);
                            renderPostsList('postsListBlog', true);
                            // 文章的列表页也要从头看起，先清掉记忆里的位置，
                            // 否则切过去会被「恢复上次位置」再拽回去，看着像闪了一下
                            viewScrollPositions.blog = 0;
                            navigateToView('blog');
                            window.scrollTo({ top: 0, behavior: 'instant' });
                            return;
                        }
                        const nextTag = this.getAttribute('data-tag');
                        setTagOfView(isHome ? 'home' : 'blog', nextTag);
                        renderTagPills('tagFilterHome');
                        renderTagPills('tagFilterBlog');
                        // 只重画这一屏的列表，另一屏的筛选状态没变
                        renderPostsList(isHome ? 'postsListHome' : 'postsListBlog', true);
                    });
                });
                // 标签数量和文字长度都变了，重新判断搜索入口放不放得下
                scheduleSearchTriggerFit();
            }

            // ==================== 搜索入口：空间自适应 ====================
            // 手机上搜索按钮带「搜索」两个字，但如果这一行已经放不下
            //（屏幕太窄，或者以后标签变多占满横向空间），就把文字收起来、
            // 只留放大镜，免得标题被挤得换行或文字被截成半截。
            //
            // 判断方式：把「标题 + 搜索按钮 + 标签行」按不换行时的自然宽度
            // 加起来，和整行可用宽度比。超过就加 is-tight。
            // 比写死屏宽可靠——标签数量、字号、屏幕宽度怎么变都能跟上。
            let searchTriggerFitTimer = null;
            let searchTriggerFitRaf = null;

            function isSearchTriggerRowTight(header) {
                if (!header) return false;
                const head = header.querySelector('.home-section-head');
                const trigger = header.querySelector('.search-trigger');
                const label = header.querySelector('.section-label');
                const tagFilter = header.querySelector('.tag-filter');
                if (!head || !trigger || !label) return false;

                // 先把可能残留的 is-tight 撤掉，才能量到「文字展开时」的真实宽度
                header.classList.remove('is-tight');

                const headStyle = window.getComputedStyle(head);
                const headerStyle = window.getComputedStyle(header);
                const gap = parseFloat(headerStyle.columnGap || headerStyle.gap) || 0;
                const headGap = parseFloat(headStyle.columnGap || headStyle.gap) || 0;

                // 标题 + 搜索按钮的自然宽度
                const naturalHeadWidth =
                    label.scrollWidth + headGap + trigger.scrollWidth;
                // 标签行不换行时的自然宽度
                const naturalTagsWidth = tagFilter ? getTagFilterNaturalWidth(tagFilter) : 0;

                // 整行可用宽度 = 自身内容宽度（不受 justify-content 影响）
                const available = header.clientWidth;

                const needed =
                    naturalHeadWidth + (naturalTagsWidth ? gap + naturalTagsWidth : 0);

                // 留 2px 余量，避开 sub-pixel 取整造成的误判
                if (needed > available + 2) return true;

                // 保险：如果实际渲染已经把标签行挤到了下一行
                //（两者不在一行），同样视为「放不下」，收起搜索文字。
                // 这样即使某处 CSS 没生效，也不会出现「标题一行、标签一行」。
                if (tagFilter) {
                    const headRect = head.getBoundingClientRect();
                    const tagRect = tagFilter.getBoundingClientRect();
                    if (tagRect.top >= headRect.bottom - 2) return true;
                }
                return false;
            }

            // 标签行如果允许换行，scrollWidth 拿不到「不换行时的宽度」，
            // 这里逐个子元素累加，得到真实的自然宽度。
            function getTagFilterNaturalWidth(tagFilter) {
                const gap = parseFloat(window.getComputedStyle(tagFilter).columnGap || '0') || 0;
                let width = 0;
                let count = 0;
                tagFilter.querySelectorAll('.tag-pill').forEach(pill => {
                    width += pill.getBoundingClientRect().width;
                    count += 1;
                });
                if (count > 1) width += gap * (count - 1);
                return width;
            }

            function applySearchTriggerFit() {
                // 只有手机布局才自动收文字；桌面本来就有键盘提示，宽度也够
                const isNarrow = window.matchMedia('(max-width: 600px)').matches;

                // 全部文章页在手机上允许换行（标题一行、标签一行），
                // 换行后第一行只剩「全部文章 + 搜索」，空间充足，
                // 不需要再收起搜索文字。把它从自适应逻辑里排除掉，
                // 同时清掉可能残留的 is-tight / 内联样式。
                const blogHeader = document.querySelector('#view-blog > .section-header');
                if (blogHeader) {
                    blogHeader.classList.remove('is-tight');
                    clearHeaderInlineFit(blogHeader);
                    // 桌面端：标签放不下时独占一行、左对齐标题，
                    // 放得下时紧跟标题靠右。用实测决定用哪种形态。
                    updateBlogTagWrap(blogHeader);
                }

                // 首页：始终不换行，空间不够时收起搜索文字
                const headers = document.querySelectorAll('#view-home > .section-header');
                headers.forEach(header => {
                    if (!isNarrow) {
                        header.classList.remove('is-tight');
                        clearHeaderInlineFit(header);
                        return;
                    }
                    // 视图隐藏时 clientWidth 是 0，量不出结果，跳过
                    if (!header.clientWidth) return;
                    const tight = isSearchTriggerRowTight(header);
                    header.classList.toggle('is-tight', tight);
                    // CSS 已经用 flex + margin-left:auto 做了对齐，
                    // 但部分内核（如鸿蒙微信的 ArkWeb）对 flex 自动外边距、
                    // flex-basis 的处理不一致，会出现「标签没贴右」。
                    // 这里再用实测宽度写一次内联样式兜底，跑在 CSS 之后，
                    // 优先级更高，能覆盖掉内核差异。
                    applyHeaderInlineFit(header);
                });
            }

            // 全部文章页（桌面端）的标签形态切换。
            // 标签是从所有文章收集的，数量不定：放得下就让它们紧跟标题靠右；
            // 放不下就整体落到第二行、从左边开始，和「全部文章」对齐——
            // 否则换行后那一坨标签会孤零零地缩在右边，看着和标题脱节。
            // 判断方式：把标题组和标签的自然宽度加起来，跟整行可用宽度比。
            function updateBlogTagWrap(header) {
                if (!header) return;
                // 只有桌面端才有两种形态；手机端 CSS 里已经固定成换行布局
                if (!window.matchMedia('(min-width: 601px)').matches) {
                    header.classList.remove('is-tag-wrap');
                    return;
                }
                const head = header.querySelector('.home-section-head');
                const tagFilter = header.querySelector('.tag-filter');
                if (!head || !tagFilter) return;
                if (!header.clientWidth) return;

                // 先复位，才能量到「标签按内容展开」时的自然宽度
                header.classList.remove('is-tag-wrap');

                const headerStyle = window.getComputedStyle(header);
                const gap = parseFloat(headerStyle.columnGap || headerStyle.gap) || 0;
                const headWidth = head.getBoundingClientRect().width;
                const tagsWidth = getTagFilterNaturalWidth(tagFilter);
                const needed = headWidth + gap + tagsWidth;

                // 留 2px 余量，避开 sub-pixel 取整造成的误判
                header.classList.toggle('is-tag-wrap', needed > header.clientWidth + 2);
            }

            // 实测后把标签行宽度钉死，并把它推到最右。
            // 放得下：宽度 = 内容宽度；放不下：宽度 = 剩余空间（内部横向滚动）。
            //
            // 关键：不依赖 CSS 的 margin-left: auto。
            // 部分内核（鸿蒙微信的 ArkWeb 等）对 flex 自动外边距支持不一致，            // 会出现「标签没贴右」。这里直接用计算出的像素值写死 margin-left，
            // 内联样式优先级最高，任何内核都会照做。
            function applyHeaderInlineFit(header) {
                const head = header.querySelector('.home-section-head');
                const tagFilter = header.querySelector('.tag-filter');
                if (!head || !tagFilter) return;

                // 先清掉上一次的内联宽度，否则会被上次的定宽裁剪，
                // 量出来的内容宽度是错的（越量越窄）
                tagFilter.style.width = '';
                tagFilter.style.marginLeft = '';

                const headerStyle = window.getComputedStyle(header);
                const gap = parseFloat(headerStyle.columnGap || headerStyle.gap) || 0;
                const avail = header.clientWidth;
                const headWidth = head.getBoundingClientRect().width;
                const contentWidth = getTagFilterNaturalWidth(tagFilter);
                // 标签行最多能用的宽度
                const remaining = Math.max(0, avail - headWidth - gap);
                const targetWidth = Math.min(contentWidth, remaining);
                // 放得下就推到最右；放不下就紧贴标题（宽度占满剩余）
                const marginLeft = Math.max(0, Math.round(avail - headWidth - gap - targetWidth));

                tagFilter.style.flex = '0 0 auto';
                tagFilter.style.width = `${Math.round(targetWidth)}px`;
                tagFilter.style.minWidth = '0';
                tagFilter.style.maxWidth = 'none';
                tagFilter.style.marginLeft = `${marginLeft}px`;
                tagFilter.style.marginRight = '0';
                tagFilter.style.overflowX = 'auto';
                tagFilter.style.overflowY = 'hidden';
            }

            function clearHeaderInlineFit(header) {
                const tagFilter = header.querySelector('.tag-filter');
                if (!tagFilter) return;
                tagFilter.style.flex = '';
                tagFilter.style.width = '';
                tagFilter.style.minWidth = '';
                tagFilter.style.maxWidth = '';
                tagFilter.style.marginLeft = '';
                tagFilter.style.marginRight = '';
                tagFilter.style.overflowX = '';
                tagFilter.style.overflowY = '';
            }

            function scheduleSearchTriggerFit() {
                window.clearTimeout(searchTriggerFitTimer);
                searchTriggerFitTimer = window.setTimeout(applySearchTriggerFit, 0);
            }

            // 「置顶」既可能是 pinned 字段，也可能是同名的标签，两处都算
            function isPinnedPost(post) {
                return Boolean(post.pinned) || (post.tags || []).includes('置顶');
            }

            /* 卡片、文章页里「给人看的那个日期」一律走这里：
               写过 updated（且跟发布日期不同）就用 updated，否则用 date。
               注意只影响显示，不影响排序和归档分组——那两处仍然按 date，
               否则老文章改一下就会跳到最新月份里去。 */
            function postDisplayDate(post) {
                const published = String(post.date || '');
                const updated = typeof post.updated === 'string' ? post.updated.trim() : '';
                return updated && updated !== published ? updated : published;
            }

            // 是否「发布后又改过」——决定要不要露发布日/更新时间这类附加信息
            function postHasUpdate(post) {
                const published = String(post.date || '');
                const updated = typeof post.updated === 'string' ? post.updated.trim() : '';
                return Boolean(updated) && updated !== published;
            }

            function getFilteredPosts(tag) {
                const activeTag = tag || 'all';
                const posts = activeTag === 'all'
                    ? [...blogPosts]
                    : activeTag === '置顶'
                        ? blogPosts.filter(isPinnedPost)
                        : blogPosts.filter(p => p.tags.includes(activeTag));
                // 置顶永远排在最前面
                return posts.sort((a, b) => Number(isPinnedPost(b)) - Number(isPinnedPost(a)));
            }

            // 首页只摊开最近更新的几篇，剩下的都在「文章」页
            const HOME_POST_LIMIT = 6;

            // 首页：置顶依旧在最前面，其余按日期倒序，总共最多 6 篇
            function getHomePosts() {
                return getFilteredPosts(homeTag)
                    .sort((a, b) => {
                        const pinnedDiff = Number(isPinnedPost(b)) - Number(isPinnedPost(a));
                        if (pinnedDiff) return pinnedDiff;
                        // 改过的文章用 updated 参与排序，跟卡片上显示的日期保持一致
                        return postDisplayDate(b).localeCompare(postDisplayDate(a));
                    })
                    .slice(0, HOME_POST_LIMIT);
            }

            /* 首页底部「查看全部文章 →」带上总篇数，省得点进去才知道有多少篇。
               数量取「文章」视图里的全部文章（不加标签筛选），和点进去看到的条数一致。
               直接写 textContent、不在里面套 <span>：那条 data-nav="blog" 的点击
               判断用的是 e.target.matches(...)，多包一层元素会让点击落空。 */
            function syncAllPostsCount() {
                const link = document.getElementById('viewAllPosts');
                if (!link || !blogPosts.length) return;
                link.textContent = `查看全部 ${blogPosts.length} 篇文章 →`;
            }

            /* 记住每个列表上次是按哪个筛选画的。
               从文章返回、或者来回切视图时会重新调用 renderPostsList，
               内容其实没变却整块重画——卡片里的图片被重建，
               「模糊 → 清晰」的淡入又放一遍，看着就是闪。 */
            const postsRenderKeys = new Map();

            /* 首页骨架屏退场。
               直接把骨架删掉（innerHTML 整个覆盖）是一帧硬切：灰块瞬间消失、
               卡片瞬间出现，像闪了一下。这里换个做法——量下骨架此刻的位置和高度，
               把它摘下来改成 fixed 定位盖在原地，让真实卡片在下面顶上来，
               再让它淡出：骨架和内容在同一次重排里完成交替，看到的是交叉淡化。
               尺寸按退场瞬间的 rect 写死，新内容比骨架高或矮都不会把它拉变形。 */
            function releaseSkeleton(container) {
                const skeleton = container.querySelector('.home-skeleton');
                if (!skeleton) return;
                const rect = skeleton.getBoundingClientRect();
                skeleton.classList.add('home-skeleton--ghost');
                skeleton.style.left = rect.left + 'px';
                skeleton.style.top = rect.top + 'px';
                skeleton.style.width = rect.width + 'px';
                skeleton.style.height = rect.height + 'px';
                // 先搬出列表：下面 innerHTML 会把列表整个换掉，
                // 留在里面只会被一起删掉，动画也就无从谈起
                document.body.appendChild(skeleton);
                // 等下一帧再加 is-leaving。同一帧里刚插入就写 opacity:0，
                // 起始态不会被算进过渡，整段动画会被跳过（直接消失）
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    // 减弱动效时没有过渡，跳过这一帧等待，否则影子会实心闪一下
                    skeleton.classList.add('is-leaving');
                } else {
                    requestAnimationFrame(function () {
                        skeleton.classList.add('is-leaving');
                    });
                }
                // 淡出 260ms，多留一点余量再摘节点
                window.setTimeout(function () {
                    skeleton.remove();
                }, 420);
            }

            function renderPostsList(containerId, animate = false) {
                const container = document.getElementById(containerId);
                if (!container) return;
                const isHomeList = postsListHome && container === postsListHome;
                const posts = isHomeList ? getHomePosts() : getFilteredPosts(blogTag);
                const listKey = (isHomeList ? 'home:' : 'blog:') + (isHomeList ? homeTag : blogTag);
                // 换筛选、或明确要求播入场动画（animate）时才真的重画
                if (!animate && postsRenderKeys.get(containerId) === listKey && container.firstChild) return;
                postsRenderKeys.set(containerId, listKey);
                if (posts.length === 0) {
                    releaseSkeleton(container);
                    container.innerHTML = '<p style="color:#999;text-align:center;padding:30px 0;">暂无文章</p>';
                    return;
                }
                // 首屏：骨架在场就交叉淡出，卡片本身不再播入场动画
                // （不然透明度从 0 起步，骨架淡掉的那 260ms 里会看到一块空白）
                const fromSkeleton = !!container.querySelector('.home-skeleton');
                releaseSkeleton(container);
                container.innerHTML = posts.map(p => {
                    // 卡片顶部的元信息行：日期 + 主标签（当作分类）+ 其余标签做成 #胶囊。
                    // 日期从原来的统计行挪到最上面，和标签排成一行，层次更干净。
                    // 「置顶」是作者用来标记文章的一个标签，不适合当分类读，
                    // 所以单独做成前面那枚「置顶」徽标（pinned 字段同样会触发）。
                    const allTags = p.tags || [];
                    const isPinned = p.pinned || allTags.includes('置顶');
                    const visibleTags = allTags.filter(t => t !== '置顶');
                    const firstTag = visibleTags[0] || '文章';
                    const restTags = visibleTags.slice(1);
                    const commentCount = 12 + (p.id % 9);
                    const likeCount = 7 + (p.id % 6);
                // ================ 二级菜单默认选项 ================
                    // url 里可以用占位符：{id} 换成文章 id，{title} 换成文章标题。
                    // 「问题反馈」和「查看评论」用 type: 'feedback' / 'comments'：
                    // 都是站内切视图，不整页跳转。
                    const menuItems = articleMenus[p.id] || [
                        { label: '复制文章链接', type: 'share' },
                        { label: '查看评论', type: 'comments' },
                        { label: '问题反馈', type: 'feedback' },
                    ];
                    const menuLinks = menuItems.map(item => {
                        if (item.type === 'article') {
                            return `<button class="post-menu-item" type="button" role="menuitem" data-action="article"><i class="ri-article-line"></i>${escapeHtml(item.label)}</button>`;
                        }
                        // 分享：直接复制这篇文章的链接（?article=id）
                        if (item.type === 'share') {
                            return `<button class="post-menu-item" type="button" role="menuitem" data-action="share"><i class="ri-link"></i>${escapeHtml(item.label)}</button>`;
                        }
                        // 反馈 / 评论：站内切视图。做成按钮而不是带 URL 的链接，
                        // 否则整页重载，回来还得重新渲染一遍文章
                        if (item.type === 'feedback') {
                            return `<button class="post-menu-item" type="button" role="menuitem" data-action="feedback"><i class="ri-feedback-line"></i>${escapeHtml(item.label)}</button>`;
                        }
                        if (item.type === 'comments') {
                            return `<button class="post-menu-item" type="button" role="menuitem" data-action="comments"><i class="ri-chat-3-line"></i>${escapeHtml(item.label)}</button>`;
                        }
                        let url = item.type === 'externalPage' ? p.externalPage : item.url;
                        if (!url) return '';
                        // 替换 URL 模板中的占位符
                        url = url.replace(/{id}/g, p.id).replace(/{title}/g, encodeURIComponent(p.title));
                        // 注意命名顺序：Remix Icon 里是 arrow-right-up，没有 arrow-up-right。
                        // 之前这里写反了顺序，字体里查不到那个类名，
                        // 菜单里「自定义链接」那一项的图标一直是空白（不会报错，只是不显示）。
                        const icon = item.type === 'externalPage' ? 'ri-external-link-line' : 'ri-arrow-right-up-line';
                        const target = new URL(url, window.location.href).origin === window.location.origin
                            ? ''
                            : ' target="_blank" rel="noopener noreferrer"';
                        return `<a class="post-menu-item" role="menuitem" href="${escapeHtml(url)}"${target}><i class="${icon}"></i>${escapeHtml(item.label)}</a>`;
                    }).join('');

                    return `
                        <article class="task post-card${animate && !fromSkeleton ? ' post-card-enter' : ''}" data-article-id="${p.id}" draggable="true">
                            <div class="tags">
                                <div class="tags-left">
                                    ${isPinned ? '<span class="tag-pinned" title="置顶文章"><i class="ri-pushpin-2-line" aria-hidden="true"></i></span><span class="tag-pinned-label">置顶</span>' : ''}
                                    <span class="tag-cat">${firstTag}</span>
                                    <time class="post-card-date" datetime="${postDisplayDate(p)}">${postDisplayDate(p)}</time>
                                </div>
                                <button class="options" type="button" aria-label="更多选项" aria-haspopup="menu" aria-expanded="false">
                                    <svg xml:space="preserve" viewBox="0 0 41.915 41.916" xmlns="http://www.w3.org/2000/svg" id="Capa_1" version="1.1" fill="#000000" aria-hidden="true"><g stroke-width="0" id="SVGRepo_bgCarrier"></g><g stroke-linejoin="round" stroke-linecap="round" id="SVGRepo_tracerCarrier"></g><g id="SVGRepo_iconCarrier"><g><g><path d="M11.214,20.956c0,3.091-2.509,5.589-5.607,5.589C2.51,26.544,0,24.046,0,20.956c0-3.082,2.511-5.585,5.607-5.585 C8.705,15.371,11.214,17.874,11.214,20.956z"></path><path d="M26.564,20.956c0,3.091-2.509,5.589-5.606,5.589c-3.097,0-5.607-2.498-5.607-5.589c0-3.082,2.511-5.585,5.607-5.585 C24.056,15.371,26.564,17.874,26.564,20.956z"></path><path d="M41.915,20.956c0,3.091-2.509,5.589-5.607,5.589c-3.097,0-5.606-2.498-5.606-5.589c0-3.082,2.511-5.585,5.606-5.585 C39.406,15.371,41.915,17.874,41.915,20.956z"></path></g></g></g></svg>
                                </button>
                                <div class="post-menu" role="menu" hidden>
                                    ${menuLinks}
                                </div>
                            </div>
                            <h3 class="task-title">${p.title}</h3>
                            <p class="task-excerpt">${p.excerpt}</p>
                            <div class="stats">
                                <div class="stats-main">
                                    <div><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><g stroke-width="0" id="SVGRepo_bgCarrier"></g><g stroke-linejoin="round" stroke-linecap="round" id="SVGRepo_tracerCarrier"></g><g id="SVGRepo_iconCarrier"><path stroke-linejoin="round" stroke-linecap="round" stroke-width="1.5" d="M16 10H16.01M12 10H12.01M8 10H8.01M3 10C3 4.64706 5.11765 3 12 3C18.8824 3 21 4.64706 21 10C21 15.3529 18.8824 17 12 17C11.6592 17 11.3301 16.996 11.0124 16.9876L7 21V16.4939C4.0328 15.6692 3 13.7383 3 10Z"></path></g></svg>${commentCount}</div>
                                    <div><svg fill="#000000" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="-2.5 0 32 32"><g stroke-width="0" id="SVGRepo_bgCarrier"></g><g stroke-linejoin="round" stroke-linecap="round" id="SVGRepo_tracerCarrier"></g><g id="SVGRepo_iconCarrier"><g id="icomoon-ignore"></g><path fill="#000000" d="M0 10.284l0.505 0.36c0.089 0.064 0.92 0.621 2.604 0.621 0.27 0 0.55-0.015 0.836-0.044 3.752 4.346 6.411 7.472 7.060 8.299-1.227 2.735-1.42 5.808-0.537 8.686l0.256 0.834 7.63-7.631 8.309 8.309 0.742-0.742-8.309-8.309 7.631-7.631-0.834-0.255c-2.829-0.868-5.986-0.672-8.686 0.537-0.825-0.648-3.942-3.3-8.28-7.044 0.11-0.669 0.23-2.183-0.575-3.441l-0.352-0.549-8.001 8.001zM1.729 10.039l6.032-6.033c0.385 1.122 0.090 2.319 0.086 2.334l-0.080 0.314 0.245 0.214c7.409 6.398 8.631 7.39 8.992 7.546l-0.002 0.006 0.195 0.058 0.185-0.087c2.257-1.079 4.903-1.378 7.343-0.836l-13.482 13.481c-0.55-2.47-0.262-5.045 0.837-7.342l0.104-0.218-0.098-0.221-0.031 0.013c-0.322-0.632-1.831-2.38-7.498-8.944l-0.185-0.215-0.282 0.038c-0.338 0.045-0.668 0.069-0.981 0.069-0.595 0-1.053-0.083-1.38-0.176z"></path></g></svg>${likeCount}</div>
                                </div>
                                ${restTags.length ? `<div class="post-card-tags">${restTags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                            </div>
                        </article>
                    `;
                }).join('');
                container.querySelectorAll('.post-card').forEach(card => {
                    card.addEventListener('click', function(e) {
                        if (e.target.closest('.options, .post-menu')) return;
                        const id = parseInt(this.getAttribute('data-article-id'));
                        openArticle(id);
                    });
                    // 移动端按下卡片时的触感反馈。
                    // 只在自己写这个类时才缩小：点在三点按钮或菜单上时不缩小，
                    // 否则菜单一展开整张卡片会缩一下再弹回去，看起来像在跳动。
                    card.addEventListener('pointerdown', function(e) {
                        if (e.target.closest('.options, .post-menu')) return;
                        card.classList.add('is-pressed');
                    });
                    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(type) {
                        card.addEventListener(type, function() {
                            card.classList.remove('is-pressed');
                        });
                    });
                });
                container.querySelectorAll('.options').forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const card = this.closest('.post-card');
                        const isOpen = !card.classList.contains('menu-open');
                        document.querySelectorAll('.post-card.menu-open').forEach(openCard => {
                            openCard.classList.remove('menu-open');
                            openCard.querySelector('.options').setAttribute('aria-expanded', 'false');
                            openCard.querySelector('.post-menu').hidden = true;
                        });
                        if (isOpen) {
                            card.classList.add('menu-open');
                            this.setAttribute('aria-expanded', 'true');
                            card.querySelector('.post-menu').hidden = false;
                        }
                    });
                });
                container.querySelectorAll('.post-menu [data-action="article"]').forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const card = this.closest('.post-card');
                        card.classList.remove('menu-open');
                        card.querySelector('.options').setAttribute('aria-expanded', 'false');
                        card.querySelector('.post-menu').hidden = true;
                        openArticle(parseInt(card.getAttribute('data-article-id')));
                    });
                });
                container.querySelectorAll('.post-menu [data-action="share"]').forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const card = this.closest('.post-card');
                        card.classList.remove('menu-open');
                        card.querySelector('.options').setAttribute('aria-expanded', 'false');
                        card.querySelector('.post-menu').hidden = true;
                        const post = blogPosts.find(item => item.id === parseInt(card.getAttribute('data-article-id'), 10));
                        // 菜单项写的是「复制链接」，就只复制，不弹系统分享面板
                        if (post) copyArticleLink(post);
                    });
                });
                container.querySelectorAll('.post-menu [data-action="comments"]').forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const card = this.closest('.post-card');
                        card.classList.remove('menu-open');
                        card.querySelector('.options').setAttribute('aria-expanded', 'false');
                        card.querySelector('.post-menu').hidden = true;
                        const post = blogPosts.find(item => item.id === parseInt(card.getAttribute('data-article-id'), 10));
                        openComments(post || null);
                    });
                });
                container.querySelectorAll('.post-menu [data-action="feedback"]').forEach(button => {
                    button.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const card = this.closest('.post-card');
                        card.classList.remove('menu-open');
                        card.querySelector('.options').setAttribute('aria-expanded', 'false');
                        card.querySelector('.post-menu').hidden = true;
                        const post = blogPosts.find(item => item.id === parseInt(card.getAttribute('data-article-id'), 10));
                        openFeedback(post || null);
                    });
                });
                container.querySelectorAll('.post-menu a').forEach(link => {
                    link.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const card = this.closest('.post-card');
                        card.classList.remove('menu-open');
                        card.querySelector('.options').setAttribute('aria-expanded', 'false');
                        card.querySelector('.post-menu').hidden = true;
                        // 同标签页跳转到其它 HTML 页面时，先记住当前界面
                        if (this.target !== '_blank') saveViewState();
                    });
                });
            }

            // ==================== 本周折腾 ====================
            // 数据在 js/tweaks-data.js：首页只露前三张，
            // 「全部折腾」切到站内的折腾视图（#view-tweaks）看完整列表，
            // 两处共用同一份数组。
            const blogTweaks = Array.isArray(window.BLOG_TWEAKS) ? window.BLOG_TWEAKS : [];

            function renderTweaks() {
                const list = document.getElementById('tweakList');
                if (!list) return;
                list.innerHTML = blogTweaks.map(item => `
                    <article class="tweak-card" role="button" tabindex="0"
                             aria-label="去「全部折腾」看完整记录：${escapeHtml(item.label)}">
                        <div class="tweak-meta">
                            <time class="tweak-date" datetime="${item.iso}">${item.date}</time>
                            <span class="tweak-cat"><span class="tweak-emoji" aria-hidden="true">${item.emoji}</span>${escapeHtml(item.label)}</span>
                        </div>
                        <p class="tweak-text">${escapeHtml(item.text)}</p>
                    </article>`).join('');
            }

            // 「全部折腾」：切到站内的折腾视图（不占导航栏，走视图历史，
            // 返回键能退回首页原位）。首页卡片也走这里，进列表顶部，不按索引往下滚。
            function openTweaksView() {
                viewScrollPositions.tweaks = 0;
                navigateToView('tweaks');
                window.scrollTo({ top: 0, behavior: 'instant' });
            }

            (function bindTweakAll() {
                const allLink = document.getElementById('tweakAll');
                if (!allLink) return;
                allLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    openTweaksView();
                });
            })();

            (function bindTweakCards() {
                const list = document.getElementById('tweakList');
                if (!list) return;
                list.addEventListener('click', function(e) {
                    const card = e.target.closest('.tweak-card');
                    if (!card || !list.contains(card)) return;
                    openTweaksView();
                });
                // 卡片上挂了 role="button"，Enter / 空格也要能进
                list.addEventListener('keydown', function(e) {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    const card = e.target.closest('.tweak-card');
                    if (!card) return;
                    e.preventDefault();
                    openTweaksView();
                });
            })();

            // 折腾视图的完整列表（首页只露前三张，这里全给）
            function renderTweaksFeed() {
                const feed = document.getElementById('tweaksFeed');
                if (!feed) return;
                if (!blogTweaks.length) {
                    feed.innerHTML = '<p class="tweaks-empty">还没有记录。</p>';
                    return;
                }
                feed.innerHTML = blogTweaks.map(item => `
                    <article class="tweak-entry">
                        <div class="tweak-meta">
                            <time class="tweak-date" datetime="${item.iso}">${item.date}</time>
                            <span class="tweak-cat"><span class="tweak-emoji" aria-hidden="true">${item.emoji}</span>${escapeHtml(item.label)}</span>
                        </div>
                        <p class="tweak-text">${escapeHtml(item.text)}</p>
                    </article>`).join('');
            }

            // ==================== 时间线 ====================
            // 按「年 → 月 → 文章」把 blogPosts 归一遍，年、月都能折叠。
            // 不另外维护数据：新发一篇，这里自动就多一条。
            const MONTH_LABEL = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
                '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

            function buildTimeline() {
                const byYear = new Map();
                // 日期倒序：新的年份、月份和文章都排在最前面。
                // 一律用 postDisplayDate：改过的文章按最近更新日排/归月，跟卡片一致
                const posts = [...blogPosts].sort((a, b) => postDisplayDate(b).localeCompare(postDisplayDate(a)));
                posts.forEach(post => {
                    const raw = postDisplayDate(post);
                    const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    if (!matched) return;
                    const year = matched[1];
                    const month = matched[2];
                    if (!byYear.has(year)) byYear.set(year, new Map());
                    const months = byYear.get(year);
                    if (!months.has(month)) months.set(month, []);
                    months.get(month).push({
                        id: post.id,
                        title: post.title,
                        // 时间线里只写「月.日」，年份已经在上一级了
                        day: `${Number(month)}.${Number(matched[3])}`,
                    });
                });

                return Array.from(byYear.entries()).map(([year, months]) => {
                    const monthList = Array.from(months.entries()).map(([month, list]) => ({
                        month,
                        label: MONTH_LABEL[Number(month) - 1] || `${Number(month)} 月`,
                        posts: list,
                    }));
                    return {
                        year,
                        count: monthList.reduce((sum, item) => sum + item.posts.length, 0),
                        months: monthList,
                    };
                });
            }

            /* 首页时间线下面的标签云：取篇数最多的 4 个标签。
               排序直接用 getTagStats()，和文章页标签栏是同一套规则
               （篇数 → 更新时间 → 拼音），两处不会打架。
               点一下等于「去文章页 + 筛到这个标签」，省得自己再找一遍。 */
            function renderTagCloud() {
                const mount = document.getElementById('tagCloud');
                if (!mount) return;

                const top = getTagStats().slice(0, TAG_CLOUD_LIMIT);
                if (!top.length) { mount.innerHTML = ''; return; }

                mount.innerHTML = top.map(item =>
                    `<span class="tag-pill" data-cloud-tag="${escapeHtml(item.name)}">${escapeHtml(item.name)}<span class="tag-pill-count">#${item.count}</span></span>`
                ).join('');

                mount.querySelectorAll('[data-cloud-tag]').forEach(pill => {
                    pill.addEventListener('click', function () {
                        setTagOfView('blog', this.getAttribute('data-cloud-tag'));
                        renderTagPills('tagFilterHome');
                        renderTagPills('tagFilterBlog');
                        renderPostsList('postsListBlog', true);
                        // 清掉记忆里的位置，否则跳过去会被「恢复上次位置」拽回来
                        viewScrollPositions.blog = 0;
                        navigateToView('blog');
                        window.scrollTo({ top: 0, behavior: 'instant' });
                    });
                });
            }

            function renderTimeline() {
                const mount = document.getElementById('timelineMount');
                if (!mount) return;
                renderTagCloud();
                const years = buildTimeline();
                if (!years.length) {
                    mount.innerHTML = '<p class="tl-empty">还没有文章。</p>';
                    return;
                }
                mount.innerHTML = years.map((yearGroup, yearIndex) => {
                    // 默认只展开最新的那一年，其余年份收起来
                    const yearOpen = yearIndex === 0;
                    const months = yearGroup.months.map((monthGroup, monthIndex) => {
                        // 默认展开最新的那个月
                        const monthOpen = yearOpen && monthIndex === 0;
                        const posts = monthGroup.posts.map(post => `
                            <li class="tl-post">
                                <span class="tl-date">${post.day}</span>
                                <a class="tl-post-title" href="index.html?article=${post.id}" data-timeline-article="${post.id}">${escapeHtml(post.title)}</a>
                            </li>`).join('');
                        return `
                            <div class="tl-month${monthOpen ? ' is-open' : ''}">
                                <button class="tl-month-head" type="button" aria-expanded="${monthOpen}">
                                    <span class="tl-month-label">${monthGroup.label}</span>
                                    <span class="tl-side">
                                        <span class="tl-count">${monthGroup.posts.length} 篇</span>
                                        <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
                                    </span>
                                </button>
                                <ul class="tl-posts">${posts}</ul>
                            </div>`;
                    }).join('');

                    return `
                        <div class="tl-year${yearOpen ? '' : ' is-collapsed'}">
                            <button class="tl-year-head" type="button" aria-expanded="${yearOpen}">
                                <span class="tl-year-label">${yearGroup.year}</span>
                                <span class="tl-side">
                                    <span class="tl-count">${yearGroup.count} 篇</span>
                                    <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
                                </span>
                            </button>
                            <div class="tl-months">${months}</div>
                        </div>`;
                }).join('');
            }

            // 月份展开 / 收起：把高度从当前值补到目标值，动画结束就撤掉，
            // 高度还回 CSS 里的 auto / 0，排版不会留下写死的像素。
            const collapseAnimations = new WeakMap();
            const timelineReduceMotion = window.matchMedia
                ? window.matchMedia('(prefers-reduced-motion: reduce)')
                : null;

            function animateCollapse(list, start, end) {
                if (start === end
                    || typeof list.animate !== 'function'
                    || (timelineReduceMotion && timelineReduceMotion.matches)) {
                    return;
                }
                // 动画期间才裁切（见 .tl-months.is-animating 的注释）
                list.classList.add('is-animating');
                const cleanup = () => list.classList.remove('is-animating');
                const anim = list.animate(
                    [{ height: `${start}px` }, { height: `${end}px` }],
                    { duration: 280, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
                );
                anim.onfinish = cleanup;
                anim.oncancel = cleanup;
                collapseAnimations.set(list, anim);
            }

            // 年 / 月共用：给 host 切一个类，再让 list 的高度从当前值补到目标值
            function toggleCollapse(host, list, open, applyClass) {
                if (!list) return;
                // 先记下当前可见高度（可能正处在上一段动画里，接得上）
                const start = list.getBoundingClientRect().height;
                const previous = collapseAnimations.get(list);
                if (previous) previous.cancel();

                applyClass(host, open);
                // 量一次目标状态的自然高度：展开是内容高度，收起是 0
                list.style.height = 'auto';
                const natural = list.getBoundingClientRect().height;
                list.style.height = '';
                animateCollapse(list, start, open ? natural : 0);
            }

            function setMonthOpen(monthEl, open) {
                toggleCollapse(monthEl, monthEl.querySelector('.tl-posts'), open,
                    (host, next) => host.classList.toggle('is-open', next));
            }

            function setYearOpen(yearEl, open) {
                // 年份的类是反过来的：收起才有 is-collapsed
                toggleCollapse(yearEl, yearEl.querySelector('.tl-months'), open,
                    (host, next) => host.classList.toggle('is-collapsed', !next));
            }

            // 年 / 月折叠与文章跳转都用事件委托，重绘后不用重新绑
            (function bindTimeline() {
                const mount = document.getElementById('timelineMount');
                if (!mount) return;
                mount.addEventListener('click', function(e) {
                    const monthHead = e.target.closest('.tl-month-head');
                    if (monthHead) {
                        const month = monthHead.closest('.tl-month');
                        const open = !month.classList.contains('is-open');
                        setMonthOpen(month, open);
                        monthHead.setAttribute('aria-expanded', String(open));
                        return;
                    }
                    const yearHead = e.target.closest('.tl-year-head');
                    if (yearHead) {
                        const year = yearHead.closest('.tl-year');
                        const open = year.classList.contains('is-collapsed');
                        setYearOpen(year, open);
                        yearHead.setAttribute('aria-expanded', String(open));
                        return;
                    }
                    const title = e.target.closest('[data-timeline-article]');
                    if (title) {
                        e.preventDefault();
                        openArticle(parseInt(title.getAttribute('data-timeline-article'), 10));
                    }
                });
            })();

            // 「完整归档」：去文章页看完整列表
            // ==================== 归档视图 ====================
            // 和首页时间线读同一份 blogPosts：按年份分组，年份内按日期倒序。
            // 「目前共计 N 篇」也在这里算，新发文不用手动改数字。
            function renderArchive() {
                const feed = document.getElementById('archiveFeed');
                if (!feed) return;
                const countEl = document.getElementById('archiveCount');

                const valid = blogPosts
                    .map(post => {
                        // 归月、排序、显示的日期统一取「最近更新优先」的那个值
                        const display = postDisplayDate(post);
                        const matched = display.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        if (!matched) return null;
                        return {
                            id: post.id,
                            title: post.title,
                            year: matched[1],
                            month: Number(matched[2]),
                            day: Number(matched[3]),
                            date: display,
                        };
                    })
                    .filter(Boolean)
                    .sort((a, b) => b.date.localeCompare(a.date));

                if (countEl) countEl.textContent = String(valid.length);
                if (!valid.length) {
                    feed.innerHTML = '<p class="archive-empty">还没有文章。</p>';
                    return;
                }

                // 已经按日期倒序，所以年份、月份、日都是新的在前
                const years = [];
                const byYear = new Map();
                valid.forEach(item => {
                    if (!byYear.has(item.year)) {
                        byYear.set(item.year, []);
                        years.push(item.year);
                    }
                    byYear.get(item.year).push(item);
                });

                feed.innerHTML = years.map(year => {
                    const rows = byYear.get(year).map(item => `
                        <li class="archive-item">
                            <time class="archive-date" datetime="${item.date}">${item.year}年${item.month}月${item.day}日</time>
                            <a class="archive-link" href="index.html?article=${item.id}">${escapeHtml(item.title)}</a>
                        </li>`).join('');
                    return `
                        <section class="archive-year">
                            <span class="archive-ring" aria-hidden="true"></span>
                            <h2 class="archive-year-label">${year}</h2>
                            <ul class="archive-list">${rows}</ul>
                        </section>`;
                }).join('');
            }

            // 「完整归档」：切到站内的归档视图（走视图历史，返回键能回首页）
            (function bindTimelineAll() {
                const allLink = document.getElementById('timelineAll');
                if (!allLink) return;
                allLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    viewScrollPositions.archive = 0;
                    navigateToView('archive');
                    window.scrollTo({ top: 0, behavior: 'instant' });
                });
            })();

            // iframe 的普通导航（设置 src / 移除 src）都会往浏览器历史里塞记录，
            // 这些记录会占掉一次“返回”，导致返回首页要按两次，所以统一改用
            // location.replace() 切换内嵌页面：它只替换当前记录，不新增记录。
            function setFrameSource(frame, url) {
                const target = url ? new URL(url, window.location.href).href : 'about:blank';
                let current = '';
                try {
                    current = frame.contentWindow ? frame.contentWindow.location.href : '';
                } catch (error) {
                    current = frame.src || '';
                }
                if (current === target) return false;
                if (!url && current === 'about:blank') return false;
                try {
                    frame.contentWindow.location.replace(target);
                } catch (error) {
                    // 跨域页面读不到 location，只能退回直接设置 src
                    if (url) {
                        frame.src = url;
                    } else {
                        frame.removeAttribute('src');
                    }
                }
                return true;
            }

            // 内嵌页面就绪：收起加载动画，把内容淡入
            function revealEmbeddedPage() {
                clearTimeout(embeddedPageFallbackTimer);
                embeddedPageFallbackTimer = null;
                embeddedArticleWrap.classList.remove('is-loading');
                embeddedArticleWrap.classList.add('is-ready');
            }

            // 更新分享卡片元信息（og:title / og:description / og:image / og:url）。
            // 微信抓取的是「被分享的那个 URL」，而本站文章都是 index.html?article=N
            // 同一个页面靠 JS 换内容，微信不会执行 JS 后再抓，所以这里改 meta
            // 对微信无效、对支持动态渲染的抓取器（部分浏览器 / Slack 等）有效。
            // 保留它是为了：链接被其它平台抓取时标题能对上当前文章。
            function updateShareMeta(post) {
                const url = buildArticleUrl(post.id);
                const setMeta = (selector, attr, value) => {
                    const el = document.head.querySelector(selector);
                    if (el) el.setAttribute(attr, value);
                };
                const title = post.title || 'Annie · 个人博客';
                const desc = post.excerpt || '思考 · 记录 · 创造';
                setMeta('meta[property="og:title"]', 'content', title);
                setMeta('meta[property="og:description"]', 'content', desc);
                setMeta('meta[property="og:url"]', 'content', url);
                setMeta('meta[name="twitter:title"]', 'content', title);
                setMeta('meta[name="twitter:description"]', 'content', desc);
                // 浏览器标签页标题也一起换掉，复制链接时更清楚
                document.title = `${title}`;
            }

            /* ============================================================
               链接提示窗
               正文里给链接加 class="gated-link"、href 写 #，点它就弹这个窗：
                      <a class="gated-link" href="#">点击前往</a>
               窗里只有「前往 / 取消 / × / 点遮罩」，都只是关掉窗口：
               不做密码校验、不跳转，地址也不存在代码里。
               ============================================================ */
            let linkGateEls = null;
            function ensureLinkGate() {
                if (linkGateEls) return linkGateEls;
                const wrap = document.createElement('div');
                wrap.className = 'link-gate';
                wrap.hidden = true;
                wrap.innerHTML = [
                    '<div class="link-gate-backdrop" data-close></div>',
                    '<div class="link-gate-card" role="dialog" aria-modal="true" aria-labelledby="linkGateTitle">',
                    '<button type="button" class="link-gate-close" data-close aria-label="关闭">×</button>',
                    '<h2 class="link-gate-title" id="linkGateTitle">根据相关规定，链接已停止访问</h2>',
                    '<p class="link-gate-desc">点击任意处关闭</p>',
                    '</div>'
                ].join('');
                document.body.appendChild(wrap);
                const els = {
                    wrap: wrap
                };
                /* 「前往」「取消」「×」「点遮罩」都只是关掉窗口 */
                wrap.addEventListener('click', function (event) {
                    if (event.target.closest('[data-close]')) hideLinkGate();
                });
                document.addEventListener('keydown', function (event) {
                    if (event.key === 'Escape' && !wrap.hidden) hideLinkGate();
                });
                linkGateEls = els;
                return els;
            }

            function showLinkGate() {
                const els = ensureLinkGate();
                els.wrap.hidden = false;
            }

            function hideLinkGate() {
                if (!linkGateEls || linkGateEls.wrap.hidden) return;
                linkGateEls.wrap.hidden = true;
            }

            /* ============================================================
               离开本站前的确认弹窗
               给外链按钮加 data-confirm-leave="GitHub"，点它先问一句：
                 「即将离开当前页面，前往 GitHub，是否继续？」
               选「继续」才走原来那次跳转（href / target 一个字符都不改），
               选「取消」「Esc」或点遮罩就只是关掉窗口，人留在原地。
               浮层按需创建、用完隐藏，页面 HTML 里不占结构。
               ============================================================ */
            let leaveConfirmEls = null;
            let leaveConfirmTrigger = null;
            /* 确认放行的那一次点击。用它区分「用户自己点」和「确认后由代码触发」，
               否则 link.click() 会再次被下面的监听拦下来，弹窗套娃 */
            let leaveConfirmBypass = null;
            /* 淡出动画时长（ms），和 css/style.css 的 --leave-confirm-fade 对齐 */
            const LEAVE_CONFIRM_FADE_MS = 180;
            let leaveConfirmHideTimer = null;
            let leaveConfirmClosing = false;

            function ensureLeaveConfirm() {
                if (leaveConfirmEls) return leaveConfirmEls;
                const wrap = document.createElement('div');
                wrap.className = 'leave-confirm';
                wrap.hidden = true;
                wrap.innerHTML = [
                    '<div class="leave-confirm-backdrop" data-leave-cancel></div>',
                    '<div class="leave-confirm-card" role="dialog" aria-modal="true"',
                    '     aria-labelledby="leaveConfirmTitle" aria-describedby="leaveConfirmDesc">',
                    '<h2 class="leave-confirm-title" id="leaveConfirmTitle">即将前往 GitHub</h2>',
                    '<p class="leave-confirm-desc" id="leaveConfirmDesc">即将离开当前页面，前往 GitHub，是否继续？</p>',
                    '<div class="leave-confirm-actions">',
                    '<button type="button" class="leave-confirm-btn is-ghost" data-leave-cancel>取消</button>',
                    '<button type="button" class="leave-confirm-btn is-primary" data-leave-continue>继续</button>',
                    '</div>',
                    '</div>'
                ].join('');
                document.body.appendChild(wrap);

                const els = {
                    wrap: wrap,
                    title: wrap.querySelector('#leaveConfirmTitle'),
                    desc: wrap.querySelector('#leaveConfirmDesc'),
                    continueBtn: wrap.querySelector('[data-leave-continue]'),
                    cancelBtn: wrap.querySelector('[data-leave-cancel]:not(.leave-confirm-backdrop)')
                };

                wrap.addEventListener('click', function (event) {
                    if (event.target.closest('[data-leave-continue]')) {
                        closeLeaveConfirm(true);
                        return;
                    }
                    if (event.target.closest('[data-leave-cancel]')) closeLeaveConfirm(false);
                });

                // 焦点只在这两个按钮之间转：浮层是 aria-modal，
                // 焦点跑到背后页面上时读屏软件会念错内容（同搜索面板的处理）
                wrap.addEventListener('keydown', function (event) {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        closeLeaveConfirm(false);
                        return;
                    }
                    if (event.key !== 'Tab') return;
                    const list = [els.cancelBtn, els.continueBtn];
                    const index = list.indexOf(document.activeElement);
                    event.preventDefault();
                    if (index === -1) {
                        list[0].focus();
                    } else if (event.shiftKey) {
                        list[(index - 1 + list.length) % list.length].focus();
                    } else {
                        list[(index + 1) % list.length].focus();
                    }
                });

                leaveConfirmEls = els;
                return els;
            }

            function openLeaveConfirm(trigger, name) {
                const els = ensureLeaveConfirm();
                const site = name || '外部网站';
                /* 默认文案就够用；个别按钮（比如 RSS）想说得具体一点，
                   用 data-confirm-title / data-confirm-desc 覆盖，
                   这样不用为每个按钮单开一套弹窗逻辑 */
                const customTitle = trigger && trigger.getAttribute('data-confirm-title');
                const customDesc = trigger && trigger.getAttribute('data-confirm-desc');
                els.title.textContent = customTitle || ('即将前往 ' + site);
                els.desc.textContent = customDesc
                    || ('即将离开当前页面，前往 ' + site + '，是否继续？');
                leaveConfirmTrigger = trigger || null;
                // 上一轮如果还在淡出（快速点了取消又马上再点），
                // 先把收尾任务和 is-closing 清掉，否则新弹窗会接着往下演
                clearTimeout(leaveConfirmHideTimer);
                leaveConfirmHideTimer = null;
                leaveConfirmClosing = false;
                els.wrap.classList.remove('is-closing');
                els.wrap.hidden = false;
                // 默认停在「继续」上：用户点这个按钮本来就是要过去
                els.continueBtn.focus();
            }

            /* 关窗前先播一段淡出，动画走完才真正 hidden。
               时长必须和 css/style.css 里 .leave-confirm 的
               --leave-confirm-fade 保持一致，改一个记得改另一个。 */
            function playLeaveConfirmOut() {
                const els = leaveConfirmEls;
                if (!els) return;
                leaveConfirmClosing = true;
                els.wrap.classList.add('is-closing');
                clearTimeout(leaveConfirmHideTimer);
                leaveConfirmHideTimer = setTimeout(function () {
                    leaveConfirmHideTimer = null;
                    leaveConfirmClosing = false;
                    els.wrap.classList.remove('is-closing');
                    els.wrap.hidden = true;
                }, LEAVE_CONFIRM_FADE_MS);
            }

            function closeLeaveConfirm(confirmed) {
                // 淡出过程中再点一下（比如连点取消）直接忽略，
                // 否则会重复起动画、还会把「继续」的跳转吞掉
                if (!leaveConfirmEls || leaveConfirmEls.wrap.hidden || leaveConfirmClosing) return;
                const trigger = leaveConfirmTrigger;
                leaveConfirmTrigger = null;

                if (confirmed && trigger && trigger.href) {
                    /* 继续：重放「刚才那一次点击」。href / target 都没动过，
                       所以还是原来的跳转、还是新标签页。
                       这里必须是同步调用（不在 Promise 里），
                       否则部分移动浏览器会认为已经不是用户手势，把新标签页拦掉。
                       先把跳转发出去，再让当前页的浮层淡出，两件事互不影响。 */
                    leaveConfirmBypass = trigger;
                    trigger.click();
                    leaveConfirmBypass = null;
                }

                // 焦点先还给触发按钮：键盘 / 读屏用户不用等动画走完才能继续
                if (trigger && typeof trigger.focus === 'function') {
                    trigger.focus({ preventScroll: true });
                }
                playLeaveConfirmOut();
            }

            document.addEventListener('click', function (event) {
                const link = event.target.closest('[data-confirm-leave]');
                if (!link) return;
                // Ctrl / Cmd / Shift / Alt / 中键：用户明确要新窗口或新标签，
                // 交回浏览器自己处理，不拦（和文章页「问题反馈」的约定一致）
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                if (leaveConfirmBypass === link) {
                    leaveConfirmBypass = null;
                    return;
                }
                event.preventDefault();
                openLeaveConfirm(link, link.getAttribute('data-confirm-leave') || '');
            });

            let commentsObserver = null;
            let commentsFailTimer = null;
            let commentsFrameObserver = null;
            let commentsReadyTimer = null;
            let commentsWarmTimer = null;
            let commentsWarmFallbackTimer = null;
            let commentsIdleId = null;
            /* 每次渲染文章递增，用来作废上一篇文章留下的预热任务（切文章/回列表时） */
            let commentsWarmToken = 0;
            /* 当前 iframe 对应的 giscus term。同一篇文章来回切换时靠它判断能否复用 */
            let commentsMountedTerm = null;

            function commentsTerm(post) {
                return `文章 ${post.id}：${post.title}`;
            }

            function clearCommentsLoading() {
                if (commentsFailTimer) {
                    clearTimeout(commentsFailTimer);
                    commentsFailTimer = null;
                }
                if (commentsWarmTimer) {
                    clearTimeout(commentsWarmTimer);
                    commentsWarmTimer = null;
                }
                if (commentsWarmFallbackTimer) {
                    clearTimeout(commentsWarmFallbackTimer);
                    commentsWarmFallbackTimer = null;
                }
                if (commentsIdleId !== null) {
                    if ('cancelIdleCallback' in window) window.cancelIdleCallback(commentsIdleId);
                    commentsIdleId = null;
                }
                if (commentsReadyTimer) {
                    clearInterval(commentsReadyTimer);
                    commentsReadyTimer = null;
                }
                if (commentsObserver) {
                    commentsObserver.disconnect();
                    commentsObserver = null;
                }
                if (commentsFrameObserver) {
                    commentsFrameObserver.disconnect();
                    commentsFrameObserver = null;
                }
            }

            function removeCommentsSkeleton() {
                const skeleton = articleCommentsStage
                    ? articleCommentsStage.querySelector('.comments-skeleton')
                    : null;
                if (skeleton) skeleton.remove();
            }

            /* 骨架和 giscus 卡片共用同一套网格：头像 40px、右侧 12px 间距、上下 14px，
               所以骨架淡出时 iframe 不会挪位置 */
            function buildCommentsSkeleton(count) {
                const wrap = document.createElement('div');
                wrap.className = 'comments-skeleton';
                wrap.setAttribute('aria-hidden', 'true');
                for (let i = 0; i < (count || 2); i += 1) {
                    const card = document.createElement('div');
                    card.className = 'comments-skeleton-card';

                    const avatar = document.createElement('div');
                    avatar.className = 'comments-skeleton-avatar';

                    const main = document.createElement('div');
                    main.className = 'comments-skeleton-main';

                    const name = document.createElement('div');
                    name.className = 'comments-skeleton-line comments-skeleton-line--name';

                    const time = document.createElement('div');
                    time.className = 'comments-skeleton-line comments-skeleton-line--time';

                    const body = document.createElement('div');
                    body.className = 'comments-skeleton-line';

                    const bodyShort = document.createElement('div');
                    bodyShort.className = 'comments-skeleton-line comments-skeleton-line--short';

                    main.append(name, time, body, bodyShort);
                    card.append(avatar, main);
                    wrap.appendChild(card);
                }
                return wrap;
            }

            function showCommentsRetry(post) {
                if (!articleComments) return;
                /* 重试面板会清空容器，这里先把还没跑完的轮询/观察器收掉 */
                clearCommentsLoading();
                articleComments.replaceChildren();
                removeCommentsSkeleton();
                const box = document.createElement('div');
                box.className = 'comments-retry';
                const text = document.createElement('p');
                text.className = 'comments-retry-text';
                text.textContent = '评论加载失败，可能是网络问题。';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'comments-retry-btn';
                btn.textContent = '重新加载';
                btn.addEventListener('click', function () {
                    clearCommentsLoading();
                    mountArticleComments(post, true);
                });
                box.append(text, btn);
                articleComments.appendChild(box);
            }

            /* 页面就绪就把 giscus 整条链拉起来（client.js → iframe → GitHub API 是串行的，
               等读者滚到底才开始就得干等着）。iframe 在正文下方，加载过程看不见。
               只在两种情况下让路：
               1) 正文还没渲染完 → 等 DOMContentLoaded。不等到 load：动态插入的第三方
                  脚本/iframe 在浏览器里本就是低优先级，不会挤掉正文图片
               2) 慢网或开了省流量 → 延后 1.5s */
            function scheduleCommentsWarmMount(callback) {
                const token = commentsWarmToken;
                let fired = false;

                function stale() {
                    return token !== commentsWarmToken;
                }

                function fire() {
                    if (fired || stale()) return;
                    fired = true;
                    commentsWarmTimer = null;
                    commentsIdleId = null;
                    callback();
                }

                function whenIdle() {
                    if (stale()) return;
                    /* 后台标签页先不抢流量，等读者切回前台再补 */
                    if (document.hidden) {
                        document.addEventListener('visibilitychange', function onVisible() {
                            if (document.hidden) return;
                            document.removeEventListener('visibilitychange', onVisible);
                            whenIdle();
                        });
                        return;
                    }
                    if ('requestIdleCallback' in window) {
                        /* 不等空闲窗口白等太久：1s 内一定执行 */
                        commentsIdleId = window.requestIdleCallback(fire, { timeout: 1000 });
                    } else {
                        commentsWarmTimer = setTimeout(fire, 0);
                    }
                }

                function start() {
                    if (stale()) return;
                    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                    const onSlowNetwork = Boolean(conn && (conn.saveData || /2g$/.test(conn.effectiveType || '')));
                    if (onSlowNetwork) {
                        commentsWarmTimer = setTimeout(whenIdle, 1500);
                        return;
                    }
                    whenIdle();
                }

                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    start();
                } else {
                    document.addEventListener('DOMContentLoaded', start, { once: true });
                    /* 解析被拖住时的兜底，别让评论区一直不启动 */
                    commentsWarmFallbackTimer = setTimeout(start, 3000);
                }
            }

            function mountArticleComments(post, force) {
                if (!articleComments) return;
                const term = commentsTerm(post);

                /* 已经挂着同一篇文章的 iframe：直接复用，不再走一遍完整请求链 */
                if (!force && commentsMountedTerm === term
                    && articleComments.querySelector('iframe.giscus-frame')) {
                    return;
                }
                commentsMountedTerm = null;
                articleComments.replaceChildren();
                if (articleCommentsStage && !articleCommentsStage.querySelector('.comments-skeleton')) {
                    articleCommentsStage.appendChild(buildCommentsSkeleton());
                }

                const script = document.createElement('script');
                script.src = 'https://giscus.app/client.js';
                script.async = true;
                script.crossOrigin = 'anonymous';
                script.dataset.repo = 'Annie106/Annie106.github.io';
                script.dataset.repoId = 'R_kgDOSTMWsg';
                script.dataset.category = 'General';
                script.dataset.categoryId = 'DIC_kwDOSTMWss4DKarQ';
                script.dataset.mapping = 'specific';
                script.dataset.term = term;
                script.dataset.strict = '0';
                script.dataset.reactionsEnabled = '0';
                script.dataset.emitMetadata = '0';
                script.dataset.inputPosition = 'bottom';
                script.dataset.theme = document.documentElement.getAttribute('data-theme') === 'dark'
                    ? 'dark'
                    : 'light';
                script.dataset.lang = 'zh-CN';
                articleComments.appendChild(script);
                commentsMountedTerm = term;

                /* 骨架留到 iframe 真正出现再撤，中间这段时间不留白 */
                if (commentsFrameObserver) commentsFrameObserver.disconnect();
                commentsFrameObserver = new MutationObserver(function () {
                    const frame = articleComments.querySelector('iframe.giscus-frame');
                    if (!frame) return;
                    commentsFrameObserver.disconnect();
                    commentsFrameObserver = null;

                    /* 等 iframe 高度稳定（说明评论内容已经渲染完）再撤骨架，
                       否则会看到 iframe 从 150px 慢慢长到成稿高度的过程 */
                    /* giscus 自己的「正在加载评论……」也是一个高度约 150px 的稳定块，
                       所以不能用「高度稳定」当完成信号。评论区真正渲染出来至少 200px 以上，
                       要求连续 450ms 高于 200px 才算就绪；10 秒兜底，避免一直盖着骨架 */
                    let lastHeight = -1;
                    let stableTicks = 0;
                    let ticks = 0;
                    if (commentsReadyTimer) clearInterval(commentsReadyTimer);
                    commentsReadyTimer = setInterval(function () {
                        ticks += 1;
                        const height = frame.getBoundingClientRect().height;
                        if (height > 200 && Math.abs(height - lastHeight) < 2) {
                            stableTicks += 1;
                        } else {
                            stableTicks = 0;
                        }
                        lastHeight = height;
                        if (stableTicks >= 3 || ticks > 70) {
                            clearInterval(commentsReadyTimer);
                            commentsReadyTimer = null;
                            /* 预热挂载比读者先到，这期间切主题的消息 iframe 还收不到，
                               就绪后按当前主题补一次 */
                            if (frame.contentWindow) {
                                frame.contentWindow.postMessage({
                                    giscus: {
                                        setConfig: {
                                            theme: document.documentElement.getAttribute('data-theme') === 'dark'
                                                ? 'dark'
                                                : 'light'
                                        }
                                    }
                                }, 'https://giscus.app');
                            }
                            frame.classList.add('is-ready');
                            const skeleton = articleCommentsStage ? articleCommentsStage.querySelector('.comments-skeleton') : null;
                            if (skeleton) {
                                skeleton.classList.add('is-hidden');
                                setTimeout(function () {
                                    if (skeleton.parentNode) skeleton.remove();
                                }, 260);
                            }
                        }
                    }, 150);
                });
                commentsFrameObserver.observe(articleComments, { childList: true });

                /* 兜底：12 秒后如果 iframe 还没撑起来，说明请求失败，给一个重试入口 */
                if (commentsFailTimer) clearTimeout(commentsFailTimer);
                commentsFailTimer = setTimeout(function () {
                    commentsFailTimer = null;
                    const frame = articleComments.querySelector('iframe.giscus-frame');
                    const height = frame ? frame.getBoundingClientRect().height : 0;
                    if (height < 80) showCommentsRetry(post);
                }, 12000);
            }

            function renderArticleComments(post, isUnavailableArticle) {
                if (!articleCommentsSection || !articleComments) return;

                /* 作废上一篇留下的预热任务：否则它可能在切文章之后才醒来，
                   把旧文章的评论区挂到新文章上 */
                commentsWarmToken += 1;

                articleCommentsSection.hidden = isUnavailableArticle;
                if (articleCommentsDivider) articleCommentsDivider.hidden = isUnavailableArticle;

                if (isUnavailableArticle) {
                    clearCommentsLoading();
                    articleComments.replaceChildren();
                    removeCommentsSkeleton();
                    commentsMountedTerm = null;
                    return;
                }

                /* 返回后再打开同一篇文章：iframe 还在 DOM 里，直接复用。
                   这里省掉的是 client.js → iframe → GitHub API 整条串行链 */
                if (commentsMountedTerm === commentsTerm(post)
                    && articleComments.querySelector('iframe.giscus-frame')) {
                    clearCommentsLoading();
                    removeCommentsSkeleton();
                    return;
                }

                clearCommentsLoading();
                commentsMountedTerm = null;
                articleComments.replaceChildren();
                removeCommentsSkeleton();
                if (articleCommentsStage) articleCommentsStage.appendChild(buildCommentsSkeleton());

                let mounted = false;
                function mountOnce() {
                    if (mounted) return;
                    mounted = true;
                    clearCommentsLoading();
                    mountArticleComments(post);
                }

                if ('IntersectionObserver' in window) {
                    /* 快滚的读者：距离视口还有 1200px 就开始挂载 */
                    commentsObserver = new IntersectionObserver(function (entries) {
                        if (entries.some(function (entry) { return entry.isIntersecting; })) {
                            mountOnce();
                        }
                    }, { rootMargin: '1200px 0px' });
                    commentsObserver.observe(articleCommentsSection);

                    /* 慢读的读者：不等滚动，首屏稳定后就在后台跑完整条链 */
                    scheduleCommentsWarmMount(mountOnce);
                } else {
                    mountOnce();
                }
            }

            function renderArticle(post) {
                const isUnavailableArticle = !isArticlePublic(post);
                /* 同一篇文章重新进入时正文可以原样复用：
                   重写 innerHTML 会把图片全部重建，图片的模糊淡入、
                   内嵌内容都跟着重播，来回切的时候看着就是闪。
                   只有「上次渲染的就是这篇、且可读状态没变、正文不是空的」
                   才复用；换文章或状态变了仍走完整渲染。 */
                const canReuseContent = renderedArticleId === post.id
                    && renderedArticleUnavailable === isUnavailableArticle
                    && !isUnavailableArticle
                    && !post.embeddedPage
                    && articleContent.firstChild !== null;
                currentArticleId = post.id;
                updateShareMeta(post);
                articleTitle.hidden = isUnavailableArticle;
                articleMeta.hidden = isUnavailableArticle;
                articleUnavailableNotice.hidden = !isUnavailableArticle;
                articleShare.hidden = isUnavailableArticle;
                // 底部「问题反馈」入口：把当前文章带给反馈页（地址格式见 buildFeedbackUrl）
                if (articleFeedback) {
                    articleFeedback.href = buildFeedbackUrl(post.id, post.title || '');
                }
                articleTitle.textContent = post.title;
                /* 日期优先读「最近更新」：发布后改过的文章，主日期直接是 updated，
                   下面再补一行「发布于 原发布日」，两边的值不会重复。
                   posts-data.js 里没写 updated（或写的跟 date 一样）就只显示发布日期。 */
                const updatedMarkup = (!isUnavailableArticle && postHasUpdate(post))
                    ? `<span class="article-updated"><i class="ri-history-line" aria-hidden="true"></i> 发布于 ${post.date}</span>`
                    : '';
                articleMeta.innerHTML = isUnavailableArticle ? '' : `
                    <span><i class="ri-calendar-line"></i> ${postDisplayDate(post)}</span>
                    ${post.tags.map(t => `<span class="post-tag">${t}</span>`).join(' ')}
                    ${updatedMarkup}
                `;
                const embeddedPage = isUnavailableArticle
                    ? 'project_subpage/blog/article_unavailable.html'
                    : post.embeddedPage;
                const isEmbeddedPage = Boolean(embeddedPage);
                articleContent.hidden = isUnavailableArticle || isEmbeddedPage;
                embeddedArticleWrap.hidden = !isEmbeddedPage;
                const embeddedMount = isUnavailableArticle
                    ? articleUnavailableMount
                    : embeddedArticleNormalMount;
                if (embeddedArticleWrap.parentElement !== embeddedMount) {
                    embeddedMount.appendChild(embeddedArticleWrap);
                }
                embeddedPageFrame.title = isUnavailableArticle
                    ? '当前文章不对外开放'
                    : '文章内嵌页面';
                if (!canReuseContent) {
                    articleContent.innerHTML = isUnavailableArticle ? '' : (post.content || '');
                    if (window.AnnieImageLoading) {
                        window.AnnieImageLoading.initialize(articleContent);
                    }
                }
                renderedArticleId = post.id;
                renderedArticleUnavailable = isUnavailableArticle;
                renderArticleComments(post, isUnavailableArticle);
                // 换了文章就重新开始量高度，否则会沿用上一篇记下的旧值
                embeddedFrameHeight = 0;
                if (embeddedPageObserver) {
                    embeddedPageObserver.disconnect();
                    embeddedPageObserver = null;
                }
                if (embeddedPageResizeHandler) {
                    window.removeEventListener('resize', embeddedPageResizeHandler);
                    embeddedPageResizeHandler = null;
                }
                if (isEmbeddedPage) {
                    // 开始加载：先显示加载动画，等页面就绪后再淡入内容
                    embeddedArticleWrap.classList.add('is-loading');
                    embeddedArticleWrap.classList.remove('is-ready');
                    clearTimeout(embeddedPageFallbackTimer);
                    embeddedPageFallbackTimer = setTimeout(revealEmbeddedPage, 10000);
                    embeddedPageFrame.onload = () => {
                        const embeddedWindow = embeddedPageFrame.contentWindow;
                        if (embeddedWindow) {
                            embeddedWindow.postMessage({
                                type: 'annie-theme',
                                theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
                            }, '*');
                        }
                        let embeddedBody;
                        let embeddedRoot;
                        try {
                            const embeddedDocument = embeddedPageFrame.contentDocument;
                            if (!embeddedDocument || !embeddedDocument.body) {
                                throw new Error('加载失败');
                            }
                            if (window.AnnieImageLoading) {
                                window.AnnieImageLoading.initialize(embeddedDocument);
                            }
                            embeddedBody = embeddedDocument.body;
                            embeddedRoot = embeddedDocument.documentElement;
                            // 高度由外层统一控制，关掉内嵌页面自己的根滚动条，
                            // 否则文章里会多出一条滚动条
                            embeddedRoot.style.overflow = 'hidden';
                            embeddedBody.style.overflow = 'hidden';
                            embeddedRoot.style.scrollbarWidth = 'none';
                        } catch (error) {
                            console.error('无法读取内嵌页面尺寸，将保留可滚动的视口高度。', error);
                            embeddedPageFrame.style.height = `${Math.max(window.innerHeight * 0.8, 600)}px`;
                            revealEmbeddedPage();
                            return;
                        }
                        // 量出内嵌页面里真正的内容底部。
                        // 不能直接用 body.scrollHeight：内嵌页面会继承站点的
                        // body { min-height: 100vh }，那个 100vh 是相对 iframe 自身高度的，
                        // 于是 iframe 会被自己撑住、永远收不回去，文章末尾就会多出一大块空白。
                        const measureContentHeight = () => {
                            const embeddedWindow = embeddedPageFrame.contentWindow;
                            const embeddedDocument = embeddedPageFrame.contentDocument;
                            if (!embeddedWindow || !embeddedDocument || !embeddedDocument.body) {
                                return embeddedBody.scrollHeight;
                            }
                            const scrollTop = embeddedWindow.scrollY
                                || embeddedDocument.documentElement.scrollTop
                                || 0;
                            let bottom = 0;
                            const nodes = embeddedDocument.body.querySelectorAll('*');
                            for (let i = 0; i < nodes.length; i += 1) {
                                const node = nodes[i];
                                const style = embeddedWindow.getComputedStyle(node);
                                if (style.display === 'none'
                                    || style.visibility === 'hidden'
                                    || style.position === 'fixed') {
                                    continue;
                                }
                                const rect = node.getBoundingClientRect();
                                if (rect.width === 0 && rect.height === 0) continue;
                                bottom = Math.max(bottom, rect.bottom + scrollTop);
                            }
                            // 兜底：一个元素都量不到时，退回文档自身高度
                            return bottom > 0 ? bottom : embeddedBody.scrollHeight;
                        };

                        const resizeFrame = () => {
                            window.requestAnimationFrame(() => {
                                // 只按下限 120px 兜底，保证 iframe 始终贴合真实内容，
                                // 底部不再出现大片空白。
                                // 不要再往量到的高度上加余量：内嵌页如果把自己的
                                // 高度当成 iframe 高度（比如还带着 100vh），多出的
                                // 几像素会被下一轮重新量进去，越滚越大。
                                const contentHeight = Math.max(Math.ceil(measureContentHeight()), 120);
                                if (contentHeight === embeddedFrameHeight) return;
                                embeddedFrameHeight = contentHeight;
                                embeddedPageFrame.style.height = `${contentHeight}px`;
                                revealEmbeddedPage();
                            });
                        };
                        resizeFrame();
                        if ('ResizeObserver' in window) {
                            embeddedPageObserver = new ResizeObserver(resizeFrame);
                            embeddedPageObserver.observe(embeddedBody);
                            embeddedPageObserver.observe(embeddedRoot);
                        }
                        embeddedPageResizeHandler = resizeFrame;
                        window.addEventListener('resize', embeddedPageResizeHandler);
                    };
                    if (!setFrameSource(embeddedPageFrame, embeddedPage) && embeddedPageFrame.contentWindow) {
                        // 已经停在这个内嵌页面上，补跑一次初始化
                        embeddedPageFrame.onload();
                    }
                } else {
                    embeddedPageFrame.onload = null;
                    clearTimeout(embeddedPageFallbackTimer);
                    embeddedPageFallbackTimer = null;
                    embeddedArticleWrap.classList.remove('is-loading', 'is-ready');
                    setFrameSource(embeddedPageFrame, null);
                }

                // 正文里标了 gated-link 的链接：点它弹出提示窗（不校验、不跳转）
                // 复用的正文里这些监听已经绑过了，重复绑定会让一次点击弹好几个窗
                if (canReuseContent) return;
                const gatedLinks = articleContent.querySelectorAll('a.gated-link');
                for (let i = 0; i < gatedLinks.length; i += 1) {
                    gatedLinks[i].addEventListener('click', function (event) {
                        event.preventDefault();
                        showLinkGate(post);
                    });
                }
            }

            // ==================== 全站搜索：交互 ====================
            // 结构：一层浮层（overlay）里放一块面板（panel）。
            // 桌面端是顶部居中的浮层，手机端是全屏面板。
            // 键盘避让靠 visualViewport：把可视高度写进 CSS 变量，
            // 面板整体缩短，输入框和结果始终留在键盘上方。

            // ---------- 最近搜索（存在本地，最多 6 条） ----------
            function readSearchHistory() {
                try {
                    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
                    if (!Array.isArray(raw)) return [];
                    return raw
                        .filter(item => typeof item === 'string')
                        .map(item => normalizeQuery(item))
                        .filter(Boolean)
                        .slice(0, SEARCH_HISTORY_LIMIT);
                } catch (e) {
                    return [];
                }
            }

            function writeSearchHistory(list) {
                try {
                    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
                } catch (e) {}
            }

            function rememberSearch(query) {
                const value = normalizeQuery(query);
                if (!value) return;
                const list = readSearchHistory().filter(item => item !== value);
                list.unshift(value);
                writeSearchHistory(list.slice(0, SEARCH_HISTORY_LIMIT));
            }

            function renderSearchHistory() {
                if (!searchHistoryChips || !searchHistoryBlock) return;
                const list = readSearchHistory();
                searchHistoryBlock.hidden = list.length === 0;
                searchHistoryChips.innerHTML = list.map(item => `
                    <button class="search-chip" type="button" data-search-history="${escapeHtml(item)}">
                        <i class="ri-history-line" aria-hidden="true"></i>${escapeHtml(item)}
                    </button>
                `).join('');
            }

            // ---------- 空状态：按标签 + 最近更新 + 快速前往 ----------
            // 渲染顺序不影响视觉顺序（视觉顺序由 index.html 的 DOM 决定），
            // 这里两块都是幂等的，先渲染谁都可以。
            function renderSearchSuggestions() {
                renderSearchRecent();
                renderSearchTagCloud();
            }

            // 标签网格：按出现次数排序，取前 8 个铺成两列卡片。
            // 每张卡右上角带文章数，点一下就把标签当关键词搜。
            function renderSearchTagCloud() {
                const cloud = document.getElementById('searchTagCloud');
                if (!cloud) return;
                const counter = new Map();
                blogPosts.forEach(post => {
                    if (!isArticlePublic(post)) return;
                    (post.tags || []).forEach(tag => {
                        counter.set(tag, (counter.get(tag) || 0) + 1);// 统计每个标签出现次数
                    });
                });
                const tags = Array.from(counter.entries()).sort((a, b) => {
                    if (b[1] !== a[1]) return b[1] - a[1];// 出现次数多的在前
                    return a[0].localeCompare(b[0], 'zh');    
                });
                if (!tags.length) {
                    cloud.innerHTML = '';
                    return;
                }
                const max = Math.max.apply(null, tags.map(entry => entry[1]));
                // 三列布局，6 个标签正好两行——比两列四行省下近一半高度，
                // 面板里还要放「最近更新」和「快速前往」，这块不能占太多
                cloud.innerHTML = tags.slice(0, 6).map(entry => {// 只取前 6 个
                    const [tag, count] = entry;
                    // 出现次数映射到 1~3 档，用来给字号/字重分层次
                    const weight = max <= 1 ? 1 : Math.min(3, Math.max(1, Math.ceil(count / max * 3)));
                    return `<button class="search-cloud-tag" type="button"
                                    data-search-tag="${escapeHtml(tag)}" data-weight="${weight}">
                        <span class="search-cloud-tag-name">${escapeHtml(tag)}</span>
                        <span class="search-cloud-count">${count}</span>
                    </button>`;
                }).join('');
            }
            // 最近更新：按日期倒序取最新的几篇，直接摊在搜索框下面。
            // 搜索面板空着的时候有个「可以点进去看看」的落点，
            // 手机上也不会只剩一大片空白。
            // 「最新」按 postDisplayDate 算：改过的文章用 updated，跟显示的日期对得上。
            function renderSearchRecent() {
                const list = document.getElementById('searchRecentList');
                if (!list) return;
                const posts = blogPosts
                    .filter(post => isArticlePublic(post))
                    .sort((a, b) => {
                        // 先按日期倒序，同一天的按 id 新的在前
                        const dateDiff = postDisplayDate(b).localeCompare(postDisplayDate(a));
                        return dateDiff !== 0 ? dateDiff : b.id - a.id;
                    })
                    .slice(0, 4);
                list.innerHTML = posts.map(post => {
                    const tag = post.tags && post.tags[0] ? ' · ' + escapeHtml(post.tags[0]) : '';
                    return `
                    <button class="search-recent-item" type="button" data-search-recent="${post.id}">
                        <span class="search-recent-dot" aria-hidden="true"></span>
                        <span class="search-recent-main">
                            <span class="search-recent-title">${escapeHtml(post.title)}</span>
                            <span class="search-recent-date">${escapeHtml(postDisplayDate(post))}${tag}</span>
                        </span>
                        <i class="ri-arrow-right-s-line search-recent-arrow" aria-hidden="true"></i>
                    </button>`;
                }).join('');
            }

            // ---------- 状态行 ----------
            function setSearchMeta(html) {
                if (!searchMeta) return;
                if (!html) {
                    searchMeta.innerHTML = '';
                    searchMeta.classList.add('is-empty');
                    return;
                }
                searchMeta.innerHTML = html;
                searchMeta.classList.remove('is-empty');
            }

            // ---------- 结果渲染 ----------
            function renderSearchSkeletons(count) {
                if (!searchResults) return;
                const total = Math.max(2, Math.min(count || 4, 6));
                const card = `
                    <div class="search-skeleton" aria-hidden="true">
                        <span class="sk-avatar"></span>
                        <span class="sk-lines">
                            <span class="sk-line sk-title"></span>
                            <span class="sk-line"></span>
                            <span class="sk-line sk-short"></span>
                        </span>
                    </div>`;
                searchResults.innerHTML = card.repeat(total);
                searchResults.hidden = false;
                if (searchSuggest) searchSuggest.hidden = true;
            }

            function setSearchActiveIndex(nextIndex, options = {}) {
                if (!searchResults) return;
                const items = searchResults.querySelectorAll('.search-result');
                if (!items.length) {
                    searchActiveIndex = -1;
                    if (searchInput) searchInput.setAttribute('aria-activedescendant', '');
                    return;
                }
                const max = items.length - 1;
                let index = nextIndex;
                if (index < 0) index = options.wrap ? max : 0;
                if (index > max) index = options.wrap ? 0 : max;
                searchActiveIndex = index;
                items.forEach((item, i) => {
                    const isActive = i === index;
                    item.classList.toggle('is-active', isActive);
                    // role=option 的选中态要跟着键盘走，读屏软件靠它念出当前项
                    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                const active = items[index];
                if (active) {
                    if (searchInput) searchInput.setAttribute('aria-activedescendant', active.id);
                    // 只滚动容器内部，不牵动整个页面
                    const itemTop = active.offsetTop;
                    const itemBottom = itemTop + active.offsetHeight;
                    const viewTop = searchBody.scrollTop;
                    const viewBottom = viewTop + searchBody.clientHeight;
                    if (itemTop < viewTop) {
                        searchBody.scrollTo({ top: itemTop - 6, behavior: 'smooth' });
                    } else if (itemBottom > viewBottom) {
                        searchBody.scrollTo({ top: itemBottom - searchBody.clientHeight + 6, behavior: 'smooth' });
                    }
                }
            }

            function renderSearchResults(hits, query) {
                if (!searchResults) return;
                searchHits = hits;
                searchActiveIndex = -1;
                if (searchInput) searchInput.removeAttribute('aria-activedescendant');

                if (!hits.length) {
                    searchResults.innerHTML = `
                        <div class="search-empty">
                            <span class="search-empty-icon"><i class="ri-search-eye-line" aria-hidden="true"></i></span>
                            <p class="search-empty-title">没有找到与「${escapeHtml(query)}」相关的内容</p>
                            <p class="search-empty-desc">试试更短的关键词，或者从下面的标签里挑一个。</p>
                            <div class="search-empty-actions" id="searchEmptyActions"></div>
                        </div>`;
                    // 空结果时给一个「退一步」的出口：用更短的关键词再试
                    const actions = searchResults.querySelector('#searchEmptyActions');
                    const keywords = getKeywords(query);
                    const fallback = keywords.length > 1 ? keywords[0] : '';
                    if (actions) {
                        actions.innerHTML = fallback
                            ? `<button class="search-chip" type="button" data-search-suggest="${escapeHtml(fallback)}">
                                   <i class="ri-search-line" aria-hidden="true"></i>只搜「${escapeHtml(fallback)}」
                               </button>`
                            : '';
                    }
                    searchResults.hidden = false;
                    if (searchSuggest) searchSuggest.hidden = true;
                    return;
                }

                searchResults.innerHTML = hits.map((hit, index) => {
                    const post = hit.post;
                    const fields = hit.fields.slice(0, 3);
                    // 标签要和文章详情页完全一致：之前这里 slice(0, 2) 只取前两个，
                    // 「第五人格 / 随笔 / 社交」三标签的文章在搜索结果里会少一个，
                    // 看着就像标签对不上。这里改成全部展示（数量本身很少，
                    // 多一个也放得下，超长时由 .search-result-tags 自动换行）。
                    const keywords = getKeywords(query);
                    const tagChips = (post.tags || []).map(tag => {
                        const isHit = keywords.some(keyword => tag.toLowerCase().includes(keyword));
                        return `<span class="search-result-tag${isHit ? ' is-hit' : ''}">${escapeHtml(tag)}</span>`;
                    }).join('');
                    const hitChips = fields
                        .filter(field => field !== 'tag')
                        .map(field => `<span class="search-result-tag is-hit">${SEARCH_FIELD_LABELS[field] || '命中'}</span>`)
                        .join('');
                    const snippetSource = hit.snippet || post.excerpt || '';
                    return `
                        <button class="search-result" type="button" role="option"
                                id="searchResult${index}" data-search-result="${index}"
                                aria-selected="false" tabindex="-1"
                                style="--result-delay:${Math.min(index * 24, 168)}ms">
                            <span class="search-result-icon"><i class="ri-article-line" aria-hidden="true"></i></span>
                            <span class="search-result-main">
                                <span class="search-result-title">${highlightKeyword(post.title, query, 'is-title')}</span>
                                <span class="search-result-excerpt">${highlightKeyword(snippetSource, query)}</span>
                                <span class="search-result-tags">${hitChips}${tagChips}</span>
                            </span>
                            <i class="ri-arrow-right-line search-result-go" aria-hidden="true"></i>
                        </button>`;
                }).join('');

                searchResults.hidden = false;
                if (searchSuggest) searchSuggest.hidden = true;
                if (searchInput) searchInput.setAttribute('aria-expanded', 'true');
            }

            // ---------- 检索调度 ----------
            function clearSearchTimers() {
                window.clearTimeout(searchDebounceTimer);
                window.clearTimeout(searchPendingTimer);
                searchDebounceTimer = null;
                searchPendingTimer = null;
                searchRequestId = null;
            }

            function showSearchIdle() {
                searchHits = [];
                searchActiveIndex = -1;
                if (searchResults) {
                    searchResults.innerHTML = '';
                    searchResults.hidden = true;
                }
                if (searchSuggest) searchSuggest.hidden = false;
                if (searchSpinner) searchSpinner.hidden = true;
                if (searchClear) searchClear.hidden = !normalizeQuery(searchInput ? searchInput.value : '');
                if (searchInput) {
                    searchInput.setAttribute('aria-expanded', 'false');
                    searchInput.removeAttribute('aria-activedescendant');
                }
                renderSearchHistory();
                setSearchMeta('');
            }

            // 真正执行一次检索。先给「检索中」的骨架屏，
            // 满足最短停留时间后再把结果换进来，避免闪一下。
            function runSearch(rawQuery) {
                const query = normalizeQuery(rawQuery);
                clearSearchTimers();
                if (!query) {
                    showSearchIdle();
                    return;
                }

                const requestId = `${Date.now()}-${Math.random()}`;
                searchRequestId = requestId;
                // 检索期间用转圈替掉清空按钮：两个都显示会在右侧挤成一团
                if (searchClear) searchClear.hidden = true;
                if (searchSpinner) searchSpinner.hidden = false;
                renderSearchSkeletons(4);
                setSearchMeta('<i class="ri-loader-4-line" aria-hidden="true"></i><span>正在检索…</span>');

                const finish = () => {
                    // 期间又输入了新关键词，或已经关闭：这次结果作废
                    if (searchRequestId !== requestId || !searchOpen) return;
                    searchRequestId = null;
                    if (searchSpinner) searchSpinner.hidden = true;
                    if (searchClear) searchClear.hidden = !normalizeQuery(searchInput ? searchInput.value : '');
                    const hits = searchPosts(query);
                    renderSearchResults(hits, query);
                    setSearchMeta(
                        hits.length
                            ? `<i class="ri-search-line" aria-hidden="true"></i><span>找到 <strong>${hits.length}</strong> 篇与「${escapeHtml(query)}」相关的内容</span>`
                            : `<i class="ri-emotion-sad-line" aria-hidden="true"></i><span>没有找到与「${escapeHtml(query)}」相关的内容</span>`
                    );
                };
                searchPendingTimer = window.setTimeout(finish, SEARCH_MIN_PENDING);
            }

            function scheduleSearch(rawQuery) {
                const query = normalizeQuery(rawQuery);
                clearSearchTimers();
                if (!query) {
                    showSearchIdle();
                    return;
                }
                if (searchClear) searchClear.hidden = false;
                // 防抖期间不显示骨架屏，只有真正开始检索才显示，
                // 否则连续输入时会一直闪灰条
                searchDebounceTimer = window.setTimeout(() => {
                    runSearch(rawQuery);
                }, SEARCH_DEBOUNCE);
            }

            // ---------- 键盘避让 ----------
            // 把当前可视区高度写给面板。手机上键盘弹起时 visualViewport.height
            // 会变小，面板随之变矮，输入框和结果就不会被键盘盖住。
            function syncSearchViewport() {
                if (!searchOverlay) return;
                const vv = window.visualViewport;
                const height = Math.round(vv ? vv.height : window.innerHeight);
                searchOverlay.style.setProperty('--search-viewport-height', `${height}px`);
                if (!searchMobile.matches) {
                    // 桌面端不需要顶部偏移补偿，避免窗口缩放时留下空隙
                    searchOverlay.style.removeProperty('--search-viewport-offset');
                    return;
                }
                // iOS 在键盘弹起时会把可视区整体上移，这里把面板也上移同样的量，
                // 否则面板底部会露在键盘下方
                const offsetTop = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
                searchOverlay.style.setProperty('--search-viewport-offset', `${offsetTop}px`);
            }

            function handleSearchViewportChange() {
                if (!searchOpen) return;
                const vv = window.visualViewport;
                const height = Math.round(vv ? vv.height : window.innerHeight);
                const previous = searchViewportHeight;
                searchViewportHeight = height;
                syncSearchViewport();
                if (!searchMobile.matches) return;
                // 键盘弹起后，如果当前滚动位置让输入框跑到了可视区上方，
                // 把结果区滚回顶部，保证输入框和第一条结果都在视野里
                if (previous && height < previous - 80) {
                    searchKeyboardVisible = true;
                    if (searchBody) searchBody.scrollTop = 0;
                } else if (searchKeyboardVisible && previous && height > previous + 80) {
                    searchKeyboardVisible = false;
                }
            }

            // ---------- 打开 / 关闭 ----------
            // 浮层打开时锁滚动会让页面宽度突然变宽（滚动条消失），
            // 这里补回同样的宽度，避免背景内容横向抖一下。
            function lockSearchScroll() {
                const root = document.documentElement;
                const scrollbarWidth = window.innerWidth - root.clientWidth;
                if (scrollbarWidth > 0) {
                    root.style.setProperty('--search-scrollbar-gap', `${scrollbarWidth}px`);
                } else {
                    root.style.removeProperty('--search-scrollbar-gap');
                }
                root.classList.add('search-open');
            }

            function unlockSearchScroll() {
                document.documentElement.classList.remove('search-open');
                document.documentElement.style.removeProperty('--search-scrollbar-gap');
            }

            // 把焦点困在面板里：Tab 走到最后一个可聚焦元素后回到第一个。
            // 浮层是 aria-modal，焦点跑到背后的页面上会让读屏软件念错内容。
            function trapSearchFocus(event) {
                if (event.key !== 'Tab' || !searchOpen || !searchPanel) return;
                const focusable = searchPanel.querySelectorAll(
                    'button:not([disabled]):not([hidden]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                const list = Array.prototype.filter.call(focusable, el =>
                    el.offsetParent !== null || el === document.activeElement
                );
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

            function openSearch(options = {}) {
                if (!searchOverlay || searchOpen) return;
                searchOpen = true;
                searchViewportHeight = Math.round(
                    (window.visualViewport ? window.visualViewport.height : window.innerHeight)
                );
                syncSearchViewport();

                // 记住是哪个按钮打开的：关闭时把焦点还给它。
                // 用 document.activeElement 兜底——用键盘（Ctrl+K）打开时
                // 焦点可能还在 body 上，这时归还给触发按钮更合理。
                const opener = options.opener instanceof HTMLElement
                    ? options.opener
                    : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
                searchReturnFocus = opener && opener !== document.body ? opener : null;
                searchOverlay.hidden = false;
                // 先让 display 生效再加强制重排，否则淡入动画会被合并跳过
                void searchOverlay.offsetHeight;
                searchOverlay.classList.add('is-open');
                lockSearchScroll();
                searchTriggers.forEach(btn => btn.setAttribute('aria-expanded', 'true'));

                // 往历史里压一条「搜索中」的记录：
                // 手机上按返回键 / 侧滑返回、桌面按后退，都会先收起面板，
                // 而不是直接离开站点。这一步放在 DOM 就绪之后，
                // 避免 pushState 抛错时面板已经打开、历史却没记录。
                if (options.pushHistory !== false && !searchHistoryEntryActive) {
                    try {
                        history.pushState(
                            Object.assign({}, history.state, { annieSearch: true }),
                            '',
                            window.location.href
                        );
                        searchHistoryEntryActive = true;
                    } catch (e) {
                        searchHistoryEntryActive = false;
                    }
                }

                if (options.query) {
                    if (searchInput) searchInput.value = options.query;
                    runSearch(options.query);
                } else {
                    showSearchIdle();
                }

                // 等面板动画把位置稳定下来再聚焦：在 0 宽/隐藏元素上聚焦
                // 会让 iOS 直接把键盘弹出来并把页面顶上去。
                // 手机端面板是 0.38s 的整块上滑，聚焦太早的话键盘会在
                // 滑动途中把可视区改矮，面板高度跟着跳一下，看着很别扭；
                // 所以等它基本滑到位（300ms）再弹键盘。
                window.setTimeout(() => {
                    if (!searchOpen) return;
                    if (searchInput) {
                        searchInput.focus({ preventScroll: true });
                        // 光标放到末尾，从入口带词进来时不用再点一下
                        const length = searchInput.value.length;
                        try {
                            searchInput.setSelectionRange(length, length);
                        } catch (e) {}
                    }
                }, searchMobile.matches ? 300 : 120);
            }

            // options:
            //   skipHistory  不碰历史（由调用方接管，比如打开文章时
            //                让 openArticle 的 replaceState 覆盖掉这条记录）
            //   fromHistory  这次关闭是浏览器返回触发的，历史里已经退回去了
            function closeSearch(options = {}) {
                if (!searchOverlay || !searchOpen) return;
                searchOpen = false;
                clearSearchTimers();
                searchKeyboardVisible = false;
                if (searchSpinner) searchSpinner.hidden = true;
                searchOverlay.classList.remove('is-open');
                unlockSearchScroll();
                searchTriggers.forEach(btn => btn.setAttribute('aria-expanded', 'false'));

                // 有搜索结果时把它记进「最近搜索」，下次打开能直接复用
                const query = normalizeQuery(searchInput ? searchInput.value : '');
                if (options.remember !== false && query && searchHits.length) {
                    rememberSearch(query);
                }

                // 把打开搜索时压进去的那条历史退掉。
                // 先清标记再 back()：back 是异步的，如果期间用户又打开了搜索，
                // 标记已经归零，不会出现「连退两条」把用户带出站点。
                // searchPendingHistoryBack 让随后到来的 popstate 知道
                // 「这次后退是我们自己发起的」，不要当成用户返回处理。
                if (searchHistoryEntryActive && options.skipHistory !== true && options.fromHistory !== true) {
                    searchHistoryEntryActive = false;
                    searchPendingHistoryBack += 1;
                    // 退回去的那条记录带的是打开搜索前的 URL。
                    // 期间视图可能已经变了（例如 Ctrl+K 打开搜索后又切到「电影」），
                    // 所以落地后再同步一次地址栏，别让 URL 和画面脱节。
                    searchHistoryBackCallback = function() {
                        syncUrlWithView();
                    };
                    try {
                        history.back();
                    } catch (e) {
                        searchPendingHistoryBack = Math.max(0, searchPendingHistoryBack - 1);
                        searchHistoryBackCallback = null;
                    }
                } else if (options.fromHistory === true) {
                    searchHistoryEntryActive = false;
                }

                // 等退场动画走完再真正隐藏。
                // 手机端面板退场是 0.26s 的整块下滑（见 style.css 里
                // .search-overlay:not(.is-open) .search-panel），
                // 等待时间必须比它长一点，否则动画还没滑完就被 display:none
                // 掐断，看起来是「啪」地消失而不是滑走。
                window.setTimeout(() => {
                    if (searchOpen) return;
                    if (searchOverlay) searchOverlay.hidden = true;
                    if (searchResults) {
                        searchResults.innerHTML = '';
                        searchResults.hidden = true;
                    }
                    if (searchInput) {
                        searchInput.value = '';
                        searchInput.setAttribute('aria-expanded', 'false');
                        searchInput.removeAttribute('aria-activedescendant');
                    }
                    if (searchClear) searchClear.hidden = true;
                    searchHits = [];
                    searchActiveIndex = -1;
                    setSearchMeta('');
                    if (searchSuggest) searchSuggest.hidden = false;
                }, searchMobile.matches ? 300 : 220);

                // 焦点还给打开搜索的那个按钮（如果它还在页面上）
                const returnFocus = searchReturnFocus;
                searchReturnFocus = null;
                if (options.restoreFocus !== false && returnFocus && document.contains(returnFocus)) {
                    window.setTimeout(() => {
                        if (!searchOpen) returnFocus.focus({ preventScroll: true });
                    }, 0);
                }
                if (searchInput && document.activeElement === searchInput) searchInput.blur();
            }

            // 打开某个搜索结果：先收起面板，再走正常的文章打开流程。
            // 这里不 back()：openArticle 会先 replaceState 把「搜索中」这条记录
            // 换成返回快照，再 pushState 文章记录。
            function activateSearchResult(index) {
                const hit = searchHits[index];
                if (!hit) return;
                const query = normalizeQuery(searchInput ? searchInput.value : '');
                rememberSearch(query);
                // 收起面板再去开文章。这里不需要记「搜索现场」：
                // 用户从文章返回时，期望的是回到「打开搜索之前的那一页」，
                // 而不是重新弹出搜索面板。所以只要把历史链收拾干净——
                // openArticle 会用 replaceState 把「搜索中」那条记录
                // 覆盖成返回快照，再 pushState 文章记录，于是返回时
                // 自然落在打开搜索前的页面。
                closeSearch({ remember: false, restoreFocus: false, skipHistory: true });
                // 那条「搜索中」的记录马上会被 openArticle 的 replaceState
                // 覆盖成返回快照，标记要一起清掉，否则之后关闭搜索会多退一页
                searchHistoryEntryActive = false;
                openArticle(hit.post.id);
            }

            // 按标签搜索：把标签当作关键词填进去
            function searchByTag(tag) {
                if (!searchInput) return;
                searchInput.value = tag;
                runSearch(tag);
                searchInput.focus({ preventScroll: true });
                const length = tag.length;
                try {
                    searchInput.setSelectionRange(length, length);
                } catch (e) {}
            }

            // ---------- 事件绑定 ----------
            searchTriggers.forEach(btn => {
                btn.addEventListener('click', function() {
                    if (searchOpen) closeSearch();
                    // 把触发按钮传进去，关闭时焦点才能准确还回来
                    else openSearch({ opener: btn });
                });
            });

            if (searchClose) {
                searchClose.addEventListener('click', function() {
                    closeSearch();
                });
            }

            // 面板左上角的「‹」：和系统返回键保持完全一致的两级行为——
            // 有关键词先清空回到空白搜索页，没关键词才收起面板。
            if (searchBack) {
                searchBack.addEventListener('click', function() {
                    if (normalizeQuery(searchInput ? searchInput.value : '')) {
                        if (searchInput) searchInput.value = '';
                        clearSearchTimers();
                        showSearchIdle();
                        if (searchInput) searchInput.focus({ preventScroll: true });
                        return;
                    }
                    closeSearch();
                });
            }

            if (searchBackdrop) {
                searchBackdrop.addEventListener('click', function() {
                    closeSearch();
                });
            }

            if (searchClear) {
                searchClear.addEventListener('click', function() {
                    if (searchInput) searchInput.value = '';
                    clearSearchTimers();
                    showSearchIdle();
                    searchInput?.focus({ preventScroll: true });
                });
            }

            if (searchHistoryClear) {
                searchHistoryClear.addEventListener('click', function() {
                    writeSearchHistory([]);
                    renderSearchHistory();
                    if (searchHistoryChips) searchHistoryChips.innerHTML = '';
                    if (searchHistoryBlock) searchHistoryBlock.hidden = true;
                });
            }

            if (searchInput) {
                // 中文输入法：合成期间不检索，否则每敲一个拼音都会闪一次骨架屏
                searchInput.addEventListener('compositionstart', function() {
                    searchComposing = true;
                    clearSearchTimers();
                });
                searchInput.addEventListener('compositionend', function() {
                    searchComposing = false;
                    scheduleSearch(this.value);
                });
                searchInput.addEventListener('input', function() {
                    if (!searchComposing) scheduleSearch(this.value);
                });

                // 键盘导航：↑↓ 选中，Enter 打开，Esc 逐级退出
                searchInput.addEventListener('keydown', function(e) {
                    if (e.isComposing || searchComposing) return;
                    const count = searchHits.length;
                    if (e.key === 'ArrowDown') {
                        if (!count) return;
                        e.preventDefault();
                        setSearchActiveIndex(searchActiveIndex + 1, { wrap: true });
                    } else if (e.key === 'ArrowUp') {
                        if (!count) return;
                        e.preventDefault();
                        setSearchActiveIndex(searchActiveIndex - 1, { wrap: true });
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        // 回车：有选中项就打开选中项，否则立即完成当前检索
                        if (searchActiveIndex >= 0 && count) {
                            activateSearchResult(searchActiveIndex);
                        } else if (count === 1) {
                            activateSearchResult(0);
                        } else {
                            runSearch(this.value);
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (this.value) {
                            this.value = '';
                            clearSearchTimers();
                            showSearchIdle();
                        } else {
                            closeSearch();
                        }
                    }
                });
            }

            // 结果区与空状态里的按钮都用事件委托，
            // 结果列表会被整块重绘，逐条绑事件既慢又容易漏
            if (searchBody) {
                searchBody.addEventListener('click', function(e) {
                    const result = e.target.closest('[data-search-result]');
                    if (result) {
                        activateSearchResult(parseInt(result.getAttribute('data-search-result'), 10));
                        return;
                    }
                    const history = e.target.closest('[data-search-history]');
                    if (history) {
                        const value = history.getAttribute('data-search-history');
                        if (searchInput) searchInput.value = value;
                        runSearch(value);
                        return;
                    }
                    const tag = e.target.closest('[data-search-tag]');
                    if (tag) {
                        searchByTag(tag.getAttribute('data-search-tag'));
                        return;
                    }
                    const suggest = e.target.closest('[data-search-suggest]');
                    if (suggest) {
                        const value = suggest.getAttribute('data-search-suggest');
                        if (searchInput) searchInput.value = value;
                        runSearch(value);
                        return;
                    }
                    const view = e.target.closest('[data-search-view]');
                    if (view) {
                        const target = view.getAttribute('data-search-view');
                        closeSearch({ restoreFocus: false });
                        navigateToView(target);
                        return;
                    }
                    // 「最近更新」里的文章：直接打开，和点搜索结果一样
                    const recent = e.target.closest('[data-search-recent]');
                    if (recent) {
                        const id = parseInt(recent.getAttribute('data-search-recent'), 10);
                        if (!Number.isFinite(id)) return;
                        closeSearch({ restoreFocus: false, skipHistory: true });
                        searchHistoryEntryActive = false;
                        openArticle(id);
                        return;
                    }
                    // 「全部文章」入口：收起面板并切到文章列表
                    if (e.target.closest('#searchRecentMore')) {
                        closeSearch({ restoreFocus: false });
                        viewScrollPositions.blog = 0;
                        navigateToView('blog');
                        window.scrollTo({ top: 0, behavior: 'instant' });
                    }
                });

                // 鼠标移到某条结果上时同步选中态，键盘和鼠标不会各指一处
                searchBody.addEventListener('pointermove', function(e) {
                    if (!searchDesktop.matches) return;
                    const result = e.target.closest('[data-search-result]');
                    if (!result) return;
                    const index = parseInt(result.getAttribute('data-search-result'), 10);
                    if (index === searchActiveIndex) return;
                    setSearchActiveIndex(index);
                });
            }

            // 点击面板外面（桌面端的空白区域）关闭
            if (searchOverlay) {
                searchOverlay.addEventListener('pointerdown', function(e) {
                    if (e.target === searchOverlay) closeSearch();
                });
            }

            // 全局快捷键：Ctrl/⌘ + K 打开，/ 也可以（不在输入框里时）
            document.addEventListener('keydown', function(e) {
                if (searchOpen) trapSearchFocus(e);
                const isTyping = e.target instanceof HTMLElement && (
                    e.target.isContentEditable ||
                    /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
                );
                if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                    e.preventDefault();
                    if (searchOpen) closeSearch();
                    // 键盘打开时焦点可能停在 body 上，归还给当前视图的入口按钮
                    else openSearch({ opener: document.querySelector('.view.active-view [data-search-open]') });
                    return;
                }
                if (e.key === '/' && !isTyping && !searchOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    openSearch({ opener: document.querySelector('.view.active-view [data-search-open]') });
                    return;
                }
                if (e.key === 'Escape' && searchOpen) {
                    closeSearch();
                }
            });

            // 键盘弹起 / 收起、横竖屏切换时重新量可视高度
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', handleSearchViewportChange);
                window.visualViewport.addEventListener('scroll', function() {
                    if (!searchOpen || !searchMobile.matches) return;
                    syncSearchViewport();
                });
            }
            /* 搜索入口自适应：窗口尺寸变化或旋转屏幕时重新测量 */
            window.addEventListener('resize', function() {
                scheduleSearchTriggerFit();
                if (!searchOpen) return;
                searchViewportHeight = Math.round(
                    (window.visualViewport ? window.visualViewport.height : window.innerHeight)
                );
                syncSearchViewport();
            });
            /* 字体加载完成后文字宽度会变，重新量一次 */
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(scheduleSearchTriggerFit).catch(function() {});
            }
            /* 横屏 / 竖屏切换时面板形态会变，重新算一次 */
            if (searchMobile.addEventListener) {
                searchMobile.addEventListener('change', function() {
                    scheduleSearchTriggerFit();
                    if (!searchOpen) return;
                    syncSearchViewport();
                });
            }
            // 切到后台再回来时，键盘状态可能已经变了，重新量一次
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'visible' && searchOpen) syncSearchViewport();
            });

            // 离开首页 / 切视图时收起搜索，避免再回来时还留着一层浮层
            function dismissSearchOnViewChange(viewName) {
                if (!searchOpen) return;
                closeSearch({ restoreFocus: false });
            }

            function openArticle(id) {
                const post = blogPosts.find(p => p.id === id);
                if (!post) return;
                /* 已经在读这篇了（比如连点两下卡片）：什么都不用做。
                   再走一遍会多压一条历史记录，返回键要按两次才有反应，
                   正文也会被重新渲染一次。 */
                if (currentView === 'article' && currentArticleId === post.id) return;
                if (isArticlePublic(post) && post.externalPage && !post.embeddedPage) {
                    // 记住当前界面，返回时才能回到原处
                    saveViewState();
                    window.location.href = post.externalPage;
                    return;
                }
                articleReturnView = currentView === 'article' ? 'home' : currentView;
                articleReturnScroll = window.scrollY;
                const viewStateSnapshot = {
                    view: currentView,
                    articleId: currentArticleId,
                    homeTag: homeTag,
                    blogTag: blogTag,
                    scroll: articleReturnScroll,
                    scrollPositions: {
                        ...viewScrollPositions,
                        [currentView]: articleReturnScroll,
                    },
                    returnView: articleReturnView,
                    returnScroll: articleReturnScroll,
                };
                history.replaceState({ annieViewSnapshot: viewStateSnapshot }, '', window.location.href);
                const articleHistoryState = {
                    annieArticleId: post.id,
                    annieReturnView: articleReturnView,
                    annieReturnScroll: articleReturnScroll,
                };
                history.pushState(articleHistoryState, '', window.location.href);
                articleHistoryEntryActive = true;
                renderArticle(post);
                switchView('article');
                /* 直接落到顶部，不要平滑滚动。
                   从首页下方点进来时，平滑滚动会让刚淡入的正文跟着往上滑，
                   和视图淡入叠在一起就是那道闪；滚动期间用户再切回去，
                   两段滚动还会互相抢。 */
                window.scrollTo({ top: 0, behavior: 'instant' });
            }

            // ==================== 导航栏：滚动状态 ====================
            /* 半透明的顶栏在页面静止时背后是空白，透出的几乎是纯底色；
               一旦开始滚动，才真的有内容从下面经过。这时候给条带加一个
               .is-scrolled，把底色压实一点点（72% → 84%），
               既不改变观感，又能保证任何内容经过时文字都够清楚。
               只切一个 class，不读其它布局，用 passive 监听。 */
            function syncHeaderScroll() {
                if (!siteHeader) return;
                siteHeader.classList.toggle('is-scrolled', window.scrollY > 4);
            }

            // ==================== 导航栏：滑动指示块 ====================
            /* 把黑色药丸挪到当前激活项下方。用 getBoundingClientRect 实时量：
               字体异步加载完成、窗口缩放、移动端四项等分后宽度变化都能算准。
               首次定位时临时关掉过渡，避免刚进页面就从左往右「飞」一遍。 */
            let navPillReady = false;
            function updateNavPill() {
                if (!siteNav || !navPill || !navLinks) return;
                const active = navLinks.querySelector('a.active');
                if (!active || !active.offsetWidth) {
                    siteNav.classList.remove('has-pill');
                    navPillReady = false;
                    return;
                }
                const navRect = siteNav.getBoundingClientRect();
                const linkRect = active.getBoundingClientRect();
                // 绝对定位的基准是内边距盒，所以扣掉左侧边框的宽度
                const left = linkRect.left - navRect.left - siteNav.clientLeft;
                // 药丸要比链接热区再缩一圈（值写在 CSS 的 --pill-inset-x 里，
                // 上下那一圈由 .nav-pill 的 top/height 负责），
                // 这样点得到的地方比看到的色块大，但不显得顶满胶囊
                const insetX = parseFloat(
                    getComputedStyle(siteNav).getPropertyValue('--pill-inset-x')
                ) || 0;
                const pillWidth = Math.max(0, linkRect.width - insetX * 2);

                navPill.style.width = `${pillWidth}px`;
                navPill.style.transform = `translate3d(${left + insetX}px, 0, 0)`;

                if (!navPillReady) {
                    navPill.style.transition = 'none';
                    siteNav.classList.add('has-pill');
                    // 读一次布局，让首帧的宽度/位移立即生效
                    void navPill.offsetWidth;
                    window.requestAnimationFrame(function() {
                        navPill.style.transition = '';
                        navPillReady = true;
                    });
                }
            }

            function switchView(viewName) {
                const previousView = currentView;
                // 上一次切视图排下的滚动恢复任务立刻作废，
                // 免得它在新视图里把滚动条拽回旧位置
                cancelScrollRestore();
                /* 间隔太短的连续切换不播入场动画：动画从 opacity:0 起步，
                   350ms 没走完就被切走，页面会一直停在半透明状态——那就是「闪」。
                   注意顺序：必须在所有视图都还没有 active 类的时候设置/移除
                   这个开关，否则恢复 animation 会让当前视图重新播一遍淡入。 */
                const now = (window.performance && performance.now) ? performance.now() : Date.now();
                const suppressEnterAnimation = lastViewSwitchAt > 0
                    && (now - lastViewSwitchAt) < VIEW_ENTER_ANIM_GAP;
                lastViewSwitchAt = now;
                // 切到别的视图时收起搜索浮层，回来时是干净的页面
                dismissSearchOnViewChange(viewName);
                if (viewName !== 'movie') closeMovieSubmission(false);
                if (previousView !== 'article') {
                    viewScrollPositions[previousView] = window.scrollY;
                }
                currentView = viewName;
                // 离开感谢页就把倒计时停掉，别再偷偷把用户送回首页
                if (viewName !== 'thanks') stopThanksCountdown();
                [viewHome, viewBlog, viewArchive, viewTweaks, viewMovie, viewAbout,
                    viewArticle, viewFeedback, viewThanks, viewComments].forEach(v => {
                    v.style.display = 'none';
                    v.classList.remove('active-view');
                });
                viewArticle.classList.remove('active');
                // 所有视图都清干净了，这时候改动画开关不会引起重播
                document.documentElement.classList.toggle('is-switch-throttled', suppressEnterAnimation);

                if (previousView === 'movie' && viewName !== 'movie') {
                    setFrameSource(movieFrame, null);
                }

                if (viewName === 'home') {
                    viewHome.style.display = 'block';
                    viewHome.classList.add('active-view');
                    // 首页重新显示，尺寸要等到下一帧才准
                    scheduleSearchTriggerFit();
                } else if (viewName === 'blog') {
                    viewBlog.style.display = 'block';
                    viewBlog.classList.add('active-view');
                    renderPostsList('postsListBlog');
                    renderTagPills('tagFilterBlog');
                    scheduleSearchTriggerFit();
                } else if (viewName === 'archive') {
                    viewArchive.style.display = 'block';
                    viewArchive.classList.add('active-view');
                    renderArchive();
                } else if (viewName === 'tweaks') {
                    viewTweaks.style.display = 'block';
                    viewTweaks.classList.add('active-view');
                    renderTweaksFeed();
                } else if (viewName === 'movie') {
                    viewMovie.style.display = 'block';
                    viewMovie.classList.add('active-view');
                    if (previousView !== 'movie') setFrameSource(movieFrame, 'movie.html');
                    sizeMovieFrame();
                    if (window.innerWidth <= 700) {
                        window.requestAnimationFrame(() => {
                            if (viewScrollPositions.movie === null) {
                                centerMovieFrame();
                            } else {
                                restoreViewScroll('movie');
                            }
                        });
                    }
                } else if (viewName === 'about') {
                    viewAbout.style.display = 'block';
                    viewAbout.classList.add('active-view');
                } else if (viewName === 'feedback') {
                    viewFeedback.style.display = 'block';
                    viewFeedback.classList.add('active-view');
                } else if (viewName === 'comments') {
                    viewComments.style.display = 'block';
                    viewComments.classList.add('active-view');
                    // 进来（或从历史里回到这里）就挂一次；同一篇文章会复用 iframe
                    mountCommentsView();
                } else if (viewName === 'thanks') {
                    viewThanks.style.display = 'block';
                    viewThanks.classList.add('active-view');
                    startThanksCountdown();
                } else if (viewName === 'article') {
                    viewArticle.style.display = 'block';
                    viewArticle.classList.add('active');
                }

                if (viewName !== 'movie' && viewName !== 'article') {
                    restoreViewScrollSettled(viewName);
                }

                $$('.nav-links a').forEach(link => {
                    link.classList.remove('active');
                    link.removeAttribute('aria-current');
                });
                /* 反馈 / 感谢不属于导航里的任何一栏，映射成 null：
                   否则站在反馈页上会看到「首页」是选中态，比没有高亮更误导。
                   指示块那边找不到 .active 会自己收起，不用额外处理。 */
                const navMap = { home: 'home', blog: 'blog', archive: 'archive', tweaks: 'home', movie: 'movie', about: 'about', article: 'blog', feedback: null, thanks: null, comments: null };
                const activeNav = (viewName in navMap) ? navMap[viewName] : 'home';
                const navLink = activeNav
                    ? document.querySelector(`.nav-links a[data-nav="${activeNav}"]`)
                    : null;
                if (navLink) {
                    navLink.classList.add('active');
                    navLink.setAttribute('aria-current', 'page');
                }
                // 视图切换后指示块要跟着走；等下一帧元素显示出来再量，尺寸才准
                window.requestAnimationFrame(updateNavPill);

                // 地址栏跟着视图走，分享出去的链接才能定位到具体文章
                syncUrlWithView();
            }

            // 回到首页（用户主动点「首页」入口时走这里，而不是直接 switchView）。
            // 关键：把当前这条「模块」历史记录改写回首页，这样从首页再进别的模块、
            // 按返回键时退回的是首页，而不是刚才浏览过的上一个模块。
            function goHome() {
                if (currentView === 'article') {
                    articleHistoryEntryActive = false;
                    returningFromArticleButton = false;
                }
                if (currentView !== 'home') {
                    try {
                        history.replaceState({ annieView: 'home' }, '', window.location.href);
                    } catch (e) {}
                }
                switchView('home');
            }

            // ==================== 问题反馈 / 提交成功 ====================
            /* 反馈页与感谢页现在都是站内视图（?view=feedback / ?view=thanks），
               原来那两张独立 HTML 里的表单和样式已经搬进 index.html + style.css：
               旧的 project_subpage/blog/feedback.html 已归档成 archive/feedback.html
               的跳转桩（老链接由根目录 404.html 接住再送过来），
               thanks.html 继续给电影投稿那个 iframe 面板用（它带 ?embedded=1）。 */
            const feedbackForm = $('#feedbackForm');
            const feedbackArticleCard = $('#feedbackArticleCard');
            const feedbackArticleTitle = $('#feedbackArticleTitle');
            const feedbackArticleIdInput = $('#feedbackArticleId');
            const feedbackArticleTitleInput = $('#feedbackArticleTitleInput');
            const feedbackTypeOther = $('#feedbackTypeOther');
            const feedbackTypeOtherBox = $('#feedbackTypeOtherBox');
            const feedbackTypeOtherText = $('#feedbackTypeOtherText');
            const feedbackSubmit = $('#feedbackSubmit');
            const feedbackSubmitHint = $('#feedbackSubmitHint');
            const feedbackCancel = $('#feedbackCancel');
            const feedbackContactBox = $('#feedbackContactBox');
            const feedbackContactValue = $('#feedbackContactValue');
            const feedbackContactValueLabel = $('#feedbackContactValueLabel');
            const feedbackContactRadios = feedbackForm
                ? feedbackForm.querySelectorAll('input[name="contact_allowed"]')
                : [];
            const feedbackContactTypeRadios = feedbackForm
                ? feedbackForm.querySelectorAll('input[name="contact_type"]')
                : [];
            const thanksCountdown = $('#thanksCountdown');
            // web3forms 的 redirect 只认绝对的 https 地址，这里按当前环境拼好
            const FEEDBACK_THANKS_PATH = 'index.html?view=thanks';
            //修改反馈可提交次数
            const FEEDBACK_DAILY_LIMIT = 1;
            const FEEDBACK_DAILY_COUNT_KEY = 'annie-feedback-daily-count';

            function getLocalDateKey() {
                const now = new Date();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                return now.getFullYear() + '-' + month + '-' + day;
            }

            function getFeedbackDailyCount() {
                const saved = window.localStorage.getItem(FEEDBACK_DAILY_COUNT_KEY);
                if (!saved) return 0;
                const record = JSON.parse(saved);
                if (!record || record.date !== getLocalDateKey()) return 0;
                if (!Number.isInteger(record.count) || record.count < 0) {
                    throw new Error('反馈提交次数记录无效');
                }
                return record.count;
            }

            function saveFeedbackDailyCount(count) {
                window.localStorage.setItem(FEEDBACK_DAILY_COUNT_KEY, JSON.stringify({
                    date: getLocalDateKey(),
                    count: count,
                }));
            }

            /* 把「这次反馈针对哪篇文章」写进表单的隐藏字段和顶部卡片。
               没有文章（比如直接从地址栏打开反馈页）时整张卡片收起来。 */
            function applyFeedbackContext(ctx) {
                const id = ctx && ctx.id !== undefined && ctx.id !== null ? String(ctx.id) : '';
                const title = ctx && ctx.title ? String(ctx.title) : '';
                feedbackContext = { id: id, title: title };
                if (feedbackArticleIdInput) feedbackArticleIdInput.value = id;
                if (feedbackArticleTitleInput) feedbackArticleTitleInput.value = title;
                if (feedbackArticleCard && feedbackArticleTitle) {
                    feedbackArticleCard.hidden = !title;
                    feedbackArticleTitle.textContent = title;
                }
            }

            function readFeedbackContextFromUrl() {
                try {
                    const params = new URL(window.location.href).searchParams;
                    return {
                        id: params.get(FEEDBACK_ARTICLE_PARAM) || '',
                        title: params.get(FEEDBACK_TITLE_PARAM) || '',
                    };
                } catch (e) {
                    return { id: '', title: '' };
                }
            }

            /* 反馈页自己的地址。留着它给「在新标签页打开」和右键复制用，
               站内点击则走 openFeedback（不重新加载页面）。 */
            function buildFeedbackUrl(id, title) {
                const params = new URLSearchParams();
                params.set(VIEW_PARAM, 'feedback');
                if (id !== undefined && id !== null && id !== '') {
                    params.set(FEEDBACK_ARTICLE_PARAM, String(id));
                }
                if (title) params.set(FEEDBACK_TITLE_PARAM, title);
                return 'index.html?' + params.toString();
            }

            function openFeedback(post) {
                applyFeedbackContext({
                    id: post ? post.id : '',
                    title: post ? post.title : '',
                });
                viewScrollPositions.feedback = 0;
                /* 这里不用 navigateToView：它在「正在读文章」时会改写当前那条记录，
                   返回键就直接离开文章了。反馈是从文章里点进去的二级页，
                   要能原路退回那篇文章，所以一律新压一条记录。 */
                rememberEntryScroll();
                pushViewHistoryEntry('feedback', true);
                switchView('feedback');
                window.scrollTo({ top: 0, behavior: 'instant' });
            }

            /* ============================================================
               一句话 checkValidity() 就能把所有必填校验做完：
               浏览器会检查表单里所有带 required 的字段，
               单选组只要组里有一个 required，整组都算必填。
               ============================================================ */
            function updateFeedbackSubmitState() {
                if (!feedbackForm || !feedbackSubmit) return;
                const ok = feedbackForm.checkValidity();
                let count;
                try {
                    count = getFeedbackDailyCount();
                } catch (error) {
                    feedbackSubmit.disabled = true;
                    if (feedbackSubmitHint) {
                        feedbackSubmitHint.textContent = '无法读取每日反馈次数，请检查浏览器存储设置后重试';
                    }
                    return;
                }
                const remaining = Math.max(0, FEEDBACK_DAILY_LIMIT - count);
                feedbackSubmit.disabled = !ok || remaining === 0;
                if (feedbackSubmitHint) {
                    if (remaining === 0) {
                        feedbackSubmitHint.textContent = '今日反馈次数已达上限';
                    } else {
                        feedbackSubmitHint.textContent = ok
                            ? '信息已填写完整，可以提交'
                            : '请填写必填项后提交';
                    }
                }
            }

            function isFeedbackContactAllowed() {
                if (!feedbackForm) return false;
                const checked = feedbackForm.querySelector('input[name="contact_allowed"]:checked');
                return !!checked && checked.value === '允许';
            }

            /* 只有在「允许联系」时才展开联系方式，并同步切换必填状态：
               隐藏的输入框如果还挂着 required，表单永远提交不了。 */
            function updateFeedbackContactField() {
                if (!feedbackContactBox) return;
                const allowed = isFeedbackContactAllowed();
                feedbackContactBox.classList.toggle('visible', allowed);
                if (allowed) {
                    if (feedbackContactTypeRadios[0]) feedbackContactTypeRadios[0].required = true;
                    return;
                }
                feedbackContactTypeRadios.forEach(function (radio) {
                    radio.required = false;
                    radio.checked = false;
                });
                if (feedbackContactValue) {
                    feedbackContactValue.required = false;
                    feedbackContactValue.disabled = true;
                    feedbackContactValue.type = 'text';
                    feedbackContactValue.placeholder = '请先选择联系方式类型';
                    feedbackContactValue.value = '';
                }
                if (feedbackContactValueLabel) feedbackContactValueLabel.textContent = '你的联系方式';
            }

            // 感谢页倒计时：结束后回首页，返回键不会再把用户带回感谢页
            function startThanksCountdown() {
                stopThanksCountdown();
                if (!thanksCountdown) return;
                let secondsLeft = 3;
                thanksCountdown.textContent = secondsLeft + ' 秒后自动返回首页';
                thanksCountdownTimer = window.setInterval(function () {
                    secondsLeft -= 1;
                    if (secondsLeft > 0) {
                        thanksCountdown.textContent = secondsLeft + ' 秒后自动返回首页';
                        return;
                    }
                    stopThanksCountdown();
                    // goHome() 会把当前这条历史记录改写成首页
                    goHome();
                    showToast('反馈已提交，谢谢！');
                }, 1000);
            }

            function stopThanksCountdown() {
                if (thanksCountdownTimer) {
                    window.clearInterval(thanksCountdownTimer);
                    thanksCountdownTimer = null;
                }
            }

            if (feedbackForm) {
                // 提交成功后的落点（绝对地址；file:// 预览时 web3forms 会拦跳转，干脆不带）
                const redirectField = feedbackForm.querySelector('input[name="redirect"]');
                if (redirectField) {
                    if (/^https?:$/.test(window.location.protocol)) {
                        redirectField.value = new URL(FEEDBACK_THANKS_PATH, window.location.href).href;
                    } else {
                        redirectField.remove();
                    }
                }

                /* 选到「其他」时，把补充说明框显出来并设为必填；
                   切走时清空，别把上一条说明残留在表单里 */
                feedbackForm.querySelectorAll('input[name="type"]').forEach(function (radio) {
                    radio.addEventListener('change', function () {
                        if (!feedbackTypeOther || !feedbackTypeOtherBox || !feedbackTypeOtherText) return;
                        if (feedbackTypeOther.checked) {
                            feedbackTypeOtherBox.classList.add('visible');
                            feedbackTypeOtherText.required = true;
                            feedbackTypeOtherText.focus();
                        } else {
                            feedbackTypeOtherBox.classList.remove('visible');
                            feedbackTypeOtherText.required = false;
                            feedbackTypeOtherText.value = '';
                        }
                        updateFeedbackSubmitState();
                    });
                });

                feedbackContactRadios.forEach(function (radio) {
                    radio.addEventListener('change', function () {
                        updateFeedbackContactField();
                        updateFeedbackSubmitState();
                    });
                });

                // 微信 / 邮箱 切换时改输入框类型、占位文案和字段名
                feedbackContactTypeRadios.forEach(function (radio) {
                    radio.addEventListener('change', function () {
                        if (!feedbackContactValue) return;
                        feedbackContactValue.disabled = false;
                        feedbackContactValue.required = true;
                        if (radio.value === '邮箱') {
                            feedbackContactValue.type = 'email';
                            feedbackContactValue.placeholder = '请输入你的邮箱地址';
                            if (feedbackContactValueLabel) feedbackContactValueLabel.textContent = '你的邮箱地址';
                        } else {
                            feedbackContactValue.type = 'text';
                            feedbackContactValue.placeholder = '请输入你的微信号';
                            if (feedbackContactValueLabel) feedbackContactValueLabel.textContent = '你的微信号';
                        }
                        feedbackContactValue.value = '';
                        updateFeedbackSubmitState();
                    });
                });

                feedbackForm.addEventListener('input', updateFeedbackSubmitState);
                feedbackForm.addEventListener('change', updateFeedbackSubmitState);

                feedbackForm.addEventListener('submit', function (e) {
                    if (!feedbackForm.checkValidity()) {
                        e.preventDefault();
                        updateFeedbackSubmitState();
                        return;
                    }
                    let count;
                    try {
                        count = getFeedbackDailyCount();
                        if (count >= FEEDBACK_DAILY_LIMIT) {
                            e.preventDefault();
                            updateFeedbackSubmitState();
                            return;
                        }
                        saveFeedbackDailyCount(count + 1);
                    } catch (error) {
                        e.preventDefault();
                        if (feedbackSubmitHint) {
                            feedbackSubmitHint.textContent = '无法保存每日反馈次数，请检查浏览器存储设置后重试';
                        }
                        if (feedbackSubmit) feedbackSubmit.disabled = true;
                        return;
                    }
                    if (feedbackSubmit) {
                        feedbackSubmit.classList.add('loading');
                        feedbackSubmit.disabled = true;
                    }
                    if (feedbackSubmitHint) {
                        feedbackSubmitHint.textContent = '正在提交……';
                    }
                });

                updateFeedbackContactField();
                updateFeedbackSubmitState();
            }

            if (feedbackCancel) {
                feedbackCancel.addEventListener('click', function () {
                    goHome();
                });
            }

            // ==================== 文章评论视图 ====================
            /* 原来是独立页 project_subpage/blog/comments.html（已归档成 archive/comments.html
               的跳转桩），现在也是站内视图
               （?view=comments）。评论本身没变：同一套 giscus、同一个 term，
               和文章正文下面那块是同一份数据；唯一的差别是 reactionsEnabled，
               这里 1（独立入口保留表情回应），文章内是 0。

               没有复用 renderArticleComments()：那套带着预热、滚动预加载、
               同一 term 复用 iframe 等一堆针对「正文下方」位置做的优化；
               这边是点了菜单就进来，进来挂一次就够，单独写一条更清楚。 */
            const commentsViewWidget = $('#commentsViewWidget');
            const commentsViewStage = $('#commentsViewStage');
            const commentsViewTitle = $('#commentsViewTitle');
            const commentsViewLead = $('#commentsViewLead');
            const commentsViewBack = $('#commentsViewBack');
            const commentsViewFeedback = $('#commentsViewFeedback');
            /* 当前 iframe 对应的 term：同一篇文章来回切时直接复用，不重走一遍请求链 */
            let commentsViewTerm = null;
            let commentsViewObserver = null;
            let commentsViewReadyTimer = null;
            let commentsViewFailTimer = null;
            let commentsViewParkTimer = null;
            let articleGiscusParked = false;

            /* ★ 这一条是评论区能不能显示的关键：
               giscus 的 client.js 不支持「挂到指定容器」，它只挂到
               document.querySelector('.giscus') —— 页面里第一个带这个类的元素。
               文章页的 #articleComments 在 DOM 里排在 #view-comments 前面，
               所以直接往评论视图里插脚本，iframe 会被塞进隐藏的文章视图，
               页面上看着就是「评论一直加载不出来」（控制台还会跟着报
               Discussion not found 之类的请求失败）。
               做法：挂之前先把文章那个的类摘掉，让 .giscus 只命中评论视图这一个，
               iframe 建出来之后再把类还回去（还回去不影响已经建好的 iframe）。 */
            function parkArticleGiscus(parked) {
                if (!articleComments) return;
                if (parked === articleGiscusParked) return;
                articleGiscusParked = parked;
                articleComments.classList.toggle('giscus', !parked);
            }

            function restoreArticleGiscus() {
                if (commentsViewParkTimer) {
                    clearTimeout(commentsViewParkTimer);
                    commentsViewParkTimer = null;
                }
                parkArticleGiscus(false);
            }

            function applyCommentsContext(ctx) {
                const id = ctx && ctx.id !== undefined && ctx.id !== null ? String(ctx.id) : '';
                const title = ctx && ctx.title ? String(ctx.title) : '';
                commentsContext = { id: id, title: title };

                if (commentsViewTitle) commentsViewTitle.textContent = title || '评论';
                if (commentsViewLead) {
                    commentsViewLead.textContent = title
                        ? '这篇文章的留言都在下面。'
                        : '缺少文章信息，请从文章卡片的「查看评论」入口打开。';
                }
                // 没有文章信息时把评论区整个收起来，只留底栏
                if (commentsViewStage) commentsViewStage.hidden = !title;
                if (commentsViewFeedback) commentsViewFeedback.href = buildFeedbackUrl(id, title);
            }

            function readCommentsContextFromUrl() {
                try {
                    const params = new URL(window.location.href).searchParams;
                    return {
                        id: params.get(COMMENTS_ARTICLE_PARAM) || '',
                        title: params.get(COMMENTS_TITLE_PARAM) || '',
                    };
                } catch (e) {
                    return { id: '', title: '' };
                }
            }

            /* giscus 的 term 必须和文章页那边一字不差，否则就是另一个讨论串。
               文章页用的是 `文章 ${post.id}：${post.title}`，这里照抄。 */
            function commentsViewTermOf() {
                return '文章 ' + commentsContext.id + '：' + commentsContext.title;
            }

            function clearCommentsViewLoading() {
                if (commentsViewReadyTimer) {
                    clearInterval(commentsViewReadyTimer);
                    commentsViewReadyTimer = null;
                }
                if (commentsViewFailTimer) {
                    clearTimeout(commentsViewFailTimer);
                    commentsViewFailTimer = null;
                }
                if (commentsViewObserver) {
                    commentsViewObserver.disconnect();
                    commentsViewObserver = null;
                }
            }

            function fadeCommentsViewSkeleton() {
                const skeleton = commentsViewStage
                    ? commentsViewStage.querySelector('.comments-skeleton')
                    : null;
                if (!skeleton) return;
                skeleton.classList.add('is-hidden');
                setTimeout(function () {
                    if (skeleton.parentNode) skeleton.remove();
                }, 260);
            }

            function showCommentsViewRetry() {
                if (!commentsViewWidget) return;
                clearCommentsViewLoading();
                restoreArticleGiscus();
                commentsViewWidget.replaceChildren();
                const skeleton = commentsViewStage
                    ? commentsViewStage.querySelector('.comments-skeleton')
                    : null;
                if (skeleton) skeleton.remove();

                const box = document.createElement('div');
                box.className = 'comments-retry';
                const text = document.createElement('p');
                text.className = 'comments-retry-text';
                text.textContent = '评论加载失败，可能是网络问题。';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'comments-retry-btn';
                btn.textContent = '重新加载';
                btn.addEventListener('click', function () {
                    mountCommentsView(true);
                });
                box.append(text, btn);
                commentsViewWidget.appendChild(box);
            }

            /* force = true 时不看缓存，重挂一遍（重试按钮用） */
            function mountCommentsView(force) {
                if (!commentsViewWidget || !commentsContext.id || !commentsContext.title) return;
                const term = commentsViewTermOf();

                // 同一篇文章的 iframe 还挂着：直接复用
                if (!force && commentsViewTerm === term
                    && commentsViewWidget.querySelector('iframe.giscus-frame')) {
                    return;
                }

                clearCommentsViewLoading();
                commentsViewTerm = null;
                commentsViewWidget.replaceChildren();
                const staleSkeleton = commentsViewStage
                    ? commentsViewStage.querySelector('.comments-skeleton')
                    : null;
                if (staleSkeleton) staleSkeleton.remove();
                if (commentsViewStage) commentsViewStage.appendChild(buildCommentsSkeleton());

                const script = document.createElement('script');
                script.src = 'https://giscus.app/client.js';
                script.async = true;
                script.crossOrigin = 'anonymous';
                script.dataset.repo = 'Annie106/Annie106.github.io';
                script.dataset.repoId = 'R_kgDOSTMWsg';
                script.dataset.category = 'General';
                script.dataset.categoryId = 'DIC_kwDOSTMWss4DKarQ';
                script.dataset.mapping = 'specific';
                script.dataset.term = term;
                script.dataset.strict = '0';
                // 独立入口保留表情回应；文章页那块是 0
                script.dataset.reactionsEnabled = '1';
                script.dataset.emitMetadata = '0';
                script.dataset.inputPosition = 'bottom';
                script.dataset.theme = document.documentElement.getAttribute('data-theme') === 'dark'
                    ? 'dark'
                    : 'light';
                script.dataset.lang = 'zh-CN';
                // 先让 .giscus 只命中评论视图这一个，再插脚本（见 parkArticleGiscus 的注释）
                parkArticleGiscus(true);
                commentsViewWidget.appendChild(script);
                commentsViewTerm = term;

                /* 脚本加载失败也要把类还回去，否则文章页的评论区以后都挂不上 giscus */
                if (commentsViewParkTimer) clearTimeout(commentsViewParkTimer);
                commentsViewParkTimer = setTimeout(function () {
                    commentsViewParkTimer = null;
                    parkArticleGiscus(false);
                }, 2500);

                /* 和文章页同一套就绪判定：iframe 出来之后高度连续 3 次
                   （约 450ms）超过 200px 才算真渲染完。giscus 自己的
                   「正在加载评论」也有 150px，用「高度稳定」当完成信号会误判 */
                commentsViewObserver = new MutationObserver(function () {
                    const frame = commentsViewWidget.querySelector('iframe.giscus-frame');
                    if (!frame) return;
                    commentsViewObserver.disconnect();
                    commentsViewObserver = null;
                    // iframe 已经落到评论视图里了，可以把文章那边还原
                    restoreArticleGiscus();

                    let lastHeight = -1;
                    let stableTicks = 0;
                    let ticks = 0;
                    commentsViewReadyTimer = setInterval(function () {
                        ticks += 1;
                        const height = frame.getBoundingClientRect().height;
                        if (height > 200 && Math.abs(height - lastHeight) < 2) {
                            stableTicks += 1;
                        } else {
                            stableTicks = 0;
                        }
                        lastHeight = height;
                        if (stableTicks >= 3 || ticks > 70) {
                            clearInterval(commentsViewReadyTimer);
                            commentsViewReadyTimer = null;
                            fadeCommentsViewSkeleton();
                        }
                    }, 150);
                });
                commentsViewObserver.observe(commentsViewWidget, { childList: true });

                // 兜底：12 秒还没撑起来就是失败了，给个重试入口
                commentsViewFailTimer = setTimeout(function () {
                    commentsViewFailTimer = null;
                    const frame = commentsViewWidget.querySelector('iframe.giscus-frame');
                    const height = frame ? frame.getBoundingClientRect().height : 0;
                    if (height < 80) showCommentsViewRetry();
                }, 12000);
            }

            function openComments(post) {
                applyCommentsContext({
                    id: post ? post.id : '',
                    title: post ? post.title : '',
                });
                viewScrollPositions.comments = 0;
                /* 和反馈页同理：不用 navigateToView（它在文章视图下会改写当前记录，
                   返回键就直接离开文章了），这里一律新压一条记录 */
                rememberEntryScroll();
                commentsEntryActive = pushViewHistoryEntry('comments', true);
                switchView('comments');
                window.scrollTo({ top: 0, behavior: 'instant' });
            }

            /* 底栏的「返回」：从站内点进来就按浏览器后退走（回到列表或文章原位），
               直接输网址打开的没有上一级可退，退回首页 */
            function returnFromComments() {
                if (commentsEntryActive) {
                    commentsEntryActive = false;
                    history.back();
                    return;
                }
                goHome();
            }

            if (commentsViewBack) {
                commentsViewBack.addEventListener('click', returnFromComments);
            }

            // ==================== 事件绑定 ====================
            $$('.nav-links a').forEach(link => {
                /* Nav items without href are not native links: Enter/Space must fire click */
                link.addEventListener('keydown', function(e) {
                    if (this.hasAttribute('href')) return;
                    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                    e.preventDefault();
                    this.click();
                });
                link.addEventListener('click', function(e) {
                    const nav = this.getAttribute('data-nav');
                    if (!nav) return;
                    e.preventDefault();
                    if (nav === 'home') goHome();
                    if (nav === 'blog') navigateToView('blog');
                    if (nav === 'archive') navigateToView('archive');
                    if (nav === 'movie') navigateToView('movie');
                    if (nav === 'about') navigateToView('about');
                });
            });

            homeLink.addEventListener('click', function(e) {
                e.preventDefault();
                goHome();
            });

            // 文章列表页标题旁的「首页」按钮：回到首页并滚到顶部。
            // 用事件委托，以后别的视图想加同样的入口不用重复绑事件。
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('[data-goto-home]');
                if (!btn) return;
                e.preventDefault();
                // 这个入口的语义就是「回首页顶部」：先把记下的位置清零，
                // 否则 switchView 会先把你送回原来的位置、再滑到顶部，一上一下
                viewScrollPositions.home = 0;
                goHome();
                window.scrollTo({ top: 0, behavior: 'instant' });
            });

            // 窗口尺寸/横竖屏变化后，四项的宽度会变，指示块要重新量
            let navResizeTick = null;
            window.addEventListener('resize', function() {
                if (navResizeTick) window.cancelAnimationFrame(navResizeTick);
                navResizeTick = window.requestAnimationFrame(function() {
                    navResizeTick = null;
                    updateNavPill();
                });
            });

            // 字体加载完成后文字宽度会变，再量一次
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(updateNavPill).catch(function() {});
            }
            updateNavPill();

            // 滚动状态：进出页面时都同步一次，避免刷新后停在中间位置却没打上标
            window.addEventListener('scroll', syncHeaderScroll, { passive: true });
            syncHeaderScroll();

            backBtn.addEventListener('click', function(e) {
                e.preventDefault();
                returnToArticlePosition();
            });
            backBtn2.addEventListener('click', function(e) {
                e.preventDefault();
                returnToArticlePosition();
            });

            // 文章页顶部的分享按钮
            if (articleShare) {
                articleShare.addEventListener('click', function() {
                    const post = blogPosts.find(item => item.id === currentArticleId);
                    if (post) shareArticle(post);
                });
            }

            /* 底部「问题反馈」：站内切到反馈视图，不跳页面。
               按住 Ctrl / Cmd / Shift 或中键点击时交回浏览器（href 是同一页的带参地址），
               想在新标签页开的人照样能开。 */
            if (articleFeedback) {
                articleFeedback.addEventListener('click', function(e) {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    const post = blogPosts.find(item => item.id === currentArticleId);
                    openFeedback(post || null);
                });
            }

            // ==================== 微信分享引导浮层 ====================
            if (wechatShareGuide) {
                if (wechatShareGuideClose) {
                    wechatShareGuideClose.addEventListener('click', closeWechatShareGuide);
                }
                // 点遮罩空白处关闭；点浮层内容本身不关闭
                wechatShareGuide.addEventListener('click', function(e) {
                    if (e.target === wechatShareGuide) closeWechatShareGuide();
                });
                // 浮层里的「再次复制链接」：复制当前文章链接
                if (wechatShareGuideCopy) {
                    wechatShareGuideCopy.addEventListener('click', function() {
                        const post = blogPosts.find(item => item.id === currentArticleId);
                        if (!post) return;
                        const url = buildArticleUrl(post.id);
                        Promise.resolve(copyLink(url)).then(function(ok) {
                            showToast(ok ? '链接已复制，粘贴给好友即可' : '链接复制失败，可长按地址栏手动复制', !ok);
                        });
                    });
                }
            }

            // Esc 关闭引导浮层（桌面版微信 / 外接键盘时用得上）
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && wechatShareGuide && !wechatShareGuide.hidden) {
                    closeWechatShareGuide();
                }
            });

            function returnToArticlePosition() {
                if (history.state && history.state.annieArticleId === currentArticleId) {
                    returningFromArticleButton = true;
                    history.back();
                    return;
                }
                articleHistoryEntryActive = false;
                switchView(articleReturnView);
                window.requestAnimationFrame(() => {
                    window.scrollTo({ top: articleReturnScroll, behavior: 'instant' });
                });
            }

            window.addEventListener('popstate', function(event) {
                const state = event.state;

                // 这次 popstate 是我们自己调用 history.back() 引起的
                // （收起搜索时退掉那条记录），页面状态不用动。
                if (searchPendingHistoryBack > 0) {
                    searchPendingHistoryBack -= 1;
                    const afterBack = searchHistoryBackCallback;
                    searchHistoryBackCallback = null;
                    if (afterBack) afterBack();
                    // 取消搜索的同时点了「全部文章」这类入口：现在落点定了，
                    // 才把视图记录补上，返回键照样能回到首页
                    if (pendingViewHistoryPush) {
                        const targetView = pendingViewHistoryPush;
                        pendingViewHistoryPush = null;
                        if (!(event.state && event.state.annieView === targetView)) {
                            pushViewHistoryEntry(targetView, true);
                            syncUrlWithView();
                        }
                    }
                    return;
                }

                // 用户按了返回键 / 侧滑返回。
                // 搜索面板开着时，返回键分两级处理：
                //   1) 输入框里有内容 → 只清空关键词，回到空白搜索页
                //      （最近搜索 / 按标签 / 最近更新 那套推荐），面板不关；
                //   2) 输入框已经空了 → 收起面板，回到原页面。
                // 这样和 Esc 的行为一致，也符合「返回上一层」的直觉：
                // 有关键词时上一层是空搜索页，没关键词时上一层才是页面。
                if (searchOpen) {
                    const typed = normalizeQuery(searchInput ? searchInput.value : '');
                    if (typed) {
                        // 清空输入和结果，但保留面板与历史记录：
                        // 用户再按一次返回才会真的关掉面板
                        if (searchInput) searchInput.value = '';
                        clearSearchTimers();
                        showSearchIdle();
                        if (searchInput) searchInput.focus({ preventScroll: true });
                        return;
                    }
                    closeSearch({ fromHistory: true });
                    return;
                }

                // 历史记录已经退到「搜索之前」，但面板还留着标记
                //（比如用户连按两次返回），把标记清掉，避免之后误触发 back()
                if (searchHistoryEntryActive) {
                    searchHistoryEntryActive = false;
                }

                // 用「前进」回到那条搜索记录：面板早就关了，
                // 这里什么都不做，别拿它去还原某个旧视图
                if (state && state.annieSearch === true) return;

                const viewSnapshot = state && state.annieViewSnapshot;
                if (viewSnapshot && VALID_VIEWS.includes(viewSnapshot.view)) {
                    // 快照里的滚动位置可能已经过期，记录里带了更新的就以它为准
                    if (state && typeof state.annieScrollTop === 'number') {
                        viewSnapshot.scroll = state.annieScrollTop;
                    }
                    restoreTagsFromSnapshot(viewSnapshot);
                    returningFromArticleButton = false;
                    articleHistoryEntryActive = false;
                    // 从「搜索结果打开的文章」返回时会走到这里
                    //（openArticle 把搜索那条记录 replaceState 成了快照）。
                    // 直接还原打开搜索前的那一页即可，不重新弹搜索面板。
                    restoreViewState(viewSnapshot);
                    return;
                }

                const post = state && blogPosts.find(item => item.id === state.annieArticleId);
                if (post && (!post.externalPage || post.embeddedPage || !isArticlePublic(post))) {
                    articleHistoryEntryActive = true;
                    articleReturnView = typeof state.annieReturnView === 'string'
                        && ['home', 'blog', 'movie', 'about'].includes(state.annieReturnView)
                        ? state.annieReturnView
                        : 'home';
                    articleReturnScroll = typeof state.annieReturnScroll === 'number'
                        ? state.annieReturnScroll
                        : 0;
                    renderArticle(post);
                    switchView('article');
                    window.scrollTo({ top: 0, behavior: 'instant' });
                    return;
                }

                if (!articleHistoryEntryActive && currentView !== 'article') {
                    // 在「文章 / 电影 / 关于」页按了返回键：回到记录里的上一级视图
                    //（正常情况下就是首页），别让用户被直接带出站点。
                    // state 为空说明退到了站点的第一条记录，那里是首页。
                    const stateView = state && typeof state.annieView === 'string'
                        && VALID_VIEWS.includes(state.annieView)
                        ? state.annieView
                        : 'home';
                    // 记录里存着这个视图离开时的滚动位置，优先用它
                    if (state && typeof state.annieScrollTop === 'number') {
                        viewScrollPositions[stateView] = state.annieScrollTop;
                    }
                    if (stateView !== currentView) switchView(stateView);
                    return;
                }
                const returnView = articleReturnView;
                const returnScroll = articleReturnScroll;
                returningFromArticleButton = false;
                articleHistoryEntryActive = false;

                switchView(returnView);
                const applyReturnScroll = () => window.scrollTo({ top: returnScroll, behavior: 'instant' });
                window.requestAnimationFrame(() => {
                    applyReturnScroll();
                    window.requestAnimationFrame(applyReturnScroll);
                });
            });

            document.addEventListener('click', function(e) {
                if (e.target.matches('[data-nav="blog"]') && e.target.closest('.tag-pill')) {
                    e.preventDefault();
                    viewScrollPositions.blog = 0;
                    navigateToView('blog');
                    window.scrollTo({ top: 0, behavior: 'instant' });
                }
            });

            document.addEventListener('click', function(e) {
                if (!e.target.closest('.post-card.menu-open')) {
                    document.querySelectorAll('.post-card.menu-open').forEach(card => {
                        card.classList.remove('menu-open');
                        card.querySelector('.options').setAttribute('aria-expanded', 'false');
                        card.querySelector('.post-menu').hidden = true;
                    });
                }
            });

            document.addEventListener('keydown', function(e) {
                if (e.key !== 'Escape') return;
                const openCard = document.querySelector('.post-card.menu-open');
                if (!openCard) return;
                openCard.classList.remove('menu-open');
                openCard.querySelector('.options').setAttribute('aria-expanded', 'false');
                openCard.querySelector('.post-menu').hidden = true;
                openCard.querySelector('.options').focus();
            });

            // ==================== 初始化 ====================
            function init() {
                const savedState = readViewState();
                restoreTagsFromSnapshot(savedState);
                renderTagPills('tagFilterHome');
                renderTagPills('tagFilterBlog');
                renderPostsList('postsListHome');
                renderPostsList('postsListBlog');
                syncAllPostsCount();
                renderTweaks();
                renderTweaksFeed();
                renderTimeline();
                renderArchive();
                // 搜索面板的初始内容：最近搜索 + 标签入口
                renderSearchSuggestions();
                renderSearchHistory();

                // 优先处理地址栏里的文章参数：别人分享过来的链接
                // （...?article=3）要能直接打开那篇文章。
                const urlArticleId = readArticleIdFromUrl();
                const urlPost = urlArticleId === null
                    ? null
                    : blogPosts.find(p => p.id === urlArticleId);
                if (urlPost && (!urlPost.externalPage || urlPost.embeddedPage || !isArticlePublic(urlPost))) {
                    articleReturnView = 'home';
                    articleReturnScroll = 0;
                    // 直接进入的文章没有可回退的站内记录，标记为未激活，
                    // 这样点「返回」会走 switchView 而不是 history.back()
                    articleHistoryEntryActive = false;
                    renderArticle(urlPost);
                    switchView('article');
                    playReturnEnterAnimation();
                    return;
                }
                // 链接里的 id 不存在（文章被删了、链接被改过）时，
                // 清掉参数并回到首页，避免地址栏留着一个无效值
                if (urlArticleId !== null && !urlPost) {
                    const clean = new URL(window.location.href);
                    clean.searchParams.delete(ARTICLE_PARAM);
                    clean.hash = '';
                    history.replaceState(history.state, '', clean.pathname + clean.search);
                }

                // 关于 / 归档 / 折腾 / 反馈 / 提交成功 / 评论 也可以通过 ?view=xxx 直接打开，
                // 不受本地界面记忆影响。
                const urlView = new URL(window.location.href).searchParams.get(VIEW_PARAM);
                if (urlView === 'about' || urlView === 'archive' || urlView === 'tweaks'
                    || urlView === 'feedback' || urlView === 'thanks' || urlView === 'comments') {
                    // 反馈 / 评论的文章信息跟着地址栏走，直接打开也能带上
                    if (urlView === 'feedback') applyFeedbackContext(readFeedbackContextFromUrl());
                    if (urlView === 'comments') applyCommentsContext(readCommentsContextFromUrl());
                    switchView(urlView);
                    playReturnEnterAnimation();
                    return;
                }

                // 从别的 HTML 页面返回时，回到离开时的界面
                if (!restoreViewState(savedState)) switchView('home');
                playReturnEnterAnimation();
            }

            /* 首屏「正在加载博客数据…」的收尾。
               提示条本身写在 index.html 里（那时 style.css 还没到，必须自带样式），
               并且要加载超过 3 秒才会露脸；这里只负责把它收掉。
               收尾方式参考 .site-toast：去掉 .is-visible 触发透明度 + 位移的过渡。 */
            function hideBootLoading() {
                const el = document.getElementById('bootLoading');
                if (!el || el.getAttribute('data-done')) return;
                // 打标记，让页面里那个 3 秒计时器别再把它放出来
                el.setAttribute('data-done', '1');

                // 压根没露过脸（3 秒内就加载完了）：什么都不用做
                if (!el.classList.contains('is-visible')) {
                    el.setAttribute('aria-hidden', 'true');
                    return;
                }

                /* 刚好在 3 秒出头加载完时，提示可能只露脸一百毫秒 ——
                   那样「闪一下就没了」比不显示还怪。补足最短展示时间再淡出。 */
                const shownAt = Number(el.getAttribute('data-shown-at') || 0);
                const played = shownAt ? Date.now() - shownAt : 0;
                const MIN_VISIBLE = 700;
                const wait = played > 0 && played < MIN_VISIBLE ? MIN_VISIBLE - played : 0;

                setTimeout(function () {
                    el.classList.remove('is-visible');
                    // 等位移走完（0.34s）再从无障碍树里摘掉，免得读屏软件还念着「正在加载」
                    setTimeout(function () {
                        el.setAttribute('aria-hidden', 'true');
                    }, 360);
                }, wait);
            }

            init();
            // init() 内部无论从哪条分支返回（首页 / 文章直链 / ?view=xxx），
            // 走到这里都说明数据已经渲染完了，提示条可以退场
            hideBootLoading();

            console.log('✅ Annie 的个人博客已就绪！');
            // console.log('📝 修改文章内容：编辑 blogPosts 数组');
            // console.log('👤 修改个人信息：编辑 siteConfig 对象');
            // console.log('🖼️ 修改头像：替换 .avatar 的 src 属性');
            // console.log('🔗 修改社交链接：编辑 .social-links 中的 href');
        })();
