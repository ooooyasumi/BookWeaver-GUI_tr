import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark'

interface ThemeContextType {
  theme: ThemeMode
  toggleTheme: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // 从 localStorage 读取主题
    const savedTheme = localStorage.getItem('theme') as ThemeMode | null
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme)
    } else {
      // 系统偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }
    setIsInitialized(true)
  }, [])

  useEffect(() => {
    if (!isInitialized) return

    // 保存主题到 localStorage
    localStorage.setItem('theme', theme)

    // 设置 document 的 data-theme 属性
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme, isInitialized])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
