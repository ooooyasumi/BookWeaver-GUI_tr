import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Space, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

interface LogEntry {
  id: number
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
  timestamp: Date
}

let logIdCounter = 0
const MAX_LOGS = 500

// 全局日志存储
let globalLogs: LogEntry[] = []
let listeners: Array<(logs: LogEntry[]) => void> = []

function addLog(level: LogEntry['level'], ...args: unknown[]) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    }
    return String(arg)
  }).join(' ')

  const entry: LogEntry = {
    id: logIdCounter++,
    level,
    message,
    timestamp: new Date()
  }

  globalLogs.push(entry)
  if (globalLogs.length > MAX_LOGS) {
    globalLogs = globalLogs.slice(-MAX_LOGS)
  }

  listeners.forEach(listener => listener([...globalLogs]))
}

function getLogs(): LogEntry[] {
  return [...globalLogs]
}

// 拦截 console 方法
const originalLog = console.log
const originalWarn = console.warn
const originalError = console.error
const originalInfo = console.info

console.log = (...args) => {
  addLog('log', ...args)
  originalLog.apply(console, args)
}

console.warn = (...args) => {
  addLog('warn', ...args)
  originalWarn.apply(console, args)
}

console.error = (...args) => {
  addLog('error', ...args)
  originalError.apply(console, args)
}

console.info = (...args) => {
  addLog('info', ...args)
  originalInfo.apply(console, args)
}

interface LogConsoleProps {
  visible: boolean
}

export function LogConsole({ visible }: LogConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) {
      setLogs(getLogs())
      const listener = (newLogs: LogEntry[]) => {
        setLogs([...newLogs])
      }
      listeners.push(listener)
      return () => {
        listeners = listeners.filter(l => l !== listener)
      }
    }
  }, [visible])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const handleClear = useCallback(() => {
    globalLogs = []
    setLogs([])
  }, [])

  const levelColors: Record<LogEntry['level'], string> = {
    log: 'var(--text-primary)',
    info: 'var(--accent-color)',
    warn: '#faad14',
    error: '#ff4d4f'
  }

  if (!visible) return null

  return (
    <div
      style={{
        marginTop: 16,
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#1e1e1e'
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#2d2d2d',
          borderBottom: '1px solid #3d3d3d'
        }}
      >
        <Text style={{ color: '#ccc', fontSize: 12 }}>调试日志</Text>
        <Space>
          <Button
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleClear}
            style={{ fontSize: 11 }}
          >
            清空
          </Button>
        </Space>
      </div>

      {/* 日志内容 */}
      <div
        ref={scrollRef}
        style={{
          height: 300,
          overflow: 'auto',
          padding: '8px 12px',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: 11,
          lineHeight: 1.6
        }}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#666', fontSize: 11 }}>暂无日志</Text>
        ) : (
          logs.map(log => (
            <div key={log.id} style={{ color: levelColors[log.level], wordBreak: 'break-all' }}>
              <span style={{ color: '#666' }}>
                [{log.timestamp.toLocaleTimeString('zh-CN', { hour12: false })}]
              </span>{' '}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// 导出不带样式的日志函数供外部使用
export const logger = {
  log: (...args: unknown[]) => addLog('log', ...args),
  warn: (...args: unknown[]) => addLog('warn', ...args),
  error: (...args: unknown[]) => addLog('error', ...args),
  info: (...args: unknown[]) => addLog('info', ...args),
  clear: () => { globalLogs = [] }
}
