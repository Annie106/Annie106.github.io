#!/usr/bin/env node
/*
 * 本地预览服务器：指向 dist/，并给所有响应加 Access-Control-Allow-Origin: *。
 *
 * 为什么不用 python -m http.server：
 *   它连 Content-Type 都靠猜，也没有 CORS 头 —— 有些独立页、外链资源靠那个头
 *   才能正常加载。这里统一带上。
 *   注意：评论区的自定义配色现在不受这个影响 —— giscus.app 是 https 公网页面，
 *   来取 http://localhost 的 CSS 会被 Chrome 的本地网络访问检查拦住（权限层，
 *   加头也过不去），所以 script.js 在 localhost 下直接用 giscus 内置主题。
 *   详见 js/script.js 里 giscusThemeUrl() 的注释。
 *
 * 用法：
 *   npm run build
 *   node tools/serve.js          # 默认 http://localhost:8000
 *   node tools/serve.js 8080     # 换端口
 *
 * 只服务 dist/：/posts/<id>/ 这种文章地址只存在于产物里，对着仓库根预览会 404。
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.argv[2]) || 8000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.mp3': 'audio/mpeg',
};

if (!fs.existsSync(ROOT)) {
    console.error('[serve] dist/ 不存在，先跑 npm run build');
    process.exit(1);
}

function send(res, status, body, type) {
    res.writeHead(status, {
        'Content-Type': type || 'text/plain; charset=utf-8',
        /* 关键：让 giscus.app 的 iframe 能跨域取到 css/giscus-annie-*.css */
        'Access-Control-Allow-Origin': '*',
        /* 还要这两条：giscus.app 是 https 公网页面，来取 http://localhost 算
           「公网 → 本地网络」，Chrome 会做 Local Network Access 检查。
           这两个头是放行的必要条件（预检响应里缺了就直接拒），但光有头还不够：
           浏览器那侧还得允许本站访问本地网络，否则 console 里还是
           corsError: LocalNetworkAccessPermissionDenied —— 主题 CSS 一失效，
           登录后的评论编辑器就只剩一行「写评论」和一片空白。
           所以 script.js 的 giscusThemeUrl() 在本地还会退回内置主题，不指望这条。
           带 Private-Network 的是旧名字，Chrome 138 以前叫 PNA，一起留着。 */
        'Access-Control-Allow-Local-Network': 'true',
        'Access-Control-Allow-Private-Network': 'true',
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

const server = http.createServer(function (req, res) {
    /* 预检：普通 CORS 预检 + Chrome 的 Private Network Access 预检都走这里。
       PNA 那条必须回 2xx 并带上 Access-Control-Allow-Private-Network，
       否则 giscus.app（https）取不到本机的主题 CSS。 */
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Local-Network': 'true',
            'Access-Control-Allow-Private-Network': 'true',
            'Access-Control-Max-Age': '600',
        });
        res.end();
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
        send(res, 400, 'Bad Request');
        return;
    }

    let filePath = path.join(ROOT, pathname);
    /* 防目录穿越：URL 里的 ../ 不能跳出 dist/ */
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
        send(res, 403, 'Forbidden');
        return;
    }

    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
    } catch (e) {
        send(res, 500, 'Internal Server Error');
        return;
    }

    fs.readFile(filePath, function (error, data) {
        if (error) {
            send(res, 404, '404 Not Found');
            return;
        }
        send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    });
});

server.listen(PORT, function () {
    console.log('[serve] dist/ → http://localhost:' + PORT + '（已带 Access-Control-Allow-Origin: *）');
    console.log('[serve] 评论框在 localhost 下用 giscus 内置主题（Chrome 不让 giscus.app 取本机 CSS）');
    console.log('[serve] Ctrl+C 退出');
});