import { BrowserWindow, dialog, ipcMain } from 'electron'
import { z } from 'zod'
import type { ConfigService } from '../config/config'
import type { ChatService } from '../services/chat'
import type { ScheduleService } from '../services/schedule'
import type { FileService } from '../services/files'
import type { AgentRunner } from '../agent/loop'
import type { ToolContext, ToolRegistry } from '../agent/registry'
import { pingLLM } from '../llm/openaiCompat'
import type { ChatStreamEvent, EventRange, OrganizeRule, Persona, Settings, SettingsUpdate } from '../../shared/types'

const createEventSchema = z.object({
  title: z.string().min(1),
  startAt: z.number(),
  endAt: z.number().optional(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  reminderMinutes: z.number().optional()
})

const updateEventSchema = z.object({
  title: z.string().optional(),
  startAt: z.number().optional(),
  endAt: z.number().optional(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  reminderMinutes: z.number().optional()
})

const organizeRuleSchema = z.object({
  sourceFolder: z.string().min(1),
  mode: z.enum(['by-extension', 'by-date', 'by-name-pattern']),
  regexPattern: z.string().optional(),
  targetBase: z.string().optional()
})

interface Deps {
  config: ConfigService
  chat: ChatService
  schedule: ScheduleService
  files: FileService
  runner: AgentRunner
  registry: ToolRegistry<ToolContext>
  getWindow: () => BrowserWindow | null
  applyRuntimeSettings: (settings: Settings) => void
}

export function registerIpc(deps: Deps): void {
  const { config, chat, schedule, files, runner, getWindow, applyRuntimeSettings } = deps
  const active = new Map<string, AbortController>()

  const send = (event: ChatStreamEvent): void => {
    getWindow()?.webContents.send('chat:event', event)
  }

  // ---- persona / settings ----
  ipcMain.handle('persona:get', () => config.getPersona())
  ipcMain.handle('persona:getDefault', () => config.getDefaultPersona())
  ipcMain.handle('persona:save', (_e, persona: Persona) => config.setPersona(persona))
  ipcMain.handle('persona:list', () => config.getPersonas())
  ipcMain.handle('persona:setActive', (_e, id: string) => config.setActivePersona(String(id)))
  ipcMain.handle('persona:create', () => config.createPersona())
  ipcMain.handle('persona:delete', (_e, id: string) => config.deletePersona(String(id)))
  ipcMain.handle('settings:get', () => config.getSettings())
  ipcMain.handle('settings:getDefault', () => config.getDefaultSettings())
  ipcMain.handle('settings:save', (_e, update: SettingsUpdate) => {
    const saved = config.setSettings(update)
    applyRuntimeSettings(saved)
    return saved
  })
  ipcMain.handle('settings:test', async () => {
    const llm = config.getLLMConfig()
    if (!llm.apiKey) return { ok: false, message: '尚未配置 API Key' }
    return pingLLM({ baseURL: llm.baseURL, apiKey: llm.apiKey, model: llm.model })
  })

  // ---- chat ----
  ipcMain.handle('chat:send', (_e, payload: { conversationId?: string; message: string }) => {
    const message = String(payload?.message ?? '')
    const conversationId = chat.ensureConversation(payload?.conversationId, message)
    const controller = new AbortController()
    active.set(conversationId, controller)

    runner
      .run(message, conversationId, controller.signal, {
        onDelta: (content) => send({ type: 'delta', conversationId, content }),
        onToolCall: (toolName) => send({ type: 'toolCall', conversationId, toolName }),
        onToolResult: (toolName, toolResult) => send({ type: 'toolResult', conversationId, toolName, toolResult })
      })
      .then(() => send({ type: 'done', conversationId }))
      .catch((err: Error) => send({ type: 'error', conversationId, error: err?.message ?? String(err) }))
      .finally(() => active.delete(conversationId))

    return { conversationId }
  })
  ipcMain.handle('chat:stop', (_e, conversationId: string) => {
    active.get(conversationId)?.abort()
  })
  ipcMain.handle('chat:listConversations', () => chat.listConversations())
  ipcMain.handle('chat:getMessages', (_e, id: string) => chat.getMessages(id))
  ipcMain.handle('chat:rename', (_e, id: string, title: string) => chat.rename(id, String(title)))
  ipcMain.handle('chat:delete', (_e, id: string) => chat.trash(String(id)))
  ipcMain.handle('chat:listTrash', () => chat.listTrash())
  ipcMain.handle('chat:restore', (_e, id: string) => chat.restore(String(id)))
  ipcMain.handle('chat:purge', (_e, id: string) => chat.purge(String(id)))

  // ---- schedule ----
  ipcMain.handle('schedule:list', (_e, range: EventRange) => schedule.list(range ?? {}))
  ipcMain.handle('schedule:create', (_e, input: unknown) => {
    const parsed = createEventSchema.parse(input)
    return schedule.create({
      title: parsed.title,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      allDay: parsed.allDay ?? false,
      description: parsed.description,
      location: parsed.location,
      reminderMinutes: parsed.reminderMinutes
    })
  })
  ipcMain.handle('schedule:update', (_e, id: string, patch: unknown) => {
    const parsed = updateEventSchema.parse(patch)
    return schedule.update(String(id), parsed)
  })
  ipcMain.handle('schedule:delete', (_e, id: string) => {
    schedule.remove(String(id))
  })

  // ---- files ----
  ipcMain.handle('files:preview', (_e, rule: unknown) => files.preview(organizeRuleSchema.parse(rule) as OrganizeRule))
  ipcMain.handle('files:execute', (_e, rule: unknown) => files.execute(organizeRuleSchema.parse(rule) as OrganizeRule))
  ipcMain.handle('files:undoLast', () => files.undoLast())
  ipcMain.handle('files:list', (_e, folder: string) => files.list(String(folder)))
  ipcMain.handle('files:chooseFolder', async () => {
    const win = getWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  // ---- frameless window controls ----
  ipcMain.handle('win:minimize', () => getWindow()?.minimize())
  ipcMain.handle('win:toggleMaximize', () => {
    const w = getWindow()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  ipcMain.handle('win:isMaximized', () => getWindow()?.isMaximized() ?? false)
  ipcMain.handle('win:close', () => getWindow()?.close())
}
