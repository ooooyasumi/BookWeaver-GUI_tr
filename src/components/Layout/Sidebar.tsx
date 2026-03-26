import { Menu } from 'antd'
import { SearchOutlined, DownloadOutlined, BookOutlined } from '@ant-design/icons'
import { useWorkspace, PageType } from '../../contexts/WorkspaceContext'

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
  }
]

export function Sidebar() {
  const { currentPage, setCurrentPage } = useWorkspace()

  const handleMenuClick = ({ key }: { key: string }) => {
    setCurrentPage(key as PageType)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        className="title-bar-drag"
        style={{
          height: 48,
          flex: '0 0 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 24,
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}
      >
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 600, letterSpacing: '-0.5px' }}>
          BookWeaver
        </span>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[currentPage]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          paddingTop: 16
        }}
      />
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 12,
          fontWeight: 500
        }}
      >
        v0.1.1
      </div>
    </div>
  )
}