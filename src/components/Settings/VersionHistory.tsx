import { useState } from 'react'
import { Modal, Typography } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'

const { Text } = Typography

interface VersionEntry {
  version: string
  date: string
  added: string[]
  fixed: string[]
  changed: string[]
}

const CURRENT_VERSION = '0.7.0'

// 内嵌的版本历史数据（与 CHANGELOG.md 保持同步）
const VERSION_HISTORY: VersionEntry[] = [
  {
    version: '0.7.0',
    date: '2026-04-14',
    added: [
      '所有页面分页和性能优化：新增统一分页组件，支持 20/50/100/全部 选项',
    ],
    fixed: [
      'UploadPage 缺少 Select 导入导致页面崩溃',
      'MetadataPage 筛选状态使用错误的 FilterKey 值',
    ],
    changed: [],
  },
  {
    version: '0.6.8',
    date: '2026-04-13',
    added: [
      '元数据作者补全：原书无作者时，LLM 自动识别并写入作者；LLM 也无法识别时报错"缺少作者"',
    ],
    fixed: [
      '元数据作者校验逻辑：原书有作者时直接放行，不再错误检查 LLM 返回值导致全部失败',
    ],
    changed: [],
  },
  {
    version: '0.6.7',
    date: '2026-04-13',
    added: [],
    fixed: [
      '元数据作者校验逻辑：修正为检查原书是否有作者，LLM 不返回 author 字段，旧逻辑导致全部书籍报"缺少作者"失败',
    ],
    changed: [],
  },
  {
    version: '0.6.5',
    date: '2026-04-13',
    added: [],
    fixed: [
      '批量上传异常流处理：safe_print防GBK编码卡死，safe_callback防异常打断循环',
    ],
    changed: [],
  },
  {
    version: '0.6.4',
    date: '2026-04-13',
    added: [],
    fixed: [
      '上传编码错误：EPUB元数据清洗，移除emoji和特殊符号，避免gbk编码错误',
    ],
    changed: [],
  },
  {
    version: '0.6.3',
    date: '2026-04-13',
    added: [
      '内置调试日志终端：设置页面内新增实时调试日志查看器',
      '日志终端独立页面：调试日志终端移至侧边栏独立菜单入口',
    ],
    fixed: [
      'DevTools 自动打开：移除开发模式自动打开 Chrome DevTools',
      '调试日志终端显示：修复日志终端在设置界面正确显示',
      'Switch 响应延迟：Switch onChange 直接调用 setDebugMode 确保立即响应',
    ],
    changed: [],
  },
  {
    version: '0.6.2',
    date: '2026-04-09',
    added: [
      '设置页版本历史：设置弹窗底部版本号可点击，弹出模态框展示版本更新历史',
      'AI对话搜索优化：新增12个分类few-shot示例，关键词从口语化转为精准分类词',
      '元数据分类优化：新增15个few-shot示例，新增分类选择指南规则',
    ],
    fixed: [
      '进度条0/0问题：修复闭包捕获stale activeTask导致进度丢失',
      'AI提示词输出稳定性：JSON解析增强健壮性',
      '搜索结果删除按钮：清空按钮改为删除按钮',
      '上传失败记录不全：验证失败改用mark_failed确保uploadError正确写入',
    ],
    changed: [
      '左侧菜单顺序调整：封面管理移至元数据管理之前',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-04-08',
    added: [
      '上传前查重检测：调用云控平台 getBooksPage 接口，书名+作者双重匹配判断重复',
      '重复书籍标记为上传失败（"书籍已存在"），错误信息持久化到索引',
      '前端失败标签悬停显示"书籍已存在"详细错误',
    ],
    fixed: [
      '封面替换必失败：修复 OPF meta 清除方式错误（DC 命名空间）+ None 保护',
    ],
    changed: [],
  },
  {
    version: '0.6.0',
    date: '2026-04-08',
    added: [
      '书籍三项属性九态系统：每本书的元数据、封面、上传三个属性各支持三种状态',
      '统一筛选组件（BookFilter）：四个页面统一使用，下拉多选分组展示9种状态',
      '全局任务状态与跨页持久化：页面切换时任务保持运行，暂停/取消按钮立即生效',
      '上传健壮性增强：单本书上传失败不影响后续，失败原因持久化到索引',
    ],
    fixed: [],
    changed: [
      '元数据管理页面重构：单列表 + BookFilter + 全局任务状态',
      '封面管理页面重构：BookFilter + 全局任务状态',
      '上传管理页面重构：BookFilter + 全局任务状态',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-04-07',
    added: [
      '封面管理页面：Google Books + Open Library 双源搜索，批量替换 EPUB 封面',
      '统一书籍三维状态图标（BookStatusIcons）',
      '图书管理筛选与批量删除',
      '上传管理筛选',
    ],
    fixed: [
      '封面更新秒完无效果：修复 Google Books URL 编码问题',
      '封面搜索 429 配额限制：多源 fallback 机制',
    ],
    changed: [
      '侧边栏 BookWeaver logo 布局调整',
      '版本发布流程文档完善',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-04-03',
    added: [
      '书籍上传页面（UploadPage）：三环境选择、SSE 实时进度、失败重试',
      '后端上传核心逻辑（book_uploader.py）：OSS 上传 + 云控平台 API',
      '后端上传 API（upload.py）',
    ],
    fixed: [],
    changed: [],
  },
  {
    version: '0.3.0',
    date: '2026-04-03',
    added: [
      '元数据管理页面（MetadataPage）正式上线：LLM 批量更新 EPUB 元数据',
      '书籍详情实时加载：点击书籍从 EPUB 文件实时解析元数据',
      'SSE 真正流式推送：progress_callback 实时推送 events',
    ],
    fixed: [
      'EPUB Tag 累加问题：修复 DC 命名空间错误',
      '出版年份不更新：同上命名空间修复',
      '取消按钮不立即生效',
      '进度显示 0/0',
    ],
    changed: [],
  },
  {
    version: '0.2.1',
    date: '2026-04-02',
    added: [
      '图书管理页面（LibraryPage）：四种浏览视图、详情抽屉、索引缓存',
    ],
    fixed: [],
    changed: [
      '后端 EPUB 解析库从 epub 切换为 ebooklib',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-04-01',
    added: [
      'AI 助手 Plan-Execute-Verify 四阶段 Harness',
      '下载实时网速显示、暂停/继续、断点续传',
      '下载进度条实时动画',
    ],
    fixed: [
      'SSE 解析错误',
      'downloadProgress 频繁写磁盘',
      'React 状态闭包问题',
    ],
    changed: [
      'AI 对话 UI 优化',
      '缓存文件结构重构',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-03-26',
    added: [],
    fixed: [
      'AI 对话 Function Calling：DashScope Coding API 兼容性问题',
      '下载进度显示问题',
      'AI 对话消息样式',
    ],
    changed: [],
  },
  {
    version: '0.1.0',
    date: '2026-03-26',
    added: [
      '工作区系统、书籍搜索、下载管理、AI 助手、设置功能、图书管理占位',
    ],
    fixed: [],
    changed: [],
  },
]

interface VersionHistoryModalProps {
  open: boolean
  onClose: () => void
}

export function VersionHistoryModal({ open, onClose }: VersionHistoryModalProps) {
  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HistoryOutlined />
          版本历史
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
    >
      <div style={{ maxHeight: 520, overflowY: 'auto', padding: '8px 0' }}>
        {VERSION_HISTORY.map((entry) => {
          const isCurrent = entry.version === CURRENT_VERSION
          return (
            <div
              key={entry.version}
              style={{
                padding: '14px 16px',
                marginBottom: 8,
                borderRadius: 8,
                background: isCurrent ? 'var(--accent-color)' + '15' : 'var(--bg-tertiary)',
                border: isCurrent ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
              }}
            >
              {/* 版本号 + 日期 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: isCurrent ? 'var(--accent-color)' : 'var(--text-primary)',
                  }}>
                    v{entry.version}
                  </span>
                  {isCurrent && (
                    <span style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'var(--accent-color)',
                      color: '#fff',
                      fontWeight: 500,
                    }}>
                      最新
                    </span>
                  )}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{entry.date}</Text>
              </div>

              {/* 新增 */}
              {entry.added.length > 0 && (
                <div style={{ marginBottom: entry.fixed.length > 0 || entry.changed.length > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#52c41a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    新增
                  </div>
                  {entry.added.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, paddingLeft: 8 }}>
                      · {item}
                    </div>
                  ))}
                </div>
              )}

              {/* 修复 */}
              {entry.fixed.length > 0 && (
                <div style={{ marginBottom: entry.changed.length > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#ff4d4f', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    修复
                  </div>
                  {entry.fixed.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, paddingLeft: 8 }}>
                      · {item}
                    </div>
                  ))}
                </div>
              )}

              {/* 变更 */}
              {entry.changed.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1890ff', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    变更
                  </div>
                  {entry.changed.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, paddingLeft: 8 }}>
                      · {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

interface VersionLinkProps {
  style?: React.CSSProperties
}

export function VersionLink({ style }: VersionLinkProps) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <span
        onClick={() => setModalOpen(true)}
        style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          ...style,
        }}
      >
        v{CURRENT_VERSION}
      </span>
      <VersionHistoryModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
