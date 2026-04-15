export interface ElectronAPI {
  // 对话框
  openFolder: () => Promise<string | null>

  // 工作区
  openWorkspace: (folderPath: string) => Promise<WorkspaceData>
  getWorkspaceStatus: () => Promise<WorkspaceData | null>
  saveWorkspace: (data: unknown) => Promise<boolean>

  // 配置
  getConfig: () => Promise<Config | null>
  saveConfig: (config: unknown) => Promise<boolean>

  // AI 上下文
  getAIContext: () => Promise<AIContext | null>
  saveAIContext: (context: unknown) => Promise<boolean>

  // Shell
  openPath: (path: string) => Promise<void>
}

export interface WorkspaceData {
  version: string
  createdAt: string
  updatedAt: string
  pendingDownloads: PendingBook[]
  currentBatch: number | null
  batches: Batch[]
}

export interface PendingBook {
  id: number
  title: string
  author: string
  language: string
  selected: boolean
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

export interface DownloadResult {
  bookId: number
  title: string
  success: boolean
  filePath?: string
  error?: string
}

export interface AIContext {
  history: Array<{ role: string; content: string }>
  bookList: PendingBook[]
}

export interface Config {
  llm: LLMConfig
  download: DownloadConfig
  upload?: UploadConfig
  metadata?: MetadataConfig
  debugMode?: boolean
}

export interface LLMConfig {
  apiKey: string
  model: string
  baseUrl: string
  temperature: number
  maxTokens: number
}

export interface DownloadConfig {
  concurrent: number
  timeout: number
}

export interface MetadataConfig {
  batchSize: number  // 每批处理的书本数量 (5-15)
  maxConcurrentBatches: number  // 最大并发批次数 (1-5)
}

export interface UploadConfig {
  concurrent: number  // 上传并发数 (1-10)
}