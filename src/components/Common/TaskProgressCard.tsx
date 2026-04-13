import { Card, Progress, Tag, Space, Button, Typography } from 'antd'
import { StopOutlined } from '@ant-design/icons'
import { TaskProgress, TaskType } from '../../contexts/WorkspaceContext'

const { Text } = Typography

// 任务类型对应的显示文字
const TASK_LABELS: Record<TaskType, string> = {
  metadata: '元数据更新',
  cover: '封面更新',
  upload: '书籍上传',
}

// 任务类型对应的阶段文字
const STAGE_LABELS: Record<string, string> = {
  sending: '正在发送',
  receiving: '正在接收',
  writing: '正在写入',
  uploading_cover: '上传封面',
  uploading_epub: '上传文件',
  adding_book: '添加记录',
}

interface TaskProgressCardProps {
  type: TaskType
  progress: TaskProgress | undefined
  onCancel: () => void
  waitingCount?: number
}

export function TaskProgressCard({ type, progress, onCancel }: TaskProgressCardProps) {
  const { total, processed, success = 0, failed = 0, skipped = 0, stage, bookTitle } = progress ?? {}

  const percent = total ? Math.round((processed ?? 0) / total * 100) : 0

  const stageText = stage ? STAGE_LABELS[stage] ?? stage : null

  return (
    <Card className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space size={16}>
          <Text strong>{TASK_LABELS[type]}</Text>
          <Tag color="blue">{processed ?? 0} / {total ?? 0} 完成</Tag>
          {success > 0 && <Tag color="green">成功 {success}</Tag>}
          {failed > 0 && <Tag color="red">失败 {failed}</Tag>}
          {skipped > 0 && <Tag color="orange">跳过 {skipped}</Tag>}
          {stageText && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {stageText}
              {bookTitle ? ` - ${bookTitle.length > 20 ? bookTitle.slice(0, 20) + '…' : bookTitle}` : ''}
            </Text>
          )}
        </Space>

        <Button danger icon={<StopOutlined />} onClick={onCancel} size="large">
          取消
        </Button>
      </div>

      <Progress
        percent={percent}
        status="active"
        strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
      />
    </Card>
  )
}
