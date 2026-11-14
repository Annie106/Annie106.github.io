#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
图标字子集化：从全量字体里只裁出「站内真正用到的图标」，生成 fonts/ 下的两个文件。

用法（任何一个都行）：
    python tools/subset-icons.py
    tools/update-icons.bat            # 裁剪 + 自检一步到位

为什么要有这一步：
    全量 Remix Icon 4.3.0 的 woff2 是 165 KB、icons.css 141 KB，
    而站内只用得到约 100 个图标。裁完之后字体约 10 KB、css 约 20 KB。
    代价是「加了新图标要重新跑一遍」，不跑就显示空白（浏览器不报错）。

输入（都在 tools/，不参与发布）：
    tools/remixicon-src.woff2   全量字体（种子，别删；丢了从 git 历史或上游 4.3.0 取）
    tools/remixicon-src.css     全量样式（图标名 → 码点的映射表）

输出（会被页面加载）：
    fonts/remixicon.woff2       只含用到的字形
    fonts/icons.css             @font-face + 基础规则 + 用到的那几条图标规则

安全网：
    - 源码里用到、但全量字体里没有的图标名 → 直接报错并给出位置
    - 裁完会重新打开字体，逐个确认码点都在 cmap 里，缺一个就报错
    - tools/check-icons.js 读的是生成后的 icons.css，漏跑会被它当场抓住
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / 'tools'
SRC_CSS = TOOLS / 'remixicon-src.css'
SRC_FONT = TOOLS / 'remixicon-src.woff2'
OUT_CSS = ROOT / 'fonts' / 'icons.css'
OUT_FONT = ROOT / 'fonts' / 'remixicon.woff2'

# 与 tools/check-icons.js 保持一致的扫描范围
SKIP_DIRS = {'.git', '.workbuddy', 'node_modules', 'images', 'dist', 'tools'}
SCAN_EXT = {'.html', '.htm', '.js'}
# 文档里的示意写法，不是真图标名
PLACEHOLDERS = {'ri-xxx', 'ri-任意', 'ri-图标名'}

ICON_NAME = re.compile(r'\bri-[a-z0-9-]+\b')
RULE = re.compile(r'^\.(ri-[a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"', re.M)


def fail(msg):
    print(f'[X] {msg}')
    sys.exit(1)


def read_source():
    if not SRC_CSS.exists() or not SRC_FONT.exists():
        fail('找不到 tools/remixicon-src.css 或 .woff2（全量源文件）')
    css = SRC_CSS.read_text(encoding='utf-8')
    rules = []
    for name, code in RULE.findall(css):
        rules.append((name, int(code, 16)))
    if not rules:
        fail('源 css 里没解析出任何图标规则，格式可能变了')
    # @font-face 到第一条图标规则之前的部分原样保留
    # （@font-face、[class^="ri-"] 基础规则、ri-lg / ri-fw 这些尺寸工具类）
    base = re.search(r'^@font-face[\s\S]*?(?=^\.ri-[a-z0-9-]+:before)', css, re.M)
    if not base:
        fail('源 css 里找不到 @font-face 段')
    return rules, base.group(0).rstrip()


def scan_used():
    used = {}
    for path in ROOT.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in SCAN_EXT:
            continue
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        for lineno, line in enumerate(text.split('\n'), 1):
            for name in ICON_NAME.findall(line):
                if name in PLACEHOLDERS:
                    continue
                used.setdefault(name, []).append(f'{rel.as_posix()}:{lineno}')
    return used


def main():
    # 先确认依赖，避免扫完一大圈才报"没装 fonttools"
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
    except ImportError:
        fail(
            '缺少 fonttools（裁剪字体用）。安装命令：\n'
            '    python -m pip install fonttools brotli\n'
            '  如果上面敲的是 py，就换成：py -m pip install fonttools brotli\n'
            '  或者直接双击 tools/setup.bat，它会一起装好。'
        )

    rules, base = read_source()
    codes = {name: code for name, code in rules}
    used = scan_used()

    missing = sorted(name for name in used if name not in codes)
    if missing:
        print('[X] 这些图标名在全量字体里不存在（拼错？后缀 -line / -fill 写反？）：')
        for name in missing:
            where = used[name]
            more = f' 等 {len(where)} 处' if len(where) > 3 else ''
            print(f'    {name} —— {"、".join(where[:3])}{more}')
        print('\n    对照 https://remixicon.com 核对名字后重跑本脚本。')
        sys.exit(1)

    # 只保留用到的图标，顺序沿用源文件（等于按码点升序，方便对比）
    keep = [(name, code) for name, code in rules if name in used]
    unicodes = sorted({code for _, code in keep})
    print(f'用到图标 {len(used)} 个，字体保留 {len(unicodes)} 个字形')

    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = []
    options.name_IDs = ['*']
    options.notdef_outline = True

    font = subset.load_font(str(SRC_FONT), options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(OUT_FONT), options)

    # 复核：裁出来的字体里必须每个码点都在
    check = TTFont(str(OUT_FONT))
    covered = set()
    for table in check['cmap'].tables:
        covered.update(table.cmap.keys())
    lost = [name for name, code in keep if code not in covered]
    if lost:
        fail(f'字体里丢了这些字形：{", ".join(lost[:10])}')

    header = f'''/*
 * Remix Icon v4.3.0 · 本地子集（生成物，不要手改）
 * 来源：https://github.com/Remix-Design/RemixIcon · Apache License 2.0
 *
 * 从 tools/remixicon-src.css 里只挑出站内用到的 {len(keep)} 个图标，
 * 字体同样由 tools/remixicon-src.woff2 裁出（{len(unicodes)} 个字形）。
 * 加 / 换图标后跑一次：python tools/subset-icons.py（或 tools/update-icons.bat），
 * 忘跑的话 tools/check-icons.js 会报「图标名不存在」。
 *
 * 由 css/style.css 顶部的 @import 引入，页面不需要单独引用本文件。
 */
'''

    body = '\n'.join(f'.{name}:before {{ content: "\\{code:x}"; }}' for name, code in keep)
    OUT_CSS.write_text(f'{header}{base}\n\n{body}\n', encoding='utf-8')

    print(f'[OK] fonts/icons.css      {OUT_CSS.stat().st_size:>7,} bytes')
    print(f'[OK] fonts/remixicon.woff2 {OUT_FONT.stat().st_size:>7,} bytes')
    print('\n下一步：node tools/check-icons.js')


if __name__ == '__main__':
    main()
