# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.3] - 2026-04-13

### Added

- **内置调试日志终端**：设置页面内新增实时调试日志查看器
- **日志终端独立页面**：调试日志终端移至侧边栏独立菜单入口

### Fixed

- **DevTools 自动打开**：移除开发模式自动打开 Chrome DevTools
- **调试日志终端显示**：修复日志终端在设置界面正确显示
- **Switch 响应延迟**：Switch onChange 直接调用 setDebugMode 确保立即响应

## [0.6.2] - 2026-04-09

### Added

- **设置页版本历史**：设置弹窗底部版本号可点击，弹出模态框展示版本更新历史（新上旧下，当前版高亮）
- **AI 对话搜索优化**：新增12个分类 few-shot 示例，关键词从口语化转为精准分类词，提升 Gutenberg 搜索召回率
- **元数据分类优化**：新增15个 few-shot 示例覆盖更多分类类型，新增分类选择指南规则，避免泛化分类

### Fixed

- **进度条0/0问题**：修复闭包捕获 stale activeTask 导致的进度丢失，setActiveTask 改用 await，updateActiveTask 支持函数式更新
- **AI提示词输出稳定性**：JSON解析增强健壮性（正则提取嵌入文本中的JSON），few-shot 覆盖正负面case
- **搜索结果删除按钮**：清空按钮改为删除按钮，正确调用 removeFromSearchResults 移除勾选书籍
- **上传失败记录不全**：验证失败（无法解析EPUB/缺少作者/无法提取封面）改用 mark_failed 而非 mark_skipped，确保 uploadError 正确写入

### Changed

- **左侧菜单顺序调整**：封面管理移至元数据管理之前

## [0.6.1] - 2026-04-08

### Added

- **上传前查重检测**
  - 调用云控平台 `getBooksPage` 接口，书名+作者双重匹配判断重复
  - 重复书籍标记为上传失败（"书籍已存在"），错误信息持久化到索引
  - 前端失败标签悬停显示"书籍已存在"详细错误

### Fixed

- **封面替换必失败**：修复 OPF meta 清除方式错误（DC 命名空间）+ None 保护

## [0.6.0] - 2026-04-08

### Added

- **书籍三项属性九态系统**
  - 每本书的元数据、封面、上传三个属性各支持三种状态：未完成/已完成/失败
  - 元数据失败写入 `metadataError`、封面失败写入 `coverError`、上传失败写入 `uploadError`
  - 上传失败/成功时同步更新 `library_index.json` 索引

- **统一筛选组件（BookFilter）**
  - 新建 `src/components/Common/BookFilter.tsx`，四个页面统一使用
  - 下拉多选分组展示9种状态筛选：元数据(3项)/封面(3项)/上传(3项)
  - 颜色标识：未完成（黄）/ 已完成（绿）/ 失败（红）

- **全局任务状态与跨页持久化**
  - `WorkspaceContext` 新增 `activeTask` 状态，`MetadataPage/CoverPage/UploadPage` 共用
  - 页面切换时任务保持运行，暂停/取消按钮立即生效

- **上传健壮性增强**
  - 单本书上传失败不影响后续书籍，失败原因持久化到索引
  - 前端 UploadPage 失败标签鼠标悬停显示详细错误

### Changed

- **元数据管理页面（MetadataPage）重构**
  - 去除左右双列布局，改为单列表 + 统一 BookFilter 筛选
  - 使用全局任务状态，不再有独立 AbortController

- **封面管理页面（CoverPage）重构**
  - 加 BookFilter 统一筛选（保持封面卡片网格布局）
  - 使用全局任务状态

- **上传管理页面（UploadPage）重构**
  - 移除原有 Tag 筛选，改用 BookFilter 统一筛选
  - 使用全局任务状态，失败详情显示

## [0.5.0] - 2026-04-07

### Added

- **封面管理页面（CoverPage）**
  - 侧边栏新增"封面管理"入口
  - 网格卡片布局，支持 3-8 列自由调节
  - 从 Google Books API + Open Library 双源搜索封面
  - 一键批量更新：搜索 → 下载 → 替换 EPUB 封面，SSE 实时进度
  - 更新成功实时刷新卡片封面图，右上角绿色 ✓ 标记
  - 更新失败右上角红色 ✕ 标记，失败书籍归入"已处理"列表
  - 全选（仅选未更新）/ 更新选中 / 全部更新 / 重置状态

- **统一书籍三维状态图标（BookStatusIcons）**
  - 三个小图标统一展示：元数据(TagsOutlined) / 封面(PictureOutlined) / 上传(CloudUploadOutlined)
  - 绿色=已完成、红色=失败（封面更新失败）、灰色=未完成
  - 图书管理、元数据管理、封面管理、上传管理四个页面统一显示
  - 列表页图标位于书名/作者下方第三行，视觉更紧凑

- **图书管理筛选与批量删除**
  - 四个可多选筛选标签：元数据已更新 / 封面已更新 / 封面更新失败 / 已上传（AND 逻辑）
  - 筛选适用于全部/文件夹/分类/年份所有视图，空分类自动隐藏
  - 全选 checkbox + 每行 checkbox，支持勾选批量删除（带确认弹窗）
  - `POST /api/library/delete` 删除文件 + 清索引 + 清上传记录

- **上传管理筛选**
  - 同样四个筛选标签，应用于待上传和已上传两个列表

### Changed

- **侧边栏 BookWeaver logo 布局调整**
  - 移除 macOS 红绿灯向右偏移，改为独立拖拽区 + 第二行 logo，Windows/macOS 统一显示

- **版本发布流程文档完善**
  - DOCUMENT.md 新增"版本显示位置"清单，推版本时需同步更新所有位置

### Fixed

- **封面更新秒完无效果**：修复 Google Books URL 编码问题（改用 httpx params），新增 Open Library 兜底搜索源
- **封面搜索 429 配额限制**：多源 fallback 机制（Google Books → Open Library）

## [0.4.0] - 2026-04-03

### Added

- **书籍上传页面（UploadPage）**
  - 侧边栏新增"书籍上传"入口
  - 自动识别元数据管理页面已更新的书籍，列为可上传状态
  - 环境下拉选择：测试环境 / 法兰克福生产 / 印度生产
  - 左列"待上传"（含失败重试） / 右列"已上传"双列布局
  - 失败书籍优先置顶显示，悬停 tooltip 显示错误原因
  - 支持勾选批量上传、全部上传
  - SSE 实时进度：圆形进度条 + 当前书名 + 当前阶段（上传封面 / 上传文件 / 添加记录）
  - 取消按钮立即生效（AbortController + 取消信号）
  - 上传记录持久化到 `.bookweaver/upload_progress.json`

- **后端上传核心逻辑（book_uploader.py）**
  - 从 EPUB 实时提取上传所需元数据（标题、作者、简介、语言、分类、封面等）
  - 分类支持多个（`categoryIds` 数组），精确匹配 39 个预设分类
  - 语言代码自动转换（`en` → `English` 等后端支持格式）
  - OSS 文件上传带重试（最多 3 次）
  - 顺序执行，取消标志随时终止

- **后端上传 API（upload.py）**
  - `GET /api/upload/status` — 查询可上传/已上传/失败状态
  - `POST /api/upload/start` — SSE 流式批量上传
  - `POST /api/upload/cancel` — 取消上传

## [0.3.0] - 2026-04-03

### Added

- **元数据管理页面（MetadataPage）正式上线**
  - 调用 LLM API 批量更新 EPUB 书籍元数据（简介、分类、出版年份）
  - 左右双列布局：左侧"未更新"、右侧"已更新"，支持复选框多选
  - 全选 / 更新选中 / 全部更新 / 重置状态操作
  - 39 个预设分类体系，LLM 返回分类编号，前端转为分类名称展示
  - 分类最多 3 个、去重，写入前清空旧标签

- **书籍详情实时加载**
  - 点击书籍从 EPUB 文件实时解析元数据，不再依赖索引缓存
  - `GET /api/library/detail` 返回字段扩展：新增 title、author、language、subjects、publishYear
  - 详情抽屉优先展示实时数据，更新后立即可见

- **SSE 真正流式推送**
  - 元数据更新改用 `asyncio.Queue + create_task`，progress_callback 实时推送事件
  - 前端实时收到 stage（sending/receiving/writing）和 progress 事件，进度条真实可用

### Fixed

- **EPUB Tag 累加问题**：修复 ebooklib DC 命名空间 key 错误（`'DC'` → `'http://purl.org/dc/elements/1.1/'`），导致清空旧 subject/date/description 的逻辑从未生效，每次更新都在原有基础上追加
- **出版年份不更新**：同上命名空间修复，date 字段现在能正确清空并写入新年份
- **取消按钮不立即生效**：前端改用 `AbortController` 断开 SSE 连接，点击取消立即终止；同时向后端发送取消信号，后端检测到连接断开后 cancel 后台任务
- **进度显示 0/0**：前端改用合并更新（`{ ...prev, ...data }`），确保 total 字段不被后续事件覆盖；初始化时明确设置 `success: 0, failed: 0`

## [0.2.1] - 2026-04-02

### Added

- **图书管理页面（LibraryPage）正式上线**
  - 基于 EPUB 文件内部元数据（ebooklib）展示书籍信息
  - 四种浏览视图：全部列表 / 文件夹树 / 按分类 / 按出版年份（50年分段）
  - 列表项显示书名、作者、出版年份、分类标签、语言、文件大小
  - 点击书籍弹出详情抽屉，动态加载封面图片、书籍简介、分类、出版商、版权等
  - 索引缓存机制：首次扫描后写入 `.bookweaver/library_index.json`，增量更新（按文件指纹检测变化）
  - "重建索引"按钮强制全量重扫工作区所有 EPUB 文件

### Changed

- 后端 EPUB 解析库从 `epub` 切换为 `ebooklib`，正确读取 Dublin Core 元数据
- `requirements.txt` 更新：`epub` → `ebooklib>=0.18` + `lxml>=4.9.0`
- Library API 新增 `GET /api/library/detail` 接口（封面 base64 + 简介）
- Library API 新增 `POST /api/library/reindex` 接口（强制重建索引）

## [0.2.0] - 2026-04-01

### Added

- **AI 助手 Plan-Execute-Verify 四阶段 Harness**
  - Phase 1 PLAN：LLM 分析用户意图，输出结构化 JSON 搜索计划（关键词列表、每次 limit、目标数量）
  - Phase 2 EXECUTE：Backend 驱动循环按计划逐关键词搜索，不依赖 LLM 决策
  - Phase 3 VERIFY：内置 30+ 兜底关键词，未达目标自动补充搜索
  - Phase 4 REPLY：任务完成后 LLM 流式输出自然语言总结
  - 支持一条消息完成"推荐 1000 本书"等大批量任务，全程无需人工干预

- **下载实时网速显示**
  - 下载中标签页实时显示当前网速（KB/s 或 MB/s）
  - 每秒聚合所有并发下载的速度后推送给前端

- **下载暂停 / 继续**
  - 暂停：向后端发送取消信号，当前正在传输的书下载完后停止，不强制中断
  - 继续：从 meta.json 读取已完成列表，只下载剩余书籍，断点续传
  - 暂停状态跨 app 重启持久化，重新打开工作区后可继续

- **下载进度条实时动画**
  - 总进度条使用 Ant Design `active` 状态，实时跳动
  - 进度基于已完成本数/总本数精确计算

### Changed

- **AI 对话 UI 优化**
  - 状态消息（搜索进度）原地更新，不再每批次追加新消息
  - 大批量任务期间对话框只显示一条"搜索中，已加入 N 本书..."动态消息
  - 任务完成后状态消息变为"共加入 N 本书到列表"结果样式

- **缓存文件结构重构**
  - 旧 `workspace.json` 拆分为：
    - `state.json`：轻量持久状态（预下载列表 + 批次摘要），每次操作立即写入
    - `downloads/batch_N/meta.json`：批次完整书单 + 下载结果，仅在下载时写入
  - 去掉 `ai_context.json`（AI 对话历史不再持久化）
  - 工作区首次打开时自动迁移旧格式数据

- **下载页面交互**
  - 点击"开始下载"：预下载列表全部转移到下载中，预下载列表清空
  - 已完成批次展开时懒加载 meta.json 详情，避免大文件影响启动速度
  - 已完成列表按批次倒序排列（最新在最上方）
  - 每批次新增"打开文件夹"按钮，直接在 Finder/Explorer 中打开

### Fixed

- **SSE 解析错误**：旧版 `JSON.parse(chunk)` 对非标准 SSE 格式不健壮，改为标准 `data: ...` 行解析
- **`downloadProgress` 频繁写磁盘**：临时下载进度从 `workspaceData` 中分离，仅保存在内存中
- **React 状态闭包问题**：使用 `useRef` 追踪消息索引，避免 `setState` 回调中读到陈旧值

## [0.1.1] - 2026-03-26

### Fixed

- **AI 对话 Function Calling**
  - 修复 DashScope Coding API 兼容性问题，移除对 `tool` 角色的依赖
  - 改用 `system` 消息传递工具执行结果
  - 修复无工具调用时的流式输出错误

- **下载进度显示**
  - 修复下载过程中进度条不可见的问题
  - 修复下载完成后"已完成"标签页不显示批次的问题
  - 优化下载中列表使用独立的书籍列表数据

- **AI 对话消息样式**
  - 优化消息气泡样式，更像手机聊天软件
  - 工具状态消息显示为浅蓝色带加载图标
  - 工具结果消息显示为浅绿色边框
  - 简化输出内容，去除冗余信息

## [0.1.0] - 2026-03-26

### Added

- **工作区系统**
  - 类似编辑器的工作区模式，需要打开文件夹才能工作
  - 支持拖拽文件夹打开工作区
  - 工作区数据持久化在 `.bookweaver/` 目录

- **书籍搜索**
  - 按书名/作者搜索 Gutenberg 目录（77,000+ 书籍）
  - 支持模糊匹配，显示匹配度评分
  - 搜索结果支持复选框选择和全选
  - 一键添加到预下载列表

- **下载管理**
  - 三个标签页：预下载 / 下载中 / 已完成
  - 批量下载支持 SSE 实时进度
  - 下载批次记录管理

- **AI 助手**
  - 悬浮按钮打开对话抽屉
  - SSE 流式输出（基础框架）

- **设置功能**
  - LLM API 配置（API Key、模型、Base URL）
  - 下载配置（并发数、超时时间）

- **图书管理**
  - 页面占位，待开发元数据编辑器

### Technical

- **前端**: Electron + React + TypeScript + Ant Design
- **后端**: Python FastAPI
- **通信**: HTTP REST + SSE

### Project Structure

```
bookweaver-gui/
├── electron/          # Electron 主进程
├── src/               # React 前端
├── backend/           # FastAPI 后端
└── resources/         # 打包资源
```