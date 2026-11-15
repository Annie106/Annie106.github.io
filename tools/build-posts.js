#!/usr/bin/env node
/* ==================== 生成文章静态页 + sitemap + robots ====================

   为什么要有这个脚本：

   本站是单页应用，文章地址是 /?article=16 —— 整站只有一个 index.html，
   标题、封面、正文都是脚本跑起来之后才写进 <head> 和 DOM 的。
   而搜索引擎、微信、Telegram 这类分享预览**都不执行 JS**，它们看到的
   永远是首页那一个标题、那一张 share_cover.jpg，正文一个字也抓不到。

   这个脚本给每篇公开文章烤一个真正的静态页：

       https://annie106.github.io/posts/16/

   head 里带这篇文章自己的 title / description / og:image / JSON-LD，
   body 里带完整正文。不跑 JS 也能读全，分享卡片也是对的。

   ⚠️ 站内链接也指向这里了：文章卡片的标题、时间线、归档的 href 都是 /posts/<id>/，
   点它是站内 pushState（不整页刷新），script.js 从地址栏认出「这是文章页」就直接渲染。
   所以站内跳转、刷新、从聊天软件点进来、爬虫抓取 —— 走的是同一个地址、同一份 DOM。
   ?article=<id> 只剩「旧链接别名」这一个用途。

   用法：
       node tools/build-site.js     # 先出 dist/（会先清空）
       node tools/build-posts.js    # 再往 dist/ 里补文章页、sitemap、robots

   顺序不能反：build-site.js 开头会清空 dist/，先跑它再跑这个。

   为什么写在 dist/ 而不是仓库根：产物和源码分开，dist/ 在 .gitignore 里，
   CI 每次重新生成。所以「本地忘了跑」不会把旧页面提交进仓库，
   也不会出现「仓库里那份和线上那份各说各话」。

   输出是确定性的（幂等）：同一份 posts-data.js，在哪台机器上跑都逐字节相同。
   时间只取文章自己的 date / updated，绝不用 new Date() —— 否则本地跑一次、
   CI 再跑一次，两边差几秒，git 里就成了两个版本互相打架。
   ================================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const POSTS_FILE = path.join(ROOT, 'js', 'posts-data.js');

/* 站点根地址。文章页的绝对地址、sitemap 里的 loc、JSON-LD 里的 url
   都从这里拼。别写成带 index.html 的形式（地址栏约定见 AGENTS.md）。 */
const SITE = 'https://annie106.github.io/';
const SITE_NAME = 'Annie · 个人博客';
const AUTHOR = 'Annie';
const SITE_DESC = '思考 · 记录 · 创造 —— 记录阅读、成长和日常灵感。';

/* 没配封面的文章共用这张。和 build-feed.js 保持一致。 */
const FALLBACK_COVER = SITE + 'share_cover.jpg';

/* 是否允许搜索引擎收录文章页。2026-11-15 起改成 false（全站 noindex）：
   页面照常能打开、能分享、分享卡片正常，只是不会出现在搜索结果里。

   ⚠️ 改回 true 时还要改 `index.html` 里那条 robots 标签（文章页的标签是
   从它替换出来的，index 自己那份没人替换）。两处一起改，否则首页仍被排除。
   ⚠️ 无论 true 还是 false，`robots.txt` 里都**不要**写 Disallow：
   爬虫进不来就读不到 noindex，已经收录的页面会永远留在搜索结果里。 */
const ALLOW_SEARCH_INDEXING = false;

/* 页面里那条 robots 标签的原文（index.html 第 5 行）。文章页把它整条替换掉，
   而不是再插一条 —— 两条互相矛盾的 robots 标签，抓取器取哪条全看运气。 */
const MARK_ROBOTS = '<meta name="robots" content="noindex,follow">';

/* 描述兜底长度：中文一句话大约 40～60 字，120 足够放两句，
   再长会在搜索结果里被截断，反而把后半句切成半个词。 */
const DESC_MAX = 120;

/* ==================== 数据 ==================== */

function loadPosts() {
    const code = fs.readFileSync(POSTS_FILE, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'posts-data.js' });

    const posts = sandbox.window.BLOG_POSTS;
    if (!Array.isArray(posts) || !posts.length) {
        throw new Error('js/posts-data.js 里没拿到 window.BLOG_POSTS，格式是不是被改过？');
    }

    /* id 是目录名，重复了会互相覆盖 —— 表现是「线上少了一篇文章」，
       而且不报错，最难自己发现。宁可在这里直接拦住。 */
    const seen = new Map();
    posts.forEach(function (post) {
        if (post == null || post.id == null) {
            throw new Error('有文章缺 id 字段：' + JSON.stringify(post && post.title));
        }
        if (seen.has(post.id)) {
            throw new Error(
                '文章 id 重复：#' + post.id + '\n  ' + seen.get(post.id) + '\n  ' + post.title
            );
        }
        seen.set(post.id, post.title);
    });

    return posts;
}

/* 和 script.js 的 isArticlePublic 保持一致：只有显式写 isPublic: false 才不发布。
   静态页一旦发出去就会被搜索引擎收录，所以这里的口径必须和站内一致，
   不然会出现「站里点不开、Google 上却有」。 */
function isPublic(post) {
    return post.isPublic !== false;
}

function dateOf(post) {
    return String(post.updated || post.date || '').slice(0, 10);
}

function sortKey(post) {
    return String(post.updated || post.date || '');
}

function publicNewestFirst(posts) {
    return posts.filter(isPublic).slice().sort(function (a, b) {
        const diff = sortKey(b).localeCompare(sortKey(a));
        return diff !== 0 ? diff : (b.id || 0) - (a.id || 0);
    });
}

/* ==================== 上一篇 / 下一篇 ====================

   ⚠️ 这里的排序和 script.js 的 getAdjacentPosts() 必须**逐字一致**：
   发布日期倒序、同日期按 id 倒序、置顶不参与。
   两边一旦不一致，静态页里给的翻页链接和 JS 渲染出来的会换人 ——
   表现是「点进去看到的上一篇，和刚才卡片上写的不是同一篇」。改一处就要改两处。

   预渲染这一栏的意义：静态页是给爬虫和分享预览用的，里面有真实的
   <a href> 才能让爬虫顺着文章之间的链接爬，而不是只靠 sitemap 一张清单。 */
function navigableNewestFirst(posts) {
    return posts.filter(function (post) {
        // 口径同 script.js 的 openArticle：未开放的、纯跳站外的不参与翻页
        return isPublic(post) && (!post.externalPage || post.embeddedPage);
    }).slice().sort(function (a, b) {
        const diff = sortKey(b).localeCompare(sortKey(a));
        return diff !== 0 ? diff : (b.id || 0) - (a.id || 0);
    });
}

function adjacentNav(post, ordered) {
    const index = ordered.findIndex(function (item) { return item.id === post.id; });
    if (index < 0) return MARK_ADJACENT;

    // ordered 是新的在前：下标 +1 是更早写的，-1 是更晚写的
    const prev = ordered[index + 1] || null;
    const next = ordered[index - 1] || null;
    if (!prev && !next) return MARK_ADJACENT;

    const itemMarkup = function (target, className, label, icon) {
        if (!target) return '';
        /* href 写的是 siteBasePath() 那种「站内相对」形式。文章页 head 里有
           <base href="/">，所以 posts/16/ 会解析成 /posts/16/ —— 和站内 JS
           渲染出来的那套完全一样。 */
        return (
            '\n                <a class="article-adjacent-link ' + className + '" href="posts/' + target.id + '/" data-adjacent-article="' + target.id + '">' +
            '<span class="adj-label"><i class="' + icon + '" aria-hidden="true"></i> ' + label + ' · ' + escapeHtml(dateOf(target)) + '</span>' +
            '<span class="adj-title">' + escapeHtml(target.title) + '</span>' +
            '</a>'
        );
    };

    // 只有一篇可翻时收成半宽（和 script.js 里 toggle 的类名保持一致）
    const singleClass = (Boolean(prev) !== Boolean(next)) ? ' is-single' : '';
    const items = itemMarkup(prev, 'is-prev', '上一篇', 'ri-arrow-left-line') +
        itemMarkup(next, 'is-next', '下一篇', 'ri-arrow-right-line');

    return '<nav class="article-adjacent' + singleClass + '" id="articleAdjacent" aria-label="相邻文章">' +
        items + '\n            </nav>';
}

/* ==================== 转义 / 取字段 ==================== */

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeXml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/* JSON-LD 塞在 <script> 里，正文或标题里只要出现 </script> 就会提前闭合。
   把 < 换成 < 转义（JSON 里的 \u003c 是等价的），彻底躲开这个坑。 */
function safeJson(value) {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function plainText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function clamp(text, max) {
    const chars = Array.from(String(text || ''));
    return chars.length > max ? chars.slice(0, max).join('') + '…' : chars.join('');
}

function firstImage(html) {
    const match = /<img[^>]+src=["']([^"']+)["']/i.exec(String(html || ''));
    return match ? match[1] : '';
}

function absoluteUrl(raw) {
    const value = String(raw || '');
    if (!value) return '';
    if (/^(?:https?:)?\/\//i.test(value)) return value;
    /* 站内相对地址统一补成「根路径 + 相对仓库根」。
       这一步是必须的：文章页在 /posts/16/ 这一层，正文里写 images/a.jpg
       会被解析成 /posts/16/images/a.jpg，直接 404。补成 /images/a.jpg 才活。
       代价是 dist/ 用 file:// 直接打开时图片不显示 —— dist/ 本来就是给
       静态服务器/CI 用的，不算损失。 */
    return SITE + value.replace(/^(?:\.\.?\/)+/, '').replace(/^\//, '');
}

/* 正文里的相对地址不用在这里改写 —— 页面 head 里那条 <base href="../../">
   已经把它们按站点根解析了。以前这里有个 absolutize()，改成「文章页就是
   index.html 改出来的」之后就没用了：base 对 href/src/poster 一律生效，
   而且本地和线上都能用，比补死 https://annie106.github.io/ 更省事。 */

function coverUrl(post) {
    const raw = post.cover || firstImage(post.content) || FALLBACK_COVER;
    return absoluteUrl(raw);
}

function summaryOf(post) {
    return clamp(post.excerpt || plainText(post.content) || post.title || '', DESC_MAX);
}

function pageUrl(post) {
    return SITE + 'posts/' + post.id + '/';
}

/* ==================== 页面 ==================== */

/* 文章页不是另写一份模板，而是**拿构建好的 dist/index.html 改出来**：
   换掉 head 里的标题 / 描述 / 分享卡，把正文塞进文章视图，再把首页视图藏起来。
   于是页面上永远是同一份 DOM —— 导航、页脚、搜索浮层、评论区全都在，
   站内点进来是 SPA 体验，刷新、直接打开、爬虫抓到的也是同一份东西。
   反过来说：index.html 改了，这里不用跟着改。单一样本，不会各说各话。

   ⚠️ 下面几个锚点字符串来自 index.html 本身。任何一个对不上（有人改了 id、
   改了那行 style），构建直接失败并点名，而不是生成一堆静默坏掉的页面。 */
const TEMPLATE_FILE = path.join(OUT_DIR, 'index.html');

const MARK_VIEW_HOME = '<div id="view-home" class="view active-view">';
const MARK_VIEW_ARTICLE = '<div id="view-article" class="article-detail" style="display:none;">';
const MARK_TITLE = '<h1 class="article-full-title" id="articleTitle"></h1>';
const MARK_META = '<div class="article-full-meta" id="articleMeta"></div>';
const MARK_CONTENT = '<div class="article-content" id="articleContent"></div>';
const MARK_ADJACENT = '<nav class="article-adjacent" id="articleAdjacent" aria-label="相邻文章"></nav>';

function loadTemplate() {
    if (!fs.existsSync(TEMPLATE_FILE)) {
        throw new Error('dist/index.html 不存在。先跑 node tools/build-site.js 再跑这个脚本。');
    }
    return fs.readFileSync(TEMPLATE_FILE, 'utf8');
}

/* 精确替换一次，少一处或多一处都算错。
   文章页是「改出来的」—— 锚点错位不会抛异常，只会生成一个空页面或者结构错乱，
   而且构建日志照样打「✅」。所以这里宁可让构建炸掉。 */
function replaceOnce(html, from, to, label) {
    const first = html.indexOf(from);
    if (first < 0) throw new Error('index.html 里找不到锚点（' + label + '）：' + from);
    if (html.indexOf(from, first + from.length) >= 0) {
        throw new Error('锚点在 index.html 里出现了不止一次（' + label + '）：' + from);
    }
    return html.slice(0, first) + to + html.slice(first + from.length);
}

function metaMarkup(post) {
    const parts = [
        '<span><i class="ri-calendar-line"></i> ' + escapeHtml(dateOf(post)) + '</span>'
    ];
    (post.tags || []).forEach(function (tag) {
        parts.push('<span class="post-tag">' + escapeHtml(tag) + '</span>');
    });
    /* 和站内一致：只有发布后改过（有 updated）才显示原发布日，
       免得同一篇里出现两个一模一样的日期 */
    if (post.updated && post.date && String(post.updated).slice(0, 10) !== String(post.date).slice(0, 10)) {
        parts.push(
            '<span class="article-updated"><i class="ri-calendar-line"></i> 发布于 ' +
                escapeHtml(String(post.date).slice(0, 10)) +
                '</span>'
        );
    }
    return parts.join('\n            ');
}

/* 正文 HTML。有 content 就直接用；没有的（正文是独立页面那几篇）退回摘要，
   免得留一个空 div —— 只有标题和一句链接的页面在搜索引擎眼里是「薄内容」。
   这里**不改写相对地址**：文章页 head 里插了 <base href="../../">，
   images/a.jpg 会照常解析成 /images/a.jpg，源码里写什么样就是什么样。 */
function contentMarkup(post) {
    const body = (post.content && String(post.content).trim())
        ? post.content
        : '<p>' + escapeHtml(post.excerpt || summaryOf(post)) + '</p>';
    if (!post.embeddedPage) return body;
    /* 正文在独立页面里那几篇：给一条明确入口，否则读者和爬虫都只看到一段摘要 */
    return body + '\n<p><a href="' + escapeHtml(post.embeddedPage) + '">打开正文页面' +
        ' <i class="ri-external-link-line"></i></a></p>';
}

/* 文章专属的 head 片段。插在 <meta charset> 后面，
   同时首页那几条 description / og: / twitter: 会被下面的 buildPage 删掉 ——
   留着就有两套互相矛盾的分享信息，抓取器取哪一条全看运气。 */
function articleHead(post) {
    const title = post.title || '文章 ' + post.id;
    const desc = summaryOf(post);
    const url = pageUrl(post);
    const cover = coverUrl(post);
    const keywords = (post.tags || []).join(',');
    const published = String(post.date || dateOf(post)).slice(0, 10);

    /* 分享/收录用的结构化数据。BlogPosting 是 Google 认的文章类型，
       headline + datePublished + author 是它必看的三个字段。 */
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: title,
        description: desc,
        datePublished: published,
        dateModified: String(post.updated || post.date || '').slice(0, 10) || published,
        author: { '@type': 'Person', name: AUTHOR, url: SITE },
        publisher: { '@type': 'Person', name: AUTHOR, url: SITE },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        url: url,
        inLanguage: 'zh-CN'
    };
    if (cover) jsonLd.image = cover;
    if (keywords) jsonLd.keywords = keywords;

    return [
        /* 文章页在 /posts/<id>/ 这两层下面，而 css/、js/、favicon 这些引用是照
           index.html 里「相对站点根」的样子写的。这里必须是**静态的绝对地址**：
           试过写成 <base href="./"> 让浏览器自己算，Chrome 会在地址被 replaceState
           改写之后再解析一遍；试过用脚本设 <base href>，预加载扫描器根本等不到脚本
           执行，整页资源全 404。站点部署在域名根（用户站），所以 / 是对的。 */
        '    <base href="/">',
        '    <title>' + escapeHtml(title + ' · ' + SITE_NAME) + '</title>',
        '    <meta name="description" content="' + escapeHtml(desc) + '">',
        '    <meta name="author" content="' + escapeHtml(AUTHOR) + '">',
        keywords ? '    <meta name="keywords" content="' + escapeHtml(keywords) + '">' : '',
        '    <link rel="canonical" href="' + escapeHtml(url) + '">',

        '    <meta property="og:type" content="article">',
        '    <meta property="og:site_name" content="' + escapeHtml(SITE_NAME) + '">',
        '    <meta property="og:title" content="' + escapeHtml(title) + '">',
        '    <meta property="og:description" content="' + escapeHtml(desc) + '">',
        '    <meta property="og:url" content="' + escapeHtml(url) + '">',
        cover ? '    <meta property="og:image" content="' + escapeHtml(cover) + '">' : '',
        '    <meta property="article:published_time" content="' + escapeHtml(published) + '">',

        '    <meta name="twitter:card" content="summary">',
        '    <meta name="twitter:title" content="' + escapeHtml(title) + '">',
        '    <meta name="twitter:description" content="' + escapeHtml(desc) + '">',
        cover ? '    <meta name="twitter:image" content="' + escapeHtml(cover) + '">' : '',

        '    <script type="application/ld+json">\n' + safeJson(jsonLd).split('\n').map(function (line) {
            return '    ' + line;
        }).join('\n') + '\n    </script>'
    ].filter(function (line) {
        return line !== '';
    }).join('\n');
}

function buildPage(post, template, ordered) {
    const title = post.title || '文章 ' + post.id;
    let html = template;

    /* 顺序很重要：先删首页那几条元信息，再把文章自己的插进来。
       反过来的话，刚插进去的 `    <meta property="og:title">` 会被同一个正则
       一起删掉 —— 页面看着正常，分享卡却是空的。 */
    html = html.replace(/^ {4}<title>[^\n]*<\/title>\n/m, '');
    html = html.replace(/^ {4}<meta name="description"[^\n]*\n/m, '');
    html = html.replace(/^ {4}<meta property="og:[^\n]*\n/mg, '');
    html = html.replace(/^ {4}<meta name="twitter:[^\n]*\n/mg, '');
    html = html.replace(/^ {4}<link rel="image_src"[^\n]*\n/m, '');

    html = replaceOnce(
        html,
        '<meta charset="UTF-8">',
        '<meta charset="UTF-8">\n' + articleHead(post),
        'head 插入点'
    );

    /* 收录开关落在这一条上。整条替换而不是追加：两条 robots 标签会让
       抓取器自己挑一条，"别收录"就可能被忽略。 */
    html = replaceOnce(
        html,
        MARK_ROBOTS,
        MARK_ROBOTS.replace(
            'noindex,follow',
            ALLOW_SEARCH_INDEXING ? 'index,follow' : 'noindex,follow'
        ),
        'robots 标签'
    );

    /* ⚠️ 这里**不用**改 <base>：index.html 里的那段内联脚本会按
       location.pathname 自己算，文章页（/posts/<id>/）它会算出往上两级的根。
       早先试过在构建时把 <base href="./"> 换成 ../../，Chrome 会在地址被
       replaceState 之后重新解析相对值，照样失效。 */



    /* 首屏只显示文章：首页默认带着 active-view 是可见的，
       不撤掉就会出现「首页在上、文章在下」的叠罗汉。 */
    html = replaceOnce(html, MARK_VIEW_HOME,
        '<div id="view-home" class="view" style="display:none;">', '首页视图');
    html = replaceOnce(html, MARK_VIEW_ARTICLE,
        '<div id="view-article" class="article-detail active">', '文章视图');

    /* 正文预渲染进 DOM。脚本跑起来之后 renderArticle 会再写一遍同样的内容
       （不会闪），但对不执行 JS 的抓取器来说，这是它们唯一能看到正文的机会。 */
    html = replaceOnce(html, MARK_TITLE,
        '<h1 class="article-full-title" id="articleTitle">' + escapeHtml(title) + '</h1>',
        '标题挂载点');
    html = replaceOnce(html, MARK_META,
        '<div class="article-full-meta" id="articleMeta">\n                ' +
        metaMarkup(post) + '\n            </div>',
        'meta 挂载点');
    html = replaceOnce(html, MARK_CONTENT,
        '<div class="article-content" id="articleContent">' + contentMarkup(post) + '</div>',
        '正文挂载点');

    /* 翻页卡片也预渲染一份：爬虫不跑 JS，只有真实 <a href> 才爬得到相邻文章。
       脚本跑起来之后 renderAdjacentArticles 会用同样的内容再写一遍，不会闪。 */
    html = replaceOnce(html, MARK_ADJACENT, adjacentNav(post, ordered), '翻页挂载点');

    return html;
}

/* ==================== sitemap / robots ==================== */

function buildSitemap(posts) {
    const latest = posts.length ? sortKey(posts[0]).slice(0, 10) : '';

    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- 由 tools/build-posts.js 生成，不要手改。加文章只需改 js/posts-data.js -->',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        '    <loc>' + escapeXml(SITE) + '</loc>',
        latest ? '    <lastmod>' + escapeXml(latest) + '</lastmod>' : '',
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>'
    ].filter(Boolean);

    posts.forEach(function (post) {
        lines.push('  <url>');
        lines.push('    <loc>' + escapeXml(pageUrl(post)) + '</loc>');
        const lastmod = dateOf(post);
        if (lastmod) lines.push('    <lastmod>' + escapeXml(lastmod) + '</lastmod>');
        lines.push('    <changefreq>monthly</changefreq>');
        lines.push('    <priority>0.8</priority>');
        lines.push('  </url>');
    });

    lines.push('</urlset>', '');
    return lines.join('\n');
}

function buildRobots() {
    /* 这个站是「能访问、不收录」：页面里带 noindex。
       所以这里必须 **Allow**，不能 Disallow —— 爬虫被拦住就进不来，
       读不到页面里的 noindex，已经收录的页面反而永远从搜索结果里删不掉。
       Sitemap 也保留：它让爬虫更快抓到页面、更快看到 noindex、更快退出索引。
       等全站彻底从搜索结果里消失之后，想省事可以把 Sitemap 那行删掉。 */
    return [
        '# 允许抓取。不要改成 Disallow：爬虫进不来就读不到页面里的 noindex，',
        '# 已经收录的页面会一直留在搜索结果里。',
        'User-agent: *',
        'Allow: /',
        '',
        'Sitemap: ' + SITE + 'sitemap.xml',
        ''
    ].join('\n');
}

/* ==================== 主流程 ==================== */

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
}

function main() {
    if (!fs.existsSync(OUT_DIR)) {
        throw new Error('dist/ 不存在。先跑 node tools/build-site.js 再跑这个脚本。');
    }

    const allPosts = loadPosts();
    const posts = publicNewestFirst(allPosts);
    // 翻页顺序要按「能站内打开」那一批来算，和 script.js 同口径
    const ordered = navigableNewestFirst(allPosts);
    // 模板只读一次，14 篇共用同一份 DOM 结构
    const template = loadTemplate();

    posts.forEach(function (post) {
        writeFile(path.join(OUT_DIR, 'posts', String(post.id), 'index.html'), buildPage(post, template, ordered));
    });

    writeFile(path.join(OUT_DIR, 'sitemap.xml'), buildSitemap(posts));
    writeFile(path.join(OUT_DIR, 'robots.txt'), buildRobots());

    console.log('✅ 静态文章页已生成');
    console.log('   文章 ' + posts.length + ' 篇 → dist/posts/<id>/index.html');
    console.log('   dist/sitemap.xml（' + (posts.length + 1) + ' 个地址）');
    console.log('   dist/robots.txt');
    posts.forEach(function (post) {
        console.log('   · /posts/' + post.id + '/  ' + (post.title || ''));
    });
}

main();
