import { useState, useEffect, useMemo } from 'react'
import { Card, Button, Space, Checkbox, message, Spin, Tag, Typography, Tooltip } from 'antd'
import { SyncOutlined, FileTextOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { BookDetailDrawer, formatFileSize, BookInfo } from '../Common/BookDetailDrawer'
import { BookStatusIcons } from '../Common/BookStatusIcons'
import { BookFilter, FilterKey, matchesFilter, BookWithAllStatus } from '../Common/BookFilter'
import { TaskProgressCard } from '../Common/TaskProgressCard'

const { Text } = Typography

// API 地址配置
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

interface FileInfo {
  filePath: string
  title: string | null
  author: string | null
  language?: string | null
  publishYear?: number | null
  subjects?: string[]
  fileSize?: number
  metadataUpdated?: boolean
  metadataError?: string | null
  coverUpdated?: boolean
  coverError?: string | null
  uploaded?: boolean
  uploadError?: string | null
  uploadedAt?: string | null
}

// ─── MetadataStatus ──────────────────────────────────────────────────────────

interface MetadataStatus {
  total: number
  notUpdated: number
  updated: number
  notUpdatedFiles: FileInfo[]
  updatedFiles: FileInfo[]
}

// ─── 书籍列表项 ─────────────────────────────────────────────────────────────

function BookItem({
  book,
  onClick,
  showCheckbox = false,
  checked = false,
  onCheck
}: {
  book: FileInfo
  onClick: () => void
  showCheckbox?: boolean
  checked?: boolean
  onCheck?: () => void
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
              uploaded={book.uploaded}
              uploadError={book.uploadError}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
        {book.metadataError && (
          <Tooltip title={book.metadataError}>
            <Tag color="error" style={{ margin: 0 }}>元数据失败</Tag>
          </Tooltip>
        )}
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

// ─── MetadataPage ─────────────────────────────────────────────────────────────

export function MetadataPage() {
  const { workspacePath, activeTask, setActiveTask, updateActiveTask, cancelTask } = useWorkspace()

  // 状态
  const [status, setStatus] = useState<MetadataStatus | null>(null)
  const [loading, setLoading] = useState(true)
  // 实时更新的已处理批次（增量显示用）
  const [processedBatch, setProcessedBatch] = useState<FileInfo[]>([])

  // 选中
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 筛选
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())

  // 详情抽屉
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)

  // 合并所有书籍（processedBatch 实时增量追加）
  const allBooks = useMemo(() => {
    if (!status) return []
    const processedPaths = new Set(processedBatch.map(b => b.filePath))
    const notUpdated = status.notUpdatedFiles.filter(f => !processedPaths.has(f.filePath))
    return [...status.updatedFiles, ...processedBatch, ...notUpdated]
  }, [status, processedBatch])

  // 筛选后的书籍
  const filteredBooks = useMemo(
    () => allBooks.filter(b => matchesFilter(b as BookWithAllStatus, filters)),
    [allBooks, filters]
  )

  // 是否正在运行元数据任务
  const isRunning = activeTask?.type === 'metadata' && activeTask.status === 'running'
  const progress = activeTask?.progress

  // 加载状态
  const loadStatus = async () => {
    if (!workspacePath) return

    setLoading(true)
    try {
      const query = new URLSearchParams({ workspacePath })
      const response = await fetch(`${API_BASE}/metadata/status?${query}`)
      if (!response.ok) throw new Error('Failed to load status')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Load status error:', error)
      message.error('加载状态失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [workspacePath])

  // 开始更新
  const startUpdate = async (files?: FileInfo[]) => {
    if (!workspacePath) return

    let filesToUpdate: FileInfo[] = files || []
    if (!files || files.length === 0) {
      filesToUpdate = Array.from(selected).map(path => {
        const found = allBooks.find(f => f.filePath === path)
        return { filePath: path, title: found?.title || null, author: found?.author || null }
      })
    }

    if (filesToUpdate.length === 0) {
      message.warning('请选择要更新的书籍')
      return
    }

    const config = await window.electronAPI.getConfig()

    // 开始前清空上次的增量结果
    setProcessedBatch([])

    const controller = new AbortController()
    await setActiveTask({
      id: Date.now().toString(),
      type: 'metadata',
      status: 'running',
      progress: { type: 'start', total: filesToUpdate.length, success: 0, failed: 0 },
      abortController: controller,
    })
    setSelected(new Set())

    try {
      const response = await fetch(`${API_BASE}/metadata/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspacePath,
          files: filesToUpdate,
          config: config?.llm || {}
        }),
        signal: controller.signal
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
              updateActiveTask(prev => ({ progress: { ...(prev?.progress || {}), ...data } }))

              // 收到每批次结果时，实时追加到 processedBatch
              if (data.latestResults && Array.isArray(data.latestResults)) {
                const batchItems: FileInfo[] = data.latestResults.map((r: { filePath: string; title: string; success: boolean; error?: string }) => ({
                  filePath: r.filePath,
                  title: r.title,
                  author: null,
                  metadataUpdated: r.success,
                  metadataError: r.success ? null : (r.error || '更新失败'),
                }))
                setProcessedBatch(prev => [...prev, ...batchItems])
              }

              if (data.type === 'done') {
                message.success(`更新完成: 成功 ${data.success || 0}, 失败 ${data.failed || 0}`)
                setTimeout(() => {
                  setActiveTask(null)
                  loadStatus()
                }, 500)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        message.info('更新已取消')
      } else {
        console.error('Update error:', error)
        message.error('更新失败')
      }
      setActiveTask(null)
      loadStatus()
    }
  }

  // 全部更新
  const updateAll = () => {
    if (!status?.notUpdatedFiles.length) {
      message.info('没有需要更新的书籍')
      return
    }
    startUpdate(status.notUpdatedFiles)
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
  const viewDetail = (book: FileInfo) => {
    setSelectedBook(book)
    setDetailDrawerOpen(true)
  }

  // 重置状态
  const resetStatus = async () => {
    if (!workspacePath) return
    try {
      const query = new URLSearchParams({ workspacePath })
      await fetch(`${API_BASE}/metadata/reset-status?${query}`, { method: 'POST' })
      message.success('已重置所有元数据状态')
      loadStatus()
    } catch (error) {
      console.error('Reset error:', error)
      message.error('重置失败')
    }
  }

  const isAllSelected = filteredBooks.length > 0 && selected.size === filteredBooks.length
  const isIndeterminate = selected.size > 0 && selected.size < filteredBooks.length

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
              <span style={{ fontSize: 20, fontWeight: 600 }}>{status?.total || 0}</span>
              <span style={{ color: 'var(--text-secondary)' }}> 本</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>未更新：</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#faad14' }}>{status?.notUpdated || 0}</span>
              <span style={{ color: 'var(--text-secondary)' }}> 本</span>
            </div>
          </Space>

          <Space>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={() => startUpdate()}
              disabled={selected.size === 0}
            >
              更新选中 ({selected.size})
            </Button>
            <Button
              icon={<SyncOutlined />}
              onClick={updateAll}
              disabled={!status?.notUpdatedFiles.length}
            >
              全部更新
            </Button>
            <Button onClick={resetStatus}>
              重置状态
            </Button>
          </Space>
        </div>

        {/* 筛选栏 */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={isIndeterminate}
            onChange={(e) => toggleSelectAll(e.target.checked)}
          >
            全选
          </Checkbox>
          <BookFilter filters={filters} onChange={setFilters} />
        </div>
      </Card>

      {/* 运行中进度卡片 */}
      {isRunning && (
        <TaskProgressCard
          type="metadata"
          progress={progress}
          onCancel={cancelTask}
        />
      )}

      {/* 书籍列表 */}
      <Card
        className="card"
        title={<span>全部书籍 ({filteredBooks.length})</span>}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
      >
        {filteredBooks.map((item, i) => (
          <BookItem
            key={item.filePath || i}
            book={item}
            onClick={() => viewDetail(item)}
            showCheckbox
            checked={selected.has(item.filePath)}
            onCheck={() => toggleSelection(item.filePath)}
          />
        ))}
        {filteredBooks.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
            {filters.size > 0 ? '没有符合筛选条件的书籍' : '没有需要更新的书籍'}
          </div>
        )}
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