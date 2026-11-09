# AGENTS.md

给在这个仓库里写代码的 AI 工具（Claude Code、Codex、Cursor、Copilot、WorkBuddy 等）看的约定。
人看的速查是 `README.md`，完整教程是站内「使用指南」`project_subpage/blog/guide.html`。
**动手前先读完这一页，尤其是「图标」和「新建页面」两节。**

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

- 不要手动编辑 `fonts/icons.css`。升级字体版本时整体替换 `icons.css` 与 `remixicon.woff2`，再跑一次上面的校验。

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
- 配色一律用 CSS 变量（`--color-bg`、`--color-text-primary`、`--color-border`、`--card-accent` 等），深色模式在 `[data-theme="dark"]` 里覆盖变量，**不要写死色值**，否则深色模式下会失效。
- 新增基于位移/透明度的动画，请一并处理 `@media (prefers-reduced-motion: reduce)`。

## 别乱动的地方

- `js/script.js` 是 SPA 式路由核心（`index.html?article=N`、`?view=xxx`、浏览器返回键、滚动位置恢复）。这里的逻辑和历史记录强耦合，改动前先读相关注释，不要顺手重构。
- `js/posts-data.js` / `js/tweaks-data.js` 是数据文件：可以增删条目，但不要改字段名，`script.js` 依赖它们。
- `favicon.svg`、`share_cover.jpg` 被多个页面和分享卡片引用，改文件名要同步全站。

## 提交前自查

```bash
node tools/check-icons.js
```

它会检查三件事：有没有残留的 CDN 图标引用、HTML/JS 里用到的图标名是否都存在于本地字体、每个用了图标的页面是否引了 `style.css`。有输出就说明有问题。
