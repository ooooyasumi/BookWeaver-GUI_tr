import { useState, useEffect } from 'react'
import { Card, Button, Space, Checkbox, message, Spin, Progress, Tag, Typography } from 'antd'
import { SyncOutlined, StopOutlined, CheckCircleOutlined, BookOutlined, FileTextOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { BookDetailDrawer, formatFileSize, BookInfo } from '../Common/BookDetailDrawer'
import { BookStatusIcons } from '../Common/BookStatusIcons'

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
  metadataError?: string
  coverUpdated?: boolean
  coverError?: string | null
  uploaded?: boolean
}

interface MetadataStatus {
  total: number
  notUpdated: number
  updated: number
  notUpdatedFiles: FileInfo[]
  updatedFiles: FileInfo[]
}

interface UpdateProgress {
  type: string
  total?: number
  processed?: number
  success?: number
  failed?: number
  latestResults?: any[]
  results?: any[]
  message?: string
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
              coverUpdated={book.coverUpdated}
              coverError={book.coverError}
              uploaded={book.uploaded}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
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
  const { workspacePath } = useWorkspace()

  // 状态
  const [status, setStatus] = useState<MetadataStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)

  // 选中的文件（分别跟踪两个列表）
  const [selectedNotUpdated, setSelectedNotUpdated] = useState<Set<string>>(new Set())
  const [selectedUpdated, setSelectedUpdated] = useState<Set<string>>(new Set())

  // 用于取消 fetch 的 AbortController
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  // 详情抽屉
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)

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

    // 如果没有传入文件，从选中的文件中获取
    let filesToUpdate: FileInfo[] = files || []
    if (!files || files.length === 0) {
      const notUpdatedFiles = Array.from(selectedNotUpdated).map(path => ({
        filePath: path,
        title: status?.notUpdatedFiles.find(f => f.filePath === path)?.title || null,
        author: status?.notUpdatedFiles.find(f => f.filePath === path)?.author || null
      }))
      const updatedFiles = Array.from(selectedUpdated).map(path => ({
        filePath: path,
        title: status?.updatedFiles.find(f => f.filePath === path)?.title || null,
        author: status?.updatedFiles.find(f => f.filePath === path)?.author || null
      }))
      filesToUpdate = [...notUpdatedFiles, ...updatedFiles]
    }

    if (filesToUpdate.length === 0) {
      message.warning('请选择要更新的书籍')
      return
    }

    // 获取配置
    const config = await window.electronAPI.getConfig()

    setUpdating(true)
    setProgress({ type: 'start', total: filesToUpdate.length, success: 0, failed: 0 })
    setSelectedNotUpdated(new Set())
    setSelectedUpdated(new Set())

    const controller = new AbortController()
    setAbortController(controller)

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
              // 合并更新 progress，保留已有的 total 等字段
              setProgress(prev => ({ ...prev, ...data }))

              // 完成时刷新状态
              if (data.type === 'done') {
                setTimeout(() => {
                  loadStatus()
                  setUpdating(false)
                  setProgress(null)
                  setAbortController(null)
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
      setUpdating(false)
      setProgress(null)
      setAbortController(null)
      loadStatus()
    }
  }

  // 全部更新（只更新未更新的）
  const updateAll = () => {
    if (!status?.notUpdatedFiles.length) {
      message.info('没有需要更新的书籍')
      return
    }
    startUpdate(status.notUpdatedFiles)
  }

  // 取消更新
  const cancelUpdate = async () => {
    try {
      // 发送取消信号给后端
      await fetch(`${API_BASE}/metadata/cancel`, { method: 'POST' })
      // 断开 SSE 连接
      if (abortController) {
        abortController.abort()
        setAbortController(null)
      }
    } catch (error) {
      console.error('Cancel error:', error)
    }
  }

  // 选择未更新文件
  const toggleNotUpdatedSelection = (filePath: string) => {
    const newSelected = new Set(selectedNotUpdated)
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath)
    } else {
      newSelected.add(filePath)
    }
    setSelectedNotUpdated(newSelected)
  }

  // 选择已更新文件
  const toggleUpdatedSelection = (filePath: string) => {
    const newSelected = new Set(selectedUpdated)
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath)
    } else {
      newSelected.add(filePath)
    }
    setSelectedUpdated(newSelected)
  }

  // 全选未更新
  const toggleSelectAllNotUpdated = (checked: boolean) => {
    if (checked && status) {
      setSelectedNotUpdated(new Set(status.notUpdatedFiles.map(f => f.filePath)))
    } else {
      setSelectedNotUpdated(new Set())
    }
  }

  // 全选已更新
  const toggleSelectAllUpdated = (checked: boolean) => {
    if (checked && status) {
      setSelectedUpdated(new Set(status.updatedFiles.map(f => f.filePath)))
    } else {
      setSelectedUpdated(new Set())
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

  // 总选中数量
  const totalSelected = selectedNotUpdated.size + selectedUpdated.size

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
            {updating ? (
              <>
                <Progress
                  type="circle"
                  percent={progress?.total ? Math.round(((progress.success || 0) + (progress.failed || 0)) / progress.total * 100) : 0}
                  size={32}
                />
                <span>
                  { (progress?.success || 0) + (progress?.failed || 0) }/{ progress?.total || 0 }
                </span>
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={cancelUpdate}
                >
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={() => startUpdate()}
                  disabled={totalSelected === 0}
                >
                  更新选中 ({totalSelected})
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
              </>
            )}
          </Space>
        </div>
      </Card>

      {/* 书籍列表 - 两列分别滚动 */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, overflow: 'hidden' }}>
        {/* 左侧：未更新列表 */}
        <Card
          className="card"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOutlined style={{ color: '#faad14' }} />
              <span>未更新 ({status?.notUpdatedFiles?.length || 0})</span>
              {status?.notUpdatedFiles && status.notUpdatedFiles.length > 0 && (
                <Checkbox
                  checked={selectedNotUpdated.size === status.notUpdatedFiles.length}
                  indeterminate={selectedNotUpdated.size > 0 && selectedNotUpdated.size < status.notUpdatedFiles.length}
                  onChange={(e) => toggleSelectAllNotUpdated(e.target.checked)}
                >
                  全选
                </Checkbox>
              )}
            </div>
          }
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
        >
          {(status?.notUpdatedFiles || []).map((item, i) => (
            <BookItem
              key={item.filePath || i}
              book={item}
              onClick={() => viewDetail(item)}
              showCheckbox
              checked={selectedNotUpdated.has(item.filePath)}
              onCheck={() => toggleNotUpdatedSelection(item.filePath)}
            />
          ))}
          {(!status?.notUpdatedFiles || status.notUpdatedFiles.length === 0) && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              没有未更新的书籍
            </div>
          )}
        </Card>

        {/* 右侧：已更新列表 */}
        <Card
          className="card"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>已更新 ({status?.updatedFiles?.length || 0})</span>
              {status?.updatedFiles && status.updatedFiles.length > 0 && (
                <Checkbox
                  checked={selectedUpdated.size === status.updatedFiles.length}
                  indeterminate={selectedUpdated.size > 0 && selectedUpdated.size < status.updatedFiles.length}
                  onChange={(e) => toggleSelectAllUpdated(e.target.checked)}
                >
                  全选
                </Checkbox>
              )}
            </div>
          }
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
        >
          {(status?.updatedFiles || []).map((item, i) => (
            <BookItem
              key={item.filePath || i}
              book={item}
              onClick={() => viewDetail(item)}
              showCheckbox
              checked={selectedUpdated.has(item.filePath)}
              onCheck={() => toggleUpdatedSelection(item.filePath)}
            />
          ))}
          {(!status?.updatedFiles || status.updatedFiles.length === 0) && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              没有已更新的书籍
            </div>
          )}
        </Card>
      </div>

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