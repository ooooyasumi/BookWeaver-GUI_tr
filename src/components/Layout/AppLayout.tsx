import { useState } from 'react'
import { Typography, Button, Tooltip } from 'antd'
import { SettingOutlined, FolderOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Sidebar } from './Sidebar'
import { SearchPage } from '../Search/SearchPage'
import { DownloadPage } from '../Download/DownloadPage'
import { LibraryPage } from '../Library/LibraryPage'
import { MetadataPage } from '../Metadata/MetadataPage'
import { CoverPage } from '../Cover/CoverPage'
import { UploadPage } from '../Upload/UploadPage'
import { SettingsModal } from '../Settings/SettingsModal'
import { LogConsolePage } from '../Settings/LogConsolePage'
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
      case 'metadata':
        return <MetadataPage />
      case 'cover':
        return <CoverPage />
      case 'upload':
        return <UploadPage />
      case 'logs':
        return <LogConsolePage />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOutlined style={{ color: 'var(--text-tertiary)', fontSize: 13 }} />
            <Text style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {workspacePath ? workspacePath.split('/').pop() : 'BookWeaver'}
            </Text>
          </div>

          <div className="title-bar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title={isDark ? '浅色模式' : '深色模式'}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                size="small"
                style={{ color: 'var(--text-tertiary)' }}
              />
            </Tooltip>
            <Tooltip title="设置">
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setSettingsOpen(true)}
                size="small"
                style={{ color: 'var(--text-tertiary)' }}
              />
            </Tooltip>
          </div>
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
