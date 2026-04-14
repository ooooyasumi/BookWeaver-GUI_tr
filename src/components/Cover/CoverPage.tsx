import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card, Button, Space, Checkbox, message, Spin, Slider, Typography, Modal } from 'antd'
import { PictureOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, DeleteOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { BookStatusIcons } from '../Common/BookStatusIcons'
import { TaskProgressCard } from '../Common/TaskProgressCard'
import { BookFilter, FilterKey, matchesFilter, BookWithAllStatus } from '../Common/BookFilter'

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
  coverError?: string | null
  metadataUpdated?: boolean
  metadataError?: string | null
  uploaded?: boolean
  uploadError?: string | null
}

interface CoverStatus {
  total: number
  offset: number
  limit: number
  notUpdated: number
  updated: number
  notUpdatedFiles: CoverFileInfo[]
  updatedFiles: CoverFileInfo[]
  files: CoverFileInfo[]  // 当前页数据
}

// ─── 封面卡片（支持懒加载缩略图）───────────────────────────────────────────────

function CoverCard({
  book,
  selected,
  onToggle,
  colWidth,
  thumbLoading,
  onVisible,
}: {
  book: CoverFileInfo
  selected: boolean
  onToggle: () => void
  colWidth: number
  thumbLoading?: boolean
  onVisible?: (filePath: string) => void
}) {
  const coverSrc = book.coverBase64
    ? `data:${book.coverMediaType || 'image/jpeg'};base64,${book.coverBase64}`
    : null

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || !onVisible) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !book.coverBase64) {
            onVisible(book.filePath)
          }
        })
      },
      { rootMargin: '100px' }  // 提前 100px 开始加载
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [onVisible, book.filePath, book.coverBase64])

  return (
    <div
      ref={containerRef}
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
        ) : thumbLoading ? (
          <LoadingOutlined style={{ fontSize: 28, color: 'var(--text-quaternary)' }} />
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
            metadataError={book.metadataError}
            coverUpdated={book.coverUpdated}
            coverError={book.coverError}
            uploaded={book.uploaded}
            uploadError={book.uploadError}
          />
        </div>
      </div>
    </div>
  )
}

// ─── CoverPage ───────────────────────────────────────────────────────────────

export function CoverPage() {
  const { workspacePath, activeTask, setActiveTask, updateActiveTask, cancelTask } = useWorkspace()

  const [status, setStatus] = useState<CoverStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [thumbLoading, setThumbLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [columns, setColumns] = useState(5)
  const [deleting, setDeleting] = useState(false)
  const [visibleBooks, setVisibleBooks] = useState<Set<string>>(new Set())  // 已加载缩略图的书籍

  // 筛选
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())

  // 分页状态
  const [pageOffset, setPageOffset] = useState(0)
  const [pageLimit, setPageLimit] = useState(50)  // 每页显示数量

  // 合并全部文件（未更新在前）
  const allBooks = useMemo(() => {
    if (!status) return []
    return [...status.notUpdatedFiles, ...status.updatedFiles]
  }, [status])

  // 筛选后的书籍（分页后）
  const filteredBooks = useMemo(() => {
    const baseFiltered = allBooks.filter(b => matchesFilter(b as BookWithAllStatus, filters))
    return baseFiltered.slice(pageOffset, pageOffset + pageLimit)
  }, [allBooks, filters, pageOffset, pageLimit])

  // 总筛选后的数量（用于分页）
  const totalFiltered = useMemo(() => {
    return allBooks.filter(b => matchesFilter(b as BookWithAllStatus, filters)).length
  }, [allBooks, filters])

  // 是否正在运行封面任务
  const isRunning = activeTask?.type === 'cover' && activeTask.status === 'running'
  const progress = activeTask?.progress

  // ── 加载缩略图（独立请求，分页）──────────────────────────────────────────

  const loadThumbnails = useCallback(async (filePaths: string[], offset = 0, limit = 0) => {
    if (!workspacePath || filePaths.length === 0) return
    setThumbLoading(true)
    try {
      const payload: any = { workspacePath, filePaths }
      if (offset > 0 || limit > 0) {
        payload.offset = offset
        payload.limit = limit
      }
      const response = await fetch(`${API_BASE}/cover/thumbnails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const detail = errData.detail || `HTTP ${response.status}`
        console.error('[Cover] 缩略图加载失败:', detail)
        message.warning(`封面缩略图加载失败: ${detail}`, 6)
        return
      }
      const data = await response.json()
      const thumbnails = data.thumbnails || {}

      // 合并缩略图到 status
      setStatus(prev => {
        if (!prev) return prev
        const mergeThumbs = (list: CoverFileInfo[]) =>
          list.map(b => {
            const t = thumbnails[b.filePath]
            return t ? { ...b, coverBase64: t.base64, coverMediaType: t.mediaType } : b
          })
        return {
          ...prev,
          notUpdatedFiles: mergeThumbs(prev.notUpdatedFiles),
          updatedFiles: mergeThumbs(prev.updatedFiles),
        }
      })
    } catch (error: any) {
      console.error('[Cover] 缩略图请求异常:', error)
      message.warning(`封面缩略图请求失败: ${error?.message || '网络错误'}`, 6)
    } finally {
      setThumbLoading(false)
    }
  }, [workspacePath])

  // ── 加载状态（轻量，不含缩略图）──────────────────────────────────────────

  const loadStatus = useCallback(async (usePagination = true) => {
    if (!workspacePath) return
    setLoading(true)
    setStatusError(null)
    try {
      const params = new URLSearchParams({ workspacePath })
      if (usePagination) {
        params.set('offset', String(pageOffset))
        params.set('limit', String(pageLimit))
        params.set('filter_updated', 'all')
      }
      const response = await fetch(`${API_BASE}/cover/status?${params}`)
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const detail = errData.detail || `HTTP ${response.status}`
        throw new Error(detail)
      }
      const data: CoverStatus = await response.json()
      setStatus(data)
      // 不再自动加载缩略图，改用懒加载（IntersectionObserver）
    } catch (error: any) {
      const errMsg = error?.message || '未知错误'
      console.error('[Cover] 状态加载失败:', errMsg)
      setStatusError(errMsg)
      message.error({
        content: `加载封面状态失败: ${errMsg}`,
        duration: 8,
      })
    } finally {
      setLoading(false)
    }
  }, [workspacePath, pageOffset, pageLimit, loadThumbnails])

  // 分页变化时重载
  const handlePageChange = useCallback((offset: number, limit: number) => {
    setPageOffset(offset)
    setPageLimit(limit)
    setSelected(new Set())
    setVisibleBooks(new Set())  // 清空已加载的缩略图
  }, [])

  // ── 懒加载：滚动到可见范围时加载单个缩略图 ───────────────────────────────

  const handleBookVisible = useCallback(async (filePath: string) => {
    if (!workspacePath || visibleBooks.has(filePath)) return
    setVisibleBooks(prev => new Set(prev).add(filePath))
    setThumbLoading(true)
    try {
      const response = await fetch(`${API_BASE}/cover/thumbnails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath, filePaths: [filePath] }),
      })
      if (!response.ok) return
      const data = await response.json()
      const thumbnails = data.thumbnails || {}
      const thumb = thumbnails[filePath]
      if (thumb) {
        setStatus(prev => {
          if (!prev) return prev
          const updateBook = (list: CoverFileInfo[]) =>
            list.map(b => b.filePath === filePath ? { ...b, coverBase64: thumb.base64, coverMediaType: thumb.mediaType } : b)
          return {
            ...prev,
            notUpdatedFiles: updateBook(prev.notUpdatedFiles),
            updatedFiles: updateBook(prev.updatedFiles),
          }
        })
      }
    } catch (e) {
      // ignore
    } finally {
      setThumbLoading(false)
    }
  }, [workspacePath, visibleBooks])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

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

  // 全选：选中所有书籍
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredBooks.map(f => f.filePath)))
    } else {
      setSelected(new Set())
    }
  }

  const isAllSelected = filteredBooks.length > 0 && selected.size === filteredBooks.length
  const isIndeterminate = selected.size > 0 && selected.size < filteredBooks.length

  // ── 开始更新 ────────────────────────────────────────────────────────────

  const startUpdate = async (files?: CoverFileInfo[]) => {
    if (!workspacePath) return

    let filesToUpdate = files || []
    if (!files || files.length === 0) {
      filesToUpdate = filteredBooks.filter(b => selected.has(b.filePath))
    }
    if (filesToUpdate.length === 0) {
      message.warning('请选择要更新封面的书籍')
      return
    }

    const controller = new AbortController()
    await setActiveTask({
      id: Date.now().toString(),
      type: 'cover',
      status: 'running',
      progress: { type: 'start', total: filesToUpdate.length, success: 0, failed: 0 },
      abortController: controller,
    })
    setSelected(new Set())

    try {
      const response = await fetch(`${API_BASE}/cover/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath, files: filesToUpdate }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${response.status}`)
      }

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
              updateActiveTask(prev => ({ progress: { ...(prev?.progress || {}), ...data } }))

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

              if (data.type === 'error') {
                message.error(`封面更新出错: ${data.message || '未知错误'}`, 6)
              }

              if (data.type === 'done') {
                const msg = `封面更新完成: 成功 ${data.success || 0}, 失败 ${data.failed || 0}`
                if (data.failed > 0) {
                  message.warning(msg, 5)
                } else {
                  message.success(msg, 3)
                }
                setTimeout(() => {
                  setActiveTask(null)
                  loadStatus()
                }, 500)
              }
            } catch { /* ignore parse error */ }
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        message.info('更新已取消')
      } else {
        const errMsg = error?.message || '未知错误'
        console.error('[Cover] 更新失败:', errMsg)
        message.error(`更新封面失败: ${errMsg}`, 6)
      }
      setActiveTask(null)
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

  const resetStatus = async () => {
    if (!workspacePath) return
    try {
      const query = new URLSearchParams({ workspacePath })
      const resp = await fetch(`${API_BASE}/cover/reset-status?${query}`, { method: 'POST' })
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${resp.status}`)
      }
      message.success('已重置所有封面状态')
      loadStatus()
    } catch (error: any) {
      console.error('[Cover] 重置失败:', error)
      message.error(`重置失败: ${error?.message || '未知错误'}`)
    }
  }

  // ── 删除选中书籍 ──────────────────────────────────────────────────────

  const handleDelete = () => {
    if (selected.size === 0) return
    Modal.confirm({
      title: `确认删除 ${selected.size} 本书籍？`,
      content: '文件将从磁盘永久删除，此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true)
        try {
          const response = await fetch(`${API_BASE}/library/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspacePath,
              filePaths: Array.from(selected),
            }),
          })
          const result = await response.json()
          if (result.success) {
            message.success(`已删除 ${result.deleted} 本书`)
            setSelected(new Set())
            loadStatus()
          } else {
            message.error(`删除失败: ${result.error || '未知错误'}`)
          }
        } catch (e: any) {
          console.error('[Cover] 删除失败:', e)
          message.error(`删除请求失败: ${e?.message || '网络错误'}`)
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  // ── 渲染 ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  // 状态加载失败时显示错误详情 + 重试按钮
  if (statusError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
        <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>加载封面状态失败</div>
        <div style={{
          fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 500, textAlign: 'center',
          padding: '8px 16px', background: 'var(--bg-tertiary)', borderRadius: 8,
          wordBreak: 'break-all',
        }}>
          {statusError}
        </div>
        <Button type="primary" icon={<SyncOutlined />} onClick={loadStatus}>
          重试
        </Button>
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
            {thumbLoading && (
              <div>
                <LoadingOutlined style={{ marginRight: 4 }} />
                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>加载封面中...</span>
              </div>
            )}
          </Space>

          <Space>
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
            {selected.size > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                loading={deleting}
              >
                删除 ({selected.size})
              </Button>
            )}
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
          type="cover"
          progress={progress}
          onCancel={cancelTask}
        />
      )}

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
        {filteredBooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-tertiary)' }}>
            <PictureOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <div>{filters.size > 0 ? '没有符合筛选条件的书籍' : '没有书籍'}</div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap,
          }}>
            {filteredBooks.map((book) => (
              <CoverCard
                key={book.filePath}
                book={book}
                selected={selected.has(book.filePath)}
                onToggle={() => toggleSelection(book.filePath)}
                colWidth={colWidthCalc as any}
                thumbLoading={thumbLoading && !book.coverBase64}
                onVisible={!book.coverBase64 ? handleBookVisible : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* 分页控制 */}
      {status && status.total > pageLimit && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 4px', flexShrink: 0, background: 'var(--bg-secondary)',
          borderRadius: 8, marginBottom: 8,
        }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            共 {totalFiltered} 本 | 当前 {pageOffset + 1}-{Math.min(pageOffset + pageLimit, totalFiltered)} 本
          </Text>
          <Space>
            <Button
              size="small"
              disabled={pageOffset === 0}
              onClick={() => handlePageChange(0, pageLimit)}
            >
              首页
            </Button>
            <Button
              size="small"
              disabled={pageOffset === 0}
              onClick={() => handlePageChange(Math.max(0, pageOffset - pageLimit), pageLimit)}
            >
              上一页
            </Button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 8px' }}>
              第 {Math.floor(pageOffset / pageLimit) + 1} / {Math.ceil(totalFiltered / pageLimit)} 页
            </span>
            <Button
              size="small"
              disabled={pageOffset + pageLimit >= totalFiltered}
              onClick={() => handlePageChange(pageOffset + pageLimit, pageLimit)}
            >
              下一页
            </Button>
            <Button
              size="small"
              disabled={pageOffset + pageLimit >= totalFiltered}
              onClick={() => handlePageChange(Math.floor((totalFiltered - 1) / pageLimit) * pageLimit, pageLimit)}
            >
              末页
            </Button>
            <select
              value={pageLimit}
              onChange={e => handlePageChange(0, Number(e.target.value))}
              style={{
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: 4, padding: '2px 8px', color: 'var(--text-primary)',
              }}
            >
              <option value={20}>20/页</option>
              <option value={50}>50/页</option>
              <option value={100}>100/页</option>
            </select>
          </Space>
        </div>
      )}
    </div>
  )
}
