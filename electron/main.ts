import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { WorkspaceManager, AppState, BatchMeta } from './workspace'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let workspaceManager: WorkspaceManager | null = null

const isDev = !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 18 },
    icon: path.join(__dirname, '../resources/icon.png'),
    title: 'BookWeaver',
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 注册快捷键打开 DevTools (Cmd+Option+I 或 F12)
  globalShortcut.register('CommandOrControl+Alt+I', () => {
    mainWindow?.webContents.openDevTools()
  })
  globalShortcut.register('F12', () => {
    mainWindow?.webContents.openDevTools()
  })
}

function startPythonBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    if (isDev) {
      console.log('开发模式：请手动启动后端 (python dev.py)')
      resolve(true)
      return
    }

    // 生产模式：启动 PyInstaller 打包的后端可执行文件
    const resourcesPath = process.resourcesPath
    const backendExe = process.platform === 'win32'
      ? path.join(resourcesPath, 'backend', 'bookweaver-backend.exe')
      : path.join(resourcesPath, 'backend', 'bookweaver-backend')

    // 检查后端可执行文件是否存在
    if (!fs.existsSync(backendExe)) {
      console.error('后端文件不存在:', backendExe)
      resolve(false)
      return
    }

    // macOS/Linux：确保可执行权限（extraResources 打包时可能丢失）
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(backendExe, 0o755)
      } catch (e) {
        console.warn('设置执行权限失败:', e)
      }
    }

    console.log('启动后端:', backendExe)

    pythonProcess = spawn(backendExe, [
      '--host', '127.0.0.1',
      '--port', '8765'
    ], {
      // Windows 打包后没有控制台，用 pipe 避免 inherit 挂起
      stdio: ['ignore', 'pipe', 'pipe'],
      // Windows 需要 detached: false 确保子进程随主进程退出
      windowsHide: true,
    })

    // 收集日志输出
    pythonProcess.stdout?.on('data', (data: Buffer) => {
      console.log('[Backend]', data.toString().trim())
    })
    pythonProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Backend Error]', data.toString().trim())
    })

    pythonProcess.on('error', (err) => {
      console.error('Python 后端启动失败:', err)
      resolve(false)
    })

    pythonProcess.on('exit', (code) => {
      console.log('Python 后端退出, code:', code)
      pythonProcess = null
    })

    // 轮询健康检查，等待后端就绪
    waitForBackend(30).then(resolve)
  })
}

async function waitForBackend(maxSeconds: number): Promise<boolean> {
  const { net } = await import('electron')
  const startTime = Date.now()

  while (Date.now() - startTime < maxSeconds * 1000) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const request = net.request('http://127.0.0.1:8765/api/health')
        request.on('response', (response) => {
          resolve(response.statusCode === 200)
        })
        request.on('error', () => resolve(false))
        request.end()
      })
      if (ok) {
        console.log('后端就绪')
        return true
      }
    } catch {
      // 忽略连接错误
    }

    // 如果进程已退出则放弃
    if (!pythonProcess) {
      console.error('后端进程已退出')
      return false
    }

    await new Promise(r => setTimeout(r, 500))
  }

  console.error('等待后端超时')
  return false
}

function stopPythonBackend() {
  if (pythonProcess) {
    // Windows 上 kill() 默认发 SIGTERM，需要用 taskkill 强制终止
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], { windowsHide: true })
      } catch {
        pythonProcess.kill()
      }
    } else {
      pythonProcess.kill()
    }
    pythonProcess = null
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// 打开工作区：初始化 WorkspaceManager，返回 AppState
ipcMain.handle('workspace:open', async (_event, folderPath: string) => {
  workspaceManager = new WorkspaceManager(folderPath)
  await workspaceManager.initialize()
  return workspaceManager.getState()
})

// 获取工作区状态
ipcMain.handle('workspace:getStatus', async () => {
  if (!workspaceManager) return null
  return workspaceManager.getState()
})

// 保存完整 AppState（预下载列表 + 批次摘要）
ipcMain.handle('workspace:save', async (_event, state: AppState) => {
  if (!workspaceManager) throw new Error('没有打开的工作区')
  workspaceManager.saveState(state)
  return true
})

// 获取批次详情 meta
ipcMain.handle('workspace:getBatchMeta', async (_event, batchId: number) => {
  if (!workspaceManager) return null
  return workspaceManager.getBatchMeta(batchId)
})

// 保存批次详情 meta（下载过程中实时调用）
ipcMain.handle('workspace:saveBatchMeta', async (_event, meta: BatchMeta) => {
  if (!workspaceManager) throw new Error('没有打开的工作区')
  workspaceManager.saveBatchMeta(meta)
  return true
})

// 获取下一个批次 ID
ipcMain.handle('workspace:nextBatchId', async () => {
  if (!workspaceManager) return 1
  return workspaceManager.nextBatchId()
})

// 获取配置
ipcMain.handle('config:get', async () => {
  if (!workspaceManager) return null
  return workspaceManager.getConfig()
})

// 保存配置
ipcMain.handle('config:save', async (_event, config: unknown) => {
  if (!workspaceManager) throw new Error('没有打开的工作区')
  workspaceManager.saveConfig(config as any)
  return true
})

// 在文件管理器中打开路径
ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  shell.openPath(targetPath)
})

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const backendOk = await startPythonBackend()
  if (!backendOk && !isDev) {
    dialog.showErrorBox('BookWeaver', '后端服务启动失败，请检查安装是否完整。')
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopPythonBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopPythonBackend()
})
