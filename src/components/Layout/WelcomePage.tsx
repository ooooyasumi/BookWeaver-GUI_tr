import { useState, useCallback, DragEvent } from 'react'
import { Button, Typography, Space, message, Tag } from 'antd'
import { FolderOpenOutlined, FolderAddOutlined } from '@ant-design/icons'
import { useWorkspace } from '../../contexts/WorkspaceContext'

const { Title, Text } = Typography

// 从 package.json 读取版本号
const APP_VERSION = '0.1.1'

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
      {/* 顶部拖动区域 */}
      <div
        className="title-bar-drag"
        style={{
          height: 48,
          flex: '0 0 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 24,
          background: 'var(--sidebar-bg)',
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}
      >
        <Text strong style={{ fontSize: 16, color: '#fff', letterSpacing: '-0.5px' }}>BookWeaver</Text>
      </div>

      {/* 主内容区 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: 24
        }}
      >
        <Space direction="vertical" size="large" align="center">
          <div style={{ textAlign: 'center' }}>
            <Title level={1} style={{ marginBottom: 8, fontSize: 36, fontWeight: 600 }}>
              BookWeaver
            </Title>
            <Space direction="vertical" size="small">
              <Text type="secondary" style={{ fontSize: 15 }}>
                Project Gutenberg 书籍下载工具
              </Text>
              <Tag color="blue" style={{ fontSize: 12, padding: '2px 12px' }}>
                v{APP_VERSION}
              </Tag>
            </Space>
          </div>

          <div
            style={{
              padding: '56px 72px',
              border: '2px dashed var(--border-color)',
              borderRadius: 16,
              background: 'var(--bg-secondary)',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              borderColor: isDragging ? 'var(--accent-color)' : 'var(--border-color)',
              boxShadow: isDragging ? '0 4px 24px rgba(0,122,255,0.15)' : 'var(--card-shadow)'
            }}
          >
            <Space direction="vertical" size="large" align="center">
              <FolderAddOutlined
                style={{
                  fontSize: 56,
                  color: 'var(--accent-color)',
                  transition: 'transform 0.3s ease',
                  transform: isDragging ? 'scale(1.1)' : 'scale(1)'
                }}
              />
              <div>
                <Text style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
                  拖拽文件夹到此处
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  或点击下方按钮选择工作区
                </Text>
              </div>
              <Button
                type="primary"
                size="large"
                icon={<FolderOpenOutlined />}
                onClick={handleOpenFolder}
                loading={isLoading}
                style={{
                  borderRadius: 10,
                  padding: '12px 32px',
                  fontSize: 15,
                  height: 48
                }}
              >
                打开工作区
              </Button>
            </Space>
          </div>

          <Text type="secondary" style={{ fontSize: 13 }}>
            工作区将用于存储下载的书籍和配置数据
          </Text>
        </Space>
      </div>
    </div>
  )
}
