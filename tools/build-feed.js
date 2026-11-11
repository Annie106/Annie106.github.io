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
     3. 每篇只输出**一句话摘要**（description）+ 封面，不塞全文

   为什么只给摘要：全文版 feed 有 24KB 左右，而读者在阅读器里读到的排版
   永远不如站内（评论、图片懒加载、代码块高亮都在站点上）。摘要版让人
   「扫一眼知道写了什么」，想读就点标题回来。体积也降到三分之一。
   要改回全文，把 itemXml 里那段 description 换回 content:encoded，
   并把 xmlns:content 命名空间加回 <rss>（否则 XML 非法），正文里的相对路径
   还要补成绝对地址 —— 旧版的 cdata() / absolutize() 在 git 历史里能翻到。

   封面（media:thumbnail）怎么取，见 coverUrl() 的三级兜底。

   平时不用管这个脚本：
   推文章到 main 后，.github/workflows/feed.yml 会自动跑它、把新的 feed.xml
   提交回来。你只改 js/posts-data.js，「写文章要动 build-feed.js」是误会 ——
   它是打印机不是账本。
   本地跑一次的唯一好处是能立刻看到 feed 长什么样。

   输出是确定性的（幂等）：同一份 posts-data.js，在哪台机器上跑都生成逐字节
   相同的文件。所以本地那份和仓库那份不会各说各话，也不会解冲突。
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
    /* 摘要版：只有一句话摘要。正文留在站点上 —— 阅读器里的排版永远不如
       站内完整（评论、图片懒加载、代码块都在那边），想读点标题回来。
       摘要用纯文本而不是 HTML/CDATA：各家阅读器对 description 的处理不一致，
       纯文本最不容易被渲染成「标签裸露」的样子。
       文章没写 excerpt 时退回用标题，至少不留一个空条目。 */
    const summary = post.excerpt || post.title || `文章 ${post.id}`;
    lines.push(`      <description>${escapeXml(summary)}</description>`);
    (post.tags || []).forEach(function (tag) {
        lines.push(`      <category>${escapeXml(tag)}</category>`);
    });

    /* 列表页缩略图。media:thumbnail 是 Media RSS 的字段，
       Feedly / Inoreader / NetNewsWire 都认；没这个字段时列表里是一块空白 */
    const cover = coverUrl(post);
    if (cover) lines.push(`      <media:thumbnail url="${escapeXml(cover)}"/>`);

    lines.push('    </item>');
    return lines.join('\n');
}

function buildFeed(posts) {
    const sorted = posts.slice().sort(function (a, b) {
        const diff = sortKey(b).localeCompare(sortKey(a));
        return diff !== 0 ? diff : (b.id || 0) - (a.id || 0);
    }).slice(0, MAX_ITEMS);

    /* lastBuildDate 用「最新一篇文章的日期」，不用 new Date()。
       这不是偷懒，是为了让输出**确定性**：同一份 posts-data.js 生成的文件
       逐字节相同。否则本地跑一次、CI 再跑一次，两边的 lastBuildDate 差几秒，
       git 里就成了两个版本互相打架，还要人工解冲突。
       副作用是它不再等于「构建时间」——但 RSS 规范里这个字段本来就指
       「内容最后变动的时间」，用文章日期反而更贴题。 */
    const newest = sorted[0] || null;
    const lastBuildDate = newest ? rfc822(sortKey(newest)) : new Date().toUTCString();

    const head = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"',
        '     xmlns:atom="http://www.w3.org/2005/Atom"',
        '     xmlns:media="http://search.yahoo.com/mrss/">',
        '  <channel>',
        `    <title>${escapeXml(CHANNEL.title)}</title>`,
        `    <link>${escapeXml(CHANNEL.link)}</link>`,
        `    <description>${escapeXml(CHANNEL.description)}</description>`,
        `    <language>${CHANNEL.language}</language>`,
        `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
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
