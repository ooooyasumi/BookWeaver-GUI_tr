import { useState, useRef, useEffect } from 'react'
import { Input, Button, Space, message, Checkbox, Drawer, Card, Segmented, Collapse, Select } from 'antd'
import { SearchOutlined, MessageOutlined, SendOutlined, PlusOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { BookList } from '../Common/BookList'

// API 地址配置
// 开发模式：/api（由 Vite dev server proxy 转发到 8765）
// 打包后：file:// 协议，必须用绝对地址直连后端
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

// 搜索类型
type SearchType = 'title' | 'author' | 'subject' | 'year'

// 语言选项
const LANGUAGE_OPTIONS = [
  { label: '英语', value: 'en' },
  { label: '西班牙语', value: 'es' },
  { label: '德语', value: 'de' },
  { label: '法语', value: 'fr' },
  { label: '葡萄牙语', value: 'pt' },
  { label: '意大利语', value: 'it' },
  { label: '俄语', value: 'ru' },
  { label: '中文', value: 'zh' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '荷兰语', value: 'nl' },
  { label: '波兰语', value: 'pl' },
  { label: '瑞典语', value: 'sv' },
  { label: '印地语', value: 'hi' },
  { label: '阿拉伯语', value: 'ar' },
]

// 从文本中提取思考块并移除
function extractThinking(text: string): { content: string; thinking: string | undefined } {
  // 匹配各种思考块格式
  const thinkingPatterns = [
    /\n*<think>[\s\S]*?<\/think>/gi,
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /<\/?(?:thought|thinking)[^>]*>[\s\S]*?<\/?(?:thought|thinking)>/gi,
    /\[\/?(?:thought|thinking)\][\s\S]*?\[\/?(?:thought|thinking)\]/gi,
    /<<[^>]+>>[\s\S]*?<<\/[^>]+>>/gi,
  ]

  let thinking: string | undefined
  let content = text

  for (const pattern of thinkingPatterns) {
    const match = content.match(pattern)
    if (match) {
      thinking = match[0]
      content = content.replace(pattern, '')
      break
    }
  }

  return { content: content.trim(), thinking: thinking?.trim() }
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  type?: 'normal' | 'tool_status' | 'tool_result'
}

interface LLMConfig {
  apiKey: string
  model: string
  baseUrl: string
  temperature: number
  maxTokens: number
}

interface Config {
  llm: LLMConfig
}

export function SearchPage() {
  const {
    addToPending,
    searchResults,
    searchResultSelectedKeys,
    setSearchResults,
    appendSearchResults,
    removeFromSearchResults,
    clearSearchResults,
    toggleSearchResultSelection,
    selectAllSearchResults,
    clearSearchResultSelection
  } = useWorkspace()

  // 搜索相关状态
  const [searchText, setSearchText] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('title')
  const [searchLanguage, setSearchLanguage] = useState('en')
  const [loading, setLoading] = useState(false)

  const selectedRowKeys = searchResultSelectedKeys

  // AI 对话相关
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<Message[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  // 滚动到底部
  const scrollToBottom = () => {
    if (autoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }

  // 处理手动滚动：检测用户是否手动滚动，若滚动则停止自动滚动
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
      autoScrollRef.current = isAtBottom
    }
  }

  // 调试信息状态
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [lastError, setLastError] = useState<string>('')
  const [debugMode, setDebugMode] = useState(false)

  // 加载调试模式配置
  useEffect(() => {
    const loadDebugMode = async () => {
      try {
        const config = await window.electronAPI.getConfig()
        setDebugMode((config as any)?.debugMode ?? false)
      } catch {
        setDebugMode(false)
      }
    }
    loadDebugMode()
  }, [])

  // 更新调试信息
  const updateDebugInfo = (info: string) => {
    setDebugInfo(info)
    console.log('[Debug]', info)
  }

  // 搜索书籍
  const handleSearch = async () => {
    if (!searchText.trim()) {
      message.warning('请输入搜索内容')
      return
    }

    setLoading(true)
    setLastError('')
    updateDebugInfo(`开始搜索...\n协议: ${window.location.protocol}\nAPI_BASE: ${API_BASE}`)

    try {
      // 根据搜索类型构建查询参数
      const params = new URLSearchParams()
      params.set('limit', '1000')
      params.set('language', searchLanguage)

      switch (searchType) {
        case 'title':
          params.set('title', searchText)
          break
        case 'author':
          params.set('author', searchText)
          break
        case 'subject':
          params.set('subject', searchText)
          break
        case 'year':
          const year = parseInt(searchText, 10)
          if (isNaN(year)) {
            message.warning('请输入有效的年份')
            setLoading(false)
            return
          }
          params.set('year', year.toString())
          break
      }

      const url = `${API_BASE}/books/search?${params.toString()}`
      updateDebugInfo(`请求URL: ${url}\n正在发送请求...`)

      let response: Response
      try {
        response = await fetch(url)
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError)
        const fullError = `Fetch失败: ${errorMsg}\nURL: ${url}\nAPI_BASE: ${API_BASE}\n协议: ${window.location.protocol}`
        updateDebugInfo(fullError)
        setLastError(fullError)
        message.error({ content: `网络请求失败\n${fullError}`, duration: 15 })
        setLoading(false)
        return
      }

      updateDebugInfo(`收到响应: HTTP ${response.status} ${response.statusText}`)

      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch {
          errorText = '无法读取响应内容'
        }
        const fullError = `HTTP ${response.status} ${response.statusText}\nURL: ${url}\n响应: ${errorText}`
        updateDebugInfo(fullError)
        setLastError(fullError)
        message.error({ content: `搜索失败\n${fullError}`, duration: 15 })
        setLoading(false)
        return
      }

      let data
      try {
        data = await response.json()
      } catch (jsonError) {
        const errorMsg = jsonError instanceof Error ? jsonError.message : String(jsonError)
        const fullError = `JSON解析失败: ${errorMsg}`
        updateDebugInfo(fullError)
        setLastError(fullError)
        message.error({ content: fullError, duration: 15 })
        setLoading(false)
        return
      }

      updateDebugInfo(`成功! 返回 ${data.results?.length || 0} 条结果`)
      setSearchResults(data.results || [])
      clearSearchResultSelection()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const fullError = `未知错误: ${errorMsg}`
      updateDebugInfo(fullError)
      setLastError(fullError)
      message.error({ content: fullError, duration: 15 })
    } finally {
      setLoading(false)
    }
  }

  // 添加到预下载
  const handleAddToPending = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择书籍')
      return
    }

    const selectedBooks = searchResults
      .filter(book => selectedRowKeys.includes(book.id))
      .map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        language: book.language,
      }))

    addToPending(selectedBooks)
    message.success(`已添加 ${selectedBooks.length} 本书籍到预下载列表`)
    // 清空选择状态，但保留搜索结果列表
    clearSearchResultSelection()
  }

  // AI 对话
  const aiMessagesRef = useRef<Message[]>([])  // 与 aiMessages state 同步，用于读取当前长度

  const handleAiSend = async () => {
    if (!aiInput.trim()) return

    const userMessage: Message = { role: 'user', content: aiInput }
    setAiMessages(prev => {
      const next = [...prev, userMessage]
      aiMessagesRef.current = next
      return next
    })
    setAiInput('')
    autoScrollRef.current = true
    setAiLoading(true)

    try {
      // 获取配置
      const config = await window.electronAPI.getConfig() as Config

      // 检查 API Key 是否配置
      if (!config?.llm?.apiKey) {
        message.error('请先在设置中配置 LLM API Key')
        setAiMessages(prev => [...prev, { role: 'assistant', content: '请先在设置中配置 LLM API Key' }])
        setAiLoading(false)
        return
      }

      const url = `${API_BASE}/chat`

      // 显示调试信息
      console.log('[AI Debug] API_BASE:', API_BASE)
      console.log('[AI Debug] URL:', url)
      console.log('[AI Debug] Protocol:', window.location.protocol)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: aiInput,
          history: aiMessages,
          config: config.llm
        })
      })

      console.log('[AI Debug] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        message.error({
          content: `AI 对话失败 (HTTP ${response.status})\nURL: ${url}\nAPI_BASE: ${API_BASE}\n协议: ${window.location.protocol}\n响应: ${errorText || '无内容'}`,
          duration: 10
        })
        setAiMessages(prev => [...prev, { role: 'assistant', content: `对话失败: HTTP ${response.status}\n${errorText}` }])
        setAiLoading(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let totalAdded = 0

      // 用固定索引追踪两条特殊消息：状态消息 + 最终回复消息
      // 索引在首次插入时确定，后续原地更新，避免大批量时刷屏
      let statusMsgIdx = -1
      let replyMsgIdx = -1

      const insertStatusMsg = (text: string) => {
        statusMsgIdx = aiMessagesRef.current.length
        setAiMessages(prev => {
          const next = [...prev, { role: 'assistant' as const, content: text, type: 'tool_status' as const }]
          aiMessagesRef.current = next
          return next
        })
      }

      const updateStatusMsg = (text: string) => {
        setAiMessages(prev => {
          const msgs = [...prev]
          if (statusMsgIdx >= 0 && statusMsgIdx < msgs.length) {
            msgs[statusMsgIdx] = { role: 'assistant', content: text, type: 'tool_status' }
          }
          aiMessagesRef.current = msgs
          return msgs
        })
      }

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))

              if (event.type === 'token') {
                assistantContent += event.content
                // 提取思考块
                const { content: cleanContent, thinking } = extractThinking(assistantContent)
                if (replyMsgIdx === -1) {
                  // 第一个 token：新建回复消息
                  replyMsgIdx = aiMessagesRef.current.length
                  setAiMessages(prev => {
                    const next = [...prev, { role: 'assistant' as const, content: cleanContent, thinking, type: 'normal' as const }]
                    aiMessagesRef.current = next
                    return next
                  })
                  scrollToBottom()
                } else {
                  // 后续 token：原地更新
                  setAiMessages(prev => {
                    const msgs = [...prev]
                    if (replyMsgIdx >= 0 && replyMsgIdx < msgs.length) {
                      msgs[replyMsgIdx] = { role: 'assistant', content: cleanContent, thinking, type: 'normal' }
                    }
                    aiMessagesRef.current = msgs
                    return msgs
                  })
                  scrollToBottom()
                }

              } else if (event.type === 'tool_status') {
                const statusText = event.content || '正在处理...'
                if (statusMsgIdx === -1) {
                  insertStatusMsg(statusText)
                } else {
                  updateStatusMsg(statusText)
                }

              } else if (event.type === 'clear_results') {
                clearSearchResults()
                totalAdded = 0

              } else if (event.type === 'add_books') {
                const books = event.books || []
                if (books.length > 0) {
                  appendSearchResults(books)
                  totalAdded += books.length
                  if (statusMsgIdx !== -1) {
                    updateStatusMsg(`搜索中，已加入 ${totalAdded} 本书...`)
                  }
                }

              } else if (event.type === 'remove_books') {
                const ids = event.ids || []
                if (ids.length > 0) {
                  removeFromSearchResults(ids)
                }

              } else if (event.type === 'complete') {
                // 完成：把状态消息改为最终统计
                if (statusMsgIdx !== -1 && totalAdded > 0) {
                  setAiMessages(prev => {
                    const msgs = [...prev]
                    if (statusMsgIdx >= 0 && statusMsgIdx < msgs.length) {
                      msgs[statusMsgIdx] = {
                        role: 'assistant',
                        content: `共加入 ${totalAdded} 本书到列表`,
                        type: 'tool_result'
                      }
                    }
                    aiMessagesRef.current = msgs
                    return msgs
                  })
                }
                scrollToBottom()

              } else if (event.type === 'error') {
                message.error(event.content)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      // 网络错误或其他错误
      const errorMsg = error instanceof Error ? error.message : String(error)
      message.error({
        content: `AI 对话失败：网络错误\nAPI_BASE: ${API_BASE}\n协议: ${window.location.protocol}\n错误: ${errorMsg}\n\n请检查后端是否启动 (127.0.0.1:8765)`,
        duration: 10
      })
      console.error('[AI Error]', error)
      setAiMessages(prev => [...prev, { role: 'assistant', content: `对话失败：网络错误\n${errorMsg}` }])
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div>
      {/* 调试面板 - 根据调试模式显示 */}
      {debugMode && (
        <Card className="card" style={{ marginBottom: 16, backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#00ff00' }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#888' }}>协议:</span> {window.location.protocol}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#888' }}>API_BASE:</span> {API_BASE}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#888' }}>后端地址:</span> http://127.0.0.1:8765
            </div>
            {debugInfo && (
              <div style={{ marginTop: 12, padding: 8, backgroundColor: '#222', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                <span style={{ color: '#888' }}>调试信息:</span>
                <div>{debugInfo}</div>
              </div>
            )}
            {lastError && (
              <div style={{ marginTop: 12, padding: 8, backgroundColor: '#400', borderRadius: 4, whiteSpace: 'pre-wrap', color: '#ff6666' }}>
                <span style={{ color: '#ff9999' }}>错误:</span>
                <div>{lastError}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 搜索卡片 */}
      <Card className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            placeholder="输入搜索内容"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            style={{ flex: 1 }}
            size="large"
            allowClear
          />
          <Segmented
            value={searchType}
            onChange={(val) => setSearchType(val as SearchType)}
            options={[
              { label: '书名', value: 'title' },
              { label: '作者', value: 'author' },
              { label: '分类', value: 'subject' },
              { label: '年份', value: 'year' },
            ]}
            size="large"
          />
          <Select
            value={searchLanguage}
            onChange={setSearchLanguage}
            options={LANGUAGE_OPTIONS}
            style={{ width: 110 }}
            size="large"
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
            size="large"
            style={{ flexShrink: 0 }}
          >
            搜索
          </Button>
          <Button
            type="primary"
            icon={<MessageOutlined />}
            onClick={() => setAiDrawerOpen(true)}
            size="large"
            className="ai-assistant-btn"
            style={{ flexShrink: 0 }}
          >
            AI
          </Button>
        </div>
      </Card>

      {/* 操作栏 */}
      {searchResults.length > 0 && (
        <Card className="card" style={{ marginBottom: 24 }}>
          <Space>
            <Checkbox
              checked={selectedRowKeys.length === searchResults.length && searchResults.length > 0}
              indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < searchResults.length}
              onChange={e => {
                selectAllSearchResults(e.target.checked)
              }}
            >
              全选
            </Checkbox>
            <Button size="small" onClick={() => {
              const keys = searchResults.slice(0, 100).map(b => b.id)
              selectAllSearchResults(false)
              keys.forEach(id => {
                if (!selectedRowKeys.includes(id)) {
                  toggleSearchResultSelection(id)
                }
              })
            }}>
              前100条
            </Button>
            <Button size="small" onClick={() => {
              const keys = searchResults.slice(0, 300).map(b => b.id)
              selectAllSearchResults(false)
              keys.forEach(id => {
                if (!selectedRowKeys.includes(id)) {
                  toggleSearchResultSelection(id)
                }
              })
            }}>
              前300条
            </Button>
            <span style={{ color: 'var(--text-secondary)' }}>
              已选 {selectedRowKeys.length} 本
            </span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddToPending}
              disabled={selectedRowKeys.length === 0}
            >
              预下载
            </Button>
            <Button
              danger
              onClick={() => {
                removeFromSearchResults(selectedRowKeys)
                clearSearchResultSelection()
              }}
              disabled={selectedRowKeys.length === 0}
            >
              删除 ({selectedRowKeys.length})
            </Button>
          </Space>
        </Card>
      )}

      {/* 搜索结果列表 */}
      <BookList
        type="search"
        data={searchResults}
        loading={loading}
        selectedRowKeys={selectedRowKeys}
        onSelectionChange={(keys) => {
          const clickedId = keys.find(k => !searchResultSelectedKeys.includes(k))
          if (clickedId) {
            toggleSearchResultSelection(clickedId)
          } else {
            const removedId = searchResultSelectedKeys.find(k => !keys.includes(k))
            if (removedId) {
              toggleSearchResultSelection(removedId)
            }
          }
        }}
      />

      {/* AI 对话抽屉 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageOutlined style={{ color: 'var(--accent-color)' }} />
            <span>AI 助手</span>
          </div>
        }
        placement="right"
        width={400}
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column' }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* 消息列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} ref={scrollContainerRef} onScroll={handleScroll}>
            {aiMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-tertiary)' }}>
                <MessageOutlined style={{ fontSize: 32, display: 'block', marginBottom: 12, opacity: 0.4 }} />
                <div style={{ fontSize: 13 }}>向 AI 描述你想找的书籍</div>
              </div>
            )}
            {aiMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: 10,
                  textAlign: msg.role === 'user' ? 'right' : 'left'
                }}
              >
                {msg.thinking && (
                  <Collapse
                    ghost
                    size="small"
                    style={{ marginBottom: 4 }}
                    items={[{
                      key: 'thinking',
                      label: <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🤔 思考过程</span>,
                      children: <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit', color: 'var(--text-secondary)' }}>{msg.thinking}</pre>
                    }]}
                  />
                )}
                <div
                  className={msg.role === 'user' ? 'ai-message-user' : msg.type === 'tool_status' ? 'ai-message-tool-status' : msg.type === 'tool_result' ? 'ai-message-tool-result' : 'ai-message-assistant'}
                  style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{ textAlign: 'left', padding: '4px 0' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>AI 正在思考...</span>
              </div>
            )}
          </div>

          {/* 输入框 */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                placeholder="输入消息..."
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onPressEnter={handleAiSend}
                disabled={aiLoading}
                size="large"
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleAiSend}
                loading={aiLoading}
                disabled={!aiInput.trim()}
                size="large"
              />
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
