import {
  app,
  shell,
  BrowserWindow,
  Notification,
  safeStorage,
  Tray,
  Menu,
  nativeImage,
  dialog,
  screen
} from 'electron'
import { isAbsolute, join } from 'path'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ConfigService } from './config/config'
import type { SecretStore } from './config/config'
import type { Settings } from '../shared/types'
import { ChatService } from './services/chat'
import { ScheduleService } from './services/schedule'
import { FileService } from './services/files'
import { ReminderService } from './services/reminders'
import { PomodoroTimer } from './services/pomodoro'
import { ToolRegistry } from './agent/registry'
import type { PomodoroWindowControl, ToolContext } from './agent/registry'
import { AgentRunner } from './agent/loop'
import { registerIpc } from './ipc/handlers'
import { clockTool } from './tools/clock'
import { scheduleTools } from './tools/schedule'
import { fileTools } from './tools/files'
import { pomodoroTools } from './tools/pomodoro'

app.setName('PALACE')

// 单实例锁：重复双击启动时只唤起已有窗口，不重复启动第二个实例。
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  showMainWindow()
})

let mainWindow: BrowserWindow | null = null
let pomodoroWindow: BrowserWindow | null = null
let reminders: ReminderService | null = null
let tray: Tray | null = null
let configService: ConfigService | null = null
let pomodoroTimer: PomodoroTimer | null = null
let isQuitting = false
let closeToTray = true
let currentDataDir = ''

function bootstrapPath(): string {
  return join(app.getPath('userData'), 'datadir.json')
}

async function readBootstrapDataDir(): Promise<string | null> {
  try {
    const raw = await fs.readFile(bootstrapPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.dataDir === 'string' && parsed.dataDir.trim()) {
      return parsed.dataDir.trim()
    }
  } catch {
    /* 无引导文件 */
  }
  return null
}

async function writeBootstrapDataDir(dir: string): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(bootstrapPath(), JSON.stringify({ dataDir: dir }, null, 2), 'utf8')
}

/** 解析实际数据目录：环境变量 > 引导文件里的自定义路径 > 默认目录；自定义目录不可用时回退默认。 */
async function resolveDataDir(): Promise<string> {
  if (process.env.AGENT_USER_DATA) return process.env.AGENT_USER_DATA
  const custom = await readBootstrapDataDir()
  if (custom) {
    try {
      await fs.mkdir(custom, { recursive: true })
      return custom
    } catch {
      console.warn('[dataDir] 自定义数据目录不可用，回退到默认目录：', custom)
    }
  }
  return app.getPath('userData')
}

/** 迁移数据到新目录并写入引导文件（旧数据保留不删除）。 */
async function setDataDir(dir: string): Promise<{ ok: boolean; error?: string }> {
  const target = (dir ?? '').trim()
  if (!target || !isAbsolute(target)) return { ok: false, error: '请输入一个绝对路径' }
  if (target === currentDataDir) return { ok: false, error: '新位置与当前位置相同' }
  try {
    await fs.mkdir(target, { recursive: true })
    for (const name of ['config.json', 'chat.json', 'schedule.json']) {
      const src = join(currentDataDir, name)
      try {
        await fs.access(src)
      } catch {
        continue
      }
      await fs.copyFile(src, join(target, name))
    }
    await writeBootstrapDataDir(target)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? String(err) }
  }
}

function relaunchApp(): void {
  app.relaunch()
  app.exit(0)
}

async function selectDirectory(): Promise<string | null> {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: '选择数据存储位置',
        properties: ['openDirectory', 'createDirectory']
      })
    : await dialog.showOpenDialog({
        title: '选择数据存储位置',
        properties: ['openDirectory', 'createDirectory']
      })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

/** 应用改名（Personal Agent → PALACE）后，把旧数据文件一次性迁移到新目录（仅迁移核心 JSON，不含 Chromium 缓存）。 */
async function migrateLegacyDataDir(dataDir: string): Promise<void> {
  const oldDir = join(app.getPath('appData'), 'Personal Agent')
  if (oldDir === dataDir) return
  const marker = join(dataDir, '.migrated-from-personal-agent')
  try {
    await fs.access(marker)
    return
  } catch {
    /* 尚未迁移 */
  }
  try {
    await fs.access(oldDir)
  } catch {
    return
  }
  try {
    await fs.mkdir(dataDir, { recursive: true })
    for (const name of ['config.json', 'chat.json', 'schedule.json']) {
      const src = join(oldDir, name)
      try {
        await fs.access(src)
      } catch {
        continue
      }
      await fs.copyFile(src, join(dataDir, name))
    }
    await fs.writeFile(marker, '')
  } catch (err) {
    console.error('[migrate] failed to migrate data dir:', err)
  }
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

function broadcastPomodoroOpen(open: boolean): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('pomodoro:openChanged', open)
  }
}

function showPomodoroWindow(): void {
  if (pomodoroWindow) {
    if (pomodoroWindow.isMinimized()) pomodoroWindow.restore()
    pomodoroWindow.show()
    pomodoroWindow.focus()
  } else {
    createPomodoroWindow()
  }
  configService?.setPomodoroOpen(true)
  broadcastPomodoroOpen(true)
}

function isPomodoroOpen(): boolean {
  return !!pomodoroWindow
}

function closePomodoroWindow(): void {
  pomodoroWindow?.close()
}

/** 判断坐标是否落在当前任一显示器范围内（避免恢复到已断开的显示器）。 */
function isPositionOnScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds
    return x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height
  })
}

function createPomodoroWindow(): void {
  const width = 400
  const height = 400
  const { workArea } = screen.getPrimaryDisplay()
  const saved = configService?.getPomodoroPosition() ?? null
  const useSaved = saved !== null && isPositionOnScreen(saved.x, saved.y)
  const x = useSaved ? saved.x : workArea.x + workArea.width - width - 24
  const y = useSaved ? saved.y : workArea.y + workArea.height - height - 24
  pomodoroWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    title: '番茄钟',
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 阻止加载的 HTML 标题覆盖窗口标题，保持窗口名称为「番茄钟」。
  pomodoroWindow.on('page-title-updated', (e) => e.preventDefault())
  pomodoroWindow.on('close', () => {
    // 关闭前记录当前位置，供下次打开时恢复（应用退出时同样会记录）。
    if (!pomodoroWindow) return
    const [px, py] = pomodoroWindow.getPosition()
    configService?.setPomodoroPosition(px, py)
  })
  pomodoroWindow.on('ready-to-show', () => {
    pomodoroWindow?.show()
    broadcastPomodoroOpen(true)
  })
  pomodoroWindow.on('closed', () => {
    pomodoroWindow = null
    // 关闭窗口即停止并重置计时（无论从窗口、主窗口按钮还是对话关闭）。
    pomodoroTimer?.reset()
    // 应用整体退出时（isQuitting）不要覆盖持久化状态，仅用户主动关闭时记录为关闭。
    if (!isQuitting) configService?.setPomodoroOpen(false)
    broadcastPomodoroOpen(false)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    pomodoroWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?view=pomodoro`)
  } else {
    pomodoroWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { view: 'pomodoro' } })
  }
}

function createTray(): void {
  if (tray) return
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('PALACE')
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

  electronApp.setAppUserModelId('com.palace.app')

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

  const dataDir = await resolveDataDir()
  currentDataDir = dataDir
  await migrateLegacyDataDir(dataDir)
  const config = new ConfigService(dataDir, secrets, () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('persona:changed')
      w.webContents.send('pomodoro:changed')
    }
  })
  configService = config
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
  await Promise.all([config.load(), chat.load(), schedule.load()])

  // 回收站：启动时清理一次过期对话与过期角色，之后每小时检查一次（30 天保留期）。
  chat.purgeExpired()
  config.purgeExpiredPersonas()
  setInterval(() => {
    chat.purgeExpired()
    config.purgeExpiredPersonas()
  }, 60 * 60 * 1000)

  applyRuntimeSettings(config.getSettings())

  const pomodoro = new PomodoroTimer(
    config,
    (state) => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('pomodoro:state', state)
      }
    },
    (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    }
  )
  pomodoroTimer = pomodoro

  const registry = new ToolRegistry<ToolContext>()
  const files = new FileService()
  const pomodoroWindowControl: PomodoroWindowControl = {
    open: () => showPomodoroWindow(),
    close: () => closePomodoroWindow(),
    minimize: () => pomodoroWindow?.minimize(),
    isOpen: () => isPomodoroOpen(),
    setAlwaysOnTop: (flag) => pomodoroWindow?.setAlwaysOnTop(flag)
  }
  const ctx: ToolContext = { schedule, files, pomodoro, pomodoroWindow: pomodoroWindowControl }
  registry.register(clockTool())
  for (const t of scheduleTools()) registry.register(t)
  for (const t of fileTools()) registry.register(t)
  for (const t of pomodoroTools()) registry.register(t)

  const runner = new AgentRunner(config, registry, ctx, chat)

  registerIpc({
    config,
    chat,
    schedule,
    pomodoro,
    runner,
    registry,
    getWindow: () => mainWindow,
    applyRuntimeSettings,
    showPomodoroWindow,
    isPomodoroOpen,
    closePomodoroWindow,
    getDataDir: () => currentDataDir,
    setDataDir,
    selectDirectory,
    relaunchApp
  })

  reminders = new ReminderService(schedule, (title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  })
  reminders.start()

  createTray()
  createWindow()
  if (config.getPomodoroOpen()) showPomodoroWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  reminders?.stop()
  if (process.platform !== 'darwin') app.quit()
})
