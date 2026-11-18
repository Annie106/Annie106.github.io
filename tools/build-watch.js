#!/usr/bin/env node
/*
 * 重新构建。两种用法：
 *
 *   node tools/build-watch.js build    构建一次（最常见的用法）
 *   node tools/build-watch.js watch    一直盯着 posts/*.md，改了就自动重建
 *
 * 根目录「重新构建.bat」双击后就是让你在这两个之间选。
 *
 * 跑的是 build:fast 那四步，**不包含抓评论数**（那一步要联网、慢，
 * 本地预览也看不出区别）。部署仍走 npm run build。
 *
 * 为什么不在 bat 里写这些：cmd 处理中文和特殊字符太容易翻车，
 * 提示和逻辑放在 Node 里，bat 只负责起个头。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');

const STEPS = [
    'tools/build-posts-data.js',
    'tools/build-site.js',
    'tools/build-posts.js',
    'tools/minify.js',
];

function runBuild() {
    const startedAt = Date.now();
    for (const step of STEPS) {
        const result = spawnSync(process.execPath, [path.join(ROOT, step)], {
            cwd: ROOT,
            stdio: 'inherit',
        });
        if (result.status !== 0) {
            return { ok: false, step: step, ms: Date.now() - startedAt };
        }
    }
    return { ok: true, ms: Date.now() - startedAt };
}

function stamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

function buildOnce() {
    console.log('\n  正在构建 ...\n');
    const result = runBuild();
    if (!result.ok) {
        console.log('\n  [X] 构建失败，卡在 ' + result.step + '，看上面的报错。');
        process.exit(1);
    }
    console.log('\n  [OK] 构建完成，用时 ' + (result.ms / 1000).toFixed(1) + ' 秒。');
    console.log('       刷新浏览器就能看到最新内容。\n');
}

/* 监听模式：保存 md 之后自动重建，刷新浏览器即可，不用再敲命令。
   防抖 300ms —— 编辑器保存常常连发好几次事件，不防抖会连着跑好几轮。 */
function watch() {
    if (!fs.existsSync(POSTS_DIR)) {
        console.error('  找不到 posts/ 目录');
        process.exit(1);
    }
    console.log('');
    console.log('  监听中：改了 posts/*.md 会自动重建。按 Ctrl + C 退出。');
    console.log('  先跑一遍，保证起点是最新的 ...');
    buildOnce();

    let timer = null;
    let running = false;
    let dirty = false;

    const rebuild = function () {
        if (running) {
            // 上一轮还没跑完，记一笔，等它结束了补跑一次
            dirty = true;
            return;
        }
        running = true;
        dirty = false;
        const result = runBuild();
        running = false;
        console.log('  [' + stamp() + '] ' + (result.ok
            ? '已重建（' + (result.ms / 1000).toFixed(1) + ' 秒）'
            : '构建失败，卡在 ' + result.step));
        if (dirty) rebuild();
    };

    fs.watch(POSTS_DIR, { recursive: true }, function (eventType, filename) {
        if (!filename || !/\.md$/i.test(String(filename))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
            timer = null;
            console.log('\n  检测到改动：posts/' + filename);
            rebuild();
        }, 300);
    });
}

function ask() {
    console.log('');
    console.log('  ============================================================');
    console.log('   重新构建');
    console.log('  ============================================================');
    console.log('');
    console.log('   1. 构建一次（改完文章跑这个）');
    console.log('   2. 持续监听（保存就自动重建，Ctrl + C 退出）');
    console.log('');
    process.stdout.write('   选哪个（默认 1）：');

    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.once('line', function (line) {
        rl.close();
        const choice = String(line || '').trim();
        if (choice === '2') watch();
        else buildOnce();
    });
}

const mode = String(process.argv[2] || '').toLowerCase();
if (mode === 'build') buildOnce();
else if (mode === 'watch') watch();
else ask();
