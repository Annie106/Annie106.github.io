#!/usr/bin/env node
/* ==================== 生成 feed.xml（RSS 2.0） ====================

   为什么要有这个脚本：
   本站是纯静态的，没有构建步骤、没有后端，文章数据躺在 js/posts-data.js 里。
   阅读器（Feedly / Inoreader / NetNewsWire / 各种 RSS 小程序）不会执行 JS，
   所以必须有一份「烤好的」XML 放在服务器上，地址是：

       https://annie106.github.io/feed.xml

   用法：
       node tools/build-feed.js

   它做三件事：
     1. 在沙箱里读 js/posts-data.js，取出 window.BLOG_POSTS
        （只求值，不碰 script.js 里任何渲染逻辑）
     2. 按 updated || date 倒序，取最新 MAX_ITEMS 篇
     3. 有 content 的文章输出全文（content:encoded）；正文在独立 HTML 里的
        （embeddedPage）输出摘要 + 原文链接 —— 那 4 篇的正文太长、还带自己的
        样式，塞进 feed 既难看也没必要

   封面（media:thumbnail）怎么取，见 coverUrl() 的三级兜底。

   ⚠️ 加了新文章、改了标题/日期之后要重跑一次，否则 feed 还是旧的。
   AGENTS.md 的「提交前自查」和 README 里都提了这条。
   ================================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const POSTS_FILE = path.join(ROOT, 'js', 'posts-data.js');
const OUTPUT_FILE = path.join(ROOT, 'feed.xml');

/* 站点根地址。文章链接是 index.html?article=N 这种查询串形式，
   feed 里的 guid / link 都要拼成绝对地址，阅读器才能点开 */
const SITE = 'https://annie106.github.io/';
const FEED_URL = SITE + 'feed.xml';

/* 没有封面时兜底用的站点图。设成 '' 就不输出 media:thumbnail ——
   注意现在是「所有没配图的文章共用同一张」，阅读器里会连着一排一样的封面，
   想每篇都不同，就在 js/posts-data.js 里给那篇加 cover: 'images/xxx.jpg' */
const FALLBACK_COVER = SITE + 'share_cover.jpg';

const CHANNEL = {
    title: 'Annie · 个人博客',
    link: SITE,
    description: '思考 · 记录 · 创造 —— 记录阅读、成长和日常灵感。',
    language: 'zh-cn'
};

/* 只放最近这些篇。全量 15 篇也就 40KB 上下，留着上限是为了
   以后文章多了不至于让每个订阅者每次拉几兆的 XML */
const MAX_ITEMS = 20;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeXml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/* 正文里的 ]]&gt; 会把 CDATA 提前截断，遇到就先断开再续上 */
function cdata(html) {
    return '<![CDATA[' + String(html).replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
}

/* YYYY-MM-DD → RFC 822（RSS 规定的时间格式）。
   时区写死 +0800：站主在国内，日期本身就是按北京时间写的，
   写死比跟着构建机器的时区飘要稳 —— 同一份数据在哪台机器上跑结果都一样 */
function rfc822(ymd) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return `${weekday}, ${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year} 00:00:00 +0800`;
}

/* 正文里的相对路径在阅读器里是坏的（它不知道你的域名），
   一律补成绝对地址。已经是 http(s) / #锚点 / mailto 这些的跳过 */
function absolutize(html) {
    return String(html).replace(
        /\b(src|href)="(?!https?:|\/\/|data:|mailto:|tel:|javascript:|#)([^"]*)"/g,
        function (whole, attr, url) {
            return `${attr}="${SITE}${url.replace(/^\.?\//, '')}"`;
        }
    );
}

/* 封面：三级兜底
     1. 文章自己写了 cover（推荐，每篇一张，最好 16:9 或 1:1）
     2. 正文里第一张 <img>（很多篇的配图本来就是它）
     3. 站点封面 share_cover.jpg
   都取不到（或 FALLBACK_COVER 被设成空）就不输出 media:thumbnail。
   阅读器列表页的缩略图就靠这个字段，正文里的图是进文章后才看得见的。 */
function firstImage(html) {
    const match = /<img[^>]+src=["']([^"']+)["']/i.exec(String(html || ''));
    return match ? match[1] : '';
}

function coverUrl(post) {
    const raw = post.cover || firstImage(post.content) || FALLBACK_COVER;
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || /^\/\//.test(raw)) return raw;
    return SITE + String(raw).replace(/^\.?\//, '');
}

function loadPosts() {
    const code = fs.readFileSync(POSTS_FILE, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'posts-data.js' });
    const posts = sandbox.window.BLOG_POSTS;
    if (!Array.isArray(posts) || !posts.length) {
        throw new Error('js/posts-data.js 里没拿到 window.BLOG_POSTS，格式是不是被改过？');
    }
    return posts;
}

/* 排序键：有 updated 就用 updated（和页面上显示、时间线分组保持一致），
   同一天的两篇按 id 倒序，保证每次生成顺序都一样 */
function sortKey(post) {
    return String(post.updated || post.date || '');
}

function articleUrl(post) {
    return `${SITE}index.html?article=${post.id}`;
}

function itemXml(post) {
    const url = articleUrl(post);
    const title = post.title || `文章 ${post.id}`;
    const date = rfc822(sortKey(post));

    const lines = ['    <item>'];
    lines.push(`      <title>${escapeXml(title)}</title>`);
    lines.push(`      <link>${escapeXml(url)}</link>`);
    // guid 用文章地址本身：链接不随标题改名而失效，阅读器也不会重复推送
    lines.push(`      <guid isPermaLink="true">${escapeXml(url)}</guid>`);
    if (date) lines.push(`      <pubDate>${date}</pubDate>`);
    if (post.excerpt) lines.push(`      <description>${escapeXml(post.excerpt)}</description>`);
    (post.tags || []).forEach(function (tag) {
        lines.push(`      <category>${escapeXml(tag)}</category>`);
    });

    /* 列表页缩略图。media:thumbnail 是 Media RSS 的字段，
       Feedly / Inoreader / NetNewsWire 都认；没这个字段时列表里是一块空白 */
    const cover = coverUrl(post);
    if (cover) lines.push(`      <media:thumbnail url="${escapeXml(cover)}"/>`);

    /* 有 content 就输出全文；只有 embeddedPage 的（正文在独立页面里）
       给一句摘要 + 原文入口，读者点一下就到站内看排版 */
    const body = post.content
        ? absolutize(post.content)
        : `<p>${escapeXml(post.excerpt || '')}</p>`
            + `<p><a href="${escapeXml(url)}">在网站上阅读全文 →</a></p>`;
    lines.push(`      <content:encoded>${cdata(body)}</content:encoded>`);
    lines.push('    </item>');
    return lines.join('\n');
}

function buildFeed(posts) {
    const sorted = posts.slice().sort(function (a, b) {
        const diff = sortKey(b).localeCompare(sortKey(a));
        return diff !== 0 ? diff : (b.id || 0) - (a.id || 0);
    }).slice(0, MAX_ITEMS);

    const head = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- 由 tools/build-feed.js 生成，不要手改。改文章请改 js/posts-data.js，',
        '     然后跑一次 node tools/build-feed.js。 -->',
        '<rss version="2.0"',
        '     xmlns:atom="http://www.w3.org/2005/Atom"',
        '     xmlns:content="http://purl.org/rss/1.0/modules/content/"',
        '     xmlns:media="http://search.yahoo.com/mrss/">',
        '  <channel>',
        `    <title>${escapeXml(CHANNEL.title)}</title>`,
        `    <link>${escapeXml(CHANNEL.link)}</link>`,
        `    <description>${escapeXml(CHANNEL.description)}</description>`,
        `    <language>${CHANNEL.language}</language>`,
        `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
        '    <generator>tools/build-feed.js</generator>',
        `    <atom:link href="${escapeXml(FEED_URL)}" rel="self" type="application/rss+xml"/>`
    ];

    return head.concat(sorted.map(itemXml), ['  </channel>', '</rss>', '']).join('\n');
}

function main() {
    const posts = loadPosts();
    const xml = buildFeed(posts);
    fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');

    const count = Math.min(posts.length, MAX_ITEMS);
    const size = (Buffer.byteLength(xml, 'utf8') / 1024).toFixed(1);
    console.log(`✓ feed.xml 已生成：${count} 篇，${size} KB`);
    console.log(`  订阅地址 ${FEED_URL}`);
    console.log(`  最新一篇 ${sortKey(posts.slice().sort(function (a, b) { return sortKey(b).localeCompare(sortKey(a)); })[0])}`);

    // 封面用了兜底的有多少篇 —— 数字大就说明该给文章配 cover 了
    const noOwnCover = posts.slice(0, MAX_ITEMS)
        .filter(function (post) { return !post.cover && !firstImage(post.content); }).length;
    if (FALLBACK_COVER) {
        console.log(`  封面：${count - noOwnCover} 篇自有配图，${noOwnCover} 篇用站点封面兜底`);
    }
}

main();
