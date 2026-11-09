#!/usr/bin/env node
/**
 * 图标自检：node tools/check-icons.js
 *
 * 查三件事：
 *   1. 有没有页面又去引 CDN 的图标字体（这是本项目踩过的坑，图标会时有时无）
 *   2. HTML / JS 里用到的 ri-* 图标名，是否都存在于本地字体
 *   3. 用了图标的页面，是否引了 css/style.css（图标是它 @import 进来的，漏引就没图标）
 *
 * 退出码 0 = 没问题，1 = 有问题（可直接挂到 git pre-commit）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', '.workbuddy', 'node_modules', 'images']);
const SKIP_FILES = new Set(['package-lock.json']);

// 文档里的示意写法，不是真图标名
const PLACEHOLDERS = new Set(['ri-xxx', 'ri-任意', 'ri-图标名']);

const errors = [];
const warns = [];

/* ---------- 1. 收集本地字体里存在的图标名 ---------- */
const iconsCssPath = path.join(ROOT, 'fonts', 'icons.css');
if (!fs.existsSync(iconsCssPath)) {
    console.error('✗ 找不到 fonts/icons.css —— 图标字体缺失，先按 AGENTS.md 恢复本地副本');
    process.exit(1);
}
const iconsCss = fs.readFileSync(iconsCssPath, 'utf8');
const available = new Set();
for (const m of iconsCss.matchAll(/^\.(ri-[a-z0-9-]+):before/gm)) available.add(m[1]);

/* ---------- 2. 遍历文件 ---------- */
function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.') {
            if (SKIP_DIRS.has(entry.name)) continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(full, out);
        } else if (/\.(html?|js)$/i.test(entry.name) && !SKIP_FILES.has(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

const files = walk(ROOT);
const usedIcons = new Map();   // 图标名 -> [文件:行]
const pagesWithIcons = [];     // 用了图标的 html

for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    let pageHasIcon = false;

    lines.forEach((line, i) => {
        const at = `${rel}:${i + 1}`;

        // CDN 图标字体残留
        if (/cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com/.test(line) && /remixicon|icon/i.test(line)) {
            errors.push(`[CDN 残留] ${at} 还在从外部 CDN 引图标字体，应删除（图标已本地化在 fonts/）`);
        }

        // 收集图标名
        for (const m of line.matchAll(/\bri-[a-z0-9-]+\b/g)) {
            const name = m[0];
            if (PLACEHOLDERS.has(name)) continue;
            if (!usedIcons.has(name)) usedIcons.set(name, []);
            usedIcons.get(name).push(at);
            pageHasIcon = true;
        }
    });

    if (/\.html?$/i.test(file) && pageHasIcon) {
        pagesWithIcons.push({ rel, hasStyle: /href="[^"]*style\.css"/.test(text) });
    }
}

/* ---------- 3. 校验 ---------- */
const missing = [];
for (const [name, where] of usedIcons) {
    if (!available.has(name)) missing.push({ name, where });
}

for (const { rel, hasStyle } of pagesWithIcons) {
    if (!hasStyle) {
        errors.push(`[漏引样式] ${rel} 用了图标但没引 css/style.css —— 图标是 style.css @import 进来的，这样会不显示`);
    }
}
for (const { name, where } of missing) {
    errors.push(`[图标名不存在] ${name} —— 本地字体（Remix Icon 4.3.0）里没有这个图标\n    出现位置：${where.slice(0, 3).join('、')}${where.length > 3 ? ` 等 ${where.length} 处` : ''}`);
}

/* ---------- 4. 输出 ---------- */
const ok = (msg) => console.log(`✓ ${msg}`);
console.log(`\n图标自检 · 本地字体共 ${available.size} 个图标\n`);

if (errors.length === 0) {
    ok(`没有 CDN 图标引用`);
    ok(`用到的 ${usedIcons.size} 个图标名都能在字体里找到`);
    ok(`${pagesWithIcons.length} 个使用图标的页面都引了 style.css`);
    console.log('');
    process.exit(0);
}

for (const e of errors) console.log(`✗ ${e}`);
console.log(`\n共 ${errors.length} 个问题。图标名请对照 https://remixicon.com 核对（注意 -line / -fill 后缀）。\n`);
process.exit(1);
