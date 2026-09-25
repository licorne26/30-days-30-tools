# 30 天 30 个一句话工具

每天用一句话让 AI 做一个小工具，连续 30 天。

规则就三条：

1. 不要服务器，所有东西都在浏览器里跑
2. 不上传任何文件
3. 提示词和代码全部开源

在线目录：https://licorne26.github.io/30-days-30-tools/

| Day | 工具 | 在线使用 |
| --- | --- | --- |
| 1 | [照片隐私清理器](day01-photo-privacy-cleaner/)：读出照片里的 GPS、设备和拍摄时间，一键导出干净照片 | [打开](https://licorne26.github.io/30-days-30-tools/day01-photo-privacy-cleaner/) |

想要什么工具？去 [X @la_licorne9](https://x.com/la_licorne9) 评论区点菜。

## 技术栈

Vite + React + TypeScript + Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)。构建产物是纯静态文件，由 GitHub Actions 部署到 GitHub Pages。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173/30-days-30-tools/
npm run build    # 输出到 dist/
```

## 新增一天

1. 新建文件夹 `dayNN-工具英文名/`，放入 `index.html`、`main.tsx`、`app.tsx` 和 `README.md`（可复制 Day 1 的结构）
2. 在 `src/tools.ts` 里登记这一天的标题、简介和那一句话
3. 需要新组件时：`npx shadcn@latest add 组件名`

构建时会自动识别所有 `dayNN-*` 文件夹，每个工具都有自己的网址。

MIT License
