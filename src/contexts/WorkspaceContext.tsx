import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// ─── electronAPI 类型声明 ─────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      openFolder: () => Promise<string | null>
      openWorkspace: (folderPath: string) => Promise<AppState>
      getWorkspaceStatus: () => Promise<AppState | null>
      saveWorkspace: (state: AppState) => Promise<boolean>
      getBatchMeta: (batchId: number) => Promise<BatchMeta | null>
      saveBatchMeta: (meta: BatchMeta) => Promise<boolean>
      nextBatchId: () => Promise<number>
      getConfig: () => Promise<Config>
      saveConfig: (config: Config) => Promise<boolean>
      openPath: (path: string) => Promise<void>
    }
  }
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface PendingBook {
  id: number
  title: string
  author: string
  language: string
}

export interface DownloadResult {
  bookId: number
  title: string
  success: boolean
  filePath?: string
  error?: string
  cancelled?: boolean
}

/** 批次摘要（存 state.json，轻量） */
export interface BatchSummary {
  id: number
  name: string
  createdAt: string
  status: 'downloading' | 'paused' | 'completed' | 'failed'
  total: number
  success: number
  failed: number
  outputDir: string
}

/** 批次详情（存 meta.json，含完整书单和结果） */
export interface BatchMeta {
  id: number
  books: PendingBook[]
  completedIds: number[]
  results: DownloadResult[]
}

/** 持久化状态（写磁盘） */
export interface AppState {
  version: string
  updatedAt: string
  pending: PendingBook[]
  batches: BatchSummary[]
}

/** 下载中临时状态（仅内存，不写磁盘） */
export interface ActiveDownload {
  batchId: number
  downloadId: string          // 用于 pause API
  books: PendingBook[]        // 本次下载的全部书
  results: DownloadResult[]   // 实时结果
  completed: number           // 已完成本数（含成功+失败）
  total: number
  percent: number
  speedBps: number            // 当前网速 bytes/s
  isPaused: boolean
}

export interface BookResult {
  id: number
  title: string
  author: string
  language: string
  matchScore: number
}

export interface Config {
  llm: {
    apiKey: string
    model: string
    baseUrl: string
    temperature: number
    maxTokens: number
  }
  download: {
    concurrent: number
    timeout: number
  }
}

export type PageType = 'search' | 'download' | 'library' | 'metadata' | 'cover' | 'upload' | 'logs'

// ─── 活跃任务类型（供 Metadata/Cover/Upload 共用）───────────────────────────

export type TaskType = 'metadata' | 'cover' | 'upload'
export type TaskStatus = 'running' | 'paused'

export interface TaskProgress {
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

export interface ActiveTask {
  id: string
  type: TaskType
  status: TaskStatus
  progress: TaskProgress
  abortController: AbortController | null
}

// ─── Context 类型 ─────────────────────────────────────────────────────────────

interface WorkspaceContextType {
  isWorkspaceOpen: boolean
  workspacePath: string | null
  appState: AppState | null
  currentPage: PageType
  isLoading: boolean
  debugMode: boolean
  setDebugMode: (enabled: boolean) => void

  // 搜索结果（临时，不持久化）
  searchResults: BookResult[]
  searchResultSelectedKeys: number[]

  // 下载中临时状态（不持久化）
  activeDownload: ActiveDownload | null

  // 活跃任务状态（供 Metadata/Cover/Upload 共用，不持久化）
  activeTask: ActiveTask | null

  openWorkspace: (path: string) => Promise<void>
  closeWorkspace: () => void
  setCurrentPage: (page: PageType) => void

  // 预下载列表操作
  addToPending: (books: PendingBook[]) => void
  removeFromPending: (ids: number[]) => void

  // 批次摘要操作
  addBatchSummary: (batch: BatchSummary) => void
  updateBatchSummary: (id: number, updates: Partial<BatchSummary>) => void

  // 搜索结果操作
  setSearchResults: (books: BookResult[]) => void
  appendSearchResults: (books: BookResult[]) => void
  removeFromSearchResults: (ids: number[]) => void
  clearSearchResults: () => void
  toggleSearchResultSelection: (id: number) => void
  selectAllSearchResults: (selected: boolean) => void
  clearSearchResultSelection: () => void

  // 下载中状态操作（纯内存）
  setActiveDownload: (d: ActiveDownload | null) => void
  updateActiveDownload: (updates: Partial<ActiveDownload>) => void

  // 活跃任务操作（纯内存）
  setActiveTask: (task: ActiveTask | null) => void
  updateActiveTask: (updates: Partial<ActiveTask>) => void
  pauseTask: () => void
  cancelTask: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)
  const [currentPage, setCurrentPage] = useState<PageType>('search')
  const [isLoading, setIsLoading] = useState(false)
  const [debugMode, setDebugMode] = useState(false)

  // 临时状态（不持久化）
  const [searchResults, setSearchResultsState] = useState<BookResult[]>([])
  const [searchResultSelectedKeys, setSearchResultSelectedKeys] = useState<number[]>([])
  const [activeDownload, setActiveDownload] = useState<ActiveDownload | null>(null)
  const [activeTask, setActiveTaskState] = useState<ActiveTask | null>(null)

  // ── 工作区 ──────────────────────────────────────────────────────────────

  const openWorkspace = async (path: string) => {
    setIsLoading(true)
    try {
      const state = await window.electronAPI.openWorkspace(path)
      setWorkspacePath(path)
      setAppState(state)
      setIsWorkspaceOpen(true)

      // 如果有 paused 状态的批次，不自动恢复，让用户在下载页面手动操作
    } catch (error) {
      console.error('打开工作区失败:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const closeWorkspace = () => {
    setIsWorkspaceOpen(false)
    setWorkspacePath(null)
    setAppState(null)
    setCurrentPage('search')
    setSearchResultsState([])
    setSearchResultSelectedKeys([])
    setActiveDownload(null)
    setActiveTaskState(null)
  }

  // ── 持久化（仅保存 appState，不含临时下载进度）──────────────────────────

  useEffect(() => {
    if (appState && isWorkspaceOpen) {
      window.electronAPI.saveWorkspace(appState).catch(console.error)
    }
  }, [appState])

  // ── 预下载列表 ───────────────────────────────────────────────────────────

  const addToPending = (books: PendingBook[]) => {
    setAppState(prev => {
      if (!prev) return prev
      const existingIds = new Set(prev.pending.map(b => b.id))
      const newBooks = books.filter(b => !existingIds.has(b.id))
      return { ...prev, pending: [...prev.pending, ...newBooks] }
    })
  }

  const removeFromPending = (ids: number[]) => {
    const idSet = new Set(ids)
    setAppState(prev => {
      if (!prev) return prev
      return { ...prev, pending: prev.pending.filter(b => !idSet.has(b.id)) }
    })
  }

  // ── 批次摘要 ─────────────────────────────────────────────────────────────

  const addBatchSummary = (batch: BatchSummary) => {
    setAppState(prev => {
      if (!prev) return prev
      return { ...prev, batches: [...prev.batches, batch] }
    })
  }

  const updateBatchSummary = (id: number, updates: Partial<BatchSummary>) => {
    setAppState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        batches: prev.batches.map(b => b.id === id ? { ...b, ...updates } : b)
      }
    })
  }

  // ── 搜索结果 ─────────────────────────────────────────────────────────────

  const setSearchResults = (books: BookResult[]) => {
    setSearchResultsState(books)
    setSearchResultSelectedKeys([])
  }

  const appendSearchResults = (books: BookResult[]) => {
    setSearchResultsState(prev => {
      const existingIds = new Set(prev.map(b => b.id))
      return [...prev, ...books.filter(b => !existingIds.has(b.id))]
    })
  }

  const removeFromSearchResults = (ids: number[]) => {
    const idSet = new Set(ids)
    setSearchResultsState(prev => prev.filter(b => !idSet.has(b.id)))
    setSearchResultSelectedKeys(prev => prev.filter(k => !idSet.has(k)))
  }

  const clearSearchResults = () => {
    setSearchResultsState([])
    setSearchResultSelectedKeys([])
  }

  const toggleSearchResultSelection = (id: number) => {
    setSearchResultSelectedKeys(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    )
  }

  const selectAllSearchResults = (selected: boolean) => {
    setSearchResultSelectedKeys(selected ? searchResults.map(b => b.id) : [])
  }

  const clearSearchResultSelection = () => setSearchResultSelectedKeys([])

  // ── 下载中状态 ───────────────────────────────────────────────────────────

  const updateActiveDownload = (updates: Partial<ActiveDownload>) => {
    setActiveDownload(prev => prev ? { ...prev, ...updates } : null)
  }

  // ── 活跃任务状态 ────────────────────────────────────────────────────────

  const setActiveTask = (task: ActiveTask | null) => {
    setActiveTaskState(task)
  }

  const updateActiveTask = (updates: Partial<ActiveTask> | ((prev: ActiveTask | null) => Partial<ActiveTask>)) => {
    setActiveTaskState(prev => {
      if (!prev) return null
      const u = typeof updates === 'function' ? updates(prev) : updates
      return { ...prev, ...u }
    })
  }

  const pauseTask = () => {
    if (!activeTask) return
    // 后端 metadata/cover/upload 暂无 pause 支持，仅更新前端 UI 状态
    // cancelTask 会真正停止任务
    updateActiveTask({ status: 'paused' })
  }

  const cancelTask = () => {
    if (!activeTask) return
    // 立即中止前端 SSE
    activeTask.abortController?.abort()
    // 通知后端取消
    const apiPath = activeTask.type === 'metadata'
      ? '/api/metadata/cancel'
      : activeTask.type === 'cover'
      ? '/api/cover/cancel'
      : '/api/upload/cancel'
    fetch(apiPath, { method: 'POST' }).catch(console.error)
    setActiveTaskState(null)
  }

  return (
    <WorkspaceContext.Provider value={{
      isWorkspaceOpen,
      workspacePath,
      appState,
      currentPage,
      isLoading,
      debugMode,
      setDebugMode,
      searchResults,
      searchResultSelectedKeys,
      activeDownload,
      activeTask,
      openWorkspace,
      closeWorkspace,
      setCurrentPage,
      addToPending,
      removeFromPending,
      addBatchSummary,
      updateBatchSummary,
      setSearchResults,
      appendSearchResults,
      removeFromSearchResults,
      clearSearchResults,
      toggleSearchResultSelection,
      selectAllSearchResults,
      clearSearchResultSelection,
      setActiveDownload,
      updateActiveDownload,
      setActiveTask,
      updateActiveTask,
      pauseTask,
      cancelTask,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return context
}
