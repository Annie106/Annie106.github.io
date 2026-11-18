#!/usr/bin/env node
/*
 * 把「还在 posts-data.js 里写成 HTML」的正文转成 Markdown 文件。
 *
 * 现在文章的正文已经搬进 posts/*.md（正文以 md 文件为准，js/posts-data.js
 * 是 tools/build-posts-data.js 生成的）。这个脚本是把更早那一版 HTML 正文
 * 一次性迁过来的工具 —— 留着是因为：以后再有人往 content 里贴 HTML，可以拿它
 * 对照着转，也方便 review 当初是怎么转的。
 *
 * 原则：**宁可保留 HTML，也不要转丢信息**。
 * 段落里只要出现 Markdown 表达不了的东西（带 class 的链接、figure、br、img 的
 * 额外属性），整个块就原样作为 HTML 输出 —— 渲染器本来就支持「以 < 开头的行
 * 原样通过」，混着写完全合法。
 *
 * 用法：
 *   node tools/html-to-md.js           只检查每篇能不能干净转换（不动文件）
 *   node tools/html-to-md.js --write   生成 posts/<id>-<标题>.md
 *   然后跑 node tools/build-posts-data.js 重新生成 js/posts-data.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const POSTS_FILE = path.join(ROOT, 'js', 'posts-data.js');
const POSTS_DIR = path.join(ROOT, 'posts');
const markdown = require(path.join(ROOT, 'js', 'markdown.js'));

/* ==================== 小块 HTML → Markdown ==================== */

/* 行内：能转的转，转不了的标 raw，由调用方决定整块保留 HTML */
function inlineToMarkdown(html) {
    let raw = false;
    let text = String(html);

    // 这些标签/属性 Markdown 没有对应写法，出现就整块保留
    if (/<(figure|figcaption|br|video|audio|iframe|table)\b/i.test(text)) raw = true;
    if (/<a\b[^>]*(class|target|rel|data-)[^>]*>/i.test(text)) raw = true;
    if (/<img\b[^>]*(class|width|height|style|data-)[^>]*>/i.test(text)) raw = true;
    if (raw) return { text: text, raw: true };

    text = text
        .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
        .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
        .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
        .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
        .replace(/<img\b[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)')
        .replace(/<img\b[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)')
        .replace(/<[^>]+>/g, '')      // 剩下没意义的标签直接剥掉
        .replace(/\s+/g, ' ')
        .trim();

    return { text: text, raw: false };
}

/* 一整段 HTML → Markdown 文本 */
function htmlToMarkdown(html) {
    const source = String(html == null ? '' : html).replace(/\r\n?/g, '\n').trim();
    if (!source) return '';
    if (!/<[a-z][\s\S]*>/i.test(source)) return source;   // 本来就是纯文本

    /* 去掉标签之间的换行和缩进，让每个顶层元素挨在一起好切 */
    const flat = source.replace(/>\s+</g, '><');
    const blocks = [];
    const pattern = /<(h[1-6]|p|ul|ol|blockquote|figure|pre)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
    let match;
    let lastIndex = 0;

    while ((match = pattern.exec(flat)) !== null) {
        // 两个块之间的裸文本（一般不会有，有就单独成段）
        const gap = flat.slice(lastIndex, match.index).trim();
        if (gap) blocks.push(pushParagraph(gap));
        lastIndex = pattern.lastIndex;

        if (!match[1]) {
            blocks.push('---');
            continue;
        }

        const tag = match[1].toLowerCase();
        const inner = match[2];

        if (tag === 'h2' || tag === 'h1') {
            const converted = inlineToMarkdown(inner);
            blocks.push(converted.raw ? match[0] : '## ' + converted.text);
        } else if (tag === 'h3') {
            const converted = inlineToMarkdown(inner);
            blocks.push(converted.raw ? match[0] : '### ' + converted.text);
        } else if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
            const converted = inlineToMarkdown(inner);
            blocks.push(converted.raw ? match[0] : '#### ' + converted.text);
        } else if (tag === 'blockquote') {
            const converted = inlineToMarkdown(inner);
            blocks.push(converted.raw ? match[0] : '> ' + converted.text);
        } else if (tag === 'ul' || tag === 'ol') {
            blocks.push(listToMarkdown(tag, inner));
        } else if (tag === 'figure' || tag === 'pre') {
            // 图注、代码块都保留原样：Markdown 的代码块也是三个反引号，
            // 但原 HTML 里可能已经带了 class，转成 ``` 反而丢样式
            blocks.push(match[0]);
        } else {
            blocks.push(pushParagraph(inner));
        }
    }

    const rest = flat.slice(lastIndex).trim();
    if (rest) blocks.push(pushParagraph(rest));

    return blocks.join('\n\n');
}

function pushParagraph(inner) {
    const converted = inlineToMarkdown(inner);
    return converted.raw ? '<p>' + inner.replace(/\s+/g, ' ').trim() + '</p>' : converted.text;
}

function listToMarkdown(tag, inner) {
    const items = [];
    const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = itemPattern.exec(inner)) !== null) {
        const converted = inlineToMarkdown(match[1]);
        if (converted.raw) {
            // 有一项转不了就整张列表保留 HTML，混着写会破坏缩进语义
            return '<' + tag + '>' + inner + '</' + tag + '>';
        }
        items.push(tag === 'ol' ? (items.length + 1) + '. ' + converted.text : '- ' + converted.text);
    }
    return items.join('\n');
}

/* ==================== 读写 posts-data.js ==================== */

function loadPosts() {
    const code = fs.readFileSync(POSTS_FILE, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return { code: code, posts: sandbox.window.BLOG_POSTS || [] };
}

/* 文件名：id 打头方便排序，后面跟一段标题（去掉不能做文件名的字符） */
function postFileName(post) {
    const title = String(post.title || '')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '')
        .slice(0, 18);
    return String(post.id).padStart(2, '0') + (title ? '-' + title : '') + '.md';
}

/* 前置元信息。只写文章真的有的字段，别塞一堆 undefined 进去 */
function frontMatter(post) {
    const lines = ['---'];
    lines.push('id: ' + post.id);
    lines.push('title: ' + String(post.title || '').replace(/\n/g, ' '));
    lines.push('date: ' + String(post.date || ''));
    if (post.updated) lines.push('updated: ' + String(post.updated));
    if (post.excerpt) lines.push('excerpt: ' + String(post.excerpt).replace(/\n/g, ' '));
    if (Array.isArray(post.tags) && post.tags.length) lines.push('tags: ' + post.tags.join(', '));
    // 总是写出，false 也写：编辑器里一眼能看到这个开关在哪
    lines.push('pinned: ' + (post.pinned ? 'true' : 'false'));
    if (post.isPublic === false) lines.push('isPublic: false');
    if (post.cover) lines.push('cover: ' + post.cover);
    if (post.embeddedPage) lines.push('embeddedPage: ' + post.embeddedPage);
    lines.push('---');
    return lines.join('\n');
}

async function main() {
    const write = process.argv.includes('--write');
    const { posts } = loadPosts();

    if (!write) {
        // 只报告：每篇能不能干净地转，文本有没有丢
        const withContent = posts.filter(function (post) {
            return typeof post.content === 'string' && post.content.trim();
        });
        withContent.forEach(function (post) {
            const mdText = htmlToMarkdown(post.content);
            const before = markdown.toPlainText(post.content).replace(/\s+/g, '');
            const after = markdown.toPlainText(markdown.render(mdText)).replace(/\s+/g, '');
            let note = '';
            if (before !== after) {
                let at = 0;
                while (at < before.length && before[at] === after[at]) at += 1;
                note = '\n        首个差异在第 ' + at + ' 个字：' +
                    '\n        原文: …' + before.slice(Math.max(0, at - 12), at + 24) +
                    '\n        转换: …' + after.slice(Math.max(0, at - 12), at + 24);
            }
            console.log('  id' + String(post.id).padEnd(3) + (note ? ' [差异]' : ' [OK]  ') +
                ' html ' + String(post.content.length).padStart(5) + ' 字 → md ' +
                String(mdText.length).padStart(5) + ' 字' + note);
        });
        console.log('\n（只检查，没有动文件。加 --write 才会生成 posts/*.md）');
        return;
    }

    fs.mkdirSync(POSTS_DIR, { recursive: true });
    posts.forEach(function (post) {
        const mdText = htmlToMarkdown(post.content || '');
        const file = path.join(POSTS_DIR, postFileName(post));
        const body = frontMatter(post) + '\n' + (mdText ? mdText + '\n' : '');
        fs.writeFileSync(file, body);
        console.log(' 写入 ' + path.relative(ROOT, file));
    });
    console.log('\n完成：' + posts.length + ' 篇正文已拆成 Markdown 文件。');
    console.log('接着跑 node tools/build-posts-data.js 重新生成 js/posts-data.js');
}

if (require.main === module) {
    main().catch(function (error) {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = { htmlToMarkdown: htmlToMarkdown };
