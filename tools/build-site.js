#!/usr/bin/env node
/*
 * 生成发布产物 dist/。
 *
 * 这个站以前靠 GitHub Pages 的 Jekyll 构建挡开发文件（那份 _config.yml 已于
 * 2026-11-13 删除）。现在改成自己构建：这个脚本决定「哪些文件会出现在线上」，
 * GitHub 只负责把 dist/ 原样托管出去（见 .github/workflows/deploy.yml）。
 *
 * 用**白名单**而不是黑名单：漏发一个页面会立刻 404、当场发现；
 * 而误发一个开发文件（AGENTS.md、tools/）往往没人察觉。
 *
 * 用法：node tools/build-site.js
 * 本地看产物：npx serve dist  或者任意静态服务器指向 dist/
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

/* ==========================================================================
 * 发布白名单：决定「哪些文件会出现在线上」
 *
 * 判断标准只有一条：**文件是不是落在这两个列表给出的路径里面**。
 * 目录是递归复制的，所以列了 `images` 就等于列了 `images/` 下的所有层级。
 *
 *   文件落在已列路径里面   → 不用改这里，直接构建
 *   仓库根级新增单个文件   → 加进 PUBLISH_FILES
 *   仓库根级新建一个目录   → 加进 PUBLISH_DIRS
 *   不想让别人打开它       → 文件名前加下划线：_draft.html（最省事，不用改脚本）
 *   这个页面就是不想上线   → 或者加进 IGNORE_HTML（给不以下划线命名的例外用）
 *
 * 对照着看（左边是路径，右边是要不要动手）：
 *
 *   project_subpage/blog/new.html      自动带上   在 project_subpage 目录里
 *   project_subpage/foo/bar.html       自动带上   子目录同样递归覆盖
 *   images/manor_photos/x.jpg          自动带上   在 images 目录里
 *   project_subpage/blog/_draft.html   不发布     下划线开头 = 草稿，自动跳过
 *   project_subpage/blog/notes.md      不发布     .md / .markdown 一律不发布
 *   assets/logo.svg                    要改       assets 是根级新目录 → PUBLISH_DIRS
 *   robots.txt                         要改       根级新文件 → PUBLISH_FILES
 *   _draft.html（只是不想发）          不用改     下划线前缀就够，脚本自动跳过
 *
 * 忘了加不会被静默放过：脚本末尾会把「仓库里所有 .html」和「产物里实际有什么」
 * 逐一比对，发现「有源码、没进产物」的页面就报错退出并点名文件。
 * 那种漏发在构建时看不出来，只会在线上变成 404，最难自己发现。
 *
 * 真报错了，按这个顺序想：
 *   ① 它本该上线，只是放在根级  → 按上面两条加白名单
 *   ② 它就是不想上线（模板、草稿）→ 加进 IGNORE_HTML，一次加好，以后都不用管
 * ========================================================================== */

/* 根级单个文件。这里只放「就在仓库根目录下、且要发布」的文件。 */
const PUBLISH_FILES = [
    'index.html',
    '404.html',
    'movie.html',
    'favicon.svg',
    'share_cover.jpg',
    'feed.xml',
];

/* 根级目录，按整份递归复制。列在这里的目录内部加文件、加子目录都不用再改脚本。 */
const PUBLISH_DIRS = [
    'css',
    'js',
    'fonts',
    'images',
    'project_subpage',
    'archive',
];

/* 产物里必须存在的文件。少了任何一个都说明白名单或源文件出了问题，
   直接报错退出，不要发出一份缺胳膊少腿的站点。 */
const MUST_HAVE = [
    'index.html',
    '404.html',
    'favicon.svg',
    'css/style.css',
    'js/script.js',
    'js/posts-data.js',
    'fonts/remixicon.woff2',
    'feed.xml',
];

/* 反向检查扫描源码时要跳过的目录。
   dist 必须跳过：它里面是刚复制出来的副本，扫它等于拿产物跟产物比，永远比得上；
   .git / .workbuddy / .github / node_modules 是工具目录，本来就没有要发布的页面。 */
const SCAN_SKIP = new Set(['.git', '.workbuddy', '.github', 'node_modules', 'dist']);

/* 故意不发布的页面：仓库里的 .html 默认都应该上线，这里列的是例外。
 *
 * 怎么加 —— 往**同一个** Set 里加条目，逗号分隔：
 *     const IGNORE_HTML = new Set(['_template.html', 'draft.html']);
 * 条目多了就换行排：
 *     const IGNORE_HTML = new Set([
 *         '_template.html',
 *         'project_subpage/blog/draft.html',
 *     ]);
 * ⚠️ 不要另起一行再写一个 const IGNORE_HTML。同一作用域重复声明 const 会直接
 *    SyntaxError，整个脚本连跑都跑不起来 —— 不是"后一个覆盖前一个"。
 *
 * 路径写法：相对仓库根、正斜杠、带子目录。检查逻辑是逐字比对：
 *     '_template.html'                     ✓ 根级文件
 *     'project_subpage/blog/draft.html'    ✓ 带子目录
 *     './draft.html'   'blog\draft.html'   ✗ 匹配不上，等于没加
 */
const IGNORE_HTML = new Set(['_template.html']);

/* 不进产物的命名约定。这一条比 IGNORE_HTML 更常用 —— 写草稿不用改脚本，
   名字加下划线就行。
 *
 * 规则：
 *   ① 以 _ 或 . 开头的文件和目录   → 跳过（_draft.html、_notes/、.env）
 *      Jekyll 时代就是这个习惯，这个仓库也早就在用（_template.html）。
 *   ② .md / .markdown              → 跳过（纯文档，线上没用）
 *   ③ IGNORE_HTML 里列出的路径     → 跳过（给不以下划线命名的例外用）
 *
 * 为什么必须有这个：白名单里的目录是**整份递归复制**的，放在
 * project_subpage/blog/ 下的任何文件都会被发出去 —— 包括草稿页和笔记。
 * 而 orphans 检查也拦不住，因为它在产物里确实存在。
 * 静态站没有访问控制，进了产物就等于公开，所以只能在「不发」这一层解决。
 */
function isExcluded(rel, name) {
    if (name.startsWith('_') || name.startsWith('.')) return true;
    if (/\.(md|markdown)$/i.test(name)) return true;
    if (IGNORE_HTML.has(rel)) return true;
    return false;
}

/* 收集仓库里所有 .html 的相对路径，用来和白名单覆盖范围做比对。
   目的是抓「加了页面但忘了加白名单」——这种漏发不会报错，
   只会在线上变成 404，是最难自己发现的一类问题。
   被 isExcluded 排除的不算漏发（草稿本来就不该上线）。 */
function collectHtml(dir, base, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? base + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            if (SCAN_SKIP.has(entry.name)) continue;
            if (isExcluded(rel, entry.name)) continue;
            collectHtml(path.join(dir, entry.name), rel, out);
        } else if (/\.html?$/i.test(entry.name)) {
            if (isExcluded(rel, entry.name)) continue;
            out.push(rel);
        }
    }
    return out;
}

function walk(dir, base, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = base ? base + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            walk(abs, rel, out);
        } else {
            out.push({ rel: rel, size: fs.statSync(abs).size });
        }
    }
    return out;
}

/* 手写递归复制。
   ⚠️ 不要换成 fs.cpSync：这台机器上（Windows + Node 22.22）调用 cpSync
   会让 node 进程直接崩掉，**没有任何报错、退出码 127、stdout 全空**，
   排查起来极费时间。手写版本慢几十毫秒，但行为可预期。 */
function copyDir(srcDir, destDir, relBase) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);
        const rel = relBase ? relBase + '/' + entry.name : entry.name;
        // 草稿、笔记、显式排除项：连目录都不建，产物里不存在这个名字
        if (isExcluded(rel, entry.name)) continue;
        if (entry.isDirectory()) {
            copyDir(src, dest, rel);
        } else if (entry.isFile()) {
            fs.copyFileSync(src, dest);
        }
    }
}

/* 清空目录内容（保留目录本身）。
   ⚠️ 不要换成 fs.rmSync：这台机器上 rmSync 被工具链 shim 成了「移到回收站」，
   回收站操作偶尔会抛 "Some operations were aborted"（文件被占用、回收站不可用），
   整个构建就崩了，而且报错和站点本身毫无关系，极易误判。
   unlinkSync / rmdirSync 是原生调用、不走回收站，逐项删更稳。 */
function emptyDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            emptyDir(target);
            fs.rmdirSync(target);
        } else {
            fs.unlinkSync(target);
        }
    }
}

function fail(msg) {
    console.error('\n[X] 构建失败：' + msg + '\n');
    process.exit(1);
}

function main() {
    /* 构建前置：图标子集必须是「按当前源码生成过的」。
       加了新图标却没重跑生成时，字形不在字体里、页面只会显示空白，肉眼很难发现，
       所以这里直接中止构建，并给出唯一的修复命令。 */
    const woff2 = path.join(ROOT, 'fonts', 'remixicon.woff2');
    if (!fs.existsSync(woff2) || fs.statSync(woff2).size < 1024) {
        fail('字体文件 fonts/remixicon.woff2 不存在或明显不完整。\n' +
            '    先跑 tools\\update-icons.bat 重新生成（需要 Python 3.9+ 与 fonttools/brotli）。');
    }
    const iconCheck = require('child_process').spawnSync(
        process.execPath, [path.join(__dirname, 'check-icons.js')], { stdio: 'inherit' }
    );
    if (iconCheck.status !== 0) {
        fail('图标子集没跟上源码（见上面的输出）。\n' +
            '    先双击 tools\\update-icons.bat 重新生成，再构建。\n' +
            '    第一次在新电脑上用，先跑 tools\\setup.bat（装 Python 依赖 + 钩子）。');
    }

    if (fs.existsSync(OUT)) emptyDir(OUT);
    else fs.mkdirSync(OUT, { recursive: true });

    const copied = [];
    const missing = [];
    const skippedDirs = [];

    for (const name of PUBLISH_FILES) {
        const src = path.join(ROOT, name);
        if (!fs.existsSync(src)) {
            missing.push(name);
            continue;
        }
        fs.copyFileSync(src, path.join(OUT, name));
        copied.push(name);
    }

    for (const name of PUBLISH_DIRS) {
        const src = path.join(ROOT, name);
        /* 目录不存在时**跳过**，不报错。
           原因：git 不追踪空目录。本地有个空的 images/，clean clone 之后就没了
           （2026-11-13 CI 就是因为这个挂了 15 秒）。没有目录 = 没有要发的资源，
           不是错误。真写错名字了也不用担心静默：输出里会把跳过的目录列出来。
           注意这里只放宽「目录」，PUBLISH_FILES 里的文件缺了照样报错。 */
        if (!fs.existsSync(src)) {
            skippedDirs.push(name);
            continue;
        }
        copyDir(src, path.join(OUT, name), name);
        copied.push(name + '/');
    }

    if (missing.length) {
        fail('这些该发布的东西在仓库里找不到 ——\n  ' + missing.join('\n  ') +
            '\n如果是有意删除，请同步改 tools/build-site.js 的白名单。');
    }

    for (const rel of MUST_HAVE) {
        if (!fs.existsSync(path.join(OUT, rel))) {
            fail('产物里缺少必需文件 dist/' + rel +
                '\n检查源文件是否存在，或白名单是否把它漏掉了。');
        }
    }

    /* 反向检查：仓库里有、产物里没有的页面。
       根级新页面 / 新目录没加白名单时，构建不会报错，线上却直接 404，
       所以这里必须拦下来 —— 要么加白名单，要么明确写进 IGNORE_HTML。 */
    const orphans = collectHtml(ROOT, '', []).filter(function (rel) {
        return !IGNORE_HTML.has(rel) && !fs.existsSync(path.join(OUT, rel));
    });
    if (orphans.length) {
        fail('这些页面没有进产物，线上会 404 ——\n  ' + orphans.join('\n  ') +
            '\n\n  根级文件加进 tools/build-site.js 的 PUBLISH_FILES；' +
            '\n  新目录（如 assets/）加进 PUBLISH_DIRS；' +
            '\n  如果它本来就是不上线的模板，加进 IGNORE_HTML。');
    }

    const files = walk(OUT, '', []);
    const total = files.reduce((sum, f) => sum + f.size, 0);
    const mb = (total / 1024 / 1024).toFixed(2);

    console.log('');
    console.log('[OK] 发布产物已生成 dist/');
    console.log('  文件 ' + files.length + ' 个，共 ' + mb + ' MB');
    console.log('');
    console.log('  已收录：' + copied.join('  '));
    if (skippedDirs.length) {
        console.log('');
        console.log('  跳过（仓库里没有这个目录，不影响构建）：' + skippedDirs.join('  '));
    }
    console.log('');
    console.log('  未收录（开发文件，不会出现在线上）：');
    console.log('    AGENTS.md  README.md  _template.html');
    console.log('    check-icons.bat  tools/  .github/  .workbuddy/  dist/');
    console.log('');
    console.log('  本地预览：任意静态服务器指向 dist/，例如 npx serve dist');
    console.log('');
}

main();
