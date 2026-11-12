# AGENTS.md

给在这个仓库里写代码的 AI 工具（Claude Code、Codex、Cursor、Copilot、WorkBuddy 等）看的约定。
人看的速查是 `README.md`，完整教程是站内「使用指南」`project_subpage/blog/guide.html`。
**动手前先读完这一页，尤其是「图标」和「新建页面」两节。**

> **这里是跨工具唯一的约定来源。** 换一个 AI 工具时，它读不到上一个工具留下的会话记忆（例如 WorkBuddy 的 `.workbuddy/memory/`，那是工具私有目录，别的 agent 不会去读）。所以凡是「以后换谁来写代码也得知道」的内容——选型决策、踩过的坑、不许改的地方、升级流程——都必须落到本文件，只写进某个工具的私有记忆等于没写。

## 这个站是什么

纯静态博客：原生 HTML + CSS + JavaScript，**没有构建步骤、没有 npm 依赖、没有后端**，直接跑在 GitHub Pages 上。

- 不要引入打包器、框架、TypeScript、CSS 预处理器或任何 npm 运行依赖。
- 不要新增构建产物目录。仓库里能直接打开的文件就是线上文件。
- 所有路径都是相对路径（用户站部署在根路径，但本地也可能用 file:// 打开）。

## 图标：只用本地字体，禁止 CDN

这是这个项目最容易写错的地方，请严格遵守：

- 图标字体是 **Remix Icon v4.3.0 的本地副本**，位于 `fonts/`：
  - `fonts/icons.css` —— `@font-face` + 全部 `.ri-*` 规则（约 2900 条，生成物）
  - `fonts/remixicon.woff2` —— 字体文件（约 165 KB）
- `css/style.css` **第一行**用 `@import url('../fonts/icons.css')` 引入它们。因此**任何引了 `css/style.css` 的页面自动拥有图标**，页面不用做任何额外声明。
- **禁止**在任何页面添加指向 `cdn.jsdelivr.net`、`unpkg.com`、`fonts.googleapis.com` 等外部域名图标字体的 `<link>`。历史原因：之前图标只有一个境外 CDN 来源，网络抖动时整站图标会集体消失（表现为图标位置空白或豆腐块），这是本项目已经修掉的 bug，不要重新引入。
- 用法：`<i class="ri-moon-line" aria-hidden="true"></i>`。图标名去 https://remixicon.com 查，本地是 4.3.0 全量（近 3000 个），直接用即可，无需生成任何文件。
- 图标名写错（拼错、后缀漏写、用了更高版本才有的图标）**不会报错，只会渲染成空白**。所以任何涉及图标的改动，结束前必须跑：

  ```bash
  node tools/check-icons.js
  ```

- 不要手动编辑 `fonts/icons.css`（它是生成物）。

### 版本状态：刻意停在 4.3.0，不要主动升级

2026-11-12 核查过，结论是先不升：

- 上游最新是 **4.9.1**，比本地多 338 个图标，woff2 从 162 KB 涨到 185 KB。
- 但 4.3.0 **没有任何功能缺口**：全站用到的 93 个图标都在，`check-icons.js` 三项全绿。
- 4.9.1 只移除了一个 `ri-font-sans`，全站无引用，改名风险为零。
- 所以这**不是"版本太旧待升级"**，是评估后的选择。除非用户明确要求，或者确实要用某个 4.3.0 里没有的图标（比如 AI 相关的 `ri-ai-*`、`ri-openai-*`、`ri-anthropic-*`），否则别动它。

要升级时按这个流程，**五步一步都不能漏**：

1. 取 `remixicon@<版本>` 的 `fonts/remixicon.css` 与 `fonts/remixicon.woff2`。
2. 用上游 css 覆盖 `fonts/icons.css`，但**只保留 woff2 一个 `@font-face`** —— 上游还引了 eot/woff/ttf/svg，本地没这些文件，留着只会在控制台刷一串 404。
3. 改 `fonts/icons.css` 顶部的版本注释（版本号 + 上游发布日期 + 来源链接）。
4. 同步版本号/体积表述到 `AGENTS.md`（本节 + 上面两行）、`README.md`、`project_subpage/blog/guide.html`（目录树里那行 `remixicon.woff2 ← 约 165 KB`）。
5. 跑 `node tools/check-icons.js`，必须全绿。有图标名报错说明新版本删了或改了这个图标，先改页面再提交。

## 新建 HTML 页面

- 首选复制根目录的 `_template.html` 改名，head 已经写对，只需按层级改相对路径。
- 页面 head 最少只要一行样式表：

  ```html
  <link rel="stylesheet" href="<层级>/css/style.css">
  ```

- 不要把 `style.css` 的内容抄进页面。页面专用样式可以在 `<head>` 里写一个 `<style>` 块（`guide.html`、`movie.html`、`thanks.html` 都是这个做法）。
- 相对路径按页面所在目录写，别用根路径 `/css/style.css`（那样用 file:// 本地打开会失效）：

  | 页面位置 | style.css | favicon.svg |
  | --- | --- | --- |
  | 根目录 `index.html` | `css/style.css` | `favicon.svg` |
  | `project_subpage/blog/` | `../../css/style.css` | `../../favicon.svg` |
  | `project_subpage/projects/xxx/` | `../../../css/style.css` | `../../../favicon.svg` |

- 每个页面都要有 `<link rel="icon" type="image/svg+xml" href="<层级>/favicon.svg">`。

## 改样式

- 全站样式在单文件 `css/style.css`（6000+ 行，按注释分节）。改之前先搜类名，沿用已有的类名前缀（`.article-*`、`.comments-*`、`.feedback-view`、`.home-skeleton` 等）。
- **`index.html` 里那个 `.boot-loading` 的内联 `<style>` 是有意的，不要挪进 `style.css`**：它是首屏「正在加载博客数据…」提示条，要展示的时间正是 `style.css` 还在下载的时候；颜色也因此写死、不用 CSS 变量（那时变量还没定义）。深色靠 `[data-theme="dark"]` 覆盖。
- `.boot-loading` 的行为：默认隐藏，**加载超过 3 秒**才由元素后面那段内联计时器加上 `.is-visible`（计时器必须在页面里，不能进 `script.js` —— 真慢的时候 `script.js` 正是还没到的东西）。收起由 `script.js` 的 `hideBootLoading()` 在 `init()` 之后去掉 `.is-visible`，走 0.24s 透明度 + 0.34s 位移的过渡（和 `.site-toast` 同一套缓动）；若刚露脸就加载完，会补足 700ms 最短展示，避免闪一下。另有 15s 兜底定时器。
- 配色一律用 CSS 变量（`--color-bg`、`--color-text-primary`、`--color-border`、`--card-accent` 等），深色模式在 `[data-theme="dark"]` 里覆盖变量，**不要写死色值**，否则深色模式下会失效。
- 新增基于位移/透明度的动画，请一并处理 `@media (prefers-reduced-motion: reduce)`。

### 滚动条：只在 html 上声明一次，不要写 `::-webkit-scrollbar`

- 两个变量管颜色（定义在 `:root`，深色在 `[data-theme="dark"]` 里覆盖）：`--scrollbar-thumb`（常态）/ `--scrollbar-thumb-hover`（鼠标进入滚动区）。都用 `rgba` 不用实色——滑块会压在纯白正文、浅灰代码块、半透明卡片上，实色在深色模式下会透出一块死板的长条。
- `css/style.css`「滚动条」一节里有 `html { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent }`，**新写的滚动区不用再声明任何样式**，自动就是「透明轨道 + 半透明细滑块」。
- ⚠️ 这两个属性都是**继承属性**，会一路传到所有滚动容器。也正因如此，**不要再写 `::-webkit-scrollbar` 那套**：只要祖先上是非 `auto` 的值，Chrome 就会忽略该元素的 webkit 伪元素，写了是死代码。想改宽度就改 `scrollbar-width`，想改颜色就改变量。
- 需要「鼠标进入就提亮」的容器，在 `.search-body:hover` 那条规则后面按同样格式追加类名即可（`scrollbar-color: var(--scrollbar-thumb-hover) transparent`），别写成 `*:hover`——那会让整棵树重算继承值。
- 别再给滚动条写 `background: var(--color-border)`：`#2a2e37` 压在 `#0f1115` 上几乎看不见，深色下等于没有滑块。这正是这次要修的 bug。
- `[data-theme="dark"]` 上还声明了 `color-scheme: dark`，让原生控件（输入框、下拉、日期面板、复选框）和浏览器自带滚动条一起切到深色渲染。新增控件如果写了显式颜色，照旧用变量即可，不用管它。

## 别乱动的地方

- `js/script.js` 是 SPA 式路由核心（`index.html?article=N`、`?view=xxx`、浏览器返回键、滚动位置恢复）。这里的逻辑和历史记录强耦合，改动前先读相关注释，不要顺手重构。
- `js/posts-data.js` / `js/tweaks-data.js` 是数据文件：可以增删条目，但不要改字段名，`script.js` 依赖它们。
- `favicon.svg`、`share_cover.jpg` 被多个页面和分享卡片引用，改文件名要同步全站。

## 订阅源（feed.xml）

- `feed.xml` 是**生成物**，不要手改。源头是 `js/posts-data.js`，用 `node tools/build-feed.js` 生成。
- 线上是自动的：`.github/workflows/feed.yml` 在 push 到 `main` 且改动了 `js/posts-data.js` / `tools/build-feed.js` / 这个 workflow 时，会重跑脚本并把新的 `feed.xml` 提交回来。**所以别再手工改 feed.xml，也别删这个 workflow**。
- 本地改完文章顺手跑一次是好习惯（能立刻看 diff），但不是必须；忘了跑不影响线上。
- 本地那份 `feed.xml` 落后于仓库是**正常状态**：它在你本地没被改过时，`git pull` 会 fast-forward 直接覆盖，不用管。
- 但**别在本地跑完脚本又不提交** —— `feed.xml` 会变成「已修改」，`git pull` 会被 `Your local changes would be overwritten` 挡住。要么连着一起提交（输出幂等，CI 不会重复提交），要么 `git checkout -- feed.xml` 还原。
- 脚本**不需要**跟着文章一起改：加文章只动 `js/posts-data.js`。它输出是幂等的——`lastBuildDate` 取最新文章日期而不是当前时间，同一份数据在本地和 CI 生成的文件逐字节相同，不会打架。别把它改回 `new Date()`。
- 脚本只在沙箱里求值 `posts-data.js`（取 `window.BLOG_POSTS`），不依赖 `script.js`，所以别把文章数据挪到别处，也别改成需要运行时的写法（如 `fetch`）。
- 内容策略是**摘要版**：每篇只有 `excerpt` 一句话 + `media:thumbnail`，不输出 `content:encoded`，正文留在站点上。`excerpt` 为空时退回用标题，别输出空 `description`。
- 别把 `description` 改成塞全文或塞 HTML：纯文本最兼容，各阅读器对 HTML 的处理不一致。要全文得同时加回 `xmlns:content` 命名空间。
- 封面 `media:thumbnail` 三级兜底：`cover` 字段 → 正文首张 `<img>` → 站点封面 `share_cover.jpg`（`tools/build-feed.js` 里的 `FALLBACK_COVER`，设成 `''` 可关）。`cover` 只喂给 feed，页面上不显示。
- `feed.xml` 冲突了（`git status` 里显示 `UU`）**不要手工选边**，也不要用编辑器的「保留当前/传入更改」：直接跑 `node tools/build-feed.js` 覆盖掉带冲突标记的文件，再 `git add feed.xml` 完成合并。脚本输出是确定的，它跑出来的就是唯一正确答案。
- 站内有 `index.html` 的 `<link rel="alternate">` 和页头社交区那个 RSS 图标两处入口，都指向 `feed.xml`，改地址要一起改。

## 提交前自查

```bash
node tools/check-icons.js   # 图标
node tools/build-feed.js    # 动过文章数据后跑，重新生成 feed.xml（CI 也会跑，本地跑能立刻看到 diff）
```

`check-icons.js` 会检查三件事：有没有残留的 CDN 图标引用、HTML/JS 里用到的图标名是否都存在于本地字体、每个用了图标的页面是否引了 `style.css`。有输出就说明有问题。
