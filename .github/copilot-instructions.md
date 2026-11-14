# Copilot 指令

**先读仓库根目录的 `AGENTS.md`**：它是这个项目唯一的约定来源，本文件只是指针，规则一律不要写在这里。

必须知道的三件事：

1. 本地需要 **Node 18+** 和 **Python 3.9+**（`fonttools` + `brotli`）。新机器跑一次 `tools/setup.bat`。
2. `fonts/icons.css` 与 `fonts/remixicon.woff2` 是**生成物**，不要手改。加图标 = 写 `<i class="ri-xxx">`，再跑 `tools/update-icons.bat`（提交时钩子会自动跑）；字体与源码不一致时构建会中止。
3. 构建 = `node tools/build-site.js`（先校验图标，再按白名单复制到 `dist/`）。不要引入打包器、框架、TypeScript 或 npm 依赖。

其他文档：`README.md`（速查）、`tools/README.md`（环境与报错）、`project_subpage/blog/guide.html`（站点手册）。
