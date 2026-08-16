import { BrowserWindow, Notification, ipcMain } from 'electron'
import { z } from 'zod'
import type { ConfigService } from '../config/config'
import type { ChatService } from '../services/chat'
import type { ScheduleService } from '../services/schedule'
import type { PomodoroTimer } from '../services/pomodoro'
import type { AgentRunner } from '../agent/loop'
import type { ToolContext, ToolRegistry } from '../agent/registry'
import { completeChat, pingLLM } from '../llm/openaiCompat'
import { countSupplements, MAX_SUPPLEMENT_ITEMS, COMPRESS_TARGET_ITEMS } from '../agent/supplements'
import type {
  ChatStreamEvent,
  EventRange,
  Persona,
  PomodoroPreset,
  Settings,
  SettingsUpdate
} from '../../shared/types'

const createEventSchema = z.object({
  title: z.string().min(1),
  startAt: z.number(),
  endAt: z.number().optional(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  reminderMinutes: z.number().optional()
})

function parsePersonaJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return {}
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const updateEventSchema = z.object({
  title: z.string().optional(),
  startAt: z.number().optional(),
  endAt: z.number().optional(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
  reminderMinutes: z.number().optional()
})

interface Deps {
  config: ConfigService
  chat: ChatService
  schedule: ScheduleService
  pomodoro: PomodoroTimer
  runner: AgentRunner
  registry: ToolRegistry<ToolContext>
  getWindow: () => BrowserWindow | null
  applyRuntimeSettings: (settings: Settings) => void
  showPomodoroWindow: () => void
  isPomodoroOpen: () => boolean
  closePomodoroWindow: () => void
  getDataDir: () => string
  setDataDir: (dir: string) => Promise<{ ok: boolean; error?: string }>
  selectDirectory: () => Promise<string | null>
  relaunchApp: () => void
}

export function registerIpc(deps: Deps): void {
  const {
    config,
    chat,
    schedule,
    pomodoro,
    runner,
    getWindow,
    applyRuntimeSettings,
    showPomodoroWindow,
    isPomodoroOpen,
    closePomodoroWindow,
    getDataDir,
    setDataDir,
    selectDirectory,
    relaunchApp
  } = deps
  const active = new Map<string, AbortController>()

  // 主窗口同步过来的当前主题色与当前对话角色（供番茄钟窗口使用）。
  let currentColor = '#4f7cff'
  let currentPersonaId: string | null = null

  const send = (event: ChatStreamEvent): void => {
    getWindow()?.webContents.send('chat:event', event)
  }

  // 用接入的模型生成简短精炼的对话标题（类似 DeepSeek 的做法）。
  const generateTitle = async (conversationId: string, firstMessage: string): Promise<void> => {
    try {
      const llm = config.getLLMConfig()
      if (!llm.apiKey) return
      const prompt = [
        '请根据下面的用户消息生成一个简短精炼的对话标题。',
        '要求：不超过 12 个汉字；只输出标题本身，不要引号、标点或任何解释。',
        '',
        `用户消息：${firstMessage}`
      ].join('\n')
      const raw = await completeChat({
        baseURL: llm.baseURL,
        apiKey: llm.apiKey,
        model: llm.model,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }]
      })
      const title = raw
        .trim()
        .replace(/^["'「『]+|["'」』]+$/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 24)
      if (title) chat.rename(conversationId, title)
    } catch (err) {
      console.error('[title]', err)
    }
  }

  // 以「助手在对话中的自我表现」为第一手资料，提炼本轮新增的人设条目（增量，供 RAG 检索）。
  const mergeSupplements = async (
    llm: { baseURL: string; apiKey: string; model: string },
    existing: string,
    dialogue: string
  ): Promise<string> => {
    const prompt = [
      '你是角色人设提炼器。请根据下面的「对话」，提炼出本轮新出现的、关于该角色的稳定人设要点（设定、事实、剧情、规则），用于在后续对话中保持一致。',
      '人设要点的第一手资料是「助手」的回复：请从助手在对话中的说话方式、自称、背景故事、世界观、行为准则、以及它主动确立的设定里，概括出角色稳定、需要长期保持的特征。',
      '「用户」的消息作为补充来源：用户给角色的设定、对角色行为的修正、与角色相关的剧情或背景。',
      '提炼要求（必须遵守）：',
      '- 只输出「本轮对话中新出现」的要点；「已有内容」里已经存在的，不要重复输出。',
      '- 输出的是「关于该角色的客观人设要点」，用普通话、直白、概括性的短句描述，绝不照抄任何一方的原话。',
      '- 例：助手说「我这人只记遗言，不记别的」，应概括为「角色只负责记录遗言」，而不是照抄原句。',
      '- 每条一句话、用分号分隔、每条都能独立看懂。',
      '- 不要把角色的名字、性格、说话风格等身份信息写进来（这些已单独保存），只记录新确立的设定、事实、剧情与规则。',
      '- 忽略寒暄、闲聊、一次性内容；若本轮没有新的长期人设信息，就什么都不输出，直接留空。',
      '',
      `已有内容：${existing || '（空）'}`,
      '',
      '对话：',
      dialogue
    ].join('\n')
    const raw = await completeChat({
      baseURL: llm.baseURL,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    })
    const next = raw.trim()
    // 兜底：模型偶尔会把「空字符串/空」字面输出，此时视为空，避免污染条目库。
    if (next === '空字符串' || next === '（空字符串）' || next === '（空）' || next === '空') return ''
    return next
  }

  // 条目达到上限时，把整份清单智能合并压缩到目标条数以内。
  const compressSupplements = async (
    llm: { baseURL: string; apiKey: string; model: string },
    supplements: string
  ): Promise<string> => {
    const prompt = [
      '你是角色人设整理器。下面是一份角色的人设条目清单，可能含有重复、相似、过时的条目。请把它整理成一份更精简的清单。',
      '整理要求：',
      '- 合并意思相近的条目；删除重复、过时、不再重要的条目。',
      '- 保留最重要、最能避免角色前后矛盾的设定。',
      `- 目标：压缩到 ${COMPRESS_TARGET_ITEMS} 条以内。`,
      '- 每条一句话、用分号分隔、客观直白、不复述原话。',
      '- 只输出整理后的清单本身，不要任何解释。',
      '',
      '条目清单：',
      supplements
    ].join('\n')
    const raw = await completeChat({
      baseURL: llm.baseURL,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    })
    return raw.trim()
  }

  // 对话结束后异步补全当前角色的补充提示词（受「启用 + 自动补全」双重开关控制）。
  const refineSupplementsAfterTurn = async (conversationId: string, beforeCount: number): Promise<void> => {
    try {
      const llm = config.getLLMConfig()
      if (!llm.apiKey) return
      const baseURL = llm.baseURL
      const apiKey = llm.apiKey
      const model = llm.model
      const conv = chat.getConversation(conversationId)
      if (!conv) return
      const persona = config.getPersonaById(conv.personaId)
      if (!(persona.supplementsEnabled ?? true)) return

      const dialogue = chat
        .getMessages(conversationId)
        .slice(beforeCount)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content ?? ''}`)
        .join('\n')
        .slice(0, 3000)
      if (!dialogue.trim()) return

      const next = await mergeSupplements({ baseURL, apiKey, model }, persona.supplements ?? '', dialogue)
      if (next) {
        const existing = (persona.supplements ?? '').trim()
        let merged = existing ? `${existing}；${next}` : next
        if (countSupplements(merged) >= MAX_SUPPLEMENT_ITEMS) {
          merged = await compressSupplements({ baseURL, apiKey, model }, merged)
        }
        config.setPersonaSupplements(persona.id, merged)
      }
    } catch (err) {
      console.error('[supplements]', err)
    }
  }

  // ---- persona / settings ----
  ipcMain.handle('persona:getDefault', () => config.getDefaultPersona())
  ipcMain.handle('persona:save', (_e, persona: Persona) => config.setPersona(persona))
  ipcMain.handle('persona:list', () => config.getPersonas())
  ipcMain.handle('persona:listTrash', () => config.listTrashPersonas())
  ipcMain.handle('persona:create', () => config.createPersona())
  ipcMain.handle('persona:delete', (_e, id: string) => config.deletePersona(String(id)))
  ipcMain.handle('persona:restore', (_e, id: string) => config.restorePersona(String(id)))
  ipcMain.handle('persona:purge', (_e, id: string) => config.purgePersona(String(id)))
  ipcMain.handle('persona:generate', async (_e, requirement: string) => {
    const llm = config.getLLMConfig()
    if (!llm.apiKey) throw new Error('尚未配置 API Key')
    const req = String(requirement ?? '').trim()
    const prompt = [
      '请随机设计一个角色人设。',
      '类型选择：一半概率设计一个现实中能存在的普通人设；一半概率设计一个幻想类角色（奇幻、科幻、神话、传说、异世界、非人生物等，类型要尽量多样，包罗万象）。',
      '不要限定为任何特定身份（如“AI 助手”“桌面助手”“智能助理”等）。',
      req ? `用户的要求（若给出了要求，则以要求为准）：${req}` : '',
      '必须包含：名字、角色定位、性格特点（3~5 个词）、说话风格、自定义系统提示词（用一两句话描述该角色的行为准则和边界）、主题色（十六进制颜色）、默认语言。',
      '只输出一个 JSON 对象，不要输出任何其他内容，格式如下：',
      '{"name":"...","role":"...","personality":["...","..."],"speakingStyle":"...","systemPrompt":"...","themeColor":"#rrggbb","defaultLanguage":"中文"}'
    ]
      .filter(Boolean)
      .join('\n')

    const text = await completeChat({
      baseURL: llm.baseURL,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 1.1,
      messages: [{ role: 'user', content: prompt }]
    })
    const raw = parsePersonaJson(text)
    return {
      name: typeof raw.name === 'string' && raw.name ? raw.name : '小助手',
      role: typeof raw.role === 'string' ? raw.role : '',
      personality: Array.isArray(raw.personality) ? raw.personality.filter((x) => typeof x === 'string') : [],
      speakingStyle: typeof raw.speakingStyle === 'string' ? raw.speakingStyle : '',
      systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
      themeColor: typeof raw.themeColor === 'string' && raw.themeColor ? raw.themeColor : '#4f7cff',
      defaultLanguage: typeof raw.defaultLanguage === 'string' ? raw.defaultLanguage : '中文'
    }
  })
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

  // ---- data directory ----
  ipcMain.handle('settings:getDataDir', () => getDataDir())
  ipcMain.handle('settings:setDataDir', (_e, dir: string) => setDataDir(String(dir ?? '')))
  ipcMain.handle('app:selectDirectory', () => selectDirectory())
  ipcMain.handle('app:relaunch', () => {
    relaunchApp()
  })

  // ---- chat ----
  ipcMain.handle('chat:send', (_e, payload: { conversationId?: string; message: string }) => {
    const message = String(payload?.message ?? '')
    let conversationId = payload?.conversationId
    if (!conversationId || !chat.getConversation(conversationId)) {
      const conv = chat.createConversation({ personaId: config.getPersona().id, firstMessage: message })
      conversationId = conv.id
    }
    const beforeCount = chat.getMessages(conversationId).length
    const wasEmpty = beforeCount === 0
    const controller = new AbortController()
    active.set(conversationId, controller)

    runner
      .run(message, conversationId, controller.signal, {
        onDelta: (content) => send({ type: 'delta', conversationId, content }),
        onToolCall: (toolName) => send({ type: 'toolCall', conversationId, toolName }),
        onToolResult: (toolName, toolResult) => send({ type: 'toolResult', conversationId, toolName, toolResult })
      })
      .then(() => {
        send({ type: 'done', conversationId })
        void refineSupplementsAfterTurn(conversationId, beforeCount)
      })
      .catch((err: Error) => send({ type: 'error', conversationId, error: err?.message ?? String(err) }))
      .finally(() => active.delete(conversationId))

    // 首条消息后异步生成精炼标题（失败则保留截断标题兜底）。
    if (wasEmpty) void generateTitle(conversationId, message)

    return { conversationId }
  })
  ipcMain.handle('chat:stop', (_e, conversationId: string) => {
    active.get(conversationId)?.abort()
  })
  ipcMain.handle('chat:newConversation', (_e, opts: { personaId: string }) => {
    return chat.createConversation({
      personaId: String(opts?.personaId)
    })
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

  // ---- pomodoro ----
  ipcMain.handle('pomodoro:list', () => config.getPomodoros())
  ipcMain.handle('pomodoro:getActive', () => config.getActivePomodoro())
  ipcMain.handle('pomodoro:save', (_e, preset: PomodoroPreset) => config.savePomodoro(preset))
  ipcMain.handle('pomodoro:setActive', (_e, id: string) => config.setActivePomodoro(String(id)))
  ipcMain.handle('pomodoro:create', () => config.createPomodoro())
  ipcMain.handle('pomodoro:delete', (_e, id: string) => config.deletePomodoro(String(id)))

  // ---- pomodoro window ----
  ipcMain.handle('pomodoro:open', () => {
    showPomodoroWindow()
  })
  ipcMain.handle('pomodoro:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('pomodoro:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('pomodoro:setOpen', (_e, open: boolean) => {
    if (open) showPomodoroWindow()
    else closePomodoroWindow()
  })
  ipcMain.handle('pomodoro:isOpen', () => isPomodoroOpen())
  ipcMain.handle('pomodoro:setCompact', (e, compact: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) {
      const [x, y] = w.getPosition()
      const [width] = w.getSize()
      w.setBounds({ x, y, width, height: compact ? 350 : 400 })
    }
  })
  ipcMain.handle('pomodoro:setAlwaysOnTop', (e, flag: boolean) => {
    BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(Boolean(flag))
  })
  ipcMain.handle('pomodoro:isAlwaysOnTop', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    return w ? w.isAlwaysOnTop() : false
  })

  // ---- pomodoro timer ----
  ipcMain.handle('pomodoro:start', () => {
    pomodoro.start()
  })
  ipcMain.handle('pomodoro:pause', () => {
    pomodoro.pause()
  })
  ipcMain.handle('pomodoro:toggle', () => {
    pomodoro.toggle()
  })
  ipcMain.handle('pomodoro:reset', () => {
    pomodoro.reset()
  })
  ipcMain.handle('pomodoro:state', () => pomodoro.getState())

  // ---- theme sync & pomodoro motto ----
  ipcMain.handle('theme:set', (_e, color: string, personaId: string | null) => {
    currentColor = typeof color === 'string' && color ? color : '#4f7cff'
    currentPersonaId = typeof personaId === 'string' && personaId ? personaId : null
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('theme:changed', { color: currentColor, personaId: currentPersonaId })
    }
  })
  ipcMain.handle('pomodoro:getContext', () => ({ color: currentColor, personaId: currentPersonaId }))
  ipcMain.handle('pomodoro:motto', async () => {
    const llm = config.getLLMConfig()
    const settings = config.getSettings()
    const persona = config.getPersonaById(currentPersonaId ?? config.getPersona().id)
    const byPersona = settings.pomodoroMottoByPersona !== false
    if (!llm.apiKey) return { personaName: byPersona ? persona.name : '', motto: '专注当下，一步一步来。' }
    const intro = byPersona
      ? `请以「${persona.name}」的口吻，写一句适合番茄钟专注场景的格言或鼓励语。角色定位：${persona.role || '无'}。说话风格：${persona.speakingStyle || '自然'}。`
      : '请写一句适合番茄钟专注场景的格言或鼓励语。'
    const prompt = [
      intro,
      '内容类型随机选择：一半概率是人生哲理，一半概率是鼓励。',
      '要求：这是一句格言或鼓励语，内容该是什么样就是什么样，不要总是以“你”开头、不要总是用“你要……”“你应该……”这类说教口吻（格言和鼓励常是陈述句、感悟、哲理）；语气由上面的角色决定即可。只输出一句话，简短有力；使用正常的中文标点；不要加引号或任何解释；不要使用 Markdown；不要每次都写“专注当下”之类的雷同句子。'
    ].join('\n')
    const raw = await completeChat({
      baseURL: llm.baseURL,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 1.0,
      messages: [{ role: 'user', content: prompt }]
    })
    return { personaName: byPersona ? persona.name : '', motto: raw.trim() || '专注当下，一步一步来。' }
  })

  // ---- notify ----
  ipcMain.handle('notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title: String(title), body: String(body) }).show()
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
