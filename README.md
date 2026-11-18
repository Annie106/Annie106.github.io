# Annie 的个人博客

> 由 AI 辅助构建

原生 HTML + CSS + JavaScript 的静态博客）。构建是四步：`build-site.js`（校验图标 + 按白名单复制到 `dist/`）→ `build-comment-counts.js`（抓每篇文章的真实评论数）→ `build-posts.js`（每篇文章的 `/posts/<id>/` 静态页 + `sitemap.xml` + `robots.txt`）→ `minify.js`（压缩产物里的 JS/CSS）。一键：`npm run build`。

完整配置教程在站内「使用指南」文章（`project_subpage/blog/guide.html`），本文件只做速查。

## 依赖（本地构建）

在本地跑 `npm run build` 需要下面这些。

| 依赖 | 版本 | 用途 | 缺了会怎样 | 怎么装 |
| --- | --- | --- | --- | --- |
| **Node.js** | 18+ | 跑 `tools/*.js`：构建、图标校验、git 钩子 | 任何构建命令都跑不起来 | [nodejs.org](https://nodejs.org/) 装 LTS |
| **npm** | 随 Node 附带 | 装下面那个 esbuild | 压缩那步会被跳过，其余步骤照常 | 装 Node 就有 |
| **esbuild** | 0.28.x | 压缩 `dist/` 里的 JS/CSS（gzip 约省一半） | `minify.js` 报错退出，产物偏大一倍 | `npm install` |
| **Python** | 3.9+ | 裁图标子集：用到哪些 `ri-*` 就只保留哪些字形 | **提交被钩子拦下，`build-site.js` 也中止** | [python.org](https://www.python.org/) |
| **fonttools** | 4.x | 读 / 写字体文件（上一条的实现） | 同上 | `python -m pip install fonttools` |
| **brotli** | 1.x | 生成 woff2 的压缩算法 | 同上 | `python -m pip install brotli` |

一次装完：

```bash
# Node 装好之后，在仓库根跑一次
npm install

# Python 装好之后
python -m pip install fonttools brotli
```

确认都到位：

```bash
node --version                        # v18.x 以上
npm --version
python --version                      # 3.9 以上
python -c "import fontTools, brotli"  # 没有任何输出 = 装好了
npm ls --depth=0                      # 应该只有一行 esbuild
```

## 目录

```text
index.html                  入口：首页 / 文章列表 / 文章详情 / 电影 / 关于
movie.html                  独立视频页（列表见 VIDEO_LIST）
404.html                    找不到页面时的提示 + 旧链接兜底；「获取联系」浮窗也在这里
favicon.svg                 站点图标
manifest.webmanifest        添加到手机主屏的清单（名称、图标、启动方式）
images/apple-touch-icon.png 主屏图标 180×180，由 tools/make-app-icons.js 从 favicon.svg 生成
images/icon-192.png         主屏图标 192×192（同上）
images/icon-512.png         主屏图标 512×512（同上，兼作 maskable）
share_cover.jpg             分享卡片封面，1080×1080
images/manor_photos/        照图集
css/style.css               全部样式与响应式
fonts/icons.css             图标字体样式（由 style.css 引入的生成物）
fonts/remixicon.woff2       图标字体子集，约 7 KB（只含用到的图标）
新建文章.bat                双击写新文章：问标题和标签，建好 posts/<id>-<标题>.md 并打开
重新构建.bat                双击重新构建：默认构建一次，也可以选「持续监听」自动重建
_template.html              新建页面时复制这份，head 已经引对了样式
feed.xml                    RSS 订阅源，由 tools/build-feed.js 生成
.github/workflows/feed.yml  push 文章数据时自动重建并提交 feed.xml
.github/workflows/deploy.yml 跑构建并把 dist/ 发布到 GitHub Pages
tools/check-icons.js        图标自检：CDN 残留、图标名是否存在、页面是否引了样式
tools/make-app-icons.js     从 favicon.svg 栅格化出主屏 PNG 图标（改了图标才需要跑）
tools/subset-icons.py       裁图标子集（扫 ri-* → 生成 fonts/ 下两个文件）
tools/precommit-icons.js    提交前自动重生成图标（由 git 钩子调用）
tools/setup.bat             新机器初始化：查环境、装依赖、装钩子
tools/update-icons.bat      手动重裁图标（平时钩子会自动跑）
tools/install-hooks.bat     只装 git 钩子（setup.bat 已包含）
tools/remixicon-src.*       图标全量源（不发布，别删）
tools/build-posts-data.js   由 posts/*.md 生成 js/posts-data.js（构建第一步）
tools/new-post.js           新建 / 导入一篇文章（生成 posts/<id>-<标题>.md）
tools/html-to-md.js         把写在 content 里的旧 HTML 正文转成 Markdown（迁移用）
tools/build-feed.js         从 js/posts-data.js 生成 feed.xml
tools/build-site.js         校验图标 + 按白名单生成 dist/（构建第一步）
tools/build-comment-counts.js 抓 giscus 的真实评论数写进 dist/js/（第二步）
tools/build-posts.js        生成每篇文章的静态页 + sitemap.xml + robots.txt（第三步）
tools/minify.js             压缩 dist/ 里的 JS 和 CSS（第四步，需要 npm install）
package.json                唯一的 devDependency：esbuild（只给 minify 用）
tools/README.md             上面这些怎么用、报错怎么修
dist/                       发布产物，已 gitignore，由上面几个脚本生成
AGENTS.md                   给 AI 工具的项目约定，跨工具生效
posts/                      文章本体：每篇一个 Markdown 文件（前置元信息 + 正文）
js/posts-data.js            由 posts/*.md 生成的文章数据（**不要手改**）
js/markdown.js              正文的 Markdown 渲染器，浏览器和构建脚本共用这一份
js/script.js                筛选、搜索、路由、页面状态
js/tweaks-data.js           博客更新记录（首页「本周折腾」+ 独立页共用）
js/theme.js                 深色模式
js/touch-hover.js           触屏悬停修正
js/background-music.js      首页背景音乐
js/copyToClipboard.js       联系方式复制
js/image-loading.js         图片占位、清晰化与高速/慢速直链（每张图每天 1 次高速）
project_subpage/blog/       站点页：contact / guide / submission / thanks / 文章内嵌页 ...
project_subpage/projects/   项目页：appeal-guide ...
archive/                    留档的旧文件，不进产物（构建白名单里没有这个目录）
```

## 功能

- 导航五个视图：首页、文章列表、归档、电影、关于（另有文章详情、「本周折腾」、「问题反馈」、「提交成功」四个不占导航的视图），移动端自适应
- 标签筛选，支持置顶文章；首页「最新 / 全部 / 置顶 / 随笔」都支持原地分页（「全部」每页 8 篇，其余每页 6 篇，带上一页 / 页码 / 下一页）
- 全站搜索（<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd>）：搜标题、摘要、标签、正文；多关键词按「与」匹配，命中高亮，空状态给最近搜索与标签入口
- 文章卡片「⋯」菜单支持三类：站内文章、独立页面（`externalPage`）、自定义链接（`link`）
- 文章可内嵌独立 HTML（`embeddedPage`），自动调高并跟随主题
- 每篇公开文章使用 Giscus 展示 GitHub Discussions 评论；博客启动时会低优先级预载 Giscus 脚本和连接，打开文章时再加载对应讨论；文章卡片的「查看评论」切到站内评论视图（`/?view=comments`），讨论串按文章 ID 区分；仓库需启用 Discussions 并安装 Giscus App
- 每个标签都有落地页 `/tags/<标签>/`：构建时生成真页面，能单独分享，也进 sitemap
- 文章地址形如 `/posts/<id>/`（站内点卡片、分享、RSS、sitemap 全用它）；旧链接 `/?article=<id>` 仍然可用，打开后自动换回新地址。地址栏不留 `index.html`（启动时自动收敛成根路径）
- `isPublic: false` 关闭单篇正文，改为 `true` 恢复
- 页面状态记忆：离开文章、切标签、关页后返回，恢复视图与滚动位置
- 文章底部有「上一篇 / 下一篇」，按发布日期排序（置顶不参与顺序）；标签里带日期，避免对方向产生歧义
- 长文辅助：正文小标题自动变成目录（桌面端右侧常驻、手机端折叠卡片，滚动时高亮当前一节，可单独分享某一节）；顶部阅读进度条；正文小 / 中 / 大三档字号，选择会被记住
- 文末「相关文章」按标签重合度推荐（共同标签数 → 主标签是否相同 → 日期），没有重合标签就整块隐藏，不拿最新几篇硬凑
- 支持「添加到主屏」：manifest + 三张 PNG 图标，安卓和 iOS 各有对应的图标尺寸
- 正文链接加 `class="gated-link"` 后点击弹出「链接已停止访问」提示
- 独立视频页：侧边播放列表、加载动画、水印，附验证码 / 地区限制 / 解码失败等错误提示
- 点击图标复制微信号、QQ 号、邮箱
- 反馈表单：文章问题、Bug、功能建议、排版样式、其他
- 「获取联系」页（`project_subpage/blog/contact.html`）：微信号 / QQ 号一键复制、主邮箱 + 备用邮箱；404 页点「获取联系」时以浮窗形式加载它，支持 Esc / 遮罩 / 右上角 × / 浏览器返回四种关闭方式

## 修改

| 想改什么 | 改哪里 |
| --- | --- |
| 姓名、简介、头像、联系方式、关于页 | `index.html` 与 `js/script.js` 的 `siteConfig` |
| 写新文章 | 双击根目录 `新建文章.bat`，或 `node tools/new-post.js "标题" --tags 随笔` |
| 改完要重新构建 | 双击 `重新构建.bat`（约 2 秒）；想边改边看就选里面的「持续监听」 |
| 文章 | `posts/*.md`（正文和元信息都在这里，改完跑 `npm run build`） |
| 置顶 | 改那篇 md 里的 `pinned`（默认 `false`，改成 `true` 即可） |
| 置顶 | 改那篇 md 里的 `pinned`（默认 `false`，改成 `true` 即可） |
| 文章卡片菜单 | `js/script.js` 的 `articleMenus`（按文章 id） |
| 背景音乐 | `js/background-music.js` 的 `musicList` |
| 视频列表 | `movie.html` 的 `VIDEO_LIST` |
| 样式 | `css/style.css` |
| 图标 | 直接写 `<i class="ri-xxx"></i>`，字体已在本地 |
| 分享封面 | 换图后同步 `index.html` 里的三处地址与宽高 |

### 新建独立 HTML 页面

直接复制 `_template.html` 改名，或只在 `<head>` 里引主样式：

```html
<link rel="stylesheet" href="../../css/style.css">
```

**只需要这一行。** 引了 style.css，正文、标题、按钮和表单控件就会默认使用博客字体与主题变量，也能直接复用文章页的 `.article-topbar`、`.article-bottombar`、`.back-link`、`.article-feedback`、`.divider-thin` 等 UI 样式。

图标字体（Remix Icon）也在这一行里：`fonts/` 下的是**从全量 4.3.0 裁出来的子集**（只含站内用到的图标，约 7 KB），由 `style.css` 顶部的 `@import` 带进来，所以不需要、也不要再引任何 CDN 图标样式表（那会让图标在 CDN 抖动时整片消失）。图标名去 [remixicon.com](https://remixicon.com/) 挑；**换了字体里没有的新图标，要双击 `tools/update-icons.bat` 重新生成**（全量源在 `tools/remixicon-src.*`）。名字拼错或忘了重新生成都不报错、只显示空白，所以改完跑一次检查——**双击根目录的 `check-icons.bat`**，或在项目目录里执行：

```bash
node tools/check-icons.js
```

站点的顶部导航是一条**通栏、吸顶的半透明磨砂条**（`background` 给 64% 不透明白 + `backdrop-filter: blur(20px)`，页面一开始滚动时由 JS 给 `.site-header` 加 `.is-scrolled` 把底色压实到 78%，保证内容经过时文字仍清楚；不支持背景模糊的浏览器退回 96% 实底）：它在 HTML 里位于 `.main-container` 之外，样式靠「宽度加回左右留白 + 等量负 margin」顶到视口两侧，再用内边距让内容与 1080 主体容器对齐。条带高、控件高、导航胶囊高由 `:root` 里的 `--header-h` / `--header-control` / `--nav-h` 三个令牌统一控制（移动端在 `@media (max-width: 600px)` 里覆盖前两个），改它们即可整体缩放；需要给「顶部让位」的浮层（如音频提示条）读 `--header-h` 即可，别写死数字。

几个注意点：

- 分享封面必须写绝对地址，如 `https://annie106.github.io/share_cover.jpg`；相对路径抓不到，带 Referer 鉴权的 CDN 也抓不到。
- **全站 `noindex`**：页面能访问、能分享（卡片正常），但不出现在搜索结果里。开关在 `tools/build-posts.js` 顶部的 `ALLOW_SEARCH_INDEXING`，改回 `true` 时记得同步 `index.html` 里那条 robots 标签
- 每篇文章有独立的静态页 `/posts/<id>/`，微信和爬虫抓得到标题、摘要、正文；封面默认仍共用 `share_cover.jpg`，想换就在文章数据里加 `cover`。
- 改文章 `id` 会让已分享的链接失效。
- 首页标签：`最新` / `全部` 由 `renderTagPills` 固定，其余由 `HOME_TAGS` 决定；分页每页 8 篇（`HOME_PAGE_SIZE`）或 6 篇（`HOME_POST_LIMIT`），超过一页才出现控件。
- 移动或重命名子页面后，同步 `embeddedPage` 与 `articleMenus` 的路径。

## 本地预览

两种，看你要预览什么：

**① 只看站点（改文章、调样式）** —— 对着仓库根：

```bash
python -m http.server 8000
```

访问 <http://localhost:8000>，或直接打开 `index.html`。背景音乐需用户交互后才能播放。

**② 看线上那一份（含文章专属地址 `/posts/<id>/`）** —— 先构建，再指向 `dist/`：

```bash
npm run build
cd dist && python -m http.server 8000
```

⚠️ `/posts/<id>/` 只存在于 `dist/` 里。对着仓库根起服务器，站内点进文章会 404 —— 这不是 bug，是产物没生成或服务器指错了目录。

## 部署

自己构建，GitHub 只负责托管。

```bash
npm install                        # 只需一次：装 esbuild（压缩用）
node tools/build-site.js           # 第一步：生成 dist/，白名单在脚本顶部
node tools/build-comment-counts.js # 第二步：抓真实评论数（会联网，失败按 0 处理）
node tools/build-posts.js          # 第三步：生成文章静态页 + sitemap + robots
node tools/minify.js               # 第四步：压缩 dist/ 里的 JS 和 CSS
```

- 该发布的文件由 `tools/build-site.js` 的白名单决定，开发文件（`AGENTS.md`、`README.md`、`tools/`、`check-icons.bat`、`新建文章.bat`）不会进入产物 —— 线上访问它们是 404。
- 新页面放在 `project_subpage/` 里会自动带上；放在根目录、新建根级目录、或者 `archive/` 这种**故意不发布**的目录才要动白名单。**忘了加不会静默放过**：脚本会比对仓库里的 `.html` 和产物，发现有源码没产物的页面就报错退出。
- push 到 main 后 `.github/workflows/deploy.yml` 自动构建并发布 `dist/`。
- ⚠️ 仓库设置的 Pages → Source 必须是「GitHub Actions」。改成网页上那一步只能人工做；如果源还是分支发布，站点会由旧的 Jekyll 流程提供，新产物不会生效。
- `dist/` 是产物、已 gitignore，不要提交。
- `feed.xml` 是构建产物但必须提交（Pages 不会替你跑脚本），由 `.github/workflows/feed.yml` 在文章数据变化时自动重建。

## 许可证

保留所有权利。
