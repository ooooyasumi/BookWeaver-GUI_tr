import { useState, useEffect } from 'react'
import { Modal, Form, Input, AutoComplete, InputNumber, Button, Space, Divider, message, Tag, Switch, Row, Col, Segmented, Select } from 'antd'
import { SettingOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, MoonOutlined, LockOutlined, EditOutlined, BugOutlined } from '@ant-design/icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { VersionLink } from './VersionHistory'

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
  debugMode?: boolean
}

const LLM_MODELS = [
  { label: 'MiniMax-M2.7', value: 'MiniMax-M2' },
  { label: 'Qwen 3.5 Plus', value: 'qwen3.5-plus' },
  { label: 'Qwen 3.5 Turbo', value: 'qwen3.5-turbo' },
  { label: 'Qwen VL Flash', value: 'qwen3-vl-flash-2026-01-22' },
  { label: 'Qwen Max', value: 'qwen-max' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
  { label: 'DeepSeek V3', value: 'deepseek-chat' },
  { label: 'DeepSeek R1', value: 'deepseek-reasoner' },
]

// 预设模型配置
const PRESET_MODELS = [
  {
    id: 'minimax',
    label: 'MiniMax-M2.7',
    apiKey: 'sk-cp-AyOemkvi0hh2K6tG1mN5c8PJCQaWbFNbPD3BDCAGx6XpSNVbFyvRyl2qMGEkotu334SJDxpkikqR7-mHuzaD1URXHsAvhG_JiLzEbqiPgiHyRmZVVJNDRcg',
    model: 'MiniMax-M2',
    baseUrl: 'https://api.minimaxi.com/v1',
  },
  {
    id: 'qwen',
    label: 'Qwen 3.5 Flash',
    apiKey: 'sk-94165d0f233b417da98b6515dcc63ada',
    model: 'qwen3.5-flash',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'qwen-vl',
    label: 'Qwen VL Flash',
    apiKey: 'sk-94165d0f233b417da98b6515dcc63ada',
    model: 'qwen3-vl-flash-2026-01-22',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
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
  },
  debugMode: false
}

// API_BASE 与 api.ts 保持一致
const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8765/api'
  : '/api'

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [testingApi, setTestingApi] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [llmMode, setLlmMode] = useState<'preset' | 'custom'>('preset')
  const [selectedPreset, setSelectedPreset] = useState<string>('minimax')
  const { toggleTheme, isDark } = useTheme()
  const { setDebugMode } = useWorkspace()

  const apiKey = Form.useWatch(['llm', 'apiKey'], form)
  const baseUrl = Form.useWatch(['llm', 'baseUrl'], form)
  const model = Form.useWatch(['llm', 'model'], form)
  // useWatch 监听 debugMode 变化，触发组件更新
  const debugModeWatch = Form.useWatch(['debugMode'], form)
  const canTest = llmMode === 'preset' || !!(apiKey?.trim() && baseUrl?.trim() && model?.trim())

  // 同步 debugMode 到 Context
  useEffect(() => {
    setDebugMode(!!debugModeWatch)
  }, [debugModeWatch, setDebugMode])

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
        // 判断是否匹配预设配置（apiKey 匹配任一预设则认为是预设模式）
        const matchedPreset = PRESET_MODELS.find(p => p.apiKey === config.llm?.apiKey)
        const isPreset = !!matchedPreset
        setLlmMode(isPreset ? 'preset' : 'custom')
        if (matchedPreset) {
          setSelectedPreset(matchedPreset.id)
        }
        form.setFieldsValue({
          llm: {
            ...DEFAULT_CONFIG.llm,
            ...config.llm
          },
          download: {
            ...DEFAULT_CONFIG.download,
            ...config.download
          },
          debugMode: config.debugMode ?? false
        })
      } else {
        setLlmMode('preset')
        setSelectedPreset(PRESET_MODELS[0].id)
        form.setFieldsValue({
          llm: PRESET_MODELS[0],
          download: DEFAULT_CONFIG.download,
          debugMode: false
        })
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      setLlmMode('preset')
      setSelectedPreset(PRESET_MODELS[0].id)
      form.setFieldsValue({ llm: PRESET_MODELS[0], download: DEFAULT_CONFIG.download, debugMode: false })
    }
  }

  // 切换模式时同步表单
  const handleModeChange = (val: string) => {
    const mode = val as 'preset' | 'custom'
    setLlmMode(mode)
    setTestStatus('idle')
    if (mode === 'preset') {
      const preset = PRESET_MODELS.find(p => p.id === selectedPreset) || PRESET_MODELS[0]
      form.setFieldsValue({ llm: preset })
    } else {
      form.setFieldsValue({
        llm: {
          apiKey: '',
          model: 'qwen3.5-plus',
          baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
          temperature: 0.7,
          maxTokens: 2000,
        }
      })
    }
  }

  // 切换预设模型时同步表单
  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId)
    const preset = PRESET_MODELS.find(p => p.id === presetId)
    if (preset) {
      form.setFieldsValue({ llm: preset })
    }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      // 预设模式下强制使用选定预设的 LLM 配置
      if (llmMode === 'preset') {
        const preset = PRESET_MODELS.find(p => p.id === selectedPreset) || PRESET_MODELS[0]
        values.llm = { ...preset, temperature: values.llm.temperature, maxTokens: values.llm.maxTokens }
      }
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
      const llmConfig = llmMode === 'preset'
        ? (PRESET_MODELS.find(p => p.id === selectedPreset) || PRESET_MODELS[0])
        : (await form.validateFields([['llm', 'apiKey'], ['llm', 'baseUrl'], ['llm', 'model']])).llm

      setTestingApi(true)
      setTestStatus('idle')

      const response = await fetch(`${API_BASE}/chat/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: llmConfig.apiKey,
          baseUrl: llmConfig.baseUrl,
          model: llmConfig.model,
        })
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

  const isPreset = llmMode === 'preset'

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
        body: { padding: '24px 0', maxHeight: '70vh', overflowY: 'auto' }
      }}
    >
      <div style={{ padding: '0 24px', overflow: 'visible' }}>
        {/* 外观设置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            外观
          </div>
          <Row align="middle" justify="space-between" style={{ marginBottom: 12 }}>
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
          <Form.Item name="debugMode" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Row align="middle" justify="space-between">
              <Col>
                <Space>
                  <BugOutlined style={{ color: 'var(--text-secondary)' }} />
                  <span>调试模式</span>
                </Space>
              </Col>
              <Col>
                <Switch
                  checkedChildren="开"
                  unCheckedChildren="关"
                />
              </Col>
            </Row>
          </Form.Item>
        </div>

        <Divider style={{ margin: '16px 0 20px' }} />

        {/* LLM 配置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            LLM 配置
          </div>

          {/* 模式切换 */}
          <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
            <Col>
              <Space>
                {isPreset
                  ? <LockOutlined style={{ color: 'var(--accent-color)' }} />
                  : <EditOutlined style={{ color: 'var(--text-secondary)' }} />
                }
                <span style={{ fontSize: 14 }}>
                  {isPreset ? '使用默认配置' : '使用自定义配置'}
                </span>
              </Space>
            </Col>
            <Col>
              <Segmented
                value={llmMode}
                onChange={handleModeChange}
                options={[
                  { label: '默认', value: 'preset' },
                  { label: '自定义', value: 'custom' },
                ]}
              />
            </Col>
          </Row>

          {/* 预设模式：显示模型选择下拉 + Temperature / MaxTokens */}
          {isPreset ? (
            <div>
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                marginBottom: 16,
                border: '1px solid var(--border-color)'
              }}>
                <Row gutter={8} align="middle">
                  <Col flex={1}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>预设模型</div>
                    <Select
                      value={selectedPreset}
                      onChange={handlePresetChange}
                      style={{ width: '100%' }}
                      options={PRESET_MODELS.map(p => ({ label: p.label, value: p.id }))}
                    />
                  </Col>
                  <Col>
                    <Tag color="blue" style={{ marginTop: 24 }}>内置</Tag>
                  </Col>
                </Row>
              </div>

              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name={['llm', 'temperature']} label="Temperature" tooltip="控制输出的随机性" style={{ marginBottom: 0 }}>
                      <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name={['llm', 'maxTokens']} label="Max Tokens" tooltip="最大输出长度" style={{ marginBottom: 0 }}>
                      <InputNumber min={100} max={8000} step={100} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>

              <div style={{ marginTop: 16 }}>
                <Button
                  onClick={handleTestApi}
                  loading={testingApi}
                  icon={testStatus === 'success' ? <CheckCircleOutlined /> : testStatus === 'error' ? <CloseCircleOutlined /> : <SyncOutlined />}
                  type={testStatus === 'success' ? 'default' : 'default'}
                  danger={testStatus === 'error'}
                >
                  {testStatus === 'success' ? '连接成功' : testStatus === 'error' ? '连接失败' : '测试连接'}
                </Button>
              </div>
            </div>
          ) : (
            /* 自定义模式：完整表单 */
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
                extra={<Tag color="blue" style={{ fontSize: 11 }}>兼容模式</Tag>}
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
                      disabled={!canTest}
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
                rules={[{ required: true, message: '请输入或选择模型' }]}
                style={{ marginBottom: 20 }}
              >
                <AutoComplete
                  placeholder="选择或输入模型名称"
                  size="large"
                  options={LLM_MODELS}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ||
                    (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name={['llm', 'temperature']} label="Temperature" tooltip="控制输出的随机性" style={{ marginBottom: 0 }}>
                    <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={['llm', 'maxTokens']} label="Max Tokens" tooltip="最大输出长度" style={{ marginBottom: 0 }}>
                    <InputNumber min={100} max={8000} step={100} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
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
                <Form.Item name={['download', 'concurrent']} label="并发数" style={{ marginBottom: 0 }}>
                  <InputNumber min={1} max={10} style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name={['download', 'timeout']} label="超时时间 (秒)" style={{ marginBottom: 0 }}>
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
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px 0',
        borderTop: '1px solid var(--border-color)',
        marginTop: 16
      }}>
        <VersionLink />
        <Space>
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
        </Space>
      </div>
    </Modal>
  )
}
