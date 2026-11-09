# Annie 的个人博客

> 由 AI 辅助构建

原生 HTML + CSS + JavaScript 的静态博客，无依赖、无构建。

完整配置教程在站内「使用指南」文章（`project_subpage/blog/guide.html`），本文件只做速查。让 AI 改这个仓库之前，先让它读 `AGENTS.md`。

## 目录

```text
index.html                  入口：首页 / 文章列表 / 文章详情 / 电影 / 关于
movie.html                  独立视频页（列表见 VIDEO_LIST）
favicon.svg                 站点图标
share_cover.jpg             分享卡片封面，1080×1080
images/manor_photos/        归宿照图集（文章 id 11 用）
css/style.css               全部样式与响应式
fonts/icons.css             图标字体样式（Remix Icon 本地副本，由 style.css 引入）
fonts/remixicon.woff2       图标字体文件，约 165 KB
_template.html              新建页面时复制这份，head 已经引对了样式
tools/check-icons.js        图标自检：CDN 残留、图标名是否存在、页面是否引了样式
AGENTS.md                   给 AI 工具的项目约定，跨工具生效
js/posts-data.js            全部文章数据（首页与归档页共用）
js/script.js                筛选、搜索、路由、页面状态
js/tweaks-data.js           博客更新记录（首页「本周折腾」+ 独立页共用）
js/theme.js                 深色模式
js/touch-hover.js           触屏悬停修正
js/background-music.js      首页背景音乐
js/copyToClipboard.js       联系方式复制
js/image-loading.js         图片占位与清晰化
project_subpage/blog/       站点页：guide / submission / thanks / 文章内嵌页 ...
project_subpage/projects/   项目页：appeal-guide / download ...
archive/                    归档，不参与显示
```

## 功能

- 导航五个视图：首页、文章列表、归档、电影、关于（另有文章详情、「本周折腾」、「问题反馈」、「提交成功」四个不占导航的视图），移动端自适应
- 标签筛选，支持置顶文章
- 全站搜索（<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd>）：搜标题、摘要、标签、正文；多关键词按「与」匹配，命中高亮，空状态给最近搜索与标签入口
- 文章卡片「⋯」菜单支持三类：站内文章、独立页面（`externalPage`）、自定义链接（`link`）
- 文章可内嵌独立 HTML（`embeddedPage`），自动调高并跟随主题
- 每篇公开文章使用 Giscus 展示 GitHub Discussions 评论；博客启动时会低优先级预载 Giscus 脚本和连接，打开文章时再加载对应讨论；文章卡片的「查看评论」切到站内评论视图（`index.html?view=comments`），讨论串按文章 ID 区分；仓库需启用 Discussions 并安装 Giscus App
- 分享链接形如 `index.html?article=<id>`；微信内改为复制链接 + 右上角引导，其它端走系统分享
- `isPublic: false` 关闭单篇正文，改为 `true` 恢复
- 页面状态记忆：离开文章、切标签、关页后返回，恢复视图与滚动位置
- 正文链接加 `class="gated-link"` 后点击弹出「链接已停止访问」提示
- 独立视频页：侧边播放列表、加载动画、水印，附验证码 / 地区限制 / 解码失败等错误提示
- 点击图标复制微信号、QQ 号、邮箱
- 反馈表单：文章问题、Bug、功能建议、排版样式、其他

## 修改

| 想改什么 | 改哪里 |
| --- | --- |
| 姓名、简介、头像、联系方式、关于页 | `index.html` 与 `js/script.js` 的 `siteConfig` |
| 文章 | `js/script.js` 的 `blogPosts` 数组 |
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

图标字体（Remix Icon）也在这一行里：字体文件放在 `fonts/`，由 `style.css` 顶部的 `@import` 带进来，所以不需要、也不要再引任何 CDN 图标样式表（那会让图标在 CDN 抖动时整片消失）。图标名去 [remixicon.com](https://remixicon.com/) 挑，本地是 v4.3.0 全量（近 3000 个），写进 HTML 就能用，不用重新生成任何文件。名字拼错不报错、只显示空白，所以改完跑一次检查——**双击根目录的 `check-icons.bat`**，或在项目目录里执行：

```bash
node tools/check-icons.js
```

站点的顶部导航是一条**通栏、吸顶的半透明磨砂条**（`background` 给 64% 不透明白 + `backdrop-filter: blur(20px)`，页面一开始滚动时由 JS 给 `.site-header` 加 `.is-scrolled` 把底色压实到 78%，保证内容经过时文字仍清楚；不支持背景模糊的浏览器退回 96% 实底）：它在 HTML 里位于 `.main-container` 之外，样式靠「宽度加回左右留白 + 等量负 margin」顶到视口两侧，再用内边距让内容与 1080 主体容器对齐。条带高、控件高、导航胶囊高由 `:root` 里的 `--header-h` / `--header-control` / `--nav-h` 三个令牌统一控制（移动端在 `@media (max-width: 600px)` 里覆盖前两个），改它们即可整体缩放；需要给「顶部让位」的浮层（如音频提示条）读 `--header-h` 即可，别写死数字。

几个注意点：

- 分享封面必须写绝对地址，如 `https://annie106.github.io/share_cover.jpg`；相对路径抓不到，带 Referer 鉴权的 CDN 也抓不到。
- 全站共用一个 `index.html?article=N` 页面，微信不执行 JS，所以所有文章共用同一张封面。
- 改文章 `id` 会让已分享的链接失效。
- 首页标签在 `js/script.js` 的 `renderTagPills` 里，目前是「置顶 / 社交 / 随笔」。
- 移动或重命名子页面后，同步 `embeddedPage` 与 `articleMenus` 的路径。

## 本地预览

```bash
python -m http.server 8000
```

访问 <http://localhost:8000>，或直接打开 `index.html`。背景音乐需用户交互后才能播放。

## 部署

静态站，放到 GitHub Pages 或任意静态托管即可，无需后端与构建。

## 许可证

保留所有权利。
