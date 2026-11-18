#!/usr/bin/env node
/*
 * 从 favicon.svg 生成主屏图标（PNG）。
 *
 * 为什么要有这个脚本：iOS 的 apple-touch-icon 只认 PNG，安卓的主屏图标也建议
 * 用 PNG，而这个站点的图标是 SVG。这台机器上没有 ImageMagick / Pillow，
 * 也不想为了三张图去引一个依赖 —— 所以这里自己栅格化。
 *
 * 只支持 favicon.svg 里实际用到的那点几何：<rect>、只含 M/L/H/V/Z 的 <path>、
 * <circle>。**换了图标就去改下面这三个 extract* 函数**，不要指望它是个通用
 * SVG 渲染器（渐变、贝塞尔、变换一个都不支持）。
 *
 * 输出是不带透明通道的满幅方图：iOS 和安卓都会自己套圆角遮罩，
 * 图里再画一层圆角会变成「圆角套圆角」，边缘发脏。
 *
 * 用法：node tools/make-app-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'favicon.svg');
const OUT_DIR = path.join(ROOT, 'images');

/* 4×4 超采样：先按 4 倍尺寸逐行填充，再缩回来。图标是纯色块，
   4 倍足够把 180px 的斜边磨平，再高就是白花时间。 */
const SUPERSAMPLE = 4;

const TARGETS = [
    { file: 'apple-touch-icon.png', size: 180 },
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
];

/* ==================== 解析 favicon.svg ==================== */

function readSvg() {
    const svg = fs.readFileSync(SVG_PATH, 'utf8');
    const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 64 64';
    const box = viewBox.trim().split(/[\s,]+/).map(Number);
    return { svg, box };
}

function extractRect(svg) {
    const m = svg.match(/<rect\b([^>]*)\/?>/);
    if (!m) return null;
    const attrs = m[1];
    const num = (name) => Number((attrs.match(new RegExp(name + '="([^"]+)"')) || [])[1] || 0);
    return {
        x: num('x'),
        y: num('y'),
        width: num('width'),
        height: num('height'),
        fill: (attrs.match(/fill="([^"]+)"/) || [])[1] || '#000000',
    };
}

function extractCircle(svg) {
    const m = svg.match(/<circle\b([^>]*)\/?>/);
    if (!m) return null;
    const attrs = m[1];
    const num = (name) => Number((attrs.match(new RegExp(name + '="([^"]+)"')) || [])[1] || 0);
    return {
        cx: num('cx'),
        cy: num('cy'),
        r: num('r'),
        fill: (attrs.match(/fill="([^"]+)"/) || [])[1] || '#000000',
    };
}

/* 只认 M / L / H / V / Z（大小写都行）。favicon 里那个字母 A 全是直线段，
   所以不需要贝塞尔：把每段端点收成多边形，用奇偶规则填。 */
function extractSubpaths(svg) {
    const m = svg.match(/<path\b[^>]*\bd="([^"]+)"/);
    if (!m) return [];
    const tokens = m[1].match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) || [];
    const subpaths = [];
    let i = 0;
    let cmd = null;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let points = null;

    const nextNum = () => Number(tokens[i++]);

    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) {
            cmd = tokens[i];
            i += 1;
        } else if (cmd === null) {
            i += 1;
            continue;
        }
        if (cmd === null) break;
        const lower = cmd.toLowerCase();
        // 小写命令是相对坐标，大写是绝对坐标（写反了会画出一团乱麻）
        const rel = cmd === lower;

        if (lower === 'm') {
            const px = nextNum();
            const py = nextNum();
            x = rel ? x + px : px;
            y = rel ? y + py : py;
            startX = x;
            startY = y;
            points = [[x, y]];
            subpaths.push(points);
            // M 后面的坐标对是隐式 lineto，方向跟着 M 的大小写走
            cmd = rel ? 'l' : 'L';
            continue;
        }
        if (lower === 'l') {
            const px = nextNum();
            const py = nextNum();
            x = rel ? x + px : px;
            y = rel ? y + py : py;
            if (points) points.push([x, y]);
            continue;
        }
        if (lower === 'h') {
            const px = nextNum();
            x = rel ? x + px : px;
            if (points) points.push([x, y]);
            continue;
        }
        if (lower === 'v') {
            const py = nextNum();
            y = rel ? y + py : py;
            if (points) points.push([x, y]);
            continue;
        }
        if (lower === 'z') {
            x = startX;
            y = startY;
            cmd = null;
            continue;
        }
        // 不支持的命令：跳过这个字母，别让后面的数字卡死
        cmd = null;
        i += 1;
    }
    return subpaths.filter((p) => p.length >= 2);
}

/* ==================== 颜色 ==================== */

function hexToRgb(hex) {
    const value = String(hex).trim();
    const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (short) {
        return [
            parseInt(short[1] + short[1], 16),
            parseInt(short[2] + short[2], 16),
            parseInt(short[3] + short[3], 16),
        ];
    }
    const full = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (full) return [parseInt(full[1], 16), parseInt(full[2], 16), parseInt(full[3], 16)];
    return [0, 0, 0];
}

/* ==================== 栅格化 ==================== */

/* 奇偶规则的多边形填充。逐行算交点、成对填色，
   比「每个像素都去测每条边」快一个数量级，2048 行也就几十毫秒。 */
function fillPolygons(pixels, width, height, subpaths, color, scale, offsetX, offsetY) {
    const edges = [];
    subpaths.forEach((points) => {
        for (let i = 0; i < points.length; i += 1) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            const y1 = (a[1] - offsetY) * scale;
            const y2 = (b[1] - offsetY) * scale;
            if (y1 === y2) continue; // 水平边不产生交点
            edges.push({
                x1: (a[0] - offsetX) * scale,
                y1,
                x2: (b[0] - offsetX) * scale,
                y2,
            });
        }
    });

    const crossings = [];
    for (let row = 0; row < height; row += 1) {
        const sampleY = row + 0.5;
        crossings.length = 0;
        for (let e = 0; e < edges.length; e += 1) {
            const edge = edges[e];
            if ((edge.y1 > sampleY) === (edge.y2 > sampleY)) continue;
            const t = (sampleY - edge.y1) / (edge.y2 - edge.y1);
            crossings.push(edge.x1 + t * (edge.x2 - edge.x1));
        }
        if (crossings.length < 2) continue;
        crossings.sort((a, b) => a - b);
        for (let c = 0; c + 1 < crossings.length; c += 2) {
            const from = Math.max(0, Math.round(crossings[c]));
            const to = Math.min(width, Math.round(crossings[c + 1]));
            for (let px = from; px < to; px += 1) {
                const at = (row * width + px) * 3;
                pixels[at] = color[0];
                pixels[at + 1] = color[1];
                pixels[at + 2] = color[2];
            }
        }
    }
}

function fillCircle(pixels, width, height, circle, color, scale, offsetX, offsetY) {
    const cx = (circle.cx - offsetX) * scale;
    const cy = (circle.cy - offsetY) * scale;
    const r = circle.r * scale;
    const yFrom = Math.max(0, Math.floor(cy - r));
    const yTo = Math.min(height - 1, Math.ceil(cy + r));
    for (let row = yFrom; row <= yTo; row += 1) {
        const dy = row + 0.5 - cy;
        const half = Math.sqrt(Math.max(0, r * r - dy * dy));
        const xFrom = Math.max(0, Math.round(cx - half));
        const xTo = Math.min(width, Math.round(cx + half));
        for (let px = xFrom; px < xTo; px += 1) {
            const at = (row * width + px) * 3;
            pixels[at] = color[0];
            pixels[at + 1] = color[1];
            pixels[at + 2] = color[2];
        }
    }
}

function renderIcon(size, geometry) {
    const big = size * SUPERSAMPLE;
    const pixels = new Uint8Array(big * big * 3);
    const { box, rect, subpaths, circle } = geometry;
    const [minX, minY, boxW, boxH] = box;
    const scale = big / Math.max(boxW, boxH);

    // 底：满幅方图（不画圆角，系统自己会套）
    const bg = hexToRgb(rect ? rect.fill : '#1a1a1a');
    for (let i = 0; i < pixels.length; i += 3) {
        pixels[i] = bg[0];
        pixels[i + 1] = bg[1];
        pixels[i + 2] = bg[2];
    }

    fillPolygons(pixels, big, big, subpaths, hexToRgb('#ffffff'), scale, minX, minY);
    if (circle) fillCircle(pixels, big, big, circle, hexToRgb(circle.fill), scale, minX, minY);

    // 缩回目标尺寸：每个输出像素取 4×4 的平均值
    const out = new Uint8Array(size * size * 3);
    const samples = SUPERSAMPLE * SUPERSAMPLE;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            let r = 0;
            let g = 0;
            let b = 0;
            for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
                for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
                    const at = ((y * SUPERSAMPLE + sy) * big + (x * SUPERSAMPLE + sx)) * 3;
                    r += pixels[at];
                    g += pixels[at + 1];
                    b += pixels[at + 2];
                }
            }
            const to = (y * size + x) * 3;
            out[to] = Math.round(r / samples);
            out[to + 1] = Math.round(g / samples);
            out[to + 2] = Math.round(b / samples);
        }
    }
    return out;
}

/* ==================== 写 PNG ==================== */

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let c = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(rgb, size) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // 位深
    ihdr[9] = 2; // 颜色类型：真彩 RGB（不带 alpha，iOS 要的就是这个）
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    // 每行前面加一个 filter 字节 0（None）
    const stride = size * 3;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y += 1) {
        raw[y * (stride + 1)] = 0;
        Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }

    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/* ==================== 主流程 ==================== */

function main() {
    const { svg, box } = readSvg();
    const geometry = {
        box,
        rect: extractRect(svg),
        subpaths: extractSubpaths(svg),
        circle: extractCircle(svg),
    };
    if (!geometry.subpaths.length) {
        throw new Error('favicon.svg 里没解析出 path —— 图标可能换成了曲线，需要改 extractSubpaths');
    }
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    TARGETS.forEach(({ file, size }) => {
        const rgb = renderIcon(size, geometry);
        const png = encodePng(rgb, size);
        const out = path.join(OUT_DIR, file);
        fs.writeFileSync(out, png);
        console.log('写入 ' + path.relative(ROOT, out) + '（' + size + '×' + size + '，' + png.length + ' 字节）');
    });
    console.log('完成。改了 favicon.svg 之后要重跑本脚本。');
}

main();
