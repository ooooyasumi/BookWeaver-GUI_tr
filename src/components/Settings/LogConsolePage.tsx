import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

interface LogEntry {
  id: number
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
  timestamp: Date
}

let logIdCounter = 0
const MAX_LOGS = 1000

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

export function LogConsolePage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLogs(getLogs())
    const listener = (newLogs: LogEntry[]) => {
      setLogs([...newLogs])
    }
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }, [])

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
    log: '#e0e0e0',
    info: '#4fc3f7',
    warn: '#ffb74d',
    error: '#ef5350'
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* 标题栏 */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Text strong style={{ fontSize: 16 }}>调试日志</Text>
        <Button
          size="small"
          icon={<DeleteOutlined />}
          onClick={handleClear}
        >
          清空
        </Button>
      </div>

      {/* 日志内容 */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: 12,
          lineHeight: 1.6,
          background: '#1e1e1e'
        }}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#666' }}>暂无日志</Text>
        ) : (
          logs.map(log => (
            <div key={log.id} style={{ color: levelColors[log.level], wordBreak: 'break-all', marginBottom: 4 }}>
              <span style={{ color: '#666' }}>
                [{log.timestamp.toLocaleTimeString('zh-CN', { hour12: false })}]
              </span>{' '}
              <span style={{ color: getLevelColor(log.level) }}>[{log.level.toUpperCase()}]</span>{' '}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function getLevelColor(level: LogEntry['level']): string {
  const colors: Record<LogEntry['level'], string> = {
    log: '#888',
    info: '#4fc3f7',
    warn: '#ffb74d',
    error: '#ef5350'
  }
  return colors[level]
}

// 导出不带样式的日志函数供外部使用
export const logger = {
  log: (...args: unknown[]) => addLog('log', ...args),
  warn: (...args: unknown[]) => addLog('warn', ...args),
  error: (...args: unknown[]) => addLog('error', ...args),
  info: (...args: unknown[]) => addLog('info', ...args),
  clear: () => { globalLogs = [] }
}
