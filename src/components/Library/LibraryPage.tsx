import { Typography, Card, Space } from 'antd'
import { BookOutlined, ToolOutlined } from '@ant-design/icons'

export function LibraryPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
      <Card className="card" style={{ padding: '48px 64px', textAlign: 'center' }}>
        <div style={{ marginBottom: 24 }}>
          <BookOutlined style={{ fontSize: 64, color: 'var(--text-tertiary)' }} />
        </div>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>图书管理</Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 32, fontSize: 14 }}>
          此功能正在开发中...
        </Typography.Text>

        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div
            style={{
              padding: '16px 20px',
              background: 'var(--bg-tertiary)',
              borderRadius: 12,
              textAlign: 'left'
            }}
          >
            <Space align="start">
              <ToolOutlined style={{ fontSize: 20, color: 'var(--accent-color)' }} />
              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>计划功能</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  浏览已下载书籍、编辑元数据、LLM 增强元数据、格式转换等
                </Typography.Text>
              </div>
            </Space>
          </div>
        </Space>
      </Card>
    </div>
  )
}
