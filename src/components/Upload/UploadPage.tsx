import { useState, useEffect, useMemo } from 'react'
import { Card, Button, Space, Checkbox, message, Spin, Progress, Tag, Typography, Select, Tooltip } from 'antd'
import {
  CloudUploadOutlined, StopOutlined, CheckCircleOutlined,
  FileTextOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
  TagsOutlined, PictureOutlined
} from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { BookDetailDrawer, formatFileSize, BookInfo } from '../Common/BookDetailDrawer'
import { BookStatusIcons } from '../Common/BookStatusIcons'

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
  // 已上传
  uploadedAt?: string
  uploadBaseUrl?: string
  // 失败
  uploadError?: string
  failedAt?: string
  // 跨页面状态
  metadataUpdated?: boolean
  coverUpdated?: boolean
  coverError?: string | null
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

interface UploadProgress {
  type: string
  total?: number
  processed?: number
  success?: number
  failed?: number
  skipped?: number
  stage?: string
  bookTitle?: string
  latestResult?: any
  results?: any[]
  message?: string
}

// 筛选
type FilterKey = 'metadataUpdated' | 'coverUpdated' | 'coverError' | 'uploaded'

const FILTER_OPTIONS: { key: FilterKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'metadataUpdated', label: '元数据已更新', icon: <TagsOutlined />, color: '#52c41a' },
  { key: 'coverUpdated', label: '封面已更新', icon: <PictureOutlined />, color: '#52c41a' },
  { key: 'coverError', label: '封面更新失败', icon: <CloseCircleOutlined />, color: '#ff4d4f' },
  { key: 'uploaded', label: '已上传', icon: <CloudUploadOutlined />, color: '#52c41a' },
]

function matchesFilter(book: UploadFileInfo, filters: Set<FilterKey>, isUploaded?: boolean): boolean {
  if (filters.size === 0) return true
  for (const f of filters) {
    switch (f) {
      case 'metadataUpdated': if (!book.metadataUpdated) return false; break
      case 'coverUpdated': if (!book.coverUpdated) return false; break
      case 'coverError': if (!(!book.coverUpdated && book.coverError)) return false; break
      case 'uploaded': if (!isUploaded && !book.uploadedAt) return false; break
    }
  }
  return true
}

// ─── 筛选栏 ─────────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  onToggle,
}: {
  filters: Set<FilterKey>
  onToggle: (key: FilterKey) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FILTER_OPTIONS.map(opt => {
        const active = filters.has(opt.key)
        return (
          <Tag
            key={opt.key}
            onClick={() => onToggle(opt.key)}
            style={{
              cursor: 'pointer', margin: 0, userSelect: 'none',
              borderColor: active ? opt.color : undefined,
              color: active ? opt.color : undefined,
              background: active ? `${opt.color}10` : undefined,
            }}
            icon={opt.icon}
          >
            {opt.label}
          </Tag>
        )
      })}
    </div>
  )
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
              coverUpdated={book.coverUpdated}
              coverError={book.coverError}
              uploaded={isUploaded || !!book.uploadedAt}
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
  const { workspacePath } = useWorkspace()

  const [status, setStatus] = useState<UploadStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)

  // 环境选择
  const [baseUrl, setBaseUrl] = useState(ENVIRONMENTS[0].value)

  // 选中的文件
  const [selectedCanUpload, setSelectedCanUpload] = useState<Set<string>>(new Set())
  const [selectedFailed, setSelectedFailed] = useState<Set<string>>(new Set())

  // AbortController
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  // 详情抽屉
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)

  // 筛选
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())
  const toggleFilter = (key: FilterKey) => {
    const next = new Set(filters)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFilters(next)
  }

  // 筛选后的列表
  const filteredCanUpload = useMemo(
    () => (status?.canUploadFiles || []).filter(b => matchesFilter(b, filters)),
    [status?.canUploadFiles, filters]
  )
  const filteredFailed = useMemo(
    () => (status?.failedFiles || []).filter(b => matchesFilter(b, filters)),
    [status?.failedFiles, filters]
  )
  const filteredUploaded = useMemo(
    () => (status?.uploadedFiles || []).filter(b => matchesFilter(b, filters, true)),
    [status?.uploadedFiles, filters]
  )

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
      const canUploadFiles = Array.from(selectedCanUpload).map(path => {
        const found = status?.canUploadFiles.find(f => f.filePath === path)
        return { filePath: path, title: found?.title || null, author: found?.author || null }
      })
      const failedFiles = Array.from(selectedFailed).map(path => {
        const found = status?.failedFiles.find(f => f.filePath === path)
        return { filePath: path, title: found?.title || null, author: found?.author || null }
      })
      filesToUpload = [...canUploadFiles, ...failedFiles]
    }

    if (filesToUpload.length === 0) {
      message.warning('请选择要上传的书籍')
      return
    }

    setUploading(true)
    setProgress({ type: 'start', total: filesToUpload.length, success: 0, failed: 0, skipped: 0 })
    setSelectedCanUpload(new Set())
    setSelectedFailed(new Set())

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch(`${API_BASE}/upload/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspacePath,
          files: filesToUpload,
          baseUrl,
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
              setProgress(prev => ({ ...prev, ...data }))

              if (data.type === 'done') {
                setTimeout(() => {
                  loadStatus()
                  setUploading(false)
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
        message.info('上传已取消')
      } else {
        console.error('Upload error:', error)
        message.error('上传失败')
      }
      setUploading(false)
      setProgress(null)
      setAbortController(null)
      loadStatus()
    }
  }

  // 全部上传
  const uploadAll = () => {
    if (!status?.canUploadFiles.length) {
      message.info('没有可上传的书籍')
      return
    }
    startUpload(status.canUploadFiles)
  }

  // 取消上传
  const cancelUpload = async () => {
    try {
      await fetch(`${API_BASE}/upload/cancel`, { method: 'POST' })
      if (abortController) {
        abortController.abort()
        setAbortController(null)
      }
    } catch (error) {
      console.error('Cancel error:', error)
    }
  }

  // 选择切换
  const toggleCanUploadSelection = (filePath: string) => {
    const newSelected = new Set(selectedCanUpload)
    if (newSelected.has(filePath)) newSelected.delete(filePath)
    else newSelected.add(filePath)
    setSelectedCanUpload(newSelected)
  }

  const toggleFailedSelection = (filePath: string) => {
    const newSelected = new Set(selectedFailed)
    if (newSelected.has(filePath)) newSelected.delete(filePath)
    else newSelected.add(filePath)
    setSelectedFailed(newSelected)
  }

  // 全选
  const toggleSelectAllCanUpload = (checked: boolean) => {
    if (checked) {
      setSelectedCanUpload(new Set(filteredCanUpload.map(f => f.filePath)))
    } else {
      setSelectedCanUpload(new Set())
    }
  }

  const toggleSelectAllFailed = (checked: boolean) => {
    if (checked) {
      setSelectedFailed(new Set(filteredFailed.map(f => f.filePath)))
    } else {
      setSelectedFailed(new Set())
    }
  }

  // 查看详情
  const viewDetail = (book: UploadFileInfo) => {
    setSelectedBook(book as BookInfo)
    setDetailDrawerOpen(true)
  }

  // 阶段描述
  const getStageText = (stage?: string) => {
    switch (stage) {
      case 'uploading_cover': return '上传封面'
      case 'uploading_epub': return '上传文件'
      case 'adding_book': return '添加记录'
      default: return '处理中'
    }
  }

  const totalSelected = selectedCanUpload.size + selectedFailed.size
  const totalPending = filteredCanUpload.length + filteredFailed.length

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
              <span style={{ color: 'var(--text-secondary)' }}>可上传：</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#1890ff' }}>{status?.canUpload || 0}</span>
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
              disabled={uploading}
            />

            {uploading ? (
              <>
                <Progress
                  type="circle"
                  percent={progress?.total ? Math.round(((progress.success || 0) + (progress.failed || 0) + (progress.skipped || 0)) / progress.total * 100) : 0}
                  size={32}
                />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                  <span style={{ fontSize: 13 }}>
                    {(progress?.success || 0) + (progress?.failed || 0) + (progress?.skipped || 0)}/{progress?.total || 0}
                  </span>
                  {progress?.bookTitle && (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {getStageText(progress?.stage)} - {progress.bookTitle.length > 20 ? progress.bookTitle.slice(0, 20) + '...' : progress.bookTitle}
                    </span>
                  )}
                </div>
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={cancelUpload}
                >
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  onClick={() => startUpload()}
                  disabled={totalSelected === 0}
                >
                  上传选中 ({totalSelected})
                </Button>
                <Button
                  icon={<CloudUploadOutlined />}
                  onClick={uploadAll}
                  disabled={!status?.canUploadFiles.length}
                >
                  全部上传
                </Button>
              </>
            )}
          </Space>
        </div>

        {/* 筛选栏 */}
        <div style={{ marginTop: 12 }}>
          <FilterBar filters={filters} onToggle={toggleFilter} />
        </div>
      </Card>

      {/* 书籍列表 */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, overflow: 'hidden' }}>
        {/* 左侧：可上传 + 失败 */}
        <Card
          className="card"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudUploadOutlined style={{ color: '#1890ff' }} />
              <span>待上传 ({totalPending})</span>
              {totalPending > 0 && (
                <Checkbox
                  checked={
                    selectedCanUpload.size + selectedFailed.size === totalPending &&
                    totalPending > 0
                  }
                  indeterminate={
                    selectedCanUpload.size + selectedFailed.size > 0 &&
                    selectedCanUpload.size + selectedFailed.size < totalPending
                  }
                  onChange={(e) => {
                    toggleSelectAllCanUpload(e.target.checked)
                    toggleSelectAllFailed(e.target.checked)
                  }}
                >
                  全选
                </Checkbox>
              )}
            </div>
          }
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
        >
          {/* 失败的文件（优先显示） */}
          {filteredFailed.map((item, i) => (
            <BookItem
              key={`fail-${item.filePath || i}`}
              book={item}
              onClick={() => viewDetail(item)}
              showCheckbox
              checked={selectedFailed.has(item.filePath)}
              onCheck={() => toggleFailedSelection(item.filePath)}
              statusTag={
                <Tooltip title={item.uploadError}>
                  <Tag color="error" icon={<CloseCircleOutlined />} style={{ margin: 0 }}>
                    失败
                  </Tag>
                </Tooltip>
              }
            />
          ))}

          {/* 可上传的文件 */}
          {filteredCanUpload.map((item, i) => (
            <BookItem
              key={`can-${item.filePath || i}`}
              book={item}
              onClick={() => viewDetail(item)}
              showCheckbox
              checked={selectedCanUpload.has(item.filePath)}
              onCheck={() => toggleCanUploadSelection(item.filePath)}
            />
          ))}

          {(filteredCanUpload.length === 0 && filteredFailed.length === 0) && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              <ExclamationCircleOutlined style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }} />
              <div>{filters.size > 0 ? '没有符合筛选条件的书籍' : '没有可上传的书籍'}</div>
              {filters.size === 0 && (
                <div style={{ fontSize: 12, marginTop: 4 }}>请先在元数据管理页面更新书籍元数据</div>
              )}
            </div>
          )}
        </Card>

        {/* 右侧：已上传 */}
        <Card
          className="card"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>已上传 ({filteredUploaded.length})</span>
            </div>
          }
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
        >
          {filteredUploaded.map((item, i) => (
            <BookItem
              key={item.filePath || i}
              book={item}
              onClick={() => viewDetail(item)}
              isUploaded
              statusTag={
                <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
                  已上传
                </Tag>
              }
            />
          ))}
          {filteredUploaded.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              {filters.size > 0 ? '没有符合筛选条件的书籍' : '没有已上传的书籍'}
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
