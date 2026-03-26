import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, InputNumber, Button, Space, Divider, message, Tag, Switch, Row, Col } from 'antd'
import { SettingOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, MoonOutlined } from '@ant-design/icons'
import { useTheme } from '../../contexts/ThemeContext'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

interface LLMConfig {
  apiKey: string
  model: string
  baseUrl: string
  temperature: number
  maxTokens: number
}

interface DownloadConfig {
  concurrent: number
  timeout: number
}

interface Config {
  llm: LLMConfig
  download: DownloadConfig
}

const LLM_MODELS = [
  { label: 'Qwen 3.5 Plus', value: 'qwen3.5-plus' },
  { label: 'Qwen 3.5 Turbo', value: 'qwen3.5-turbo' },
  { label: 'Qwen Max', value: 'qwen-max' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
  { label: 'DeepSeek V3', value: 'deepseek-chat' },
  { label: 'DeepSeek R1', value: 'deepseek-reasoner' },
]

const DEFAULT_CONFIG: Config = {
  llm: {
    apiKey: '',
    model: 'qwen3.5-plus',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    temperature: 0.7,
    maxTokens: 2000
  },
  download: {
    concurrent: 3,
    timeout: 30
  }
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [testingApi, setTestingApi] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const { toggleTheme, isDark } = useTheme()

  // 加载配置
  useEffect(() => {
    if (open) {
      loadConfig()
    }
  }, [open])

  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.getConfig()
      if (config) {
        form.setFieldsValue({
          llm: {
            ...DEFAULT_CONFIG.llm,
            ...config.llm
          },
          download: {
            ...DEFAULT_CONFIG.download,
            ...config.download
          }
        })
      } else {
        form.setFieldsValue(DEFAULT_CONFIG)
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      form.setFieldsValue(DEFAULT_CONFIG)
    }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      await window.electronAPI.saveConfig(values)
      message.success('配置已保存')
      onClose()
    } catch (error) {
      message.error('保存配置失败')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // 测试 API 连接
  const handleTestApi = async () => {
    try {
      const values = await form.validateFields(['llm.apiKey', 'llm.baseUrl', 'llm.model'])
      setTestingApi(true)
      setTestStatus('idle')

      const config = {
        apiKey: values.llm.apiKey,
        baseUrl: values.llm.baseUrl,
        model: values.llm.model
      }

      const response = await fetch('/api/chat/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setTestStatus('success')
        message.success('API 连接测试成功！')
      } else {
        setTestStatus('error')
        message.error(`API 连接失败：${result.error || '未知错误'}`)
      }
    } catch (error: any) {
      setTestStatus('error')
      message.error(`API 连接失败：${error.message || '请检查 API Key 和 URL 是否正确'}`)
    } finally {
      setTestingApi(false)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <span style={{ fontSize: 16, fontWeight: 600 }}>设置</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={640}
      footer={null}
      styles={{
        body: { padding: '24px 0' }
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {/* 外观设置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            外观
          </div>
          <Row align="middle" justify="space-between">
            <Col>
              <Space>
                <MoonOutlined style={{ color: 'var(--text-secondary)' }} />
                <span>深色模式</span>
              </Space>
            </Col>
            <Col>
              <Switch
                checked={isDark}
                onChange={toggleTheme}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </Col>
          </Row>
        </div>

        <Divider style={{ margin: '16px 0 20px' }} />

        {/* LLM 配置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            LLM 配置
          </div>
          <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
            <Form.Item
              name={['llm', 'apiKey']}
              label="API Key"
              rules={[{ required: true, message: '请输入 API Key' }]}
              style={{ marginBottom: 20 }}
            >
              <Input.Password placeholder="输入您的 LLM API Key" size="large" />
            </Form.Item>

            <Form.Item
              name={['llm', 'baseUrl']}
              label="API Base URL"
              rules={[{ required: true, message: '请输入 API Base URL' }]}
              style={{ marginBottom: 20 }}
              extra={
                <Tag color="blue" style={{ fontSize: 11 }}>
                  兼容模式
                </Tag>
              }
            >
              <Input
                placeholder="https://coding.dashscope.aliyuncs.com/v1"
                size="large"
                addonAfter={
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleTestApi}
                    loading={testingApi}
                    disabled={!form.getFieldValue(['llm', 'apiKey'])}
                    icon={testStatus === 'success' ? <CheckCircleOutlined /> : testStatus === 'error' ? <CloseCircleOutlined /> : <SyncOutlined />}
                  >
                    {testStatus === 'success' ? '成功' : testStatus === 'error' ? '失败' : '测试'}
                  </Button>
                }
              />
            </Form.Item>

            <Form.Item
              name={['llm', 'model']}
              label="模型"
              rules={[{ required: true, message: '请选择模型' }]}
              style={{ marginBottom: 20 }}
            >
              <Select placeholder="选择 LLM 模型" options={LLM_MODELS} size="large" />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name={['llm', 'temperature']}
                  label="Temperature"
                  tooltip="控制输出的随机性"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name={['llm', 'maxTokens']}
                  label="Max Tokens"
                  tooltip="最大输出长度"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={100} max={8000} step={100} style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>

        <Divider style={{ margin: '16px 0 20px' }} />

        {/* 下载配置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            下载配置
          </div>
          <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name={['download', 'concurrent']}
                  label="并发数"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} max={10} style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name={['download', 'timeout']}
                  label="超时时间 (秒)"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={10} max={120} style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>
      </div>

      {/* 底部按钮 */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 12,
        padding: '16px 24px 0',
        borderTop: '1px solid var(--border-color)',
        marginTop: 16
      }}>
        <Button size="large" onClick={onClose}>
          取消
        </Button>
        <Button
          type="primary"
          size="large"
          icon={<SaveOutlined />}
          loading={loading}
          onClick={handleSave}
          style={{ borderRadius: 8, padding: '8px 24px' }}
        >
          保存
        </Button>
      </div>
    </Modal>
  )
}
