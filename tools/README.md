# tools/ —— 本地构建与生成脚本

这个目录**不会发布到线上**（`tools/` 不在 `build-site.js` 的白名单里），只在你自己的电脑和 GitHub Actions 里跑。

- 想加图标 / 改文章 / 发布：只看本文档就够。
- 站点本身的教程在网页里：`project_subpage/blog/guide.html`。

---

## 一、依赖（两样都要有）

| 依赖 | 版本 | 用来干什么 | 缺了会怎样 |
| --- | --- | --- | --- |
| **Node.js** | 18 或更高 | 构建产物、图标校验、git 钩子 | `node tools/build-site.js` 直接跑不起来 |
| **Python** | 3.9 或更高 | 裁剪图标字体（需要 `fonttools` + `brotli`） | **提交被钩子拦下、本地构建中止** |

Python 装好后还要装两个包（`setup.bat` 会自动装）：

```
python -m pip install fonttools brotli
```

> 用的是 `py` 命令的话，把上面的 `python` 换成 `py`。

### 怎么确认装好了

```
node --version          # 应该打印 v18.x / v20.x / v22.x
python --version        # 应该打印 Python 3.9+
python -c "import fontTools, brotli"    # 没有任何输出 = 装好了
```

**不要用 `where python` 判断。** Windows 自带一个「应用商店占位符」`python.exe`，`where` 找得到，真运行报 `9009`（命令不存在）。只有 `python --version` 能打印版本号才算真装上。

装 Python 时记得在安装向导第一屏勾上 **Add python.exe to PATH**，否则命令照样找不到。

---

## 二、第一次上手（只做一次）

按顺序，每一步都有明确的"成功长什么样"。

### 1. 双击 `tools/setup.bat`

它依次做：查 Node → 查 Python → 装 `fonttools`/`brotli` → 生成图标子集 → 装 git 钩子 → 跑一次校验。

成功时最后几行长这样：

```
[OK] Node.js found
[OK] Python found
[OK] fonttools / brotli installed
[OK] pre-commit hook installed
[OK] 用到的 97 个图标名都能在字体里找到
==== Done. Build with: node tools/build-site.js ====
```

失败会停住并说明是哪一步（见下面「错误对照表」）。

### 2. 日常只用一个命令：出产物

```
node tools/build-site.js
```

产物在 `dist/`，本地预览指向它即可（`python -m http.server` 或 Live Server）。

### 3. 发布

推到 `main` 分支即可，GitHub Actions 会自动构建 + 部署（`.github/workflows/deploy.yml`）。**不用手动传 `dist/`。**

---

## 三、四个 bat 怎么跑

双击即可，也可以右键"在终端中运行"。都会在结尾停住，方便看输出。

| 脚本 | 什么时候用 | 正常结束会看到 | 失败会看到 |
| --- | --- | --- | --- |
| `setup.bat` | **每台新电脑一次**；或环境坏了想重置 | `==== Done. Build with: node tools/build-site.js ====` | 具体哪一步失败（Node/Python/pip） |
| `update-icons.bat` | 手动重新裁剪图标（平时钩子会自动跑，一般不用） | `[OK] Icon subset rebuilt and verified.` | `[FAILED] Subset generation failed ...` |
| `install-hooks.bat` | 重新 clone 仓库后补装钩子（`setup.bat` 已包含） | `[OK] pre-commit hook installed.` | `[X] Not a git repository root` |
| `check-icons.bat` | 只想检查图标名有没有写错（**不需要 Python**） | 三行 `[OK]` | `[X] 图标名不存在 ...` 并指出文件行号 |

> `update-icons.bat` 首次运行如果发现没装 `fonttools`，会自己 `pip install`（十几秒），之后再跑是秒过。

### 命令行等价写法

```bat
node tools\build-site.js            :: 构建
node tools\build-feed.js            :: 重生成 feed.xml
node tools\check-icons.js           :: 图标校验（退出码 0 = 通过）
python tools\subset-icons.py        :: 只重裁图标
```

---

## 四、错误对照表

| 你看到的 | 原因 | 怎么解决 |
| --- | --- | --- |
| `[X] Python not found on this machine.` | 没装 Python，或没加进 PATH | 去 python.org 装，勾 **Add python.exe to PATH**，然后跑 `setup.bat` |
| `... (exit code 9009)` | 命中的是 Windows 的应用商店占位符，不是真 Python | 同上；或用 `py --version` 确认有没有另一个可用的 |
| `[X] 缺少 fonttools（裁剪字体用）` | Python 有了，但两个包没装 | `python -m pip install fonttools brotli`，或跑 `setup.bat` |
| `[FAILED] Could not install fonttools / brotli` | 网络问题，pip 拉不到包 | 换网络/挂代理后重试，或手动执行上面那条命令 |
| `[X] 这些图标名在全量字体里不存在` | 图标名拼错，或用了 4.3.0 没有的图标 | 去 remixicon.com 核对（注意 `-line` / `-fill`），改完重跑 |
| 页面图标空白、控制台无报错 | 加了图标但没重新生成 | 双击 `update-icons.bat` |
| 构建报「图标子集没跟上源码」 | 同上（这是有意的拦截） | 同上，然后重新构建 |
| 提交被钩子拦下 | 同上；或 Python 不可用 | 跑 `update-icons.bat` 成功后再提交 |
| `fatal: not a git repository` | bat 放到别处运行了 | 放回项目根目录的 `tools/` 里再双击 |
| 钩子好像没生效 | 没装，或换了机器 | 跑 `install-hooks.bat` |

**确实要临时绕过钩子**：`git commit --no-verify`（不推荐，线上部署时仍会重新裁剪）。

---

## 五、图标是怎么工作的

页面只加载 `fonts/` 下两个**子集**（约 6 KB 样式 + 7 KB 字体，正好是站内用到的那些）。子集由 `tools/` 里的全量源裁出来：

```
tools/remixicon-src.css + .woff2      ← Remix Icon 4.3.0 全量源（165 KB，不发布）
            ↓  python tools/subset-icons.py
fonts/icons.css + remixicon.woff2     ← 子集（发布，页面实际加载的）
```

**加 / 换图标**：

1. 写 `<i class="ri-xxx" aria-hidden="true"></i>`；
2. 提交（钩子自动生成并带上字体文件）。

等不及钩子就双击 `update-icons.bat`。

**删图标**：删掉 `<i>` 就行；下次生成时字形自动消失（不生成也没坏处，只是多带几 KB）。

**全量源别删**（`remixicon-src.css` / `.woff2`）——以后加图标要从它裁。丢了可以从 git 历史或 `remixicon@4.3.0` 重新取。

---

## 六、脚本清单

| 文件 | 作用 |
| --- | --- |
| `build-site.js` | 按白名单复制到 `dist/`；开头先跑图标校验，不一致就中止 |
| `build-feed.js` | 从 `js/posts-data.js` 生成 `feed.xml` |
| `check-icons.js` | 查 CDN 残留 / 图标名是否存在 / 页面是否漏引 `style.css` |
| `subset-icons.py` | 图标子集生成器（扫全站 `ri-*` → 裁字体 → 重写 `icons.css` → 复核 cmap） |
| `precommit-icons.js` | git 钩子的实际逻辑：暂存区有 `.html/.js` 就先重生成并 `git add` 字体 |
| `hooks/pre-commit` | 钩子入口（两行 sh） |
| `setup.bat` / `update-icons.bat` / `install-hooks.bat` | 见上表 |
| `remixicon-src.css` / `.woff2` | 全量图标源，**别删** |

### 维护备注（改脚本前看）

- bat 的提示文字和注释**一律用英文**：中文控制台是 GBK，UTF-8 中文会被拆成乱码、甚至被当成命令执行。
- bat 行尾统一 **CRLF**（LF-only 的 bat 里 `goto` 标签可能找不到）。
- 判断 Python 用 `python --version` 实测，不要用 `where`。
- Python 脚本可以输出中文（bat 里已设 `PYTHONIOENCODING=utf-8`）。
