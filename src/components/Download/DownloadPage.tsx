import { useState } from 'react'
import { Tabs, Button, Progress, Space, message, Card, Typography, Empty, Tag, Collapse } from 'antd'
import { PlayCircleOutlined, FolderOutlined } from '@ant-design/icons'
import { useWorkspace, PendingBook, Batch } from '../../contexts/WorkspaceContext'
import { BookList } from '../Common/BookList'

const { Panel } = Collapse
const { Text } = Typography

export function DownloadPage() {
  const {
    workspaceData,
    workspacePath,
    removeFromPending,
    updatePendingSelection,
    addBatch,
    updateBatch
  } = useWorkspace()

  const [activeTab, setActiveTab] = useState('pending')
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Record<number, number>>({})
  const [currentDownloadBooks, setCurrentDownloadBooks] = useState<PendingBook[]>([])

  const pendingBooks = workspaceData?.pendingDownloads || []
  const batches = workspaceData?.batches || []

  // 开始下载
  const handleStartDownload = async () => {
    const selectedBooks = pendingBooks.filter(b => b.selected)
    if (selectedBooks.length === 0) {
      message.warning('请先选择要下载的书籍')
      return
    }

    // 创建新批次
    const batchId = batches.length + 1
    const batchName = `下载${batchId}`
    const newBatch: Batch = {
      id: batchId,
      name: batchName,
      createdAt: new Date().toISOString(),
      status: 'downloading',
      total: selectedBooks.length,
      success: 0,
      failed: 0,
      results: []
    }

    addBatch(newBatch)
    setCurrentDownloadBooks(selectedBooks)
    setDownloading(true)
    setDownloadProgress({})
    setActiveTab('downloading')

    try {
      const response = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          books: selectedBooks,
          outputDir: `${workspacePath}/${batchName}`
        })
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          try {
            const event = JSON.parse(chunk)

            if (event.type === 'progress') {
              setDownloadProgress(prev => ({
                ...prev,
                [event.bookId]: event.progress
              }))
            } else if (event.type === 'complete') {
              updateBatch(batchId, {
                status: 'completed',
                success: event.success,
                failed: event.failed,
                results: event.results
              })
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      removeFromPending(selectedBooks.map(b => b.id))
      message.success('下载完成')
    } catch (error) {
      message.error('下载失败')
      console.error(error)
    } finally {
      setDownloading(false)
      setCurrentDownloadBooks([])
      setDownloadProgress({})
      setActiveTab('completed')
    }
  }

  // 渲染预下载标签
  const renderPendingTab = () => (
    <div>
      <Card className="card" style={{ marginBottom: 24 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleStartDownload}
            disabled={pendingBooks.filter(b => b.selected).length === 0}
            loading={downloading}
            size="large"
          >
            开始下载
          </Button>
          <Text type="secondary">
            已选 {pendingBooks.filter(b => b.selected).length} / {pendingBooks.length} 本
          </Text>
        </Space>
      </Card>

      <BookList
        type="download"
        data={pendingBooks}
        selectedRowKeys={pendingBooks.filter(b => b.selected).map(b => b.id)}
        onSelectionChange={(keys) => {
          pendingBooks.forEach(b => {
            updatePendingSelection(b.id, keys.includes(b.id))
          })
        }}
        onRemove={(id) => removeFromPending([id])}
        emptyDescription="暂无待下载书籍"
      />
    </div>
  )

  // 渲染下载中标签
  const renderDownloadingTab = () => {
    if (!downloading || currentDownloadBooks.length === 0) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="暂无下载任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }

    const totalProgress = currentDownloadBooks.length > 0
      ? Object.values(downloadProgress).reduce((a, b) => a + b, 0) / currentDownloadBooks.length
      : 0

    return (
      <div>
        <Card className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text strong>整体进度</Text>
            <Tag color="blue">{currentDownloadBooks.length} 本书</Tag>
          </div>
          <Progress
            percent={Math.round(totalProgress)}
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068'
            }}
            style={{ marginTop: 12 }}
          />
        </Card>

        <BookList
          type="downloading"
          data={currentDownloadBooks}
          downloadProgress={downloadProgress}
          emptyDescription="暂无下载任务"
        />
      </div>
    )
  }

  // 渲染已完成标签
  const renderCompletedTab = () => {
    if (batches.length === 0) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="暂无下载记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }

    return (
      <Collapse
        accordion
        bordered={false}
        style={{ background: 'transparent' }}
      >
        {batches.map(batch => (
          <Panel
            key={batch.id}
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FolderOutlined style={{ color: 'var(--accent-color)' }} />
                <Typography.Text strong style={{ fontSize: 15 }}>{batch.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>{batch.createdAt.split('T')[0]}</Typography.Text>
                <Tag color="green" style={{ marginLeft: 8 }}>成功 {batch.success}</Tag>
                {batch.failed > 0 && <Tag color="red">失败 {batch.failed}</Tag>}
              </div>
            }
            style={{
              marginBottom: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 12
            }}
          >
            <BookList
              type="completed"
              data={batch.results}
              emptyDescription="本批次无数据"
            />
          </Panel>
        ))}
      </Collapse>
    )
  }

  const tabItems = [
    {
      key: 'pending',
      label: `预下载 (${pendingBooks.length})`,
      children: renderPendingTab()
    },
    {
      key: 'downloading',
      label: '下载中',
      children: renderDownloadingTab()
    },
    {
      key: 'completed',
      label: `已完成 (${batches.length})`,
      children: renderCompletedTab()
    }
  ]

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
      />
    </div>
  )
}
