# Commit 指南

> **当前版本：v0.7.0**

本文档为 AI 助手指引，每次 commit 后请按以下规则执行。

---

## 提交时机

| 场景 | 规则 |
|------|------|
| 功能完成 | 立即 commit，不等用户提醒 |
| 修复 bug | 立即 commit |
| 用户明确要求 | 按要求 commit |
| 用户说"先不改" | 不动代码 |

---

## Commit 消息格式

使用以下格式，**不需确认直接执行**：

```bash
git add -A && git commit -m "$(cat <<'EOF'
<type>: <简短描述>

<可选：详细说明>
EOF
)"
```

### Type 类型

| type | 使用场景 |
|------|---------|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `perf` | 性能优化 |
| `refactor` | 重构（不影响功能） |
| `chore` | 工具/构建/依赖更新 |
| `docs` | 文档改动 |

### 描述规则

- 第一行不超过 72 字符
- 用中文描述
- 写清楚"做了什么"而非"改了什么文件"
- 结尾不加句号

### Co-Author

消息末尾固定加：
```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Git 操作权限

| 操作 | 是否需要确认 | 备注 |
|------|------------|------|
| `git commit` | **不需要** | 功能完成/修复后直接提交 |
| `git push` | **不需要** | 正常开发中可按需推送 |
| `git tag` | **需要确认** | 只有用户说"推版本"时才打标签 |
| 新建分支 | **需要确认** | 除非用户明确要求，否则不新建分支 |

---

## 分支管理

- 默认在 `optimize` 分支上工作
- 除非用户明确要求新建分支，否则不新建
- 除非用户要求打标签，否则不打

---

## 禁止事项

- **不要**在 commit 消息中列出具体改动的文件列表
- **不要**在 commit 消息中写马后炮式描述（如"修复了 XXX bug"）
- **不要**在 commit 前询问用户，直接执行
- **不要**在 commit 后自动打 tag，除非用户明确说"推版本"

---

## 版本发布规则（仅当用户说"推版本"时执行）

用户说"推版本"后，按以下顺序执行：

### 1. 更新 README.md
- 更新当前版本号
- 更新当前版本的更新内容

### 2. 更新 CHANGELOG.md
- 在最上面新增本次版本号的更新内容
- 使用标准格式：
```markdown
## [0.x.x] - YYYY-MM-DD

### 新增
- 功能描述

### 修复
- 修复描述

### 变更
- 变更描述
```

### 3. 更改软件内的版本号显示

| 文件 | 位置 |
|------|------|
| `package.json` | `"version": "x.x.x"`（决定 CI/CD 打包输出文件名） |
| `src/components/Layout/Sidebar.tsx` | 侧边栏左下角版本号文字（格式：`v0.x.x`） |
| `src/components/Layout/WelcomePage.tsx` | 欢迎页标题版本显示（如有） |
| `src/components/Settings/VersionHistory.tsx` | 在 VERSION_HISTORY 数组最上面插入新版本，currentVersion 改为新版本号 |

> 注意：`package.json` 的 version 字段决定了 CI/CD 打包输出的文件名（`${productName}-${version}.${ext}`），务必与 git tag 版本一致。

### 4. 更新 DOCUMENT.md（如有架构更新）
- 阅读 DOCUMENT.md 检查是否有需要更新的内容
- 包括顶部"当前版本"字段

### 5. 提交并打标签
```bash
git add -A && git commit -m "$(cat <<'EOF'
chore: 发布 v0.x.x

版本更新说明
EOF
)"
git tag -a v0.x.x -m "v0.x.x - 版本更新说明"
```

### 6. Push 远程仓库
```bash
git push
git push origin v0.x.x
```
- 先 push commit，再 push tag
- tag push 会触发 CI/CD 自动打包

---

## 提交后的状态

commit 完成后，告知用户：
- commit hash（前 7 位）
- 所在分支
- 简要描述改动内容

tag push 后告知用户 CI/CD 已触发，打包完成后可在 GitHub Releases 下载。
