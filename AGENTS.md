# AGENTS.md

给在这个仓库里写代码的 AI 工具（Claude Code、Codex、Cursor、Copilot、WorkBuddy 等）看的约定。
人看的速查是 `README.md`，完整教程是站内「使用指南」`project_subpage/blog/guide.html`。
**动手前先读完这一页，尤其是「图标」和「新建页面」两节。**

> **这里是跨工具唯一的约定来源。** 换一个 AI 工具时，它读不到上一个工具留下的会话记忆（例如 WorkBuddy 的 `.workbuddy/memory/`，那是工具私有目录，别的 agent 不会去读）。所以凡是「以后换谁来写代码也得知道」的内容——选型决策、踩过的坑、不许改的地方、升级流程——都必须落到本文件，只写进某个工具的私有记忆等于没写。

## 这个站是什么

纯静态博客：原生 HTML + CSS + JavaScript，**没有 npm 依赖、没有后端**，托管在 GitHub Pages 上。

- 不要引入打包器、框架、TypeScript、CSS 预处理器或任何 npm 运行依赖。唯一的构建步骤是 `tools/build-site.js`，它只做一件事：按白名单把要发布的文件**复制**到 `dist/`。不要把它扩展成打包器（不编译、不转译、不哈希、不压缩）。
- `dist/` 是产物目录，已在 `.gitignore` 里；页面源码仍然是「能直接打开就能看」的原样文件，产物只是同一批文件的副本。见「构建与部署」一节。
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

- 每个页面都要有 `<link rel="icon" type="image/svg+xml" href="<层级>/favicon.svg">`。**`404.html` 是唯一的例外**：它会被 GitHub Pages 兜到任意路径（`/foo/bar`）上渲染，相对写法会解析成 `/foo/bar/favicon.svg` 又 404 一次，所以必须用站点根路径 `/favicon.svg`（和它里面那个「获取联系」链接同一个道理），本地 `file://` 预览则靠页内脚本退回相对地址。2026-11-13 之前这一页整个漏了 favicon，标签页一直没图标。

## 改样式

- 全站样式在单文件 `css/style.css`（6000+ 行，按注释分节）。改之前先搜类名，沿用已有的类名前缀（`.article-*`、`.comments-*`、`.feedback-view`、`.home-skeleton` 等）。
- **文章正文的基础字体必须是 `--font-sans`，别让里面任何子元素继承到 `--font-serif`。** `.article-content` 原来写的是 `var(--font-serif)`，而只有 `p` 和 `h2` 单独覆盖成了无衬线，于是 `ul / ol / li / blockquote` 全跟着落进 `SimSun` —— `--font-serif` 的前三顺位（Noto Serif SC / Songti SC / STSong）在 Windows 上都没有。表现就是正文是雅黑、一进列表和引用突然变成又细又虚的宋体，小字号下锯齿特别重。2026-11-13 已把基础字体改成 sans 修掉。**注意这是「基础值错了、靠个别元素打补丁」造成的**，以后加 `table`、`dl`、`figure` 之类的新块级元素，基础值对了才自动没问题；要是哪天把基础字体改回 serif，这些新元素会一起变宋体。
- 同理，**`blockquote` 不要写 `font-style: italic`**：中文没有真正的斜体，浏览器是把整个字形斜着拉出来的，笔画会发糊、末端发虚，和正文字重也对不上。靠左边线 + `--color-text-secondary` 区分就够了（已改成 `normal`）。
- 字体栈 `--font-sans` 的顺序是 `PingFang SC → HarmonyOS Sans SC → MiSans → Noto Sans SC → Microsoft YaHei`，前面几个字形更圆润，但 Windows 默认只会有雅黑。**这是「装了就用、没装就回落」，不是引入 web 字体** —— 中文 web font 动辄几 MB，纯静态站不现实，也别为了「圆一点」去引 CDN 字体。
- **`index.html` 里那个 `.boot-loading` 的内联 `<style>` 是有意的，不要挪进 `style.css`**：它是首屏「正在加载博客数据…」提示条，要展示的时间正是 `style.css` 还在下载的时候；颜色也因此写死、不用 CSS 变量（那时变量还没定义）。深色靠 `[data-theme="dark"]` 覆盖。
- `.boot-loading` 的行为：默认隐藏，**加载超过 3 秒**才由元素后面那段内联计时器加上 `.is-visible`（计时器必须在页面里，不能进 `script.js` —— 真慢的时候 `script.js` 正是还没到的东西）。收起由 `script.js` 的 `hideBootLoading()` 在 `init()` 之后加 `.is-leaving`（`@keyframes bootOut`），380ms 后把两个类一起摘掉；若刚露脸就加载完，会补足 700ms 最短展示，避免闪一下。另有 15s 兜底定时器。
- 进出**都用 `@keyframes`（`bootIn` / `bootOut`），不要改回 `transition`**：退场是「加一个类 + 删另一个类」，两次样式变更可能落在同一帧被合并，transition 会被整个跳过——表现就是弹窗「啪」地消失、没有淡出。`.site-toast` 重播入场时踩过同一个坑。
- 配色一律用 CSS 变量（`--color-bg`、`--color-text-primary`、`--color-border`、`--card-accent` 等），深色模式在 `[data-theme="dark"]` 里覆盖变量，**不要写死色值**，否则深色模式下会失效。
- 新增基于位移/透明度的动画，请一并处理 `@media (prefers-reduced-motion: reduce)`。
- ⚠️ **站内视图（`?view=xxx`）激活时挂的类是 `.active-view`，文章详情才是 `.active`。** 想按「当前在哪个视图」写规则，选择器必须是 `#view-comments.active-view ~ .site-footer` 这种；写成 `.active` 不会报错，只会**静默不生效**（2026-11-13 踩过一次，靠无头 Chrome 量 `getBoundingClientRect` 才发现）。
- 「评论视图」（`?view=comments`）的底栏 `.comments-view-bottombar` 有两处特调，别顺手删：① 行里的 `.back-link` 要把自带的 24px `margin-bottom` 清 0，否则行盒被撑高 24px、文字顶到行首而按钮仍居中；② 视自身 `padding-bottom: 0`，底部间距由 `#view-comments.active-view ~ .site-footer { margin-top: 20px }` 统一给，保证分割线到这一行、这一行到页脚分割线**都是 20px**。

### 滚动条：只在 html 上声明一次，不要写 `::-webkit-scrollbar`

- 两个变量管颜色（定义在 `:root`，深色在 `[data-theme="dark"]` 里覆盖）：`--scrollbar-thumb`（常态）/ `--scrollbar-thumb-hover`（鼠标进入滚动区）。都用 `rgba` 不用实色——滑块会压在纯白正文、浅灰代码块、半透明卡片上，实色在深色模式下会透出一块死板的长条。
- `css/style.css`「滚动条」一节里有 `html { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent }`，**新写的滚动区不用再声明任何样式**，自动就是「透明轨道 + 半透明细滑块」。
- ⚠️ 这两个属性都是**继承属性**，会一路传到所有滚动容器。也正因如此，**不要再写 `::-webkit-scrollbar` 那套**：只要祖先上是非 `auto` 的值，Chrome 就会忽略该元素的 webkit 伪元素，写了是死代码。想改宽度就改 `scrollbar-width`，想改颜色就改变量。
- 需要「鼠标进入就提亮」的容器，在 `.search-body:hover` 那条规则后面按同样格式追加类名即可（`scrollbar-color: var(--scrollbar-thumb-hover) transparent`），别写成 `*:hover`——那会让整棵树重算继承值。
- 别再给滚动条写 `background: var(--color-border)`：`#2a2e37` 压在 `#0f1115` 上几乎看不见，深色下等于没有滑块。这正是这次要修的 bug。
- `[data-theme="dark"]` 上还声明了 `color-scheme: dark`，让原生控件（输入框、下拉、日期面板、复选框）和浏览器自带滚动条一起切到深色渲染。新增控件如果写了显式颜色，照旧用变量即可，不用管它。

## 地址栏里不留 index.html

用户明确要求主页地址就是 `https://annie106.github.io/`，不要出现 `/index.html`。2026-11-13 落地。

- `script.js` 的 `normalizeHomeUrl()` 在 `init()` 第一行执行：把 `/index.html` 收敛成 `/`，`?article=` / `?view=` 等参数一个不动，`history.state` 也照旧。所以从站外链接、404 兜底、子页面跳回来，落地瞬间地址栏就是干净的。
- ⚠️ **`file://` 下这个函数直接 return，别"顺手"删掉这个判断**：本地把 `index.html` 换成目录，浏览器会去列目录而不是渲染页面，预览反而打不开。
- 新生成的 URL 一律用**查询串形式**（`?article=N`、`?view=xxx`），让 pathname 保持当前值：
  - `buildFeedbackUrl()` 返回 `'?' + params`，不拼 `index.html`
  - `tools/build-feed.js` 的 `articleUrl()` 返回 `https://annie106.github.io/?article=N`
  - `404.html` 的兜底跳转写 `/?`，不是 `/index.html?`
- 页面里现存的 `href="index.html?view=xxx"` **可以保留**：SPA 会拦下点击（不产生导航），真有整页跳转也会被 `normalizeHomeUrl` 收敛。但新建页面时优先写查询串，别主动加文件名。
- `syncUrlWithView()` 只改 query、**原样保留 pathname** —— 所以入口的 pathname 决定了之后所有地址栏形态。别把它改成拼接死路径。
- 验证手法：起本地 http server，用临时页 iframe 读 `contentWindow.location` 对比 `pathname + search`。**每个用例必须用独立的 `--user-data-dir`**，否则 `sessionStorage` 里的「上次所在视图」会污染下一个用例 —— 表现是 `/` 被改写成 `/?view=about`，看着像 bug，其实是视图记忆（`readViewState`）。

## 别乱动的地方

- `js/script.js` 是 SPA 式路由核心（`/?article=N`、`?view=xxx`、浏览器返回键、滚动位置恢复）。这里的逻辑和历史记录强耦合，改动前先读相关注释，不要顺手重构。
- `js/posts-data.js` / `js/tweaks-data.js` 是数据文件：可以增删条目，但不要改字段名，`script.js` 依赖它们。
- `favicon.svg`、`share_cover.jpg` 被多个页面和分享卡片引用，改文件名要同步全站。
- **发布走自建构建，不再让 Pages 跑 Jekyll。** 详见下面「构建与部署」一节。

## 构建与部署：自己生成产物，GitHub 只负责托管

2026-11-13 之前是「Pages 直接吃仓库根目录 + 用 `_config.yml` 的 `exclude` 挡开发文件」。现在改成自己构建。

- **`tools/build-site.js` 是唯一的发布入口。** 它按**白名单**把该发布的文件复制到 `dist/`，开发文件一个都进不去。用白名单而不是黑名单：漏发一个页面会立刻 404、当场发现；误发一个开发文件（`AGENTS.md`、`tools/`）往往没人察觉。
  - 白名单在脚本顶部：`PUBLISH_FILES`（根级文件）+ `PUBLISH_DIRS`（目录）。新页面只要落在 `project_subpage/`、`archive/` 这些已列目录里就**自动带上，不用改脚本**；只有新增**根级文件**（`robots.txt`、`sitemap.xml`、根目录的 `about.html`）或**根级新目录**（`assets/`）才需要加。
  - **不想发布的内容，用下划线前缀。** 以 `_` 或 `.` 开头的文件和目录一律不进产物（`_draft.html`、`_notes/`、`.env`），`.md` / `.markdown` 也不进。这一条比改脚本重要：白名单里的目录是**整份递归复制**的，放在 `project_subpage/blog/` 下的任何文件都会被发出去 —— 包括草稿页和笔记，而 orphans 检查拦不住它们（在产物里确实存在）。静态站没有访问控制，进了 `dist/` 就等于公开，所以只能在「不发出去」这一层解决。
  - **漏加会被拦下来。** 脚本会扫仓库里所有 `.html` 和产物逐一比对，发现「有源码、没进产物」的页面就直接报错退出并点名文件 —— 因为这种漏发在构建时不会暴露，只会在线上变成 404，是最难自己发现的一类问题。确实不该上线的页面优先用下划线前缀；不以下划线命名的例外写进脚本顶部的 `IGNORE_HTML`（目前只有 `_template.html`，其实已被 `_` 规则覆盖，留作示例）。
  - 脚本末尾还有一组 `MUST_HAVE` 校验，产物缺关键文件同样直接报错退出，不会发出一份残站。
- **`.github/workflows/deploy.yml`** 在 push 到 main 时执行构建，再用 `upload-pages-artifact` + `deploy-pages` 发布 `dist/`。**Pages 的 Source 必须设成「GitHub Actions」**（Settings → Pages），否则部署步骤会失败 —— 这一步只能人工在网页上改，代码改不了。
  - 推荐的切换顺序：① 先 push 代码（此时 Source 还是分支发布，站点照常由 Jekyll 提供，只是 Actions 部署那步会失败）→ ② 去 Settings 把 Source 改成「GitHub Actions」→ ③ 在 Actions 页面手动 Run 一次「部署站点」。反过来先改 Source 会出现一段「还没有任何产物」的 404 空窗。
- **`dist/` 进 `.gitignore`，不要提交。** 它是产物不是源码。本地想看线上效果：`node tools/build-site.js`，然后起静态服务器指向 `dist/`。
- ⚠️ **这台机器上 `fs.cpSync` 和 `fs.rmSync` 都不要用。**
  - `cpSync`：Windows + Node 22.22 下会让 node 进程直接崩掉 —— **没有任何报错、退出码 127、stdout 全空**，只复制了前面几个文件，排查极费时间。
  - `rmSync`：被工具链 shim 成「移到回收站」，回收站操作偶尔抛 `Some operations were aborted`，整个构建失败，而报错内容和站点毫无关系，极易误判成脚本逻辑错。
  - 所以 `build-site.js` 里是手写递归复制 + 逐项 `unlinkSync` / `rmdirSync` 清空。别"优化"回这两个 API。
- `_config.yml` 是分支发布时代的遗留，现在**不起作用**（Pages 不再跑 Jekyll，也不会看它的 exclude）。留着只是万一要切回分支发布时还有个兜底；确认 Actions 部署稳定后可以删。
- 注意这是「构建规则由你定、执行交给 CI」，不是「本地整站打包上传」。GitHub Pages 没有手动上传产物的入口，只有分支发布或 Actions 发布两条路。如果哪天要求构建也完全在本地完成，做法是本地生成 `dist/` 再推到 `gh-pages` 分支、Source 选那个分支 —— 但那样容易漏跑脚本导致线上是旧内容，除非明确要求，别改。

## 「获取联系」页与 404 浮窗

`project_subpage/blog/contact.html` 是一张**双形态**的页面，`404.html` 里的浮窗是它的第二个入口。改这两处前先读这一节。

- 页面内容是四张联系方式卡片：**微信 `sossil`、QQ `3810710631`（这两张点了复制号码）+ 主邮箱 `anniedv106@gmail.com`、备用邮箱 `anniedv106@126.com`（这两张是 mailto）**，外加一行回复时效说明。版面是**两竖列**：左列微信 / QQ（`.contact-channel-group`），右列两个邮箱；窄屏时每列各自落下，顺序还是 微信 → QQ → 邮箱 → 备用邮箱，别再改回 2×2 那种「微信|QQ 一行、邮箱|备用 一行」。⚠️ 卡片是 `<button>`（微信/QQ）和 `<a>`（邮箱）混用的，**`.contact-channel` 上的 `line-height: 1.5` 不能删**：button 不继承 `body` 的 1.7、a 会继承，删掉两列卡片高度差 8px，右边整体比左边高一截。**`.contact-channel-group` 和 `.contact-channel` 上的 `min-width: 0` 也不能删**：栅格项默认 `min-width: auto`，邮箱那列会把容器顶宽几像素，手机底部就冒出一条横向滚动条（320px 宽实测会多出 4px）。复制走的是「谁带 `data-copy` 就复制谁、`data-copy-toast` 决定提示语」的委托写法，**加一条联系方式只要多写一张卡片，不用改 JS**。**不要再往里加表单**：2026-11-12 按用户要求删掉了原来的 web3forms 留言表单，投稿/反馈统一走站内的 `/?view=feedback`。
- 独立访问 = 完整页面（带 `// Contact` 页头、“获取联系”大标题）。
- 加 `?embedded=1` = 浮窗形态：JS 在 `<head>` 里就给 `<html>` 加上 `.is-embedded`，只做两件事——**隐藏 `.contact-hero`、收紧上下内边距**。标题由浮窗自己的标题栏给。
- ⚠️ **这一页的 `<head>` 不要加 `<meta name="color-scheme" content="light dark">`，文档背景也不要设成 `transparent`。** 两个坑叠在一起出过一次真实的翻车：meta 让浏览器按**系统偏好**决定画布配色，而站内的深浅色是 `data-theme` 说了算，两边不一致时（系统深色 + 站内浅色）画布被涂成近黑、浅色内容直接画在深色底上，深色标题几乎看不见；再叠加透明底，连“自己的底色”都没有了。现在的写法是 `html { color-scheme: light }` 把 UA 层钉死在 `data-theme` 上（深色仍由 `style.css` 的 `[data-theme="dark"]` 接管），并让页面自己铺 `--color-bg`。404 的 `--panel-bg` 取值和它一致，所以照样无缝。
- 404 的浮窗用 **iframe** 装它，不是把内容抄一份进 404。理由：那页要引 `css/style.css`、要带自己的复制逻辑，iframe 让两套东西互不干扰；代价是 **404 页不引 `style.css`，所以浮窗外壳里的图标一律不能用 `<i class="ri-*">`**（字体不在）。现有那个 × 是内联 SVG 画的。
- 关闭有四条路：右上角 ×、点遮罩、Esc、浏览器返回。前三条走 `closeModal()`，最后一条靠打开时 `pushState` 撑的记录 + `popstate`。**别删那个 `pushState`**——否则手机上按返回键会直接离开 404 页，而不是关浮窗。
- **框的高度按内容收，不是写死的**：`contact.html` 在浮窗形态下把 `document.documentElement` 的高度用 `postMessage({ type: 'annie-contact-height' })` 报给父页，父页写进 `iframe.style.height`；`.contact-panel` 只有 `max-height` 封顶。所以浮窗里 `body` 的 `min-height: 0` 不能删——留着 `style.css` 的 `100vh` 就永远量出「和 iframe 一样高」，框缩不回去。**也别给 `.contact-frame` 加 `opacity` 淡入**：起始帧卡住时整个框就是一片空白，现在用的是 `visibility` 一步切到位（实测见过卡帧）。
- 主题：`contact.html` 自己读 `localStorage` 的 `annie-theme`，同时接受父页面 `postMessage({ type: 'annie-theme' })`，两处都在 `<head>` 里。
- **浮窗底色用 `--panel-bg`（白 / `#0f1115`），不是 404 自己的 `--card`**：框里那页用的是 `style.css` 的变量，底色要是跟 `--card`（深色 `#1e1e23`）对齐，卡片会比背景更暗，观感是反的。
- **加载态是骨架，不是转圈**（2026-11-13 换的）。`.contact-loading` 里铺了一层形状照 `contact.html` 抄来的骨架：两列四卡（卡高 77、图标圈 38、gap 12）+ 底部两行说明条，光带 1.4s 一轮。四个要点：
  1. **数值是照 `contact.html` 抄的，改那页布局必须同步这里**，否则加载完会跳一下。`.contact-frame` 的占位高度也跟着骨架走（桌面 272 / 窄屏 450），**别改回写死的 420** —— 两列真实内容只有 283 高，420 会让面板加载完突然矮一大截。
  2. **骨架是 `position: absolute`，高度靠 iframe 撑着**。没有 iframe 时会塌成 0 高（调试时把 `hidden` 去掉单独看骨架就会遇到），这不是样式没生效。
  3. **撤骨架和加 `is-ready` 必须在同一帧**（都放进 `load` 后那 60ms 的 setTimeout）。拆成两步会有 60ms 白屏；以前转圈时看不出来，换成一整块骨架就很显眼。
  4. 扫光只扫在卡片这一层（`::after` 盖过内部的圈和横条），底色比面板深一档才有对比度；深色下光带只给 `rgba(255,255,255,.07)`，再高就是一块刺眼的亮斑。
- 404 里那个 `<a href="/project_subpage/blog/contact.html">` **必须是站点根路径**：404.html 会被 GitHub Pages 兜到任意路径（`/foo/bar`）上渲染，相对地址会跟着假路径走成 `/foo/project_subpage/...`，又是一次 404。只有 `file://` 预览才在 JS 里退回相对地址。
- **这一页的图标是内联 SVG，刻意不用图标字体**（2026-11-13 改）。统一写成 `<svg class="ci" viewBox="0 0 24 24">`，`.ci` 给 `fill: currentColor` + `width/height: 1em`，颜色和尺寸自动跟随所在位置的 `color` / `font-size`，和原来 `<i class="ri-*">` 的表现一致。**别改回 `<i class="ri-*">`，也别在 `<head>` 里加回 `remixicon.woff2` 的 preload**。原因：web 字体在 Chrome 里会拖住窗口的 `load` 事件，而浮窗正是等 iframe 的 `load` 才露脸——本地把 woff2 延迟 2 秒，`DOMContentLoaded` 34ms、`loadEventEnd` 却是 2035ms，用户盯着转圈的全是那个 165 KB 字体。改完这页传输量 243 KB → 80 KB。⚠️ preload 是无条件下载的，当初改完 SVG 后发现字体还在被请求，就是漏了删那条 preload，别再装回去。加图标时从 `remixicon@4.3.0/icons/<分类>/<名字>.svg` 抄 `<path d="...">`：`wechat-fill` / `qq-fill` 在 `Logos/`、`mail-fill` / `mail-send-fill` 在 `Business/`、`file-copy-line` 在 `Document/`、`arrow-right-up-line` 在 `Arrows/`、`time-line` 在 `System/`。
- **404 页 `load` 之后会预热这四个文件**（`PREFETCH` 数组，逐个列是因为 prefetch 不递归）。实测本地每响应延迟 200ms 模拟跨境 RTT：预热后 iframe 子资源 213ms → 5ms，整体 447ms → 234ms。⚠️ **只有子资源能命中，iframe 的 HTML 文档那一次请求复用不了缓存**——`prefetch`、`prefetch as="document"`、`fetch()` 三种都试过，结果一样，别指望点了是 0 等待。以后这一页新增外链脚本 / 样式，记得同步往上加，少一个就多一次往返。`navigator.connection.saveData` 为真时跳过预取。

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
