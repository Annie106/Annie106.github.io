# AGENTS.md

给在这个仓库里写代码的 AI 工具看的约定。人看的速查是 `README.md`，完整手册是站内 `project_subpage/blog/guide.html`。
`CLAUDE.md` / `.cursorrules` 只是指向本文件的指针，规则一律写在这里，别在那边另开一套。

## 写入时注意 
- 非必要内容不要写进此文档内，以节省token和上下文占用

## 硬前提

- 纯静态博客：原生 HTML + CSS + JS，**运行时零依赖、无后端**，托管在 GitHub Pages。不引框架、打包器、TypeScript、CSS 预处理器。
- 唯一 npm 依赖 `esbuild`，只给 `tools/minify.js` 用。`minifyIdentifiers` 必须 `false`（三处内联 `onclick` 靠全局函数名），`charset` 必须 `utf8`。
- 本地要 **Node 18+**（构建）和 **Python 3.9+**（裁图标子集，需 `fonttools` + `brotli`）。新机器先跑一次 `tools/setup.bat`。
- `dist/` 是产物、已 gitignore，**不要提交**。源码保持「双击就能打开」的原样。
- `js/script.js` 是 SPA 路由核心（视图切换、浏览器返回、滚动恢复），逻辑和历史强耦合。改动前先读相关注释，**不要顺手重构**。

## 五条一改就整页崩的坑

1. `index.html` **不能加 `<base>`**：预加载扫描器在脚本执行前就解析资源，加了全站 404。
2. `body` 末尾的相对 `<script src="js/…">` **必须排在 `script.js` 前面**，否则在 `/posts/<id>/` 下会解析成 `/posts/<id>/js/…`。
3. 运行时拼地址一律用 `siteBaseUrl()`，**不要拿 `location.href` 当基准**。
4. 站内视图激活是 `.active-view`，文章详情才是 `.active`。写成 `.active` 不报错，只会静默不生效。
5. 文章之间翻页用 `replaceState` 不用 `pushState`，否则读十篇要按十次返回。

## 图标：本地子集，禁止 CDN

- `fonts/icons.css` + `fonts/remixicon.woff2` 是从 Remix Icon 4.3.0 裁出来的子集（约 100 个字形、7KB）。`css/style.css` 首行 `@import`，引了 style.css 的页面自动有图标。
- **加图标**：写 `<i class="ri-xxx">` 然后提交，pre-commit 钩子会自动重裁并暂存 `fonts/`；手动补跑 `tools/update-icons.bat`。
- **改完必跑 `node tools/check-icons.js`**（构建已把它设为前置）。图标名写错或忘了重裁**不会报错，只会渲染成空白**。
- **禁止**引 CDN 图标字体。版本刻意停在 4.3.0，别主动升级；真要升就替换 `tools/remixicon-src.*` 再跑 `tools/update-icons.bat`。
- **换了 `favicon.svg` 必须跑 `node tools/make-app-icons.js`**，否则主屏图标还是旧的（同样不报错）。

## 新建页面

- 复制根目录 `_template.html` 改名，按层级改相对路径即可（模板自带 noindex 和 favicon）。
- 只引一行样式表 `<link rel="stylesheet" href="<层级>/css/style.css">`；页面专用样式写页内 `<style>`。**别用根路径** `/css/style.css`（`file://` 打开会失效）。
- `404.html` 是唯一例外：favicon 和内部链接必须用站点根路径（它会被兜到任意 URL 上渲染）。
- 放 `project_subpage/` 里自动发布；根级新文件 / 新目录要加进 `tools/build-site.js` 的 `PUBLISH_FILES` / `PUBLISH_DIRS`。
- 草稿和测试用 `_` 前缀（自动不发布）。不该上线但要正常命名的，写进脚本顶部的 `IGNORE_HTML`——`archive/` 就是这么处理的。

## 改样式

- 全站样式在单文件 `css/style.css`。颜色一律用 CSS 变量，深色在 `[data-theme="dark"]` 里覆盖变量，**不要写死色值**。
- 位移/透明度动画要处理 `@media (prefers-reduced-motion: reduce)`；进出场用 `@keyframes` 不用 `transition`（同一帧的两次样式变更会被合并、整个跳过）。
- 标签胶囊 `.tag-pill` **必须是 `<button>`**，不能是 `<span>`（键盘和读屏要用）。`<body>` 首行的 skip link 和 `#app` 的 `tabindex="-1"` 也别删。
- 文章正文基础字体是 `--font-sans`，别改回 serif（`ul`/`blockquote` 会掉进宋体）；`blockquote` 不要 italic。
- 滚动条只在 `html` 上声明 `scrollbar-width` / `scrollbar-color`（都是继承属性），**不要写 `::-webkit-scrollbar`** —— 祖先非 `auto` 时 Chrome 会忽略它，写了是死代码。
- `index.html` 里 `.boot-loading` 那段内联 `<style>` 不要挪进 `style.css`：它要展示的时刻正是样式表还没下载完的时候。

## 构建与部署

`npm run build` 四步，顺序固定：

1. `build-site.js` —— 图标校验 + 白名单复制（会先清空 `dist/`）
2. `build-comment-counts.js` —— 抓 giscus 真实评论数（要覆盖第 1 步复制过去的空表占位）
3. `build-posts.js` —— `/posts/<id>/` 静态页 + `sitemap.xml` + `robots.txt`
4. `minify.js` —— 压缩，必须最后（否则被复制覆盖）

- 评论数**在构建时抓**：`giscus.app/api/discussions` 的 CORS 只放行它自己，浏览器里请求会被拦。仓库里的 `js/comment-counts.js` 是空表占位，**别把抓下来的数字提交回来**；抓取失败按 0 处理，不能让部署失败。
- `build-site.js` 是发布入口：白名单复制 + 孤儿页检查（有源码没产物就报错）+ `MUST_HAVE` 校验。用白名单是因为漏发会立刻 404，误发却没人察觉。
- ⚠️ **别用 `fs.cpSync` / `fs.rmSync`**：这台机器上前者让 node 静默崩溃（退出码 127、无任何输出），后者被 shim 成回收站操作、偶发失败。脚本里是手写递归复制。
- `.github/workflows/deploy.yml` 在 push 到 main 时构建并发布。**Pages 的 Source 必须是「GitHub Actions」**（只能人工在网页设置）。
- **本地预览指向 `dist/`**：`/posts/<id>/` 只在产物里存在，对着仓库根起服务器点文章会 404。

## 搜索引擎收录：默认全站 noindex

- 开关在 `tools/build-posts.js` 顶部 `ALLOW_SEARCH_INDEXING`；改回 `true` 时还要同步 `index.html` 第 5 行的 robots 标签。
- ⚠️ **`robots.txt` 绝不能写 Disallow**：爬虫进不来就读不到 noindex，已收录的页面永远删不掉。保持 `Allow: /` + `Sitemap:`。

## 文章地址与数据

- 站内文章地址是 `/posts/<id>/`，`?article=N` 只是旧链接别名（打开后自动收敛）。卡片标题是**真链接**（爬虫要实际地址），点击由 JS 拦截，**别去掉那个 `preventDefault`**。
- **正文和元信息在 `posts/*.md`**（每篇一个文件，`---` 里是元信息）。`js/posts-data.js` 是 `tools/build-posts-data.js` 生成的，**不要手改**；改完文章跑一次生成，`npm run build` 已经包含这一步。
- 正文是 Markdown，渲染器是 `js/markdown.js`，**浏览器和构建脚本共用这一份**（构建时静态页也用它渲染）；动手改语法支持时两边会同时变，这是有意的。
- `js/tweaks-data.js`：可增删条目，**不要改字段名**（`script.js` 依赖）。
- `feed.xml` 是生成物，不手改；冲突就重跑 `node tools/build-feed.js` 覆盖。加文章只动 `posts/*.md`。输出必须幂等（`lastBuildDate` 取最新文章日期，别改回 `new Date()`）。
- `isPublic: false` 是「不展示」不是「保密」：`build-posts-data.js` 不下发 `content`、`build-feed.js` 不进 feed、`build-posts.js` 不出静态页，前端 `isArticlePublic()` 再挡列表 / 搜索 / 翻页。仓库是公开的，`posts/*.md` 原文照样能读到。
- 文章页由 `build-posts.js` 从 `dist/index.html` 改出来：`index.html` 改了不用跟，但 `MARK_*` 锚点常量改了必须同步（对不上会构建失败）。模板读入先统一成 LF。

## 各模块一句话

- **首页列表**：切筛选 / 翻页走 `swapPostsList()`，别直接 `innerHTML`；卡片高度保持自然（不固定、不等比化）。
- **图片**：`data-fast-src` / `data-slow-src` 双直链，每张图每天 1 次高速额度。头像走**单独通道**（内联 `onerror`）：**别接进** `image-loading.js`，也不打任何控制台日志。
- **音乐**：模块在 `music/`（**只放资源**：tracks.js/ui.js/core.js/dock.css，**没有 index.html 页面**），音乐页是**站内视图** `/?view=music`（不占导航，直接访问、无跳转，复用博客导航/页脚/主题）。分层：`tracks.js`（数据）+ `ui.js`（卡片 / 迷你条 / 歌单 / 音乐页，**首屏加载**，约 5KB gzip）+ `core.js`（全站唯一 `<audio>`，**第一次点播放才加载**）+ `dock.css`（迷你条样式，同步懒加载）。加歌、换封面只改 `tracks.js`（`src` 要直链且支持 Range；`cover` 不填就画黑胶）。`index.html` 里卡片的首帧文案（第一首标题/歌手/时长）写死了，改第一首记得两处一起改。播放失败统一提示「今日播放额度已用完」——限流是音频服务器的事，前端只负责这句话，别在页面上写额度规则。`music/` 已进 `build-site.js` 的 `PUBLISH_DIRS` 和 `minify.js` 的 `TARGETS`，压缩断言写 `AnnieMusic` / `AnnieMusicUI`。
- **评论**：giscus，term 是「文章 N：标题」。文章页和 `?view=comments` 两处配置要一起改。配色用 `css/giscus-annie-light.css` / `-dark.css`（官方原样，只换输入框聚焦框 —— 新版那条框是 `box-shadow: 0 0 0 2px` 画的，**border-color 和 box-shadow 都要写**）。⚠️ **绝不能把 CSS 的 URL 交给 giscus**：它站在公网 origin，取 localhost 的 CSS 会被 Chrome 的本地网络访问检查拒掉，主题变量一缺编辑器就塌成一片空白。`syncGiscusTheme()` 是同源 fetch 后转 `data:text/css;base64` 塞进去；切主题由 `theme.js` 发 `annie:themechange` 事件，别在 theme.js 里自己算地址。
- **外链确认**：`<a data-confirm-leave="GitHub">` 的弹窗在 `js/leave-confirm.js`，全站一份（`index.html` + 各独立页各自引一行）。**别搬回 `script.js`**：不引 script.js 的页面（guide.html 等）拿不到它，属性静默失效。弹窗建在最顶层同源文档里，内嵌页面（guide.html）也不会跑位。
- **滚动出现**：首页 / 文章列表 / 文章页 / 关于 / 归档的元素滚进视口才淡入上移。隐藏态 `.is-reveal-hidden` **只能由 `script.js` 的 `refreshScrollReveal()` 挂**，CSS / HTML 里预置就是「脚本一挂全站白屏」；新加的站内视图要写进 `REVEAL_TARGETS`。
- **独立页（不引 script.js）**：`article_14_baidu` / `manor_photo` / `guide` 各自引一行 `<script src="../../js/scroll-reveal.js" data-reveal-targets="选择器">`，同一批滚进来的元素再用 `data-reveal-stagger` 错开（全部参数见脚本头部注释）；目标要拆到「段」而不是整个 section，否则一屏只有一两块，看着等于没动画。它被文章页 iframe 内嵌时按**父窗口的滚动**换算（iframe 高度=全文，自己的 viewport 等于全文高度，IO 会判「全部已出现」）；跨域拿不到 `frameElement` 就退回独立页逻辑，全部直接可见，不会坏。
- **`contact.html` / 404 浮窗**：改动前先读这两个文件里的注释——行高、`min-width`、iframe、内联 SVG、高度上报这些坑都记在那儿了。

## 提交前

```bash
node tools/check-icons.js   # 图标名、CDN 残留、页面是否引了 style.css
node tools/build-feed.js    # 动过文章数据后跑（CI 也会跑，本地跑能立刻看 diff）
```

查不到的东西按这个顺序找：`README.md`（速查）→ `tools/README.md`（环境、脚本、报错对照）→ `guide.html`（完整手册）→ 相关文件里的注释。