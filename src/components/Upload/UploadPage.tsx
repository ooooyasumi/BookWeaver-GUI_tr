import { useState, useEffect, useMemo } from 'react'
import { Card, Button, Space, Checkbox, message, Spin, Tag, Typography, Tooltip, Select } from 'antd'
import {
  CloudUploadOutlined, CheckCircleOutlined,
  FileTextOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { useWorkspace, ActiveTask } from '../../contexts/WorkspaceContext'
import { BookDetailDrawer, formatFileSize, BookInfo } from '../Common/BookDetailDrawer'
import { TaskProgressCard } from '../Common/TaskProgressCard'
import { BookStatusIcons } from '../Common/BookStatusIcons'
import { BookFilter, FilterKey, matchesFilter, BookWithAllStatus } from '../Common/BookFilter'
import { PaginationBar } from '../Common/PaginationBar'

const { Text } = Typography

// API 地址配置
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

// 云控平台环境列表
const ENVIRONMENTS = [
  { label: '测试环境', value: 'https://test-backend.toolmatrix.plus' },
  { label: '法兰克福生产', value: 'https://backend.toolmatrix.plus' },
  { label: '印度生产', value: 'https://ind-backend.toolmatrix.plus' },
]

interface UploadFileInfo {
  filePath: string
  title: string | null
  author: string | null
  language?: string | null
  publishYear?: number | null
  subjects?: string[]
  fileSize?: number
  uploadedAt?: string
  uploadBaseUrl?: string
  uploadError?: string | null
  failedAt?: string
  metadataUpdated?: boolean
  metadataError?: string | null
  coverUpdated?: boolean
  coverError?: string | null
  uploaded?: boolean
}

interface UploadStatus {
  total: number
  canUpload: number
  uploaded: number
  failed: number
  canUploadFiles: UploadFileInfo[]
  uploadedFiles: UploadFileInfo[]
  failedFiles: UploadFileInfo[]
}

// ─── 书籍列表项 ─────────────────────────────────────────────────────────────

function BookItem({
  book,
  onClick,
  showCheckbox = false,
  checked = false,
  onCheck,
  statusTag,
  isUploaded,
}: {
  book: UploadFileInfo
  onClick: () => void
  showCheckbox?: boolean
  checked?: boolean
  onCheck?: () => void
  statusTag?: React.ReactNode
  isUploaded?: boolean
}) {
  return (
    <div
      className="book-item"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', marginBottom: 10, cursor: 'pointer'
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {showCheckbox && (
          <Checkbox
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={onCheck}
            style={{ marginRight: 12 }}
          />
        )}
        <FileTextOutlined style={{ fontSize: 20, color: 'var(--accent-color)', marginRight: 14, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 500, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {book.title || '未知书名'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {book.author || '未知作者'}
            {book.publishYear && <span style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>({book.publishYear})</span>}
          </div>
          <div style={{ marginTop: 4 }}>
            <BookStatusIcons
              metadataUpdated={book.metadataUpdated}
              metadataError={book.metadataError}
              coverUpdated={book.coverUpdated}
              coverError={book.coverError}
              uploaded={isUploaded || !!book.uploadedAt}
              uploadError={book.uploadError}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
        {statusTag}
        {book.subjects && book.subjects.length > 0 && (
          <Tag style={{ margin: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {book.subjects[0]}
          </Tag>
        )}
        {book.language && (
          <Tag color={book.language === 'en' ? 'blue' : 'green'} style={{ margin: 0 }}>
            {book.language}
          </Tag>
        )}
        {book.fileSize && (
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {formatFileSize(book.fileSize)}
          </Text>
        )}
      </div>
    </div>
  )
}

// ─── UploadPage ─────────────────────────────────────────────────────────────

export function UploadPage() {
  const { workspacePath, activeTask, setActiveTask, updateActiveTask, cancelTask } = useWorkspace()

  const [status, setStatus] = useState<UploadStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // 环境选择
  const [baseUrl, setBaseUrl] = useState(ENVIRONMENTS[0].value)

  // 选中的文件（统一一个 Set）
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 详情抽屉
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)

  // 筛选
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())

  // 分页状态
  const [pageOffset, setPageOffset] = useState(0)
  const [pageLimit, setPageLimit] = useState(50)

  // 上传并发数
  const [uploadConcurrent, setUploadConcurrent] = useState(3)

  // 加载上传并发数配置
  useEffect(() => {
    const loadUploadConfig = async () => {
      try {
        const config = await window.electronAPI.getConfig()
        if (config?.upload?.concurrent) {
          setUploadConcurrent(config.upload.concurrent)
        }
      } catch (error) {
        console.error('加载上传配置失败:', error)
      }
    }
    if (workspacePath) {
      loadUploadConfig()
    }
  }, [workspacePath])

  // 合并所有书籍到一个列表，标记状态
  const allBooks = useMemo(() => {
    if (!status) return []
    const books: (UploadFileInfo & { _status: 'failed' | 'uploaded' | 'pending' })[] = []
    // 失败优先
    for (const b of status.failedFiles) {
      books.push({ ...b, _status: 'failed' })
    }
    // 待上传
    for (const b of status.canUploadFiles) {
      books.push({ ...b, _status: 'pending' })
    }
    // 已上传
    for (const b of status.uploadedFiles) {
      books.push({ ...b, _status: 'uploaded' })
    }
    return books
  }, [status])

  // 筛选后的列表
  const filteredBooks = useMemo(
    () => allBooks.filter(b => matchesFilter(b as BookWithAllStatus, filters)),
    [allBooks, filters]
  )

  // 分页后的书籍
  const paginatedBooks = useMemo(
    () => pageLimit === 0 ? filteredBooks : filteredBooks.slice(pageOffset, pageOffset + pageLimit),
    [filteredBooks, pageOffset, pageLimit]
  )

  // 是否正在运行上传任务
  const isRunning = activeTask?.type === 'upload' && activeTask.status === 'running'
  const progress = activeTask?.progress

  // 加载状态
  const loadStatus = async () => {
    if (!workspacePath) return

    setLoading(true)
    try {
      const query = new URLSearchParams({ workspacePath })
      const response = await fetch(`${API_BASE}/upload/status?${query}`)
      if (!response.ok) throw new Error('Failed to load status')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Load status error:', error)
      message.error('加载上传状态失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [workspacePath])

  // 开始上传
  const startUpload = async (files?: UploadFileInfo[]) => {
    if (!workspacePath) return

    let filesToUpload: UploadFileInfo[] = files || []
    if (!files || files.length === 0) {
      filesToUpload = Array.from(selected).map(path => {
        const found = allBooks.find(f => f.filePath === path)
        return { filePath: path, title: found?.title || null, author: found?.author || null }
      })
    }

    if (filesToUpload.length === 0) {
      message.warning('请选择要上传的书籍')
      return
    }

    const controller = new AbortController()
    await setActiveTask({
      id: Date.now().toString(),
      type: 'upload',
      status: 'running',
      progress: { type: 'start', total: filesToUpload.length, success: 0, failed: 0, skipped: 0 },
      abortController: controller,
    })
    setSelected(new Set())

    try {
      const response = await fetch(`${API_BASE}/upload/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspacePath,
          files: filesToUpload,
          baseUrl,
          concurrent: uploadConcurrent,
        }),
        signal: controller.signal,
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              updateActiveTask((prev: ActiveTask | null): Partial<ActiveTask> => ({ progress: { ...(prev?.progress || {}), ...data } }))

              if (data.type === 'done') {
                const msgs: string[] = []
                if (data.success > 0) msgs.push(`${data.success} 本成功`)
                if (data.failed > 0) msgs.push(`${data.failed} 本失败`)
                if (data.skipped > 0) msgs.push(`${data.skipped} 本跳过`)
                if (msgs.length > 0) {
                  message.info(`上传完成: ${msgs.join('，')}`)
                }
                // 如果有跳过的，显示原因
                if (data.results) {
                  for (const r of data.results) {
                    if (r.status === 'skipped' && r.error) {
                      message.warning(`${r.title}: ${r.error}`, 5)
                    }
                  }
                }
                setTimeout(() => {
                  setActiveTask(null)
                  loadStatus()
                }, 500)
              } else if (data.type === 'error') {
                message.error(`上传出错: ${data.message}`)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        message.info('上传已取消')
      } else {
        console.error('Upload error:', error)
        message.error('上传失败')
      }
      setActiveTask(null)
      loadStatus()
    }
  }

  // 全部上传（上传所有非已上传的书籍）
  const uploadAll = () => {
    const pending = allBooks.filter(b => b._status !== 'uploaded')
    if (pending.length === 0) {
      message.info('没有可上传的书籍')
      return
    }
    startUpload(pending)
  }

  // 选择切换
  const toggleSelection = (filePath: string) => {
    const next = new Set(selected)
    if (next.has(filePath)) next.delete(filePath)
    else next.add(filePath)
    setSelected(next)
  }

  // 全选
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredBooks.map(f => f.filePath)))
    } else {
      setSelected(new Set())
    }
  }

  // 查看详情
  const viewDetail = (book: UploadFileInfo) => {
    setSelectedBook(book as BookInfo)
    setDetailDrawerOpen(true)
  }

  const pendingCount = allBooks.filter(b => b._status !== 'uploaded').length

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部统计栏 */}
      <Card className="card" style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <Space size="large">
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>总计：</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>{status?.total || 0}</span>
              <span style={{ color: 'var(--text-secondary)' }}> 本</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>待上传：</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#1890ff' }}>{pendingCount}</span>
              <span style={{ color: 'var(--text-secondary)' }}> 本</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>已上传：</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#52c41a' }}>{status?.uploaded || 0}</span>
              <span style={{ color: 'var(--text-secondary)' }}> 本</span>
            </div>
            {(status?.failed || 0) > 0 && (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>失败：</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#ff4d4f' }}>{status?.failed || 0}</span>
                <span style={{ color: 'var(--text-secondary)' }}> 本</span>
              </div>
            )}
          </Space>

          <Space>
            {/* 环境选择 */}
            <Select
              value={baseUrl}
              onChange={setBaseUrl}
              options={ENVIRONMENTS}
              style={{ width: 180 }}
              disabled={isRunning}
            />

            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => startUpload()}
              disabled={selected.size === 0}
            >
              上传选中 ({selected.size})
            </Button>
            <Button
              icon={<CloudUploadOutlined />}
              onClick={uploadAll}
              disabled={pendingCount === 0}
            >
              全部上传
            </Button>
          </Space>
        </div>

        {/* 筛选栏 */}
        <div style={{ marginTop: 12 }}>
          <BookFilter filters={filters} onChange={setFilters} />
        </div>
      </Card>

      {/* 运行中进度卡片 */}
      {isRunning && (
        <TaskProgressCard
          type="upload"
          progress={progress}
          onCancel={cancelTask}
        />
      )}

      {/* 书籍列表 */}
      <Card
        className="card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudUploadOutlined style={{ color: '#1890ff' }} />
            <span>全部书籍 ({filteredBooks.length})</span>
            {filteredBooks.length > 0 && (
              <Checkbox
                checked={selected.size === filteredBooks.length && filteredBooks.length > 0}
                indeterminate={selected.size > 0 && selected.size < filteredBooks.length}
                onChange={(e) => toggleSelectAll(e.target.checked)}
              >
                全选
              </Checkbox>
            )}
          </div>
        }
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
      >
        {paginatedBooks.map((item, i) => {
          let statusTag: React.ReactNode = null
          if (item._status === 'failed') {
            statusTag = (
              <Tooltip title={item.uploadError}>
                <Tag color="error" icon={<CloseCircleOutlined />} style={{ margin: 0 }}>
                  上传失败
                </Tag>
              </Tooltip>
            )
          } else if (item._status === 'uploaded') {
            statusTag = (
              <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
                已上传
              </Tag>
            )
          }

          return (
            <BookItem
              key={`${item._status}-${item.filePath || i}`}
              book={item}
              onClick={() => viewDetail(item)}
              showCheckbox
              checked={selected.has(item.filePath)}
              onCheck={() => toggleSelection(item.filePath)}
              isUploaded={item._status === 'uploaded'}
              statusTag={statusTag}
            />
          )
        })}

        {filteredBooks.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
            <ExclamationCircleOutlined style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }} />
            <div>{filters.size > 0 ? '没有符合筛选条件的书籍' : '工作区内没有 EPUB 文件'}</div>
          </div>
        )}

        <PaginationBar
          total={filteredBooks.length}
          pageOffset={pageOffset}
          pageLimit={pageLimit}
          onPageChange={(offset) => setPageOffset(offset)}
          onPageSizeChange={(limit) => {
            setPageLimit(limit)
            setPageOffset(0)
          }}
        />
      </Card>

      {/* 详情抽屉 */}
      <BookDetailDrawer
        book={selectedBook}
        open={detailDrawerOpen}
        onClose={() => {
          setDetailDrawerOpen(false)
          setSelectedBook(null)
        }}
      />
    </div>
  )
}
