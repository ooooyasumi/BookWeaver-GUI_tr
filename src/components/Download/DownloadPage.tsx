import { useState, useRef } from 'react'
import { Tabs, Button, Progress, Space, message, Card, Typography, Empty, Tag, Collapse, List } from 'antd'
import {
  PlayCircleOutlined, PauseCircleOutlined, CloseCircleOutlined,
  FolderOutlined, CheckCircleOutlined, CloseCircleOutlined as FailIcon
} from '@ant-design/icons'
import {
  useWorkspace, PendingBook, BatchSummary, BatchMeta, DownloadResult, ActiveDownload
} from '../../contexts/WorkspaceContext'

const { Text } = Typography

// 打包后 file:// 协议必须直连后端
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

// ─── 网速格式化 ───────────────────────────────────────────────────────────────

function formatSpeed(bps: number): string {
  if (bps <= 0) return '0 KB/s'
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  return `${(bps / 1024).toFixed(0)} KB/s`
}

// ─── SSE 解析 helper ──────────────────────────────────────────────────────────

function parseSseChunk(buffer: string): [string, any[]] {
  const lines = buffer.split('\n')
  const remaining = lines.pop() ?? ''
  const events: any[] = []
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    try { events.push(JSON.parse(line.slice(6))) } catch { /* ignore */ }
  }
  return [remaining, events]
}

// ─── DownloadPage ─────────────────────────────────────────────────────────────

export function DownloadPage() {
  const {
    appState,
    workspacePath,
    activeDownload,
    setActiveDownload,
    updateActiveDownload,
    removeFromPending,
    addBatchSummary,
    updateBatchSummary,
  } = useWorkspace()

  const [activeTab, setActiveTab] = useState('pending')
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const pendingBooks = appState?.pending ?? []
  const batches = appState?.batches ?? []

  // ── 开始下载 ────────────────────────────────────────────────────────────

  const handleStartDownload = async () => {
    if (pendingBooks.length === 0) {
      message.warning('预下载列表为空')
      return
    }
    if (activeDownload) {
      message.warning('已有下载任务正在进行')
      return
    }

    const config = await window.electronAPI.getConfig()
    const concurrent = config?.download?.concurrent ?? 3

    const batchId = await window.electronAPI.nextBatchId()
    const batchName = `下载${batchId}`
    const outputDir = `${workspacePath}/${batchName}`
    const downloadId = `batch_${batchId}_${Date.now()}`

    const books: PendingBook[] = [...pendingBooks]

    // 创建批次摘要（持久化）
    const summary: BatchSummary = {
      id: batchId,
      name: batchName,
      createdAt: new Date().toISOString(),
      status: 'downloading',
      total: books.length,
      success: 0,
      failed: 0,
      outputDir,
    }
    addBatchSummary(summary)

    // 创建批次详情 meta（持久化，用于继续下载）
    const meta: BatchMeta = {
      id: batchId,
      books,
      completedIds: [],
      results: [],
    }
    await window.electronAPI.saveBatchMeta(meta)

    // 清空预下载列表
    removeFromPending(books.map(b => b.id))

    // 初始化临时下载状态
    const initial: ActiveDownload = {
      batchId,
      downloadId,
      books,
      results: [],
      completed: 0,
      total: books.length,
      percent: 0,
      speedBps: 0,
      isPaused: false,
    }
    setActiveDownload(initial)
    setActiveTab('downloading')

    await runDownload({ books, outputDir, concurrent, downloadId, batchId, existingResults: [] })
  }

  // ── 核心下载执行 ────────────────────────────────────────────────────────

  const runDownload = async ({
    books, outputDir, concurrent, downloadId, batchId, existingResults
  }: {
    books: PendingBook[]
    outputDir: string
    concurrent: number
    downloadId: string
    batchId: number
    existingResults: DownloadResult[]
  }) => {
    const accResults: DownloadResult[] = [...existingResults]

    try {
      const response = await fetch(`${API_BASE}/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, outputDir, concurrent, downloadId })
      })

      if (!response.ok) throw new Error('下载请求失败')

      const reader = response.body!.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const [remaining, events] = parseSseChunk(buffer)
        buffer = remaining

        for (const event of events) {
          if (event.type === 'book_complete') {
            const result: DownloadResult = event.result
            accResults.push(result)

            updateActiveDownload({
              results: [...accResults],
              completed: accResults.length,
              percent: Math.round(accResults.length / books.length * 100),
            })

            // 实时更新 meta.json
            const meta: BatchMeta = {
              id: batchId,
              books,
              completedIds: accResults.filter(r => r.success).map(r => r.bookId),
              results: accResults,
            }
            window.electronAPI.saveBatchMeta(meta).catch(() => {})

          } else if (event.type === 'speed') {
            updateActiveDownload({ speedBps: event.bytesPerSec ?? 0 })

          } else if (event.type === 'progress') {
            updateActiveDownload({
              completed: event.completed,
              percent: event.percent,
            })

          } else if (event.type === 'paused') {
            // 后端因取消标志停止，更新状态
            const pausedResults: DownloadResult[] = event.results ?? accResults
            updateActiveDownload({
              isPaused: true,
              results: pausedResults,
              completed: pausedResults.length,
              speedBps: 0,
            })
            updateBatchSummary(batchId, {
              status: 'paused',
              success: pausedResults.filter(r => r.success).length,
              failed: pausedResults.filter(r => !r.success && !r.cancelled).length,
            })
            const meta: BatchMeta = {
              id: batchId,
              books,
              completedIds: pausedResults.filter(r => r.success).map(r => r.bookId),
              results: pausedResults,
            }
            await window.electronAPI.saveBatchMeta(meta)
            return  // 不进入 complete 流程

          } else if (event.type === 'complete') {
            const finalResults: DownloadResult[] = event.results ?? accResults
            updateActiveDownload({
              results: finalResults,
              completed: finalResults.length,
              percent: 100,
              speedBps: 0,
            })
            updateBatchSummary(batchId, {
              status: 'completed',
              success: event.success ?? finalResults.filter(r => r.success).length,
              failed: event.failed ?? finalResults.filter(r => !r.success).length,
            })
            const meta: BatchMeta = {
              id: batchId,
              books,
              completedIds: finalResults.filter(r => r.success).map(r => r.bookId),
              results: finalResults,
            }
            await window.electronAPI.saveBatchMeta(meta)
            setActiveDownload(null)
            setActiveTab('completed')
            message.success(`下载完成，成功 ${event.success} 本`)
          }
        }
      }
    } catch (err) {
      console.error(err)
      message.error('下载出错')
      updateBatchSummary(batchId, { status: 'failed' })
      setActiveDownload(null)
    }
  }

  // ── 暂停 ────────────────────────────────────────────────────────────────

  const handlePause = async () => {
    if (!activeDownload) return
    try {
      await fetch(`${API_BASE}/download/pause/${activeDownload.downloadId}`, { method: 'POST' })
      // 后端收到暂停信号，SSE 会发 paused 事件，由 runDownload 处理
    } catch {
      message.error('暂停失败')
    }
  }

  // ── 继续 ────────────────────────────────────────────────────────────────

  const handleResume = async () => {
    if (!activeDownload) return

    const config = await window.electronAPI.getConfig()
    const concurrent = config?.download?.concurrent ?? 3

    const meta = await window.electronAPI.getBatchMeta(activeDownload.batchId)
    if (!meta) { message.error('找不到批次数据'); return }

    const completedIds = new Set(meta.completedIds)
    const remainingBooks = meta.books.filter(b => !completedIds.has(b.id))

    if (remainingBooks.length === 0) {
      message.info('所有书籍已下载完毕')
      setActiveDownload(null)
      setActiveTab('completed')
      return
    }

    const newDownloadId = `batch_${activeDownload.batchId}_${Date.now()}`
    updateActiveDownload({
      downloadId: newDownloadId,
      isPaused: false,
      total: remainingBooks.length + meta.results.filter(r => r.success).length,
      speedBps: 0,
    })
    updateBatchSummary(activeDownload.batchId, { status: 'downloading' })

    const summary = appState?.batches.find(b => b.id === activeDownload.batchId)
    const outputDir = summary?.outputDir ?? `${workspacePath}/${summary?.name}`

    await runDownload({
      books: remainingBooks,
      outputDir,
      concurrent,
      downloadId: newDownloadId,
      batchId: activeDownload.batchId,
      existingResults: meta.results,
    })
  }

  // ── 取消 ────────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!activeDownload) return
    // 先发暂停信号停下后端，然后标记为完成（保留已下载的）
    try {
      await fetch(`${API_BASE}/download/pause/${activeDownload.downloadId}`, { method: 'POST' })
    } catch { /* ignore */ }

    updateBatchSummary(activeDownload.batchId, {
      status: activeDownload.results.length > 0 ? 'completed' : 'failed',
      success: activeDownload.results.filter(r => r.success).length,
      failed: activeDownload.results.filter(r => !r.success && !r.cancelled).length,
    })
    setActiveDownload(null)
    setActiveTab('completed')
    message.info('已取消下载')
  }

  // ── 渲染：预下载 tab ────────────────────────────────────────────────────

  const renderPendingTab = () => (
    <div>
      <Card className="card" style={{ marginBottom: 24 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleStartDownload}
            disabled={pendingBooks.length === 0 || !!activeDownload}
            size="large"
          >
            开始下载
          </Button>
          <Text type="secondary">共 {pendingBooks.length} 本</Text>
        </Space>
      </Card>

      {pendingBooks.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="暂无待下载书籍" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <List
          dataSource={pendingBooks}
          renderItem={(book) => (
            <div
              className="book-item"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', marginBottom: 10
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>{book.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{book.author}</div>
              </div>
              <Space>
                <Tag color={book.language === 'en' ? 'blue' : 'green'}>{book.language}</Tag>
                <Button
                  size="small"
                  danger
                  onClick={() => removeFromPending([book.id])}
                >
                  移除
                </Button>
              </Space>
            </div>
          )}
        />
      )}
    </div>
  )

  // ── 渲染：下载中 tab ────────────────────────────────────────────────────

  const renderDownloadingTab = () => {
    if (!activeDownload) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="暂无下载任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }

    const { results, completed, total, percent, speedBps, isPaused } = activeDownload
    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success && !r.cancelled).length

    // 还未完成的书（结果里没有的）
    const completedIds = new Set(results.map(r => r.bookId))
    const pendingInProgress = activeDownload.books.filter(b => !completedIds.has(b.id))

    return (
      <div>
        {/* 总进度卡片 */}
        <Card className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Space size={16}>
              <Text strong>整体进度</Text>
              <Tag color="blue">{completed} / {total} 完成</Tag>
              {successCount > 0 && <Tag color="green">成功 {successCount}</Tag>}
              {failedCount > 0 && <Tag color="red">失败 {failedCount}</Tag>}
              {!isPaused && (
                <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {formatSpeed(speedBps)}
                </Text>
              )}
              {isPaused && <Tag color="orange">已暂停</Tag>}
            </Space>

            <Space>
              {isPaused ? (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleResume} size="large">
                  继续
                </Button>
              ) : (
                <Button icon={<PauseCircleOutlined />} onClick={handlePause} size="large">
                  暂停
                </Button>
              )}
              <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel} size="large">
                取消
              </Button>
            </Space>
          </div>

          <Progress
            percent={percent}
            status={isPaused ? 'normal' : 'active'}
            strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
          />
        </Card>

        {/* 等待中的书 */}
        {pendingInProgress.length > 0 && (
          <Card className="card" style={{ marginBottom: 16 }} size="small">
            <Text type="secondary" style={{ fontSize: 13 }}>等待下载（{pendingInProgress.length} 本）</Text>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pendingInProgress.slice(0, 20).map(b => (
                <Tag key={b.id} style={{ fontSize: 12 }}>{b.title.length > 20 ? b.title.slice(0, 20) + '…' : b.title}</Tag>
              ))}
              {pendingInProgress.length > 20 && <Tag>+{pendingInProgress.length - 20} 本</Tag>}
            </div>
          </Card>
        )}

        {/* 已完成结果 */}
        {results.length > 0 && (
          <List
            dataSource={[...results].reverse()}
            renderItem={(result) => (
              <div
                style={{
                  display: 'flex', alignItems: 'center', padding: '12px 20px',
                  marginBottom: 8, background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)', borderRadius: 10
                }}
              >
                <div style={{ marginRight: 12 }}>
                  {result.success
                    ? <CheckCircleOutlined style={{ color: 'var(--success-color)', fontSize: 20 }} />
                    : <FailIcon style={{ color: 'var(--error-color)', fontSize: 20 }} />
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>{result.title}</div>
                  <div style={{ fontSize: 12, color: result.success ? 'var(--text-secondary)' : 'var(--error-color)' }}>
                    {result.success ? '下载成功' : (result.cancelled ? '已取消' : result.error)}
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>
    )
  }

  // ── 渲染：已完成 tab ────────────────────────────────────────────────────

  const renderCompletedTab = () => {
    const completedBatches = batches.filter(b => b.status === 'completed' || b.status === 'failed')

    if (completedBatches.length === 0) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="暂无下载记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }

    return (
      <Collapse accordion bordered={false} style={{ background: 'transparent' }}>
        {[...completedBatches].reverse().map(batch => (
          <Collapse.Panel
            key={batch.id}
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FolderOutlined style={{ color: 'var(--accent-color)' }} />
                <Text strong style={{ fontSize: 15 }}>{batch.name}</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>{batch.createdAt.split('T')[0]}</Text>
                <Tag color="green">成功 {batch.success}</Tag>
                {batch.failed > 0 && <Tag color="red">失败 {batch.failed}</Tag>}
                {batch.outputDir && (
                  <Button
                    size="small"
                    icon={<FolderOutlined />}
                    onClick={(e) => { e.stopPropagation(); window.electronAPI.openPath(batch.outputDir) }}
                  >
                    打开文件夹
                  </Button>
                )}
              </div>
            }
            style={{
              marginBottom: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 12
            }}
          >
            <CompletedBatchDetail batchId={batch.id} />
          </Collapse.Panel>
        ))}
      </Collapse>
    )
  }

  const tabItems = [
    { key: 'pending', label: `预下载 (${pendingBooks.length})`, children: renderPendingTab() },
    { key: 'downloading', label: activeDownload ? `下载中 (${activeDownload.completed}/${activeDownload.total})` : '下载中', children: renderDownloadingTab() },
    { key: 'completed', label: `已完成 (${batches.filter(b => b.status === 'completed' || b.status === 'failed').length})`, children: renderCompletedTab() },
  ]

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />
    </div>
  )
}

// ── 已完成批次详情（懒加载 meta.json）─────────────────────────────────────────

function CompletedBatchDetail({ batchId }: { batchId: number }) {
  const [meta, setMeta] = useState<BatchMeta | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (meta) return
    setLoading(true)
    try {
      const m = await window.electronAPI.getBatchMeta(batchId)
      setMeta(m)
    } finally {
      setLoading(false)
    }
  }

  // 展开时加载
  if (!meta && !loading) {
    load()
  }

  if (loading) return <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>加载中...</div>
  if (!meta || meta.results.length === 0) return <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>无详细数据</div>

  return (
    <List
      dataSource={meta.results}
      renderItem={(result) => (
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 16px',
          marginBottom: 6, background: 'var(--bg-primary)',
          border: '1px solid var(--border-light)', borderRadius: 8
        }}>
          <div style={{ marginRight: 10 }}>
            {result.success
              ? <CheckCircleOutlined style={{ color: 'var(--success-color)', fontSize: 18 }} />
              : <FailIcon style={{ color: 'var(--error-color)', fontSize: 18 }} />
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{result.title}</div>
            <div style={{ fontSize: 12, color: result.success ? 'var(--text-tertiary)' : 'var(--error-color)' }}>
              {result.success ? result.filePath : result.error}
            </div>
          </div>
        </div>
      )}
    />
  )
}
