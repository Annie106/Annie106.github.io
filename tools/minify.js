#!/usr/bin/env node
/* ==================== 压缩 dist/ 里的 JS 和 CSS ====================

   为什么要有这个脚本：

   源码是写给人看的 —— 中文注释、12 格缩进、空行。这些在 gzip 里几乎原价
   收费（中文注释 UTF-8 三字节一个字，压缩率本来就差），全站传了 70KB 的
   说明文字。这一步只处理**产物**：源码一个字不动，dist/ 里换成删掉注释和
   空白的版本，体积大约减半。

   用法（必须在两个 build 脚本之后）：
       node tools/build-site.js
       node tools/build-posts.js
       node tools/minify.js

   ⚠️ 三个刻意的决定：

   1. **不重命名任何标识符**（不开 minifyIdentifiers）。
      index.html 里那三处 onclick="copyToClipboard(...)" 靠的是「顶层函数名
      是全局的」。重命名一开就全挂，而收益只有几 KB —— 注释和缩进才是大头。
      文件末尾的 ASSERTIONS 就是在守这一条，别删。

   2. **不压缩 HTML。** guide.html 里有大量 <pre> 代码块，压空白要么靠
      白名单要么靠猜，一失手就把对齐搞乱；而 HTML 的 gzip 收益只有几 KB。
      不划算。

   3. **只改 dist/，源码保持可读。** 所以这个脚本必须在 build-site.js
      之后跑 —— 它会复制源码到 dist/，顺序反了压缩就被覆盖掉。

   压缩后 dist/ 里的文件不再可读，出问题请对着源码看（也就没必要发布
   sourcemap：生产的报错行号对不上，但本地永远跑的是源码）。

   ================================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* 要处理的文件：dist/js 下所有 .js，dist/css 和 dist/fonts 下所有 .css。
   图片和字体不碰。 */
const TARGETS = [
    { dir: 'js', ext: '.js', loader: 'js' },
    { dir: 'css', ext: '.css', loader: 'css' },
    { dir: 'fonts', ext: '.css', loader: 'css' },
];

/* 压缩后必须仍然存在的字符串 —— 每一条都对应一个「被重命名就会静默坏掉」的地方。
   挂了就说明压缩配置被改动了，直接中止，不要发出去。 */
const ASSERTIONS = {
    'js/copyToClipboard.js': ['function copyToClipboard'],
    'js/posts-data.js': ['window.BLOG_POSTS'],
    'js/tweaks-data.js': ['window.BLOG_TWEAKS'],
    'js/image-loading.js': ['window.AnnieImageLoading'],
    'js/leave-confirm.js': ['window.LeaveConfirm'],
    'js/background-music.js': ['window.BackgroundMusic'],
    'js/script.js': ['function openArticle', 'function switchView'],
    'css/style.css': ['.article-content', '@import'],
};

function kb(bytes) {
    return (bytes / 1024).toFixed(1).padStart(7);
}

function gzipSize(text) {
    return zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).length;
}

function collect(target) {
    const dir = path.join(DIST, target.dir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(function (name) { return name.toLowerCase().endsWith(target.ext); })
        .map(function (name) { return path.join(target.dir, name).split(path.sep).join('/'); });
}

function assertIntact(relPath, output) {
    const required = ASSERTIONS[relPath] || [];
    const missing = required.filter(function (needle) { return output.indexOf(needle) < 0; });
    if (missing.length) {
        throw new Error(
            '压缩后的 ' + relPath + ' 里找不到：' + missing.join('、') + '\n' +
            '  这些名字被重命名了，页面上依赖它们的地方（比如 onclick="copyToClipboard(…)"）会静默失效。\n' +
            '  检查 tools/minify.js 的 esbuild 配置，minifyIdentifiers 必须是 false。'
        );
    }
}

async function main() {
    if (!fs.existsSync(DIST)) {
        throw new Error('dist/ 不存在。先跑 node tools/build-site.js 和 node tools/build-posts.js。');
    }

    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch (error) {
        throw new Error(
            '没找到 esbuild。这个仓库只有一个构建期依赖，装一次即可：\n' +
            '    npm install\n' +
            '（它只在压缩这一步用到，站点运行时不依赖任何 npm 包）'
        );
    }

    const rows = [];
    let beforeRaw = 0;
    let afterRaw = 0;
    let beforeGzip = 0;
    let afterGzip = 0;

    for (const target of TARGETS) {
        for (const relPath of collect(target)) {
            const file = path.join(DIST, relPath);
            const source = fs.readFileSync(file, 'utf8');

            const result = await esbuild.transform(source, {
                loader: target.loader,
                // 只删注释、空白，做等价的语法收缩；**不动名字**
                minifyWhitespace: true,
                minifySyntax: true,
                minifyIdentifiers: false,
                legalComments: 'none',
                /* ⚠️ 默认值 ascii 会把中文全部转成 \uXXXX —— 一个汉字 3 字节
                   变成 6 个字符，posts-data.js 反而胖了 10KB。站点本来就是
                   UTF-8（<meta charset> + 服务器 Content-Type 都对），必须显式写 utf8。 */
                charset: 'utf8',
            });

            const output = result.code;
            assertIntact(relPath, output);
            fs.writeFileSync(file, output, 'utf8');

            const rawBefore = Buffer.byteLength(source, 'utf8');
            const rawAfter = Buffer.byteLength(output, 'utf8');
            const gzBefore = gzipSize(source);
            const gzAfter = gzipSize(output);

            beforeRaw += rawBefore;
            afterRaw += rawAfter;
            beforeGzip += gzBefore;
            afterGzip += gzAfter;

            rows.push({
                file: relPath,
                raw: kb(rawBefore) + ' → ' + kb(rawAfter),
                gzip: kb(gzBefore) + ' → ' + kb(gzAfter),
                save: Math.round((1 - gzAfter / gzBefore) * 100),
            });
        }
    }

    if (!rows.length) {
        throw new Error('dist/ 里没找到要压缩的 js/css，是不是构建没跑？');
    }

    const pad = function (text, width) { return String(text).padEnd(width); };
    console.log('✅ 已压缩 dist/ 里的 JS 和 CSS（源码未改动）\n');
    console.log('  ' + pad('文件', 26) + pad('原始 KB', 20) + pad('gzip KB', 20) + '省');
    rows.forEach(function (row) {
        console.log('  ' + pad(row.file, 26) + pad(row.raw, 20) + pad(row.gzip, 20) + row.save + '%');
    });
    console.log('\n  合计  gzip ' + (beforeGzip / 1024).toFixed(1) + ' KB → ' +
        (afterGzip / 1024).toFixed(1) + ' KB，省 ' +
        Math.round((1 - afterGzip / beforeGzip) * 100) + '%');
}

main().catch(function (error) {
    console.error('\n[X] 压缩失败：' + error.message + '\n');
    process.exit(1);
});
