import { useState, useMemo } from 'react'
import { List, Checkbox, Progress, Tag, Empty, Pagination } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

interface BookItem {
  id: number
  title: string
  author: string
  language: string
  selected?: boolean
  matchScore?: number
}

interface DownloadResult {
  bookId: number
  title: string
  success: boolean
  filePath?: string
  error?: string
}

interface BookListProps {
  type: 'search' | 'download' | 'downloading' | 'completed'
  data: BookItem[] | DownloadResult[]
  loading?: boolean
  selectedRowKeys?: number[]
  onSelectionChange?: (keys: number[]) => void
  onRemove?: (id: number) => void
  downloadProgress?: Record<number, number>
  emptyDescription?: string
}

export function BookList({
  type,
  data,
  loading = false,
  selectedRowKeys = [],
  onSelectionChange,
  onRemove,
  downloadProgress = {},
  emptyDescription = '暂无数据'
}: BookListProps) {
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const dataLength = (data as BookItem[]).length

  // 计算分页数据
  const paginatedData = useMemo(() => {
    if (type === 'completed') {
      return data as DownloadResult[]
    }
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return (data as BookItem[]).slice(start, end)
  }, [data, currentPage, pageSize, type])

  // 渲染搜索/下载列表
  const renderBookItem = (book: BookItem) => {
    const isSelected = selectedRowKeys.includes(book.id)
    const progress = downloadProgress[book.id]

    return (
      <div
        className={`book-item ${isSelected ? 'selected' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          marginBottom: 12,
          cursor: type === 'search' ? 'pointer' : 'default'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {type === 'search' && onSelectionChange && (
            <Checkbox
              checked={isSelected}
              onChange={() => {
                if (isSelected) {
                  onSelectionChange(selectedRowKeys.filter(k => k !== book.id))
                } else {
                  onSelectionChange([...selectedRowKeys, book.id])
                }
              }}
              style={{ marginRight: 16 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4, color: 'var(--text-primary)' }}>
              {book.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {book.author}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Tag
            color={book.language === 'en' ? 'blue' : 'green'}
            style={{ minWidth: 50, textAlign: 'center' }}
          >
            {book.language}
          </Tag>

          {book.matchScore !== undefined && (
            <Tag color={book.matchScore >= 80 ? 'green' : book.matchScore >= 60 ? 'orange' : 'default'}>
              {book.matchScore}%
            </Tag>
          )}

          {type === 'downloading' && progress !== undefined && (
            <Progress
              percent={Math.round(progress)}
              status={progress === 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068'
              }}
              style={{ width: 100, margin: 0 }}
            />
          )}

          {onRemove && type !== 'search' && (
            <Checkbox
              checked={isSelected}
              onChange={() => {
                if (isSelected) {
                  onSelectionChange?.(selectedRowKeys.filter(k => k !== book.id))
                } else {
                  onSelectionChange?.([...selectedRowKeys, book.id])
                }
              }}
              style={{ marginLeft: 8 }}
            />
          )}
        </div>
      </div>
    )
  }

  // 渲染已完成批次
  const renderCompletedItem = (result: DownloadResult) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        marginBottom: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12
      }}
    >
      <div style={{ marginRight: 16 }}>
        {result.success ? (
          <CheckCircleOutlined style={{ color: 'var(--success-color)', fontSize: 24 }} />
        ) : (
          <CloseCircleOutlined style={{ color: 'var(--error-color)', fontSize: 24 }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
          {result.title}
        </div>
        <div style={{ fontSize: 13, color: result.success ? 'var(--success-color)' : 'var(--error-color)' }}>
          {result.success ? result.filePath : result.error}
        </div>
      </div>
    </div>
  )

  // 空状态
  if (data.length === 0 && !loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Empty description={emptyDescription} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <div>
      <List
        dataSource={paginatedData}
        loading={loading}
        renderItem={(item: BookItem | DownloadResult) =>
          type === 'completed' ? (
            renderCompletedItem(item as DownloadResult)
          ) : (
            renderBookItem(item as BookItem)
          )
        }
      />

      {/* 分页器 - 仅搜索和下载列表显示 */}
      {type !== 'completed' && dataLength > pageSize && (
        <Pagination
          current={currentPage}
          total={dataLength}
          pageSize={pageSize}
          onChange={setCurrentPage}
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid var(--border-light)'
          }}
          showTotal={(total) => `共 ${total} 条`}
        />
      )}
    </div>
  )
}
