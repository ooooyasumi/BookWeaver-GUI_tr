import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Empty, Spin, Tag, Segmented, Collapse, Typography, message, Button, Checkbox, Modal, Space } from 'antd'
import {
  BookOutlined, FolderOutlined, TagsOutlined, CalendarOutlined,
  ReloadOutlined, FileTextOutlined, DeleteOutlined,
  PictureOutlined, CloudUploadOutlined, CloseCircleOutlined
} from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import {
  getLibraryFiles, getLibraryBySubject, getLibraryByYear,
  reindexLibrary,
  EpubMetadata, CategoryGroup
} from '../../services/api'
import { BookDetailDrawer, formatFileSize, BookInfo } from '../Common/BookDetailDrawer'
import { BookStatusIcons } from '../Common/BookStatusIcons'

const { Text } = Typography

// API 地址
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

type ViewMode = 'all' | 'folder' | 'subject' | 'year'

// 筛选标签类型
type FilterKey = 'metadataNotUpdated' | 'coverNotUpdated' | 'coverError' | 'uploaded' | 'notUploaded'

const FILTER_OPTIONS: { key: FilterKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'metadataNotUpdated', label: '元数据未更新', icon: <TagsOutlined />, color: '#faad14' },
  { key: 'coverNotUpdated', label: '封面未更新', icon: <PictureOutlined />, color: '#faad14' },
  { key: 'coverError', label: '封面更新失败', icon: <CloseCircleOutlined />, color: '#ff4d4f' },
  { key: 'uploaded', label: '已上传', icon: <CloudUploadOutlined />, color: '#52c41a' },
  { key: 'notUploaded', label: '未上传', icon: <CloudUploadOutlined />, color: '#faad14' },
]

function matchesFilter(book: EpubMetadata, filters: Set<FilterKey>): boolean {
  if (filters.size === 0) return true
  for (const f of filters) {
    switch (f) {
      case 'metadataNotUpdated': if (book.metadataUpdated) return false; break
      case 'coverNotUpdated': if (book.coverUpdated || book.coverError) return false; break
      case 'coverError': if (!(!book.coverUpdated && book.coverError)) return false; break
      case 'uploaded': if (!book.uploaded) return false; break
      case 'notUploaded': if (book.uploaded) return false; break
    }
  }
  return true
}

// ─── 书籍列表项 ─────────────────────────────────────────────────────────────

function BookItem({
  book,
  onClick,
  showCheckbox,
  checked,
  onCheck,
}: {
  book: EpubMetadata
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
            {book.title || book.fileName}
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
        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatFileSize(book.fileSize)}
        </Text>
      </div>
    </div>
  )
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

// ─── LibraryPage ────────────────────────────────────────────────────────────

export function LibraryPage() {
  const { workspacePath } = useWorkspace()

  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [loading, setLoading] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [allBooks, setAllBooks] = useState<EpubMetadata[]>([])
  const [fileTree, setFileTree] = useState<Record<string, any>>({})
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 筛选
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())

  // 选中（用于删除）
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const toggleFilter = (key: FilterKey) => {
    const next = new Set(filters)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFilters(next)
  }

  // 筛选后的书籍列表
  const filteredBooks = useMemo(
    () => allBooks.filter(b => matchesFilter(b, filters)),
    [allBooks, filters]
  )

  // ── 加载数据 ────────────────────────────────────────────────────────────

  const loadAllFiles = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const data = await getLibraryFiles(workspacePath)
      setAllBooks(data.files)
      setFileTree(data.tree)
    } catch (e) {
      message.error('加载图书列表失败')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

  const loadBySubject = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const data = await getLibraryBySubject(workspacePath)
      setCategories(data.categories)
    } catch (e) {
      message.error('加载分类失败')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

  const loadByYear = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const data = await getLibraryByYear(workspacePath)
      setCategories(data.categories)
    } catch (e) {
      message.error('加载年份分类失败')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

  const loadCurrentView = useCallback(() => {
    switch (viewMode) {
      case 'all':
      case 'folder':
        loadAllFiles()
        break
      case 'subject':
        loadBySubject()
        break
      case 'year':
        loadByYear()
        break
    }
  }, [viewMode, loadAllFiles, loadBySubject, loadByYear])

  useEffect(() => {
    loadCurrentView()
  }, [loadCurrentView])

  // 切换视图/筛选时清空选中
  useEffect(() => {
    setSelected(new Set())
  }, [viewMode, filters])

  // ── 刷新/重建索引 ─────────────────────────────────────────────────────

  const handleReindex = async () => {
    if (!workspacePath) return
    setReindexing(true)
    try {
      const result = await reindexLibrary(workspacePath)
      if (result.success) {
        message.success(`索引重建完成，共 ${result.total} 本书`)
        loadCurrentView()
      } else {
        message.error(result.error || '索引重建失败')
      }
    } catch (e) {
      message.error('索引重建失败')
      console.error(e)
    } finally {
      setReindexing(false)
    }
  }

  // ── 选择 ─────────────────────────────────────────────────────────────

  const toggleSelection = (fp: string) => {
    const next = new Set(selected)
    if (next.has(fp)) next.delete(fp)
    else next.add(fp)
    setSelected(next)
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredBooks.map(b => b.filePath)))
    } else {
      setSelected(new Set())
    }
  }

  // ── 删除 ─────────────────────────────────────────────────────────────

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
            loadCurrentView()
          } else {
            message.error('删除失败')
          }
        } catch (e) {
          console.error(e)
          message.error('删除请求失败')
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  // ── 点击书籍 ───────────────────────────────────────────────────────────

  const handleBookClick = (book: EpubMetadata) => {
    setSelectedBook(book)
    setDrawerOpen(true)
  }

  // ── 渲染：全部列表 ─────────────────────────────────────────────────────

  const renderAllView = () => {
    if (filteredBooks.length === 0) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty
            description={filters.size > 0 ? '没有符合筛选条件的书籍' : '工作区中暂无 EPUB 文件'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      )
    }

    return (
      <div>
        {filteredBooks.map((book, i) => (
          <BookItem
            key={book.filePath || i}
            book={book}
            onClick={() => handleBookClick(book)}
            showCheckbox
            checked={selected.has(book.filePath)}
            onCheck={() => toggleSelection(book.filePath)}
          />
        ))}
      </div>
    )
  }

  // ── 渲染：文件夹视图 ───────────────────────────────────────────────────

  const renderFolderNode = (node: Record<string, any>): React.ReactNode => {
    const children = node.children || {}
    const entries = Object.entries(children)

    const folders = entries.filter(([, v]: [string, any]) => v.type === 'folder')
    const files = entries.filter(([, v]: [string, any]) => v.type === 'file')
      .filter(([, v]: [string, any]) => matchesFilter(v.data, filters))

    return (
      <>
        {folders.map(([key, folder]: [string, any]) => {
          const countFiles = (n: any): number => {
            if (n.type === 'file') return matchesFilter(n.data, filters) ? 1 : 0
            return Object.values(n.children || {}).reduce((acc: number, c: any) => acc + countFiles(c), 0) as number
          }
          const fileCount = countFiles(folder)
          if (fileCount === 0) return null

          return (
            <Collapse
              key={key}
              bordered={false}
              style={{ background: 'transparent', marginBottom: 8 }}
              items={[{
                key,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FolderOutlined style={{ color: 'var(--accent-color)' }} />
                    <Text strong>{folder.name}</Text>
                    <Tag>{fileCount} 本</Tag>
                  </div>
                ),
                children: renderFolderNode(folder),
                style: {
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  marginBottom: 8,
                }
              }]}
            />
          )
        })}
        {files.map(([key, file]: [string, any]) => (
          <BookItem
            key={key}
            book={file.data}
            onClick={() => handleBookClick(file.data)}
            showCheckbox
            checked={selected.has(file.data.filePath)}
            onCheck={() => toggleSelection(file.data.filePath)}
          />
        ))}
      </>
    )
  }

  const renderFolderView = () => {
    if (allBooks.length === 0) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="工作区中暂无 EPUB 文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }
    return renderFolderNode(fileTree)
  }

  // ── 渲染：分类/年份视图 ────────────────────────────────────────────────

  const renderCategoryView = () => {
    if (categories.length === 0) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }

    return (
      <Collapse
        accordion
        bordered={false}
        style={{ background: 'transparent' }}
        items={categories.map(cat => {
          const filtered = cat.books.filter(b => matchesFilter(b, filters))
          return {
            key: cat.name,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {viewMode === 'subject'
                  ? <TagsOutlined style={{ color: 'var(--accent-color)' }} />
                  : <CalendarOutlined style={{ color: 'var(--accent-color)' }} />
                }
                <Text strong>{cat.name}</Text>
                <Tag>{filtered.length} 本</Tag>
              </div>
            ),
            children: (
              <div>
                {filtered.map((book, i) => (
                  <BookItem
                    key={book.filePath || i}
                    book={book}
                    onClick={() => handleBookClick(book)}
                    showCheckbox
                    checked={selected.has(book.filePath)}
                    onCheck={() => toggleSelection(book.filePath)}
                  />
                ))}
              </div>
            ),
            style: {
              marginBottom: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
            }
          }
        }).filter(item => {
          // 隐藏空分类
          const cat = categories.find(c => c.name === item.key)
          return cat && cat.books.some(b => matchesFilter(b, filters))
        })}
      />
    )
  }

  // ── 主渲染 ─────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ padding: 80, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: 'var(--text-tertiary)' }}>扫描工作区文件中...</div>
        </div>
      )
    }

    switch (viewMode) {
      case 'all': return renderAllView()
      case 'folder': return renderFolderView()
      case 'subject':
      case 'year':
        return renderCategoryView()
    }
  }

  const isAllSelected = filteredBooks.length > 0 && selected.size === filteredBooks.length
  const isIndeterminate = selected.size > 0 && selected.size < filteredBooks.length

  return (
    <div>
      {/* 工具栏 */}
      <Card className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as ViewMode)}
              options={[
                { label: '全部', value: 'all', icon: <BookOutlined /> },
                { label: '文件夹', value: 'folder', icon: <FolderOutlined /> },
                { label: '分类', value: 'subject', icon: <TagsOutlined /> },
                { label: '年份', value: 'year', icon: <CalendarOutlined /> },
              ]}
              size="large"
            />
            <Tag color="blue" style={{ marginLeft: 8 }}>
              {filters.size > 0 ? `${filteredBooks.length}/${allBooks.length}` : allBooks.length} 本
            </Tag>
          </div>
          <Space>
            {selected.size > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                loading={deleting}
              >
                删除选中 ({selected.size})
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReindex}
              loading={reindexing}
            >
              重建索引
            </Button>
          </Space>
        </div>

        {/* 筛选栏 + 全选 */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={isIndeterminate}
            onChange={(e) => toggleSelectAll(e.target.checked)}
          >
            全选
          </Checkbox>
          <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />
          <FilterBar filters={filters} onToggle={toggleFilter} />
        </div>
      </Card>

      {/* 内容区 */}
      {renderContent()}

      {/* 书籍详情抽屉 */}
      <BookDetailDrawer
        book={selectedBook}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
