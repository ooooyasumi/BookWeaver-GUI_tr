import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// TypeScript 类型声明
declare global {
  interface Window {
    electronAPI: {
      openFolder: () => Promise<string | null>
      openWorkspace: (folderPath: string) => Promise<WorkspaceData>
      getWorkspaceStatus: () => Promise<WorkspaceData | null>
      saveWorkspace: (data: WorkspaceData) => Promise<boolean>
      getConfig: () => Promise<Config>
      saveConfig: (config: Config) => Promise<boolean>
      getAIContext: () => Promise<AIContext>
      saveAIContext: (context: AIContext) => Promise<boolean>
      openPath: (path: string) => Promise<void>
    }
  }
}

// 类型定义
export interface PendingBook {
  id: number
  title: string
  author: string
  language: string
  selected: boolean
}

export interface DownloadResult {
  bookId: number
  title: string
  success: boolean
  filePath?: string
  error?: string
}

export interface Batch {
  id: number
  name: string
  createdAt: string
  status: 'downloading' | 'completed' | 'failed'
  total: number
  success: number
  failed: number
  results: DownloadResult[]
}

export interface WorkspaceData {
  version: string
  createdAt: string
  updatedAt: string
  pendingDownloads: PendingBook[]
  currentBatch: number | null
  batches: Batch[]
}

export interface AIContext {
  history: Array<{ role: string; content: string }>
  bookList: PendingBook[]
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

export type PageType = 'search' | 'download' | 'library'

// Context 类型
interface WorkspaceContextType {
  // 工作区状态
  isWorkspaceOpen: boolean
  workspacePath: string | null
  workspaceData: WorkspaceData | null
  currentPage: PageType

  // 加载状态
  isLoading: boolean

  // 操作方法
  openWorkspace: (path: string) => Promise<void>
  closeWorkspace: () => void
  saveWorkspaceData: () => Promise<void>
  setCurrentPage: (page: PageType) => void

  // 工作区数据操作
  addToPending: (books: PendingBook[]) => void
  removeFromPending: (ids: number[]) => void
  updatePendingSelection: (id: number, selected: boolean) => void
  selectAllPending: (selected: boolean) => void

  // 批次操作
  addBatch: (batch: Batch) => void
  updateBatch: (id: number, batch: Partial<Batch>) => void
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null)
  const [currentPage, setCurrentPage] = useState<PageType>('search')
  const [isLoading, setIsLoading] = useState(false)

  // 打开工作区
  const openWorkspace = async (path: string) => {
    setIsLoading(true)
    try {
      const data = await window.electronAPI.openWorkspace(path)
      setWorkspacePath(path)
      setWorkspaceData(data)
      setIsWorkspaceOpen(true)
    } catch (error) {
      console.error('打开工作区失败:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  // 关闭工作区
  const closeWorkspace = () => {
    setIsWorkspaceOpen(false)
    setWorkspacePath(null)
    setWorkspaceData(null)
    setCurrentPage('search')
  }

  // 保存工作区数据
  const saveWorkspaceData = async () => {
    if (!workspaceData) return
    await window.electronAPI.saveWorkspace(workspaceData)
  }

  // 添加到预下载
  const addToPending = (books: PendingBook[]) => {
    if (!workspaceData) return
    const existingIds = new Set(workspaceData.pendingDownloads.map(b => b.id))
    const newBooks = books.filter(b => !existingIds.has(b.id))
    setWorkspaceData({
      ...workspaceData,
      pendingDownloads: [...workspaceData.pendingDownloads, ...newBooks]
    })
  }

  // 从预下载移除
  const removeFromPending = (ids: number[]) => {
    if (!workspaceData) return
    setWorkspaceData({
      ...workspaceData,
      pendingDownloads: workspaceData.pendingDownloads.filter(b => !ids.includes(b.id))
    })
  }

  // 更新选中状态
  const updatePendingSelection = (id: number, selected: boolean) => {
    if (!workspaceData) return
    setWorkspaceData({
      ...workspaceData,
      pendingDownloads: workspaceData.pendingDownloads.map(b =>
        b.id === id ? { ...b, selected } : b
      )
    })
  }

  // 全选/取消全选
  const selectAllPending = (selected: boolean) => {
    if (!workspaceData) return
    setWorkspaceData({
      ...workspaceData,
      pendingDownloads: workspaceData.pendingDownloads.map(b => ({ ...b, selected }))
    })
  }

  // 添加批次
  const addBatch = (batch: Batch) => {
    if (!workspaceData) return
    setWorkspaceData({
      ...workspaceData,
      batches: [...workspaceData.batches, batch]
    })
  }

  // 更新批次
  const updateBatch = (id: number, updates: Partial<Batch>) => {
    if (!workspaceData) return
    setWorkspaceData({
      ...workspaceData,
      batches: workspaceData.batches.map(b =>
        b.id === id ? { ...b, ...updates } : b
      )
    })
  }

  // 自动保存
  useEffect(() => {
    if (workspaceData && isWorkspaceOpen) {
      saveWorkspaceData()
    }
  }, [workspaceData])

  return (
    <WorkspaceContext.Provider value={{
      isWorkspaceOpen,
      workspacePath,
      workspaceData,
      currentPage,
      isLoading,
      openWorkspace,
      closeWorkspace,
      saveWorkspaceData,
      setCurrentPage,
      addToPending,
      removeFromPending,
      updatePendingSelection,
      selectAllPending,
      addBatch,
      updateBatch
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}