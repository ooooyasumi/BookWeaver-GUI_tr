import { useState } from 'react'
import { Typography, Button, Space, Tooltip } from 'antd'
import { SettingOutlined, FolderOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Sidebar } from './Sidebar'
import { SearchPage } from '../Search/SearchPage'
import { DownloadPage } from '../Download/DownloadPage'
import { LibraryPage } from '../Library/LibraryPage'
import { SettingsModal } from '../Settings/SettingsModal'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useTheme } from '../../contexts/ThemeContext'

const { Text } = Typography

export function AppLayout() {
  const { currentPage, workspacePath } = useWorkspace()
  const { toggleTheme, isDark } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const renderContent = () => {
    switch (currentPage) {
      case 'search':
        return <SearchPage />
      case 'download':
        return <DownloadPage />
      case 'library':
        return <LibraryPage />
      default:
        return <SearchPage />
    }
  }

  return (
    <div className="app-layout">
      {/* 左侧固定边栏 */}
      <aside className="sidebar">
        <Sidebar />
      </aside>

      {/* 右侧可滚动主内容区 */}
      <div className="main-section">
        {/* 顶部标题栏 */}
        <header className="title-bar">
          <div className="title-bar-drag" style={{ width: 70, flexShrink: 0 }} />

          <Text strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
            <FolderOutlined style={{ marginRight: 8, color: 'var(--text-secondary)' }} />
            {workspacePath ? workspacePath.split('/').pop() : 'BookWeaver'}
          </Text>

          <Space size="small" className="title-bar-no-drag">
            <Tooltip title={isDark ? '切换到浅色模式' : '切换到深色模式'}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                size="small"
              />
            </Tooltip>
            <Tooltip title="设置">
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setSettingsOpen(true)}
                size="small"
              />
            </Tooltip>
          </Space>
        </header>

        {/* 可滚动内容区 */}
        <div className="content">
          <div className="page-container">
            {renderContent()}
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}