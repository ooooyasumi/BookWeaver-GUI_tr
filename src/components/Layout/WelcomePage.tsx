import { useState, useCallback, DragEvent } from 'react'
import { Button, Typography, message } from 'antd'
import { FolderOpenOutlined, FolderAddOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'

const { Title, Text } = Typography

const APP_VERSION = '0.5.0'

export function WelcomePage() {
  const { openWorkspace, isLoading } = useWorkspace()
  const [isDragging, setIsDragging] = useState(false)

  const handleOpenFolder = async () => {
    try {
      const path = await window.electronAPI.openFolder()
      if (path) {
        await openWorkspace(path)
        message.success(`已打开工作区：${path}`)
      }
    } catch (error) {
      message.error('打开工作区失败')
      console.error(error)
    }
  }

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const item = files[0]
      if (item.path) {
        try {
          await openWorkspace(item.path)
          message.success(`已打开工作区：${item.path}`)
        } catch (error) {
          message.error('打开工作区失败')
          console.error(error)
        }
      }
    }
  }, [openWorkspace])

  return (
    <div
      className={`drop-zone ${isDragging ? 'active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)'
      }}
    >
      {/* 顶部拖动区域（无内容，仅保留 macOS 红绿灯空间） */}
      <div
        className="title-bar-drag"
        style={{
          height: 52,
          flex: '0 0 52px',
          background: 'var(--sidebar-bg)',
        }}
      />

      {/* 主内容区 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: 32
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
            <Title level={2} style={{ marginBottom: 4, fontWeight: 700 }}>
              BookWeaver
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              Project Gutenberg 书籍下载工具
            </Text>
            <div style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                v{APP_VERSION}
              </Text>
            </div>
          </div>

          <div
            style={{
              padding: '40px 48px',
              border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
              borderRadius: 16,
              background: isDragging ? 'var(--accent-light)' : 'var(--bg-secondary)',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              boxShadow: isDragging ? '0 4px 24px rgba(0,122,255,0.15)' : 'none'
            }}
          >
            <FolderAddOutlined
              style={{
                fontSize: 48,
                color: isDragging ? 'var(--accent-color)' : 'var(--text-tertiary)',
                transition: 'all 0.3s ease',
                transform: isDragging ? 'scale(1.1)' : 'scale(1)',
                display: 'block',
                marginBottom: 16
              }}
            />
            <Text style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
              拖拽文件夹到此处
            </Text>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 20 }}>
              或点击下方按钮选择工作区
            </Text>
            <Button
              type="primary"
              size="large"
              icon={<FolderOpenOutlined />}
              onClick={handleOpenFolder}
              loading={isLoading}
              style={{
                borderRadius: 10,
                padding: '8px 32px',
                fontSize: 14,
                height: 44
              }}
            >
              打开工作区
            </Button>
          </div>

          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 16 }}>
            工作区用于存储下载的书籍和配置数据
          </Text>
        </div>
      </div>
    </div>
  )
}
