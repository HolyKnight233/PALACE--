// Shared types used by main, preload, and renderer.

export type Role = 'user' | 'assistant' | 'tool'

export interface ToolCallPart {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: Role
  content: string
  /** Present when role === 'tool'; links to an assistant tool call id. */
  toolCallId?: string
  /** Present when role === 'assistant' and the model requested tool calls. */
  toolCalls?: ToolCallPart[]
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  /** 该对话所属角色（persona）id。 */
  personaId: string
  createdAt: number
  updatedAt: number
  /** Epoch ms when moved to trash; undefined while active. */
  deletedAt?: number
  /** 滚动摘要：把被裁剪出窗口的更早历史压缩成的文本。 */
  summary?: string
  /** 已摘要到的消息条数（正序），用于增量摘要。 */
  summarizedCount?: number
}

export interface Persona {
  id: string
  name: string
  role: string
  personality: string[]
  speakingStyle: string
  systemPrompt: string
  defaultLanguage: string
  themeColor: string
  /** 仅保留名字、隐藏人设细节。 */
  hidden?: boolean
  /** 补充提示词：AI 在对话中逐步补全的人设细节，避免长期聊天前后矛盾。 */
  supplements?: string
  /** 是否启用补充提示词（默认 true；启用后会自动补全写入）。 */
  supplementsEnabled?: boolean
  /** Epoch ms when moved to trash; undefined while active. */
  deletedAt?: number
}

export type ProviderId = 'deepseek' | 'custom'

/** Non-secret settings surfaced to the renderer. The API key never leaves main. */
export interface Settings {
  provider: ProviderId
  baseURL: string
  model: string
  temperature: number
  timezone: string
  hasApiKey: boolean
  launchAtLogin: boolean
  closeToTray: boolean
  /** 番茄钟是否显示格言（默认 true）。 */
  pomodoroShowMotto: boolean
  /** 格言是否由当前选中角色表达（默认 true；仅当 pomodoroShowMotto 开启时生效）。 */
  pomodoroMottoByPersona: boolean
}

export interface SettingsUpdate {
  provider: ProviderId
  baseURL: string
  model: string
  temperature: number
  timezone: string
  launchAtLogin: boolean
  closeToTray: boolean
  pomodoroShowMotto: boolean
  pomodoroMottoByPersona: boolean
  /** Optional; only supplied when the user types a new key. */
  apiKey?: string
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  /** Epoch milliseconds. */
  startAt: number
  /** Epoch milliseconds. */
  endAt?: number
  allDay: boolean
  /** 是否已完成（用于绿色对钩/边框）。 */
  completed?: boolean
  /** Minutes before start to fire a reminder. */
  reminderMinutes?: number
  createdAt: number
  updatedAt: number
}

export interface PomodoroPreset {
  id: string
  name: string
  workMinutes: number
  breakMinutes: number
  /** 循环次数；0 表示无限循环。 */
  loopCount: number
}

/** 番茄钟计时器当前状态。 */
export interface PomodoroState {
  running: boolean
  phase: 'work' | 'break'
  remainingSeconds: number
  /** 当前是第几轮（从 0 开始）。 */
  cycle: number
  presetName: string
}

export interface ChatStreamEvent {
  type: 'delta' | 'toolCall' | 'toolResult' | 'done' | 'error'
  conversationId: string
  content?: string
  toolName?: string
  toolResult?: string
  error?: string
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

export interface EventRange {
  from?: number
  to?: number
}

export interface WindowControls {
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  isMaximized(): Promise<boolean>
  close(): Promise<void>
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

/** The surface exposed on window.agentApi via contextBridge. */
export interface AgentApi {
  getDefaultPersona(): Promise<Persona>
  savePersona(persona: Persona): Promise<Persona>
  getPersonas(): Promise<Persona[]>
  createPersona(): Promise<Persona>
  deletePersona(id: string): Promise<Persona>
  /** 回收站里的角色。 */
  listTrashPersonas(): Promise<Persona[]>
  restorePersona(id: string): Promise<Persona>
  purgePersona(id: string): Promise<Persona>
  /** 用接入的模型生成一个角色人设（不含 id）。 */
  generatePersona(requirement: string): Promise<Omit<Persona, 'id'>>
  onPersonaChanged(callback: () => void): () => void

  getSettings(): Promise<Settings>
  getDefaultSettings(): Promise<Settings>
  saveSettings(update: SettingsUpdate): Promise<Settings>
  testConnection(): Promise<ConnectionTestResult>
  /** 当前数据存储目录（绝对路径）。 */
  getDataDir(): Promise<string>
  /** 迁移数据到新目录并写入引导文件；返回是否成功与错误信息。 */
  setDataDir(dir: string): Promise<{ ok: boolean; error?: string }>
  /** 打开系统目录选择框，返回所选目录路径或 null。 */
  selectDirectory(): Promise<string | null>
  /** 重启应用。 */
  relaunchApp(): Promise<void>

  chatSend(payload: { conversationId?: string; message: string }): Promise<{ conversationId: string }>
  chatStop(conversationId: string): Promise<void>
  chatNewConversation(opts: { personaId: string }): Promise<Conversation>
  listConversations(): Promise<Conversation[]>
  getMessages(conversationId: string): Promise<ChatMessage[]>
  renameConversation(conversationId: string, title: string): Promise<void>
  /** Move a conversation to the trash (soft delete). */
  deleteConversation(conversationId: string): Promise<void>
  listTrash(): Promise<Conversation[]>
  restoreConversation(conversationId: string): Promise<void>
  purgeConversation(conversationId: string): Promise<void>
  /** Subscribe to conversation-list mutations (new/rename/trash/restore/purge). */
  onChatChanged(callback: () => void): () => void
  onChatEvent(callback: (event: ChatStreamEvent) => void): () => void

  listEvents(range: EventRange): Promise<CalendarEvent[]>
  createEvent(input: {
    title: string
    startAt: number
    endAt?: number
    allDay?: boolean
    description?: string
    reminderMinutes?: number
  }): Promise<CalendarEvent>
  updateEvent(
    id: string,
    patch: Partial<{
      title: string
      startAt: number
      endAt: number
      allDay: boolean
      description: string
      completed: boolean
      reminderMinutes: number
    }>
  ): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
  /** Subscribe to schedule mutations. */
  onScheduleChanged(callback: () => void): () => void

  getPomodoros(): Promise<PomodoroPreset[]>
  getActivePomodoro(): Promise<PomodoroPreset>
  savePomodoro(preset: PomodoroPreset): Promise<PomodoroPreset>
  setActivePomodoro(id: string): Promise<PomodoroPreset>
  createPomodoro(): Promise<PomodoroPreset>
  deletePomodoro(id: string): Promise<PomodoroPreset>
  onPomodoroChanged(callback: () => void): () => void
  /** 番茄钟计时控制（开始/暂停/切换/重置/查询状态）。 */
  pomodoroStart(): Promise<void>
  pomodoroPause(): Promise<void>
  pomodoroToggle(): Promise<void>
  pomodoroReset(): Promise<void>
  getPomodoroState(): Promise<PomodoroState>
  onPomodoroState(callback: (state: PomodoroState) => void): () => void
  /** 番茄钟独立窗口的控制（打开/最小化/关闭/置顶）。 */
  pomodoroWindow: {
    open(): Promise<void>
    minimize(): Promise<void>
    close(): Promise<void>
    /** 置顶 / 取消置顶。 */
    setAlwaysOnTop(flag: boolean): Promise<void>
    /** 当前是否置顶。 */
    isAlwaysOnTop(): Promise<boolean>
  }
  /** 打开/关闭番茄钟窗口。 */
  setPomodoroOpen(open: boolean): Promise<void>
  isPomodoroOpen(): Promise<boolean>
  onPomodoroOpenChanged(callback: (open: boolean) => void): () => void
  /** 调整番茄钟窗口高度（不显示格言时底部向上缩小）。 */
  setPomodoroCompact(compact: boolean): Promise<void>
  /** 主窗口把当前主题色与当前对话角色同步给主进程（供番茄钟窗口使用）。 */
  setTheme(color: string, personaId: string | null): Promise<void>
  onThemeChanged(callback: (payload: { color: string; personaId: string | null }) => void): () => void
  /** 以当前对话角色生成一句番茄钟格言（含角色名）。 */
  generateMotto(): Promise<{ personaName: string; motto: string }>
  /** 番茄钟窗口打开时获取当前主题色与当前对话角色。 */
  getPomodoroContext(): Promise<{ color: string; personaId: string | null }>
  /** 获取拖入的文件/文件夹的本地绝对路径。 */
  getPathForFile(file: File): string

  notify(title: string, body: string): Promise<void>
  windowControls: WindowControls
}
