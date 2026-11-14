#!/usr/bin/env node
/**
 * pre-commit：把「图标子集」跟提交绑在一起。
 *
 * 只要这次提交里动了 .html / .js，就先重跑一遍子集生成，把 fonts/ 下两个
 * 生成物一起加进提交，再跑校验。这样「加图标」就真的只剩两步：
 *   写 <i class="ri-xxx"> → 提交
 *
 * 没装 Python 时直接中止提交：图标子集是本地产物，本地生成不了就别提交，
 * 否则别人拉下来预览缺图标、本地构建也会被 check 拦住。
 * 装一次 Python + 跑一次 tools/setup.bat 即可，之后全自动。
 *
 * 由 tools/install-hooks.bat 安装到 .git/hooks/pre-commit。
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, quiet) {
    return spawnSync(cmd, args, {
        cwd: ROOT,
        stdio: quiet ? 'ignore' : 'inherit',
        shell: process.platform === 'win32',
        // 中文 Windows 控制台是 GBK，不指定的话 Python 打印中文可能直接崩
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
}

/* 判断 Python 是否真的可用：必须执行 --version，
   不能只看 where —— Windows 有个商店占位符 python.exe，
   where 找得到，跑起来是 9009（命令不存在）。 */
function pickPython() {
    if (run('python', ['--version'], true).status === 0) return 'python';
    if (run('py', ['--version'], true).status === 0) return 'py';
    return null;
}

// 这次提交改了哪些文件
const staged = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: ROOT,
    encoding: 'utf8',
});
if (staged.status !== 0) {
    console.error('[!] 读不到暂存区，跳过图标检查');
    process.exit(0);
}

const files = staged.stdout.split('\n').map(s => s.trim()).filter(Boolean);
const touchedCode = files.some(f => /\.(html?|js)$/i.test(f) && !f.startsWith('tools/'));

if (touchedCode) {
    const py = pickPython();
    if (!py) {
        /* 这个项目默认要求本机能跑 Python：图标子集是本地产物，
           没生成就提交，别人拉下来本地预览会缺图标、本地构建也会被拦。 */
        console.error('\n[X] 没找到可用的 Python，提交已中止。');
        console.error('    图标子集需要 Python 3.9+（fonttools + brotli）。');
        console.error('    装好后双击 tools\\setup.bat 一次，之后就不用管了。');
        console.error('    注意：Windows 的 python 可能是应用商店占位符，');
        console.error('          运行 py --version 或 python --version 能出版本号才算装好。\n');
        process.exit(1);
    }

    if (run(py, ['tools/subset-icons.py']).status !== 0) {
        console.error('\n[X] 图标子集生成失败，提交已中止（见上面的输出）');
        console.error('    确认图标名拼写（remixicon.com），或先修好依赖后重试。\n');
        process.exit(1);
    }
    // 生成物跟着这次提交一起走
    run('git', ['add', 'fonts/icons.css', 'fonts/remixicon.woff2']);
}

const check = run('node', [path.join('tools', 'check-icons.js')]);
process.exit(check.status === 0 ? 0 : 1);
