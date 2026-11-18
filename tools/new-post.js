#!/usr/bin/env node
/*
 * 新建 / 导入一篇文章。
 *
 * 文章的正文和元信息都以 posts/*.md 为准（js/posts-data.js 是生成物），
 * 所以「写一篇」= 在 posts/ 里放一个带前置元信息的 md 文件。
 *
 * 用法：
 *   node tools/new-post.js "标题"                  新建一篇，正文留空等你写
 *   node tools/new-post.js "标题" --tags 随笔,教程   顺便把标签填上
 *   node tools/new-post.js --from 草稿.md          把已经写好的 md 导进来
 *   加 --open 会用系统默认程序打开刚建好的文件（根目录的 bat 就是这么用的）
 *
 * 导入时：文件里已经有 --- 前置元信息就沿用（缺 id / date 会补上），
 * 没有就整篇当作正文，标题从 --title 或文件名取。
 *
 * 写完这个脚本会顺手跑一次 build-posts-data.js，好让你马上 npm run build 看效果。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const DATA_FILE = path.join(ROOT, 'js', 'posts-data.js');

function today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/* 现有最大 id + 1。id 一旦发出去就代表一个地址，**永远不要复用**。 */
function nextId() {
    const code = fs.readFileSync(DATA_FILE, 'utf8');
    const ids = (code.match(/\bid:\s*(\d+)/g) || []).map(function (item) {
        return Number(item.replace(/\D/g, ''));
    });
    return (ids.length ? Math.max.apply(null, ids) : 0) + 1;
}

function safeFileName(id, title) {
    const clean = String(title || '')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '')
        .slice(0, 18);
    return String(id).padStart(2, '0') + (clean ? '-' + clean : '') + '.md';
}

function splitTags(value) {
    return String(value || '').split(/[,，]/).map(function (tag) {
        return tag.trim();
    }).filter(Boolean);
}

function buildFrontMatter(fields) {
    const lines = ['---'];
    lines.push('id: ' + fields.id);
    lines.push('title: ' + fields.title);
    lines.push('date: ' + fields.date);
    /* updated 留空不写值：它是「最后一次改动」的日期，平时不填，
       改过之后填上，列表和详情页会优先显示它。空着等于「没改过」。 */
    lines.push(fields.updated ? 'updated: ' + fields.updated : 'updated:');
    /* excerpt 也总写一行（没写就留空）：它决定首页卡片上那句摘要和 RSS 里的一段话，
       不写的话卡片那块就是空的，想自己控制的时候得知道有这个地方可以填。 */
    lines.push(fields.excerpt ? 'excerpt: ' + fields.excerpt : 'excerpt:');
    if (fields.tags && fields.tags.length) lines.push('tags: ' + fields.tags.join(', '));
    /* 这两个字段总是写出来，哪怕是 false。
       不写的话，回头想置顶/精选得先知道有这个字段名、还得记得加在哪；
       写出来就是「改一个词」的事。默认不置顶、不精选。 */
    lines.push('pinned: ' + (fields.pinned ? 'true' : 'false'));
    lines.push('---');
    return lines.join('\n');
}

function writePost(fileName, content, id) {
    if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
    const target = path.join(POSTS_DIR, fileName);
    if (fs.existsSync(target)) {
        console.error('✗ posts/' + fileName + ' 已经存在了，换个标题或手动改文件名');
        process.exit(1);
    }
    fs.writeFileSync(target, content);
    console.log('✓ 已创建 posts/' + fileName + '（id ' + id + '）');

    try {
        execFileSync(process.execPath, [path.join(__dirname, 'build-posts-data.js')], { stdio: 'inherit' });
    } catch (error) {
        console.error('✗ 生成 js/posts-data.js 失败，检查一下刚写的正文');
        process.exit(1);
    }
    console.log('\n接下来：');
    console.log('  1. 打开 posts/' + fileName + ' 写正文（Markdown，## 小标题，**粗体**，- 列表）');
    console.log('  2. npm run build 重新构建产物');
    return target;
}

/* 用系统默认程序打开刚建好的文件（.bat 那一键流程用）。
   不在 Windows 上就什么都不做；打开失败也不该影响「文件已经建好」这个事实，
   所以异常全部吞掉。 */
function openInEditor(file) {
    if (process.platform !== 'win32') return;
    // 批量生成时不想弹一堆窗口，设 ANNIE_NO_OPEN=1 就只建文件
    if (process.env.ANNIE_NO_OPEN) return;
    try {
        require('child_process').execFile('cmd.exe', ['/c', 'start', '', file], { windowsHide: true }, function () {});
    } catch (error) {
        /* 没有关联的编辑器就算了，路径上面已经打印出来了 */
    }
}

function parseArgs(argv) {
    const result = { title: '', tags: [], from: '', open: false, ask: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--from') {
            result.from = argv[i + 1] || '';
            i += 1;
        } else if (arg === '--title') {
            result.title = argv[i + 1] || '';
            i += 1;
        } else if (arg === '--ask') {
            result.ask = true;
        } else if (arg === '--open') {
            result.open = true;
        } else if (arg === '--tags') {
            result.tags = splitTags(argv[i + 1]);
            i += 1;
        } else if (!arg.startsWith('--')) {
            // 位置参数：第一个是标题，第二个当标签（方便 bat 直接透传）
            if (!result.title) result.title = arg;
            else if (!result.tags.length) result.tags = splitTags(arg);
        }
    }
    return result;
}

function importFrom(file, args) {
    if (!fs.existsSync(file)) {
        console.error('✗ 找不到文件：' + file);
        process.exit(1);
    }
    const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    const id = nextId();
    const hasFrontMatter = /^---\n/.test(raw);

    if (hasFrontMatter) {
        const end = raw.indexOf('\n---', 4);
        if (end < 0) {
            console.error('✗ 前置元信息没有闭合（缺少第二行 ---）');
            process.exit(1);
        }
        let head = raw.slice(4, end);
        const body = raw.slice(end + 4).replace(/^\n/, '');
        // 补上缺的 id / date，已有的保持不动
        if (!/^id:/m.test(head)) head = 'id: ' + id + '\n' + head;
        if (!/^date:/m.test(head)) head = head.replace(/^(title:.*)$/m, '$1\ndate: ' + today());
        const titleMatch = /^title:\s*(.+)$/m.exec(head);
        const title = (titleMatch ? titleMatch[1] : '') || args.title || path.basename(file, '.md');
        if (!titleMatch) head = 'title: ' + title + '\n' + head;
        if (args.tags.length && !/^tags:/m.test(head)) head += '\ntags: ' + args.tags.join(', ');
        // 老草稿里缺的字段补上，省得以后想改时找不到位置
        if (!/^updated:/m.test(head)) head += '\nupdated:';
        if (!/^pinned:/m.test(head)) head += '\npinned: false';
        const created = writePost(safeFileName(id, title), '---\n' + head.trim() + '\n---\n\n' + body.replace(/^\n+/, ''), id);
        if (args.open) openInEditor(created);
        return;
    }

    const title = args.title || path.basename(file, '.md');
    const front = buildFrontMatter({ id: id, title: title, date: today(), tags: args.tags });
    const created = writePost(safeFileName(id, title), front + '\n\n' + raw.replace(/^\n+/, ''), id);
    if (args.open) openInEditor(created);
}

/* 问答式新建。
   为什么不放在 .bat 里用 set /p：cmd 处理含中文的 UTF-8 批处理并不可靠
   （实测中文行会被吞掉半句，`&` 还会被当成分隔符）。把提示做到 Node 里，
   bat 就只剩「chcp + 调 node」两件事，编码问题一次消失。 */
async function askMode(seedTitle, seedTags) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    /* 自己维护一个答案队列，而不是用 rl.question：粘贴多行或者用管道喂输入时，
       几行会一起到达，question 只接得住当前那一问，后面的行会被当成事件丢掉。
       队列版本对「手打」和「一次灌进来」两种情况都成立。 */
    const queue = [];
    const waiters = [];
    rl.on('line', function (line) {
        if (waiters.length) waiters.shift()(line);
        else queue.push(line);
    });
    const ask = function (question) {
        process.stdout.write(question);
        if (queue.length) return Promise.resolve(queue.shift());
        return new Promise(function (resolve) {
            waiters.push(resolve);
        });
    };

    console.log('');
    console.log('  ============================================================');
    console.log('   新建一篇文章');
    console.log('  ============================================================');
    console.log('');

    let title = String(seedTitle || '').trim();
    if (!title) title = String(await ask('   标题：')).trim();
    if (!title) {
        console.log('');
        console.log('   [X] 标题不能为空。');
        rl.close();
        process.exit(1);
    }

    let tags = String(seedTags || '').trim();
    if (!tags) {
        console.log('');
        console.log('   标签用逗号分隔，例如：随笔,教程');
        tags = String(await ask('   标签（直接回车跳过）：')).trim();
    }
    rl.close();

    console.log('');
    console.log('   标题：' + title);
    if (tags) console.log('   标签：' + tags);
    console.log('');
    console.log('   正在生成 ...');
    console.log('');

    const id = nextId();
    const front = buildFrontMatter({ id: id, title: title, date: today(), tags: splitTags(tags) });
    const created = writePost(safeFileName(id, title), front + '\n\n', id);
    openInEditor(created);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.ask) {
        await askMode(args.title, args.tags.join(','));
        return;
    }
    if (args.from) {
        importFrom(args.from, args);
        return;
    }
    if (!args.title) {
        console.error('用法：node tools/new-post.js "标题" [--tags 随笔,教程]');
        console.error('      node tools/new-post.js --from 草稿.md');
        process.exit(1);
    }
    const id = nextId();
    const front = buildFrontMatter({ id: id, title: args.title, date: today(), tags: args.tags });
    // 开头的空行留给正文，写的时候直接往下接
    const created = writePost(safeFileName(id, args.title), front + '\n\n', id);
    if (args.open) openInEditor(created);
}

main().catch(function (error) {
    console.error('✗ ' + (error && error.message ? error.message : error));
    process.exit(1);
});
