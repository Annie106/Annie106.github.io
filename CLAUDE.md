# CLAUDE.md

**先读仓库根目录的 `AGENTS.md`** —— 它是这个项目唯一的约定来源，本文件只是指针，不要在这里补充规则。

三条硬前提：

1. 本地要有 **Node 18+** 和 **Python 3.9+**（图标裁切需要 `fonttools` + `brotli`）。新机器先跑一次 `tools/setup.bat`。
2. `fonts/icons.css` 和 `fonts/remixicon.woff2` 是**生成物**，不要手改。加图标 = 在页面写 `<i class="ri-xxx">`，再跑 `tools/update-icons.bat`（或直接提交，pre-commit 钩子会自动生成）。字体和源码不一致时构建会中止。
3. 构建 = `node tools/build-site.js`（先校验图标，再按白名单复制到 `dist/`）。不要引入打包器、框架、TypeScript 或任何 npm 依赖。

其他文档：`README.md`（速查）、`tools/README.md`（环境、脚本用法、报错对照）、`project_subpage/blog/guide.html`（站点使用手册）。
