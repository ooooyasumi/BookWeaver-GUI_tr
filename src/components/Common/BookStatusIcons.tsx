import { Tooltip } from 'antd'
import { TagsOutlined, PictureOutlined, CloudUploadOutlined } from '@ant-design/icons'

interface BookStatusIconsProps {
  metadataUpdated?: boolean
  coverUpdated?: boolean
  coverError?: string | null
  uploaded?: boolean
}

const iconStyle = (active: boolean, error?: boolean) => ({
  fontSize: 14,
  color: error ? '#ff4d4f' : active ? '#52c41a' : 'var(--text-quaternary, rgba(0,0,0,0.15))',
  transition: 'color 0.2s',
})

export function BookStatusIcons({ metadataUpdated, coverUpdated, coverError, uploaded }: BookStatusIconsProps) {
  const hasCoverError = !coverUpdated && !!coverError

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
      <Tooltip title={metadataUpdated ? '元数据已更新' : '元数据未更新'}>
        <TagsOutlined style={iconStyle(!!metadataUpdated)} />
      </Tooltip>
      <Tooltip title={hasCoverError ? `封面更新失败: ${coverError}` : coverUpdated ? '封面已更新' : '封面未更新'}>
        <PictureOutlined style={iconStyle(!!coverUpdated, hasCoverError)} />
      </Tooltip>
      <Tooltip title={uploaded ? '已上传' : '未上传'}>
        <CloudUploadOutlined style={iconStyle(!!uploaded)} />
      </Tooltip>
    </span>
  )
}
