import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { WelcomePage } from './components/Layout/WelcomePage'
import { AppLayout } from './components/Layout/AppLayout'

function AppContent() {
  const { isWorkspaceOpen } = useWorkspace()

  if (!isWorkspaceOpen) {
    return <WelcomePage />
  }

  return <AppLayout />
}

function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  )
}

function ThemedApp() {
  const { isDark } = useTheme()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#007aff',
          borderRadius: 8,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
        },
      }}
    >
      <WorkspaceProvider>
        <AppContent />
      </WorkspaceProvider>
    </ConfigProvider>
  )
}

export default App