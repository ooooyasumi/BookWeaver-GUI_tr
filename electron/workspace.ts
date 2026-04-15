import fs from 'fs'
import path from 'path'

// 目录/文件常量
const WORKSPACE_DIR = '.bookweaver'
const CONFIG_FILE = 'config.json'
const STATE_FILE = 'state.json'       // 持久状态：预下载列表 + 批次摘要
const DOWNLOADS_DIR = 'downloads'     // 每批次一个子目录

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
}

/**
 * 批次摘要 - 存在 state.json 里，轻量
 */
export interface BatchSummary {
  id: number
  name: string
  createdAt: string
  status: 'downloading' | 'paused' | 'completed' | 'failed'
  total: number
  success: number
  failed: number
  outputDir: string   // 实际 EPUB 文件所在目录（工作区外，用户选择的）
}

/**
 * 批次详情 - 存在 downloads/batch_N/meta.json，包含完整书单和结果
 */
export interface BatchMeta {
  id: number
  books: PendingBook[]          // 本批次所有书
  completedIds: number[]        // 已成功下载的 bookId（用于继续下载时跳过）
  results: DownloadResult[]     // 完整结果列表
}

/**
 * state.json 结构
 */
export interface AppState {
  version: string
  updatedAt: string
  pending: PendingBook[]
  batches: BatchSummary[]
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
  upload?: {
    concurrent: number
  }
  metadata?: {
    batchSize: number
    maxConcurrentBatches: number
  }
}

// ─── 默认值 ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Config = {
  llm: {
    apiKey: '',
    model: 'qwen3-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    temperature: 0.7,
    maxTokens: 2000
  },
  download: {
    concurrent: 3,
    timeout: 30
  },
  upload: {
    concurrent: 3
  },
  metadata: {
    batchSize: 5,
    maxConcurrentBatches: 2
  }
}

const DEFAULT_STATE: AppState = {
  version: '2.0',
  updatedAt: new Date().toISOString(),
  pending: [],
  batches: []
}

// ─── WorkspaceManager ────────────────────────────────────────────────────────

export class WorkspaceManager {
  private basePath: string
  private workspacePath: string   // basePath/.bookweaver

  constructor(folderPath: string) {
    this.basePath = folderPath
    this.workspacePath = path.join(folderPath, WORKSPACE_DIR)
  }

  async initialize(): Promise<void> {
    fs.mkdirSync(this.workspacePath, { recursive: true })

    const configPath = path.join(this.workspacePath, CONFIG_FILE)
    if (!fs.existsSync(configPath)) {
      this.saveConfig(DEFAULT_CONFIG)
    }

    const statePath = path.join(this.workspacePath, STATE_FILE)
    if (!fs.existsSync(statePath)) {
      this.saveState(DEFAULT_STATE)
    }

    // 迁移旧格式 workspace.json → state.json
    const legacyPath = path.join(this.workspacePath, 'workspace.json')
    if (fs.existsSync(legacyPath) && !fs.existsSync(statePath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'))
        const migrated: AppState = {
          version: '2.0',
          updatedAt: new Date().toISOString(),
          pending: (legacy.pendingDownloads || []).map((b: any) => ({
            id: b.id, title: b.title, author: b.author, language: b.language
          })),
          batches: (legacy.batches || []).map((b: any) => ({
            id: b.id,
            name: b.name,
            createdAt: b.createdAt,
            status: b.status,
            total: b.total,
            success: b.success,
            failed: b.failed,
            outputDir: ''
          }))
        }
        this.saveState(migrated)
      } catch {
        this.saveState(DEFAULT_STATE)
      }
    }
  }

  // ── State (state.json) ──────────────────────────────────────────────────

  getState(): AppState {
    const filePath = path.join(this.workspacePath, STATE_FILE)
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return { ...DEFAULT_STATE }
    }
  }

  saveState(state: AppState): void {
    const filePath = path.join(this.workspacePath, STATE_FILE)
    fs.writeFileSync(filePath, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString()
    }, null, 2))
  }

  // ── Batch Meta (downloads/batch_N/meta.json) ────────────────────────────

  getBatchMetaDir(batchId: number): string {
    return path.join(this.workspacePath, DOWNLOADS_DIR, `batch_${batchId}`)
  }

  getBatchMeta(batchId: number): BatchMeta | null {
    const metaPath = path.join(this.getBatchMetaDir(batchId), 'meta.json')
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch {
      return null
    }
  }

  saveBatchMeta(meta: BatchMeta): void {
    const dir = this.getBatchMetaDir(meta.id)
    fs.mkdirSync(dir, { recursive: true })
    const metaPath = path.join(dir, 'meta.json')
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  }

  // ── Config ──────────────────────────────────────────────────────────────

  getConfig(): Config {
    const filePath = path.join(this.workspacePath, CONFIG_FILE)
    try {
      const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return {
        llm: { ...DEFAULT_CONFIG.llm, ...loaded.llm },
        download: { ...DEFAULT_CONFIG.download, ...loaded.download },
        upload: loaded.upload
          ? { ...DEFAULT_CONFIG.upload, ...loaded.upload }
          : DEFAULT_CONFIG.upload,
        metadata: loaded.metadata
          ? { ...DEFAULT_CONFIG.metadata, ...loaded.metadata }
          : DEFAULT_CONFIG.metadata
      }
    } catch {
      return DEFAULT_CONFIG
    }
  }

  saveConfig(config: Config): void {
    const filePath = path.join(this.workspacePath, CONFIG_FILE)
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2))
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  getBasePath(): string {
    return this.basePath
  }

  getWorkspacePath(): string {
    return this.workspacePath
  }

  /** 生成下一个批次 ID（已有批次最大 ID + 1） */
  nextBatchId(): number {
    const state = this.getState()
    if (state.batches.length === 0) return 1
    return Math.max(...state.batches.map(b => b.id)) + 1
  }
}
