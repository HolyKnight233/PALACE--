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
  createdAt: number
  updatedAt: number
  /** Epoch ms when moved to trash; undefined while active. */
  deletedAt?: number
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
  /** Launch the app automatically when Windows starts. */
  launchAtLogin: boolean
  /** Hide to the system tray instead of quitting when the window is closed. */
  closeToTray: boolean
}

export interface SettingsUpdate {
  provider: ProviderId
  baseURL: string
  model: string
  temperature: number
  timezone: string
  launchAtLogin: boolean
  closeToTray: boolean
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
  location?: string
  /** Minutes before start to fire a reminder. */
  reminderMinutes?: number
  createdAt: number
  updatedAt: number
}

export type OrganizeMode = 'by-extension' | 'by-date' | 'by-name-pattern'

export interface OrganizeRule {
  sourceFolder: string
  mode: OrganizeMode
  /** Regex for by-name-pattern mode. */
  regexPattern?: string
  /** Optional base folder for grouped subfolders. Defaults to sourceFolder. */
  targetBase?: string
}

export interface FileMovePreview {
  source: string
  destination: string
  size: number
  conflict: boolean
}

export interface FileMoveRecord {
  id: string
  batchId: string
  source: string
  destination: string
  fileName: string
  size: number
  status: 'moved' | 'failed'
  error?: string
  createdAt: number
}

export interface FileEntry {
  name: string
  isDirectory: boolean
  size: number
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

export interface FileExecuteResult {
  batchId: string
  moved: number
  failed: FileMoveRecord[]
}

export interface FileUndoResult {
  batchId: string | null
  restored: number
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
  getPersona(): Promise<Persona>
  getDefaultPersona(): Promise<Persona>
  savePersona(persona: Persona): Promise<Persona>
  getPersonas(): Promise<Persona[]>
  setActivePersona(id: string): Promise<Persona>
  createPersona(): Promise<Persona>
  deletePersona(id: string): Promise<Persona>
  onPersonaChanged(callback: () => void): () => void
  getSettings(): Promise<Settings>
  getDefaultSettings(): Promise<Settings>
  saveSettings(update: SettingsUpdate): Promise<Settings>
  testConnection(): Promise<ConnectionTestResult>

  chatSend(payload: { conversationId?: string; message: string }): Promise<{ conversationId: string }>
  chatStop(conversationId: string): Promise<void>
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
    location?: string
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
      location: string
      reminderMinutes: number
    }>
  ): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
  /** Subscribe to schedule mutations (fired whenever a schedule is created/updated/deleted). */
  onScheduleChanged(callback: () => void): () => void

  filesPreview(rule: OrganizeRule): Promise<FileMovePreview[]>
  filesExecute(rule: OrganizeRule): Promise<FileExecuteResult>
  filesUndoLast(): Promise<FileUndoResult>
  filesList(folder: string): Promise<FileEntry[]>
  chooseFolder(): Promise<string | null>
  windowControls: WindowControls
}
