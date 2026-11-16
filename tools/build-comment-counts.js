#!/usr/bin/env node
/* ==================== 抓每篇文章的真实评论数 ====================

   产出 dist/js/comment-counts.js：

       window.BLOG_COMMENT_COUNTS = {"1":0,"8":1,...};

   卡片上那个评论数就靠它（js/script.js 的 renderPostsList）。

   为什么要在构建时抓，而不是页面里 fetch：
   giscus 有一个公开的查询接口 https://giscus.app/api/discussions，
   不需要任何 token，但它返回的 Access-Control-Allow-Origin 写死了
   https://giscus.app，浏览器里跨域 fetch 会被拦掉。构建机跑 node
   没有这层限制。

   为什么不用 GitHub API：Discussions 只在 GraphQL 里，必须带 token；
   静态站把 token 放进前端等于公开。这里借 giscus 自己的服务端代劳。

   失败不阻塞构建：
     · discussion 不存在（还没人评论，giscus 是第一条评论才创建）→ 记 0
     · 网络错误 / 超时 / 接口改版 → 整批退回空表并打印警告，
       dist 里仍是「全 0」，站照常发布，不会因为评论数挂掉一次部署。

   本地跑：node tools/build-comment-counts.js
   ================================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const POSTS_FILE = path.join(ROOT, 'js', 'posts-data.js');
const OUT_DIR = path.join(ROOT, 'dist', 'js');
const OUT_FILE = path.join(OUT_DIR, 'comment-counts.js');

// 和 js/script.js 里 giscus 的配置保持一致（改仓库/分类时三处一起改）
const REPO = 'Annie106/Annie106.github.io';
const API = 'https://giscus.app/api/discussions';

// term 的生成方式必须和 script.js 的 commentsTerm() 逐字一致，
// 否则查的是另一条讨论串
const TERM = (post) => `文章 ${post.id}：${post.title}`;

const TIMEOUT_MS = 6000;
const CONCURRENCY = 4;
/* 整批的时间预算：网慢或半通的时候别把构建拖到几十秒。
   超预算的文章直接记 0（页面显示 0，比卡住构建好）。 */
const DEADLINE_MS = 20000;
const deadline = Date.now() + DEADLINE_MS;

function readPosts() {
    const code = fs.readFileSync(POSTS_FILE, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'posts-data.js' });
    const posts = sandbox.window.BLOG_POSTS;
    if (!Array.isArray(posts)) throw new Error('posts-data.js 里没读到 window.BLOG_POSTS');
    // 和 script.js 的 isArticlePublic 同口径：只有显式 false 才不发布
    return posts.filter((p) => p.isPublic !== false);
}

async function fetchCount(post) {
    if (Date.now() > deadline) return { id: post.id, count: 0, note: 'over-deadline' };
    const url = `${API}?repo=${encodeURIComponent(REPO)}&term=${encodeURIComponent(TERM(post))}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
        // 没有对应 discussion：接口返回 404 + {"error":"Discussion not found"}
        if (!res.ok) return { id: post.id, count: 0, note: res.status === 404 ? 'no-discussion' : `HTTP ${res.status}` };
        const data = await res.json();
        const count = Number(data && data.discussion && data.discussion.totalCommentCount);
        return { id: post.id, count: Number.isFinite(count) ? count : 0 };
    } catch (err) {
        return { id: post.id, count: 0, note: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(timer);
    }
}

async function runPool(items, worker, limit) {
    const results = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

(async () => {
    const posts = readPosts();
    console.log(`[comment-counts] 查询 ${posts.length} 篇文章在 ${REPO} 的评论数…`);

    let results;
    try {
        results = await runPool(posts, fetchCount, CONCURRENCY);
    } catch (err) {
        console.warn('[comment-counts] 整批请求失败，本轮记为全 0：', err.message);
        results = posts.map((p) => ({ id: p.id, count: 0, note: 'batch-failed' }));
    }

    const table = {};
    const failed = [];
    let skipped = 0;
    results.forEach((r) => {
        table[r.id] = r.count;
        if (r.note === 'over-deadline') skipped += 1;
        else if (r.note && r.note !== 'no-discussion') failed.push(`${r.id}:${r.note}`);
    });

    const body = '/* 生成物，别手改：tools/build-comment-counts.js 在构建时写入。 */\n'
        + 'window.BLOG_COMMENT_COUNTS = ' + JSON.stringify(table) + ';\n';

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, body, 'utf8');

    const total = Object.values(table).reduce((a, b) => a + b, 0);
    const withComments = Object.values(table).filter((n) => n > 0).length;
    console.log(`[comment-counts] 写入 ${path.relative(ROOT, OUT_FILE)}：${posts.length} 篇，`
        + `${withComments} 篇有评论，共 ${total} 条`);
    if (skipped) {
        console.warn(`[comment-counts] 超出 ${DEADLINE_MS / 1000}s 预算，${skipped} 篇按 0 处理`);
    }
    if (failed.length) {
        console.warn('[comment-counts] 这些文章查询失败（已按 0 处理）：', failed.join('、'));
    }
})().catch((err) => {
    // 兜底：真有意外也别让构建挂掉，写一份空表，页面显示 0
    console.warn('[comment-counts] 脚本异常，写空表：', err.message);
    try {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(OUT_FILE, 'window.BLOG_COMMENT_COUNTS = {};\n', 'utf8');
    } catch (e) { /* 写不了就算了，页面有兜底 */ }
});
