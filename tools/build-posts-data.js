#!/usr/bin/env node
/*
 * 由 posts/*.md 生成 js/posts-data.js。
 *
 * 文章的正文和元信息以 posts/ 里的 Markdown 文件为准，这个脚本把它们合成
 * 一份 window.BLOG_POSTS 供站点（和构建脚本）使用。
 *
 * 为什么要生成，而不是直接在 md 里让浏览器读：
 *   站点是纯静态的，首页列表要同时拿到 16 篇的标题、日期、标签、摘要来排序和
 *   筛选。让浏览器去 fetch 16 个 md 再解析，首屏会明显变慢，而且双击 index.html
 *   （file://）时 fetch 直接被拦。合成一份 JS 就没有这些问题，代价是这个文件
 *   变成了产物 —— 改文章请改 posts/*.md，然后重新跑本脚本。
 *
 * 生成物要提交：GitHub Pages 不会替你跑脚本，本地双击也要有它。
 *
 * 用法：
 *   node tools/build-posts-data.js           生成
 *   node tools/build-posts-data.js --check   只校验生成物是否最新（CI 用）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const OUT_FILE = path.join(ROOT, 'js', 'posts-data.js');

/* 前置元信息里允许出现的字段。写错字段名不会报错，但也永远不会生效，
   所以这里留一份白名单，遇到不认识的键就提醒一句。 */
const FIELDS = new Set([
    'id', 'title', 'date', 'updated', 'excerpt', 'tags',
    'pinned', 'isPublic', 'cover', 'embeddedPage',
]);

function splitFrontMatter(text) {
    const source = String(text).replace(/\r\n?/g, '\n');
    if (!/^---\n/.test(source)) {
        throw new Error('缺少前置元信息（文件必须以 --- 开头）');
    }
    const end = source.indexOf('\n---', 4);
    if (end < 0) throw new Error('前置元信息没有闭合（缺少第二行 ---）');
    const head = source.slice(4, end);
    const body = source.slice(end + 4).replace(/^\n/, '');

    const meta = {};
    head.split('\n').forEach(function (line) {
        if (!line.trim() || /^\s*#/.test(line)) return;
        const at = line.indexOf(':');
        if (at < 0) return;
        const key = line.slice(0, at).trim();
        let value = line.slice(at + 1).trim();
        if (!FIELDS.has(key)) {
            console.warn('  [注意] 不认识的字段 "' + key + '"，会被忽略');
            return;
        }
        // 值里允许带冒号（标题、摘要里很常见），所以只按第一个冒号切
        if (key === 'tags') {
            meta.tags = value ? value.split(/[,，]/).map(function (tag) {
                return tag.trim();
            }).filter(Boolean) : [];
        } else if (key === 'pinned' || key === 'featured' || key === 'isPublic') {
            meta[key] = value !== 'false';
        } else if (key === 'id') {
            meta.id = Number(value);
        } else {
            meta[key] = value;
        }
    });
    return { meta: meta, body: body };
}

function loadPosts() {
    if (!fs.existsSync(POSTS_DIR)) {
        throw new Error('找不到 posts/ 目录');
    }
    const files = fs.readdirSync(POSTS_DIR).filter(function (name) {
        return /\.md$/i.test(name);
    });
    if (!files.length) throw new Error('posts/ 里没有 .md 文件');

    const posts = [];
    const seen = new Map();

    files.forEach(function (name) {
        const raw = fs.readFileSync(path.join(POSTS_DIR, name), 'utf8');
        let parsed;
        try {
            parsed = splitFrontMatter(raw);
        } catch (error) {
            throw new Error(name + '：' + error.message);
        }
        const post = parsed.meta;
        if (!Number.isFinite(post.id)) throw new Error(name + '：缺少 id');
        if (seen.has(post.id)) {
            throw new Error('id ' + post.id + ' 重复：' + seen.get(post.id) + ' 和 ' + name);
        }
        seen.set(post.id, name);
        post.content = parsed.body.replace(/\s+$/, '');
        posts.push(post);
    });

    /* 新的在前。同一天按 id 倒序 —— 跟站内列表、时间线、feed 用的是同一套规则 */
    posts.sort(function (a, b) {
        const byDate = String(b.updated || b.date || '').localeCompare(String(a.updated || a.date || ''));
        return byDate !== 0 ? byDate : (b.id || 0) - (a.id || 0);
    });
    return posts;
}

/* 正文塞进模板字面量，反引号和 ${ 必须转义，否则生成的 JS 直接语法错误 */
function escapeTemplate(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
}

function quote(text) {
    return "'" + String(text == null ? '' : text).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function render(posts) {
    const blocks = posts.map(function (post) {
        const lines = [];
        lines.push('{');
        lines.push('    id: ' + post.id + ',');
        if (post.pinned) lines.push('    pinned: true,');
        if (post.isPublic === false) lines.push('    isPublic: false,');
        lines.push('    title: ' + quote(post.title || '') + ',');
        if (post.date) lines.push('    date: ' + quote(post.date) + ',');
        if (post.updated) lines.push('    updated: ' + quote(post.updated) + ',');
        if (post.excerpt) lines.push('    excerpt: ' + quote(post.excerpt) + ',');
        if (post.tags && post.tags.length) {
            lines.push('    tags: [' + post.tags.map(quote).join(', ') + '],');
        }
        if (post.cover) lines.push('    cover: ' + quote(post.cover) + ',');
        if (post.embeddedPage) lines.push('    embeddedPage: ' + quote(post.embeddedPage) + ',');
        /* 不公开的文章**连正文都不下发**。
           只写 isPublic: false 标记是不够的：这个文件会原样发给浏览器，谁打开
           DevTools 都能读到「不公开」的内容。站内的 isArticlePublic() 拦的只是
           「渲染不渲染」，拦不住「数据在不在」。摘录照旧保留 —— 列表、搜索、
           feed 都靠它，而且它本来就是给外面看的。
           对应的另一处出口是 tools/build-feed.js（RSS 里也不能有这篇）。 */
        if (post.content && post.isPublic !== false) {
            /* 正文**不能缩进**：Markdown 里 4 个空格开头就是代码块，
               为了文件好看去缩排会让所有标题和列表失效。所以正文一律顶格写，
               只有首尾的反引号单独占一行。 */
            lines.push('    content: `\n' + escapeTemplate(post.content) + '\n`,');
        }
        lines.push('},');
        return lines.join('\n');
    });

    return `/* ==================== 全部文章数据 ====================
   这个文件是**生成物**，不要手改：正文和元信息在 posts/*.md 里，
   改完跑 node tools/build-posts-data.js 重新生成（npm run build 也会跑）。

   字段：id / title / date / excerpt / tags / content 等。
   可选字段：
     updated       最近一次改动日期（YYYY-MM-DD）。写了之后卡片和详情页优先显示它，
                   排序、时间线、归档分组也按它算。
     cover         文章封面，只给 RSS 的缩略图用，页面上不显示。
     pinned        置顶（只影响展示，不改变「哪篇更早写」）
     isPublic: false  不公开：正文不下发（这个文件里没有 content）、不进 feed、
                   不生成 /posts/<id>/ 静态页、站内列表和搜索也看不到。
                   注意它只是「不展示」，不是「保密」—— posts/*.md 和 git 历史里
                   原文都在，真敏感的内容别写进仓库。
     embeddedPage  正文是独立 HTML 页面（这时没有 content）
   ======================================================== */

window.BLOG_POSTS = [${blocks.join('\n')}];
`;
}

function main() {
    const posts = loadPosts();
    const output = render(posts);
    const check = process.argv.includes('--check');

    if (check) {
        const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
        if (current !== output) {
            console.error('✗ js/posts-data.js 不是最新的，跑一次 node tools/build-posts-data.js');
            process.exit(1);
        }
        console.log('✓ js/posts-data.js 与 posts/*.md 一致（' + posts.length + ' 篇）');
        return;
    }

    fs.writeFileSync(OUT_FILE, output);
    console.log('✓ 已由 ' + posts.length + ' 个 Markdown 文件生成 js/posts-data.js');
}

try {
    main();
} catch (error) {
    console.error('✗ ' + (error.message || error));
    process.exit(1);
}
