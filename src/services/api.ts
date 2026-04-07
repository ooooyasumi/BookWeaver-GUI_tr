// API 调用封装
// 开发模式：/api（由 Vite dev server proxy 转发到 8765）
// 打包后：file:// 协议，必须用绝对地址直连后端
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

// 调试日志
function debugLog(...args: unknown[]) {
  console.log('[API Debug]', ...args)
}

// 详细错误处理
async function handleApiError(response: Response, url: string, operation: string): Promise<Error> {
  let errorDetail = ''
  try {
    const text = await response.text()
    errorDetail = text ? `响应内容: ${text}` : '无响应内容'
  } catch {
    errorDetail = '无法读取响应内容'
  }

  const message = `${operation}失败\n` +
    `URL: ${url}\n` +
    `状态码: ${response.status} ${response.statusText}\n` +
    `${errorDetail}`

  debugLog('API Error:', message)
  return new Error(message)
}

// 书籍搜索
export async function searchBooks(params: {
  title?: string
  author?: string
  language?: string
  limit?: number
}): Promise<{
  results: Array<{
    id: number
    title: string
    author: string
    language: string
    matchScore: number
  }>
}> {
  const query = new URLSearchParams()
  if (params.title) query.append('title', params.title)
  if (params.author) query.append('author', params.author)
  if (params.language) query.append('language', params.language)
  if (params.limit) query.append('limit', String(params.limit))

  const url = `${API_BASE}/books/search?${query}`
  debugLog('搜索请求:', url, '参数:', params)

  try {
    const response = await fetch(url)
    debugLog('搜索响应:', response.status, response.statusText)

    if (!response.ok) {
      throw await handleApiError(response, url, '搜索')
    }
    return response.json()
  } catch (err) {
    // 网络错误（无法连接到服务器）
    if (err instanceof TypeError && err.message.includes('fetch')) {
      debugLog('网络错误:', err)
      throw new Error(`搜索失败：无法连接到后端服务器\n` +
        `URL: ${url}\n` +
        `API_BASE: ${API_BASE}\n` +
        `当前协议: ${window.location.protocol}\n` +
        `请检查后端是否已启动 (127.0.0.1:8765)`)
    }
    throw err
  }
}

// 目录状态
export async function getCatalogStatus(): Promise<{
  cached: boolean
  lastUpdate: string | null
  totalBooks: number
}> {
  const url = `${API_BASE}/books/catalog/status`
  debugLog('获取目录状态:', url)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw await handleApiError(response, url, '获取目录状态')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`获取目录状态失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 刷新目录
export async function refreshCatalog(): Promise<void> {
  const url = `${API_BASE}/books/catalog/refresh`
  debugLog('刷新目录:', url)

  try {
    const response = await fetch(url, { method: 'POST' })
    if (!response.ok) {
      throw await handleApiError(response, url, '刷新目录')
    }
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`刷新目录失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 开始下载 (SSE)
export async function startDownload(
  books: Array<{ id: number; title: string; author: string; language: string }>,
  outputDir: string,
  onProgress: (bookId: number, progress: number) => void,
  onComplete: (result: { success: number; failed: number; results: Array<{
    bookId: number
    title: string
    success: boolean
    filePath?: string
    error?: string
  }> }) => void
): Promise<void> {
  const url = `${API_BASE}/download/start`
  debugLog('开始下载:', url, '书籍数量:', books.length)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books, outputDir })
    })

    if (!response.ok) {
      throw await handleApiError(response, url, '开始下载')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'progress') {
              onProgress(data.bookId, data.progress)
            } else if (data.type === 'complete') {
              onComplete(data)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`下载失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// AI 对话 (SSE)
export async function* chatStream(
  message: string,
  onToken: (token: string) => void
): AsyncGenerator<string> {
  const url = `${API_BASE}/chat`
  debugLog('AI对话:', url, '消息:', message)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })

    if (!response.ok) {
      throw await handleApiError(response, url, 'AI对话')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'token') {
              onToken(data.content)
              fullContent += data.content
            } else if (data.type === 'error') {
              debugLog('AI对话错误:', data.content)
              throw new Error(`AI对话错误: ${data.content}`)
            }
          } catch (parseErr) {
            // 忽略解析错误，但记录日志
            debugLog('SSE解析错误:', line)
          }
        }
      }
    }

    yield fullContent
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`AI对话失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 获取配置
export async function getConfig(): Promise<{
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
}> {
  const url = `${API_BASE}/config`
  debugLog('获取配置:', url)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw await handleApiError(response, url, '获取配置')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`获取配置失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 保存配置
export async function saveConfig(config: unknown): Promise<void> {
  const url = `${API_BASE}/config`
  debugLog('保存配置:', url, config)

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    if (!response.ok) {
      throw await handleApiError(response, url, '保存配置')
    }
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`保存配置失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// ─── Library API ─────────────────────────────────────────────────────────────

export interface EpubMetadata {
  filePath: string
  fileName: string
  fileSize: number
  title: string | null
  author: string | null
  language: string | null
  subjects: string[]
  publishYear: number | null
  error: string | null
  relativePath?: string
  metadataUpdated?: boolean
  coverUpdated?: boolean
  coverError?: string | null
  uploaded?: boolean
}

export interface EpubDetail {
  filePath: string
  description: string | null
  coverBase64: string | null
  coverMediaType: string | null
  publisher: string | null
  rights: string | null
  identifier: string | null
  error: string | null
}

export interface LibraryFilesResponse {
  files: EpubMetadata[]
  tree: Record<string, unknown>
  total: number
}

export interface CategoryGroup {
  name: string
  count: number
  books: EpubMetadata[]
}

// 获取工作区目录下的所有 EPUB 文件（使用索引）
export async function getLibraryFiles(workspacePath: string): Promise<LibraryFilesResponse> {
  const query = new URLSearchParams({ workspacePath })
  const url = `${API_BASE}/library/files?${query}`
  debugLog('获取图书列表:', url)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw await handleApiError(response, url, '获取图书列表')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`获取图书列表失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 按分类筛选书籍
export async function getLibraryBySubject(workspacePath: string): Promise<{
  categories: CategoryGroup[]
  total: number
}> {
  const query = new URLSearchParams({ workspacePath })
  const url = `${API_BASE}/library/filter/subject?${query}`
  debugLog('获取分类:', url)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw await handleApiError(response, url, '获取分类')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`获取分类失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 按出版年份筛选书籍
export async function getLibraryByYear(workspacePath: string): Promise<{
  categories: CategoryGroup[]
  total: number
}> {
  const query = new URLSearchParams({ workspacePath })
  const url = `${API_BASE}/library/filter/year?${query}`
  debugLog('获取年份分类:', url)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw await handleApiError(response, url, '获取年份分类')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`获取年份分类失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 获取单个书籍详情（封面 + 简介，动态读取）
export async function getBookDetail(filePath: string): Promise<EpubDetail> {
  const query = new URLSearchParams({ filePath })
  const url = `${API_BASE}/library/detail?${query}`
  debugLog('获取书籍详情:', url)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw await handleApiError(response, url, '获取书籍详情')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`获取书籍详情失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}

// 强制重建索引
export async function reindexLibrary(workspacePath: string): Promise<{
  success: boolean
  total: number
  error?: string
}> {
  const query = new URLSearchParams({ workspacePath })
  const url = `${API_BASE}/library/reindex?${query}`
  debugLog('重建索引:', url)

  try {
    const response = await fetch(url, { method: 'POST' })
    if (!response.ok) {
      throw await handleApiError(response, url, '重建索引')
    }
    return response.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(`重建索引失败：无法连接到后端服务器\nURL: ${url}\nAPI_BASE: ${API_BASE}`)
    }
    throw err
  }
}