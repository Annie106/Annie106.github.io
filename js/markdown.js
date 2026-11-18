/*
 * 文章正文的 Markdown 渲染器。
 *
 * 为什么不用 marked / markdown-it：
 *   站点运行时零依赖，构建期也只有 esbuild 一个 devDependency。正文用到的语法
 *   就这么几种（标题、段落、列表、引用、粗体、行内代码、链接、图片、代码块），
 *   自己写一份反而更可控 —— 尤其是「中文换行不能变成空格」这条，通用库要么
 *   不支持，要么得额外配插件。
 *
 * 两个地方共用这一份：浏览器里 window.AnnieMarkdown，Node 里 require 它。
 * tools/build-posts.js 用它预渲染静态页，script.js 用它渲染站内文章，
 * 所以站点上的样子和爬虫抓到的 HTML 一定一致。
 *
 * 支持的语法：
 *   ## 二级标题        → <h2>（一、二级都当 h2：页面本身已经有 h1 了）
 *   ### 三级标题       → <h3>
 *   普通段落           → <p>
 *   - 无序 / 1. 有序   → <ul>/<ol>，缩进两格可以嵌一层
 *   > 引用             → <blockquote>
 *   ``` 代码块 ```     → <pre><code>
 *   ---                → <hr>
 *   **粗**  *斜*  `代码`  [文字](链接)  ![说明](图片)
 *
 * 以 < 开头的一行会**原样输出**，所以需要 class、data-* 或者 figure 这种
 * 精细控制的地方，直接嵌 HTML 就行，不会被包进 <p>。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AnnieMarkdown = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* 段落里的软换行：中文之间不能补空格（补了会出现「的 时候」这种断字），
       只有两头都是西文/数字时才按 Markdown 的规矩补一个空格。 */
    function joinLines(lines) {
        var out = '';
        for (var i = 0; i < lines.length; i += 1) {
            var line = lines[i].trim();
            if (!line) continue;
            if (out && /[A-Za-z0-9)\]"'.,;:!?]$/.test(out) && /^[A-Za-z0-9(\["']/.test(line)) {
                out += ' ';
            }
            out += line;
        }
        return out;
    }

    /* 行内语法。顺序有讲究：行内代码先抽成占位符，否则里面的 * 和 [] 会被
       后面的粗体、链接规则吃掉。 */
    function inline(text) {
        var codes = [];
        var out = String(text == null ? '' : text);

        out = out.replace(/`([^`]+)`/g, function (whole, code) {
            codes.push(code);
            return '\u0000' + (codes.length - 1) + '\u0000';
        });

        out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (whole, alt, src) {
            return '<img src="' + src + '" alt="' + alt + '" loading="lazy" decoding="async">';
        });

        out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (whole, label, href) {
            return '<a href="' + href + '">' + label + '</a>';
        });

        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

        out = out.replace(/\u0000(\d+)\u0000/g, function (whole, index) {
            return '<code>' + codes[Number(index)] + '</code>';
        });

        return out;
    }

    /* 列表：靠缩进判断层级。返回的 <li> 不闭合在每一项上，
       而是在「回到上一层」或「同级新项」时补上 —— 这样嵌套列表才会落在
       父级 <li> 里面，而不是变成兄弟节点。 */
    function buildList(items) {
        var out = '';
        var stack = [];

        function closeList() {
            if (!stack.length) return;
            var top = stack.pop();
            out += '</li></' + (top.ordered ? 'ol' : 'ul') + '>';
        }

        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            while (stack.length && item.indent < stack[stack.length - 1].indent) {
                closeList();
            }
            if (!stack.length || item.indent > stack[stack.length - 1].indent) {
                stack.push({ indent: item.indent, ordered: item.ordered });
                out += '<' + (item.ordered ? 'ol' : 'ul') + '>';
            } else if (stack[stack.length - 1].ordered !== item.ordered) {
                // 同一层里从无序换成有序：关掉旧的、开一个新的
                closeList();
                stack.push({ indent: item.indent, ordered: item.ordered });
                out += '<' + (item.ordered ? 'ol' : 'ul') + '>';
            } else {
                out += '</li>';
            }
            out += '<li>' + inline(item.text);
        }
        while (stack.length) closeList();
        return out;
    }

    function render(source) {
        var lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
        var html = [];
        var i = 0;

        function blank(line) {
            return !String(line == null ? '' : line).trim();
        }

        while (i < lines.length) {
            var line = lines[i];

            if (blank(line)) {
                i += 1;
                continue;
            }

            var trimmed = line.trim();

            // 围栏代码块
            if (/^```/.test(trimmed)) {
                var buffer = [];
                i += 1;
                while (i < lines.length && !/^```/.test(lines[i].trim())) {
                    buffer.push(lines[i]);
                    i += 1;
                }
                i += 1; // 吃掉收尾的那行 ```
                html.push('<pre><code>' + escapeHtml(buffer.join('\n')) + '</code></pre>');
                continue;
            }

            /* 原始 HTML：整行以 < 开头就原样输出，不包 <p>。
               多行的 HTML 会逐行通过，拼起来仍然是合法的（外层自己闭合）。 */
            if (/^</.test(trimmed)) {
                html.push(trimmed);
                i += 1;
                continue;
            }

            // 分割线
            if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
                html.push('<hr>');
                i += 1;
                continue;
            }

            // 标题：一、二级都当 h2（页面已经有一个 h1 了）
            var heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
            if (heading) {
                var level = heading[1].length <= 2 ? 2 : Math.min(heading[1].length, 4);
                html.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>');
                i += 1;
                continue;
            }

            // 引用：连续的 > 行合成一段
            if (/^>/.test(trimmed)) {
                var quoted = [];
                while (i < lines.length && /^\s*>/.test(lines[i])) {
                    quoted.push(lines[i].replace(/^\s*>\s?/, ''));
                    i += 1;
                }
                html.push('<blockquote>' + inline(joinLines(quoted)) + '</blockquote>');
                continue;
            }

            // 列表
            if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
                var items = [];
                while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
                    var matched = /^(\s*)([-*+]|\d+[.)])\s+([\s\S]*)$/.exec(lines[i]);
                    items.push({
                        // 制表符按四个空格算，缩进判断才稳定
                        indent: matched[1].replace(/\t/g, '    ').length,
                        ordered: /^\d/.test(matched[2]),
                        text: matched[3],
                    });
                    i += 1;
                }
                html.push(buildList(items));
                continue;
            }

            // 普通段落：吃到空行或下一个块级标记为止
            var paragraph = [];
            while (i < lines.length && !blank(lines[i])) {
                var next = lines[i].trim();
                if (/^(#{1,6}\s|>|```|-{3,}$)/.test(next)) break;
                if (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) break;
                if (/^</.test(next)) break;
                paragraph.push(lines[i]);
                i += 1;
            }
            if (paragraph.length) {
                html.push('<p>' + inline(joinLines(paragraph)) + '</p>');
            } else {
                // 兜底：这一行什么规则都没命中，按原样当一段，避免死循环
                html.push('<p>' + inline(trimmed) + '</p>');
                i += 1;
            }
        }

        return html.join('\n');
    }

    /* 纯文本：给搜索索引、摘要、RSS 描述用。
       不渲染成 HTML 再剥标签，是因为这里要的是「读者看到的字」，
       顺带把 Markdown 的记法（#、**、[]()）也一起清掉。 */
    function toPlainText(source) {
        var text = String(source == null ? '' : source)
            .replace(/\r\n?/g, '\n')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')
            .replace(/^\s*>\s?/gm, ' ')
            .replace(/^\s*([-*+]|\d+[.)])\s+/gm, ' ')
            .replace(/`([^`]*)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/\s+/g, ' ')
            .trim();
        return text;
    }

    /* 正文里的第一张图：RSS 缩略图、分享封面都用它兜底。
       先找 Markdown 的 ![]()，再找已经写成 HTML 的 <img>。 */
    function firstImage(source) {
        var text = String(source == null ? '' : source);
        var md = /!\[[^\]]*\]\(\s*([^)\s]+)/.exec(text);
        if (md) return md[1];
        var html = /<img[^>]+src=["']([^"']+)["']/i.exec(text);
        return html ? html[1] : '';
    }

    return {
        render: render,
        toPlainText: toPlainText,
        firstImage: firstImage,
    };
});
