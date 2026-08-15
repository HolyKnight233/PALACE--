import {
  app,
  shell,
  BrowserWindow,
  Notification,
  safeStorage,
  Tray,
  Menu,
  nativeImage,
  dialog
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { ConfigService } from './config/config'
import type { SecretStore } from './config/config'
import type { Settings } from '../shared/types'
import { ChatService } from './services/chat'
import { ScheduleService } from './services/schedule'
import { FileService } from './services/files'
import { ReminderService } from './services/reminders'
import { ToolRegistry } from './agent/registry'
import type { ToolContext } from './agent/registry'
import { AgentRunner } from './agent/loop'
import { registerIpc } from './ipc/handlers'
import { clockTool } from './tools/clock'
import { scheduleTools } from './tools/schedule'
import { filesTools } from './tools/files'

app.setName('Personal Agent')

// 单实例锁：重复双击启动时只唤起已有窗口，不重复启动第二个实例。
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  showMainWindow()
})

let mainWindow: BrowserWindow | null = null
let reminders: ReminderService | null = null
let tray: Tray | null = null
let isQuitting = false
let closeToTray = true

function userDataDir(): string {
  return process.env.AGENT_USER_DATA || app.getPath('userData')
}

/** Apply settings that affect OS-level behavior (login item, tray close). */
function applyRuntimeSettings(settings: Settings): void {
  closeToTray = settings.closeToTray
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
  }
}

function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
}

function createTray(): void {
  if (tray) return
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Personal Agent')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showMainWindow())
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: '发现新版本',
        message: `新版本 ${info.version} 已下载完成，是否立即重启安装？`,
        buttons: ['立即重启', '稍后']
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err?.message ?? String(err))
  })
  autoUpdater.checkForUpdates().catch(() => {
    /* no update server reachable / not configured */
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    show: false,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => mainWindow?.webContents.send('win:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:maximized', false))
  mainWindow.on('close', (e) => {
    if (!isQuitting && closeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (!gotTheLock) return

  electronApp.setAppUserModelId('com.personal.agent')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const secrets: SecretStore = {
    encrypt: (plain) =>
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(plain).toString('base64')
        : Buffer.from(plain, 'utf8').toString('base64'),
    decrypt: (enc) =>
      safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(enc, 'base64'))
        : Buffer.from(enc, 'base64').toString('utf8')
  }

  const dataDir = userDataDir()
  const config = new ConfigService(dataDir, secrets, () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('persona:changed')
    }
  })
  const chat = new ChatService(dataDir, () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('chat:changed')
    }
  })
  const schedule = new ScheduleService(dataDir, () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('schedule:changed')
    }
  })
  const files = new FileService(dataDir)

  await Promise.all([config.load(), chat.load(), schedule.load(), files.load()])

  // 回收站：启动时清理一次过期对话，之后每小时检查一次（30 天保留期）。
  chat.purgeExpired()
  setInterval(() => chat.purgeExpired(), 60 * 60 * 1000)

  applyRuntimeSettings(config.getSettings())

  const registry = new ToolRegistry<ToolContext>()
  const ctx: ToolContext = { schedule, files }
  registry.register(clockTool())
  for (const t of scheduleTools()) registry.register(t)
  for (const t of filesTools()) registry.register(t)

  const runner = new AgentRunner(config, registry, ctx, chat)

  registerIpc({ config, chat, schedule, files, runner, registry, getWindow: () => mainWindow, applyRuntimeSettings })

  reminders = new ReminderService(schedule, (title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  })
  reminders.start()

  createTray()
  createWindow()

  if (app.isPackaged) {
    setupAutoUpdater()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  reminders?.stop()
  if (process.platform !== 'darwin') app.quit()
})
