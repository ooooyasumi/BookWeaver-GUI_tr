# BookWeaver GUI

Project Gutenberg 书籍下载工具 - GUI 版本

## 功能特性

- 📁 **工作区模式**: 类似编辑器的工作区管理，所有数据持久化在 `.bookweaver/` 目录
- 🔍 **书籍搜索**: 按书名/作者搜索 Gutenberg 目录（77,000+ 书籍），支持模糊匹配
- 🤖 **AI 助手**: 自然语言交互，一句话批量推荐书籍（支持 1000+ 本大批量任务）
- ⬇️ **批量下载**: 并发下载，实时网速显示，支持暂停/继续
- 📊 **下载管理**: 预下载 / 下载中 / 已完成三态管理，断点续传
- 📚 **图书管理**: 浏览已下载 EPUB，显示封面/简介/分类/年份，多视图（文件夹/分类/年份），筛选与批量删除
- 🏷️ **元数据管理**: LLM 批量更新 EPUB 元数据（简介/分类/出版年份），SSE 实时进度
- 🖼️ **封面管理**: Google Books + Open Library 双源搜索封面，一键批量替换 EPUB 封面
- ☁️ **书籍上传**: 批量上传 EPUB 到云控平台，多环境选择，失败重试，状态持久化
- ⚙️ **设置**: LLM API 配置、下载并发数设置

## 技术栈

- **前端**: Electron + React + TypeScript + Ant Design
- **后端**: Python FastAPI
- **通信**: HTTP REST + SSE 流式推送

## 项目结构

```
bookweaver-gui/
├── electron/          # Electron 主进程
│   ├── main.ts       # 主进程入口 + IPC 处理
│   ├── preload.ts    # 预加载脚本（暴露 electronAPI）
│   └── workspace.ts  # 工作区管理（缓存文件读写）
├── src/              # React 前端
│   ├── components/   # UI 组件
│   │   ├── Search/   # 搜索页面 + AI 助手对话框
│   │   ├── Download/ # 下载管理页面
│   │   ├── Library/  # 图书管理（封面/简介/分类/年份，索引缓存）
│   │   ├── Layout/   # 布局组件
│   │   ├── Common/   # 通用组件（BookList 等）
│   │   └── Settings/ # 设置弹窗
│   └── contexts/     # React Context（WorkspaceContext 全局状态）
├── backend/          # Python FastAPI 后端
│   ├── api/          # API 路由（books / download / chat）
│   └── core/         # 核心功能（catalog 目录解析 / downloader 下载器 / epub_meta EPUB元数据）
├── resources/        # 打包资源（图标等）
└── dev.py            # 一键启动开发服务器（前后端）
```

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.9+

### 安装依赖

```bash
# 前端依赖
npm install

# 后端依赖
pip install -r backend/requirements.txt
```

### 启动开发服务器

```bash
# 一键启动前后端（Ctrl+C 同时退出）
python dev.py
```

或手动分开启动：

```bash
# 终端 1：后端
cd backend && python -m uvicorn main:app --reload --port 8765

# 终端 2：前端
npm run dev
```

## API 端点

### 书籍搜索
- `GET /api/books/search` — 搜索书籍（支持 title / author / language / limit）
- `GET /api/books/catalog/status` — 目录缓存状态
- `POST /api/books/catalog/refresh` — 刷新目录缓存

### 下载管理
- `POST /api/download/start` — 开始下载，SSE 流式推送进度（book_start / book_complete / speed / progress / paused / complete）
- `POST /api/download/pause/{download_id}` — 暂停下载
- `GET /api/download/status` — 当前活跃下载列表

### AI 对话
- `POST /api/chat` — AI 对话，SSE 流式推送（token / tool_status / add_books / clear_results / complete / error）

### 配置
- `GET /api/config` — 获取配置
- `PUT /api/config` — 保存配置

## 工作区数据结构

打开工作区后，在所选文件夹内创建 `.bookweaver/` 目录：

```
.bookweaver/
├── config.json           # LLM + 下载配置
├── state.json            # 持久状态：预下载列表 + 批次摘要
└── downloads/
    ├── batch_1/
    │   └── meta.json     # 批次完整书单 + 每本下载结果（用于断点续传）
    └── batch_2/
        └── meta.json
```

每次点击"开始下载"创建一个新批次，对应工作区内一个以批次名命名的文件夹（存放实际 EPUB 文件）。

## AI 助手工作原理

采用 Plan-Execute-Verify-Reply 四阶段 Harness：

1. **PLAN**: LLM 分析用户意图，输出结构化搜索计划（目标数量、关键词列表）
2. **EXECUTE**: Backend 驱动循环，按计划逐关键词调用搜索 API，结果实时推送前端
3. **VERIFY**: 若未达到目标数量，自动用兜底关键词继续补充搜索
4. **REPLY**: 任务完成后 LLM 生成一句话自然语言总结

LLM 仅参与计划和回复两个阶段，循环执行完全由 Backend 控制，保证大批量任务一定完成。

## 打包发布

```bash
# macOS
npm run package:mac

# Windows
npm run package:win
```

推送 `v*` tag 后 GitHub Actions 自动构建 macOS + Windows 安装包并创建 Release。

## 许可证

MIT
