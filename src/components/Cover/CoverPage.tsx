import { useState, useEffect } from 'react'
import { Card, Button, Space, Checkbox, message, Spin, Progress, Slider, Typography } from 'antd'
import { PictureOutlined, SyncOutlined, StopOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { BookStatusIcons } from '../Common/BookStatusIcons'

const { Text } = Typography

const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

interface CoverFileInfo {
  filePath: string
  title: string | null
  author: string | null
  coverBase64?: string
  coverMediaType?: string
  coverUpdated?: boolean
  coverError?: string
  metadataUpdated?: boolean
  uploaded?: boolean
}

interface CoverStatus {
  total: number
  notUpdated: number
  updated: number
  notUpdatedFiles: CoverFileInfo[]
  updatedFiles: CoverFileInfo[]
}

interface UpdateProgress {
  type: string
  total?: number
  processed?: number
  success?: number
  failed?: number
  latestResult?: {
    filePath: string
    success: boolean
    error?: string
    coverBase64?: string
    coverMediaType?: string
  }
}

// ─── 封面卡片 ────────────────────────────────────────────────────────────────

function CoverCard({
  book,
  selected,
  onToggle,
  colWidth,
}: {
  book: CoverFileInfo
  selected: boolean
  onToggle: () => void
  colWidth: number
}) {
  const coverSrc = book.coverBase64
    ? `data:${book.coverMediaType || 'image/jpeg'};base64,${book.coverBase64}`
    : null

  return (
    <div
      onClick={onToggle}
      style={{
        width: colWidth,
        cursor: 'pointer',
        borderRadius: 10,
        border: selected ? '2.5px solid #1677ff' : '2.5px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: selected ? '0 0 0 2px rgba(22,119,255,0.15)' : 'none',
      }}
    >
      {/* 封面图片 */}
      <div style={{
        width: '100%',
        aspectRatio: '2/3',
        background: 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={book.title || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <PictureOutlined style={{ fontSize: 36, color: 'var(--text-tertiary)' }} />
        )}
      </div>

      {/* 状态标记：成功绿勾 / 失败红叉 */}
      {book.coverUpdated && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          background: '#52c41a', borderRadius: '50%',
          width: 22, height: 22, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircleOutlined style={{ color: '#fff', fontSize: 13 }} />
        </div>
      )}
      {!book.coverUpdated && book.coverError && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          background: '#ff4d4f', borderRadius: '50%',
          width: 22, height: 22, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <CloseCircleOutlined style={{ color: '#fff', fontSize: 13 }} />
        </div>
      )}

      {/* 标题 */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          lineHeight: '1.3',
        }}>
          {book.title || 'Untitled'}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {book.author || 'Unknown'}
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
  )
}

// ─── CoverPage ───────────────────────────────────────────────────────────────

export function CoverPage() {
  const { workspacePath } = useWorkspace()

  const [status, setStatus] = useState<CoverStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [columns, setColumns] = useState(5)

  // 合并全部文件（未更新在前）
  const allBooks = status ? [...status.notUpdatedFiles, ...status.updatedFiles] : []

  // ── 加载状态 ────────────────────────────────────────────────────────────

  const loadStatus = async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const query = new URLSearchParams({ workspacePath })
      const response = await fetch(`${API_BASE}/cover/status?${query}`)
      if (!response.ok) throw new Error('Failed to load status')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Cover load status error:', error)
      message.error('加载封面状态失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [workspacePath])

  // ── 选择逻辑 ────────────────────────────────────────────────────────────

  const toggleSelection = (filePath: string) => {
    const next = new Set(selected)
    if (next.has(filePath)) {
      next.delete(filePath)
    } else {
      next.add(filePath)
    }
    setSelected(next)
  }

  // 全选：只选未更新的
  const handleSelectAll = (checked: boolean) => {
    if (checked && status) {
      setSelected(new Set(status.notUpdatedFiles.map(f => f.filePath)))
    } else {
      setSelected(new Set())
    }
  }

  const notUpdatedCount = status?.notUpdatedFiles.length || 0
  const isAllSelected = notUpdatedCount > 0 && selected.size === notUpdatedCount
  const isIndeterminate = selected.size > 0 && selected.size < notUpdatedCount

  // ── 开始更新 ────────────────────────────────────────────────────────────

  const startUpdate = async (files?: CoverFileInfo[]) => {
    if (!workspacePath) return

    let filesToUpdate = files || []
    if (!files || files.length === 0) {
      filesToUpdate = allBooks.filter(b => selected.has(b.filePath))
    }
    if (filesToUpdate.length === 0) {
      message.warning('请选择要更新封面的书籍')
      return
    }

    setUpdating(true)
    setProgress({ type: 'start', total: filesToUpdate.length, success: 0, failed: 0 })
    setSelected(new Set())

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch(`${API_BASE}/cover/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath, files: filesToUpdate }),
        signal: controller.signal,
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              setProgress(prev => ({ ...prev, ...data }))

              // 实时更新封面：当某本书更新成功，更新 status 中对应书的封面
              if (data.latestResult?.success && data.latestResult.coverBase64) {
                setStatus(prev => {
                  if (!prev) return prev
                  const fp = data.latestResult.filePath
                  const updateBook = (list: CoverFileInfo[]) =>
                    list.map(b => b.filePath === fp ? {
                      ...b,
                      coverBase64: data.latestResult.coverBase64,
                      coverMediaType: data.latestResult.coverMediaType,
                      coverUpdated: true,
                    } : b)
                  return {
                    ...prev,
                    notUpdatedFiles: updateBook(prev.notUpdatedFiles),
                    updatedFiles: updateBook(prev.updatedFiles),
                  }
                })
              }

              if (data.type === 'done') {
                setTimeout(() => {
                  loadStatus()
                  setUpdating(false)
                  setProgress(null)
                  setAbortController(null)
                }, 500)
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        message.info('更新已取消')
      } else {
        console.error('Cover update error:', error)
        message.error('更新封面失败')
      }
      setUpdating(false)
      setProgress(null)
      setAbortController(null)
      loadStatus()
    }
  }

  const updateAll = () => {
    if (!status?.notUpdatedFiles.length) {
      message.info('没有需要更新封面的书籍')
      return
    }
    startUpdate(status.notUpdatedFiles)
  }

  const cancelUpdate = async () => {
    try {
      await fetch(`${API_BASE}/cover/cancel`, { method: 'POST' })
      if (abortController) {
        abortController.abort()
        setAbortController(null)
      }
    } catch (error) {
      console.error('Cancel error:', error)
    }
  }

  const resetStatus = async () => {
    if (!workspacePath) return
    try {
      const query = new URLSearchParams({ workspacePath })
      await fetch(`${API_BASE}/cover/reset-status?${query}`, { method: 'POST' })
      message.success('已重置所有封面状态')
      loadStatus()
    } catch (error) {
      console.error('Reset error:', error)
      message.error('重置失败')
    }
  }

  // ── 渲染 ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  // 计算卡片宽度（容器宽度 - 间距）
  const gap = 12
  const colWidthCalc = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部 Dock 栏 */}
      <Card className="card" style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Space size="middle">
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>总计：</span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{status?.total || 0}</span>
              <span style={{ color: 'var(--text-secondary)' }}> 本</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>未更新：</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#faad14' }}>{status?.notUpdated || 0}</span>
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
                  {(progress?.success || 0) + (progress?.failed || 0)}/{progress?.total || 0}
                </span>
                <Button danger icon={<StopOutlined />} onClick={cancelUpdate}>
                  停止
                </Button>
              </>
            ) : (
              <>
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isIndeterminate}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                >
                  全选
                </Checkbox>
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={() => startUpdate()}
                  disabled={selected.size === 0}
                >
                  更新封面 ({selected.size})
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

      {/* 列数调整 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '0 4px' }}>
        <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>每行列数</Text>
        <Slider
          min={3} max={8} value={columns}
          onChange={setColumns}
          style={{ flex: 1, maxWidth: 200 }}
        />
        <Text type="secondary" style={{ fontSize: 13 }}>{columns}</Text>
      </div>

      {/* 书籍网格 */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 20 }}>
        {allBooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-tertiary)' }}>
            <PictureOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <div>没有书籍</div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap,
          }}>
            {allBooks.map((book) => (
              <CoverCard
                key={book.filePath}
                book={book}
                selected={selected.has(book.filePath)}
                onToggle={() => toggleSelection(book.filePath)}
                colWidth={colWidthCalc as any}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
