import { Menu } from 'antd'
import { SearchOutlined, DownloadOutlined, BookOutlined, TagsOutlined, PictureOutlined, CloudUploadOutlined, CodeOutlined } from '@ant-design/icons'
import { useWorkspace, PageType } from '../../contexts/WorkspaceContext'
import { VersionLink } from '../Settings/VersionHistory'

const menuItems = [
  {
    key: 'search',
    icon: <SearchOutlined />,
    label: '搜索书籍'
  },
  {
    key: 'download',
    icon: <DownloadOutlined />,
    label: '下载管理'
  },
  {
    key: 'library',
    icon: <BookOutlined />,
    label: '图书管理'
  },
  {
    key: 'cover',
    icon: <PictureOutlined />,
    label: '封面管理'
  },
  {
    key: 'metadata',
    icon: <TagsOutlined />,
    label: '元数据管理'
  },
  {
    key: 'upload',
    icon: <CloudUploadOutlined />,
    label: '书籍上传'
  }
]

// 调试日志菜单项
const logsMenuItem = {
  key: 'logs',
  icon: <CodeOutlined />,
  label: '日志终端'
}

export function Sidebar() {
  const { currentPage, setCurrentPage, debugMode } = useWorkspace()

  const handleMenuClick = ({ key }: { key: string }) => {
    setCurrentPage(key as PageType)
  }

  // 根据 debugMode 决定是否显示日志菜单
  const visibleMenuItems = debugMode
    ? [...menuItems, logsMenuItem]
    : menuItems

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        className="title-bar-drag"
        style={{
          height: 32,
          flex: '0 0 32px',
        }}
      />
      <div
        style={{
          padding: '8px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>📖</span>
        <span style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>
          BookWeaver
        </span>
      </div>
      <div style={{ flex: 1, padding: '12px 12px 0' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPage]}
          items={visibleMenuItems}
          onClick={handleMenuClick}
          style={{
            border: 'none',
            background: 'transparent',
          }}
        />
      </div>
      <div
        style={{
          padding: '12px 16px',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.5px'
        }}
      >
        <VersionLink style={{ color: 'rgba(255,255,255,0.25)' }} />
      </div>
    </div>
  )
}
