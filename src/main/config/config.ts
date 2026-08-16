import { join } from 'path'
import { JsonStore, newId } from '../db/store'
import type { Persona, PomodoroPreset, ProviderId, Settings, SettingsUpdate } from '../../shared/types'

export interface SecretStore {
  encrypt(plain: string): string
  decrypt(enc: string): string
}

export const PROVIDER_DEFAULTS: Record<ProviderId, { baseURL: string; model: string }> = {
  deepseek: { baseURL: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  custom: { baseURL: '', model: '' }
}

export const DEFAULT_PERSONA: Persona = {
  id: 'default',
  name: '小助手',
  role: '一个贴心、可靠的个人桌面助理',
  personality: ['友善', '耐心', '有条理'],
  speakingStyle: '简洁、自然、乐于帮忙',
  systemPrompt: '',
  defaultLanguage: '中文',
  themeColor: '#4f7cff',
  hidden: false,
  supplements: '',
  supplementsEnabled: true
}

const DEFAULT_POMODORO: PomodoroPreset = {
  id: 'default',
  name: '标准番茄钟',
  workMinutes: 25,
  breakMinutes: 5,
  loopCount: 4
}

function defaultSettings(): ConfigShape['settings'] {
  return {
    provider: 'deepseek' as ProviderId,
    baseURL: PROVIDER_DEFAULTS.deepseek.baseURL,
    model: PROVIDER_DEFAULTS.deepseek.model,
    temperature: 0.7,
    timezone: 'Asia/Shanghai',
    launchAtLogin: false,
    closeToTray: true,
    pomodoroShowMotto: true,
    pomodoroMottoByPersona: true
  }
}

interface ConfigShape {
  personas: Persona[]
  pomodoros: PomodoroPreset[]
  activePomodoroId: string
  /** 番茄钟窗口的开关状态，重启后据此决定是否自动打开。 */
  pomodoroOpen: boolean
  /** 番茄钟窗口上次关闭时的位置（屏幕坐标），用于重新打开时恢复。 */
  pomodoroX: number | null
  pomodoroY: number | null
  settings: {
    provider: ProviderId
    baseURL: string
    model: string
    temperature: number
    timezone: string
    launchAtLogin: boolean
    closeToTray: boolean
    pomodoroShowMotto: boolean
    pomodoroMottoByPersona: boolean
  }
  apiKeyEnc: string | null
}

export class ConfigService {
  private store: JsonStore<ConfigShape>
  private readonly onChange?: () => void

  constructor(
    dataDir: string,
    private readonly secrets: SecretStore,
    onChange?: () => void
  ) {
    this.store = new JsonStore<ConfigShape>(join(dataDir, 'config.json'), () => ({
      personas: [DEFAULT_PERSONA],
      pomodoros: [DEFAULT_POMODORO],
      activePomodoroId: 'default',
      pomodoroOpen: true,
      pomodoroX: null,
      pomodoroY: null,
      settings: defaultSettings(),
      apiKeyEnc: null
    }))
    this.onChange = onChange
  }

  async load(): Promise<void> {
    await this.store.load()
    this.store.update((d) => {
      // 迁移旧版单一人设结构（persona -> personas[]）
      const legacy = (d as unknown as { persona?: Persona }).persona
      if (legacy) {
        d.personas = [{ ...DEFAULT_PERSONA, ...legacy, id: legacy.id || 'default' }]
        delete (d as unknown as { persona?: Persona }).persona
      }
      if (!Array.isArray(d.personas) || d.personas.length === 0) {
        d.personas = [DEFAULT_PERSONA]
      }
      // 迁移：角色的旧「偏好」字段改名为「补充提示词」，并清理已废弃的自动写入开关。
      for (const p of d.personas) {
        const raw = p as unknown as Record<string, unknown>
        if (typeof raw.preferences === 'string' && !raw.supplements) {
          raw.supplements = raw.preferences
        }
        delete raw.preferences
        delete raw.preferencesAuto
        delete raw.supplementsAuto
      }
      d.personas = d.personas.map((p) => ({ ...DEFAULT_PERSONA, ...p }))
      if (!Array.isArray(d.pomodoros) || d.pomodoros.length === 0) {
        d.pomodoros = [DEFAULT_POMODORO]
      }
      d.pomodoros = d.pomodoros.map((p) => ({ ...DEFAULT_POMODORO, ...p }))
      if (!d.pomodoros.some((p) => p.id === d.activePomodoroId)) {
        d.activePomodoroId = d.pomodoros[0].id
      }
      d.settings = { ...defaultSettings(), ...d.settings }
    })
  }

  private emit(): void {
    this.onChange?.()
  }

  /** 活动（未删除）角色列表。 */
  getPersonas(): Persona[] {
    return this.store.read().personas.filter((p) => !p.deletedAt)
  }

  /** 默认角色（第一个未删除角色，用于没有绑定角色时的兜底）。 */
  getPersona(): Persona {
    return this.store.read().personas.find((p) => !p.deletedAt) ?? DEFAULT_PERSONA
  }

  getPersonaById(id: string): Persona {
    const d = this.store.read()
    return d.personas.find((p) => p.id === id) ?? this.getPersona()
  }

  /** 新建或更新一个角色（按 id 幂等 upsert）。 */
  setPersona(persona: Persona): Persona {
    const normalized = { ...DEFAULT_PERSONA, ...persona }
    this.store.update((d) => {
      const idx = d.personas.findIndex((p) => p.id === normalized.id)
      if (idx >= 0) {
        d.personas[idx] = normalized
      } else {
        d.personas.push(normalized)
      }
    })
    this.emit()
    return normalized
  }

  createPersona(): Persona {
    const persona: Persona = { ...DEFAULT_PERSONA, id: newId(), name: '新角色' }
    this.store.update((d) => {
      d.personas.push(persona)
    })
    this.emit()
    return persona
  }

  /** 软删除角色（移入回收站）；至少保留一个活动角色。 */
  deletePersona(id: string): Persona {
    this.store.update((d) => {
      const active = d.personas.filter((p) => !p.deletedAt)
      if (active.length <= 1) return
      const p = d.personas.find((x) => x.id === id)
      if (p && !p.deletedAt) p.deletedAt = Date.now()
    })
    this.emit()
    return this.getPersona()
  }

  /** 回收站里的角色。 */
  listTrashPersonas(): Persona[] {
    return this.store.read().personas.filter((p) => p.deletedAt !== undefined)
  }

  /** 从回收站恢复角色。 */
  restorePersona(id: string): Persona {
    this.store.update((d) => {
      const p = d.personas.find((x) => x.id === id)
      if (p) delete p.deletedAt
    })
    this.emit()
    return this.getPersona()
  }

  /** 永久删除回收站里的角色。 */
  purgePersona(id: string): Persona {
    this.store.update((d) => {
      d.personas = d.personas.filter((p) => !(p.id === id && p.deletedAt !== undefined))
    })
    this.emit()
    return this.getPersona()
  }

  /** 删除回收站中超过保留期（30 天）的角色。 */
  purgeExpiredPersonas(now: number = Date.now()): void {
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const expired = this.store.read().personas.filter((p) => p.deletedAt !== undefined && p.deletedAt < cutoff)
    if (expired.length === 0) return
    const ids = new Set(expired.map((p) => p.id))
    this.store.update((d) => {
      d.personas = d.personas.filter((p) => !ids.has(p.id))
    })
    this.emit()
  }

  getDefaultPersona(): Persona {
    return { ...DEFAULT_PERSONA }
  }

  getPomodoros(): PomodoroPreset[] {
    return [...this.store.read().pomodoros]
  }

  getActivePomodoro(): PomodoroPreset {
    const d = this.store.read()
    return d.pomodoros.find((p) => p.id === d.activePomodoroId) ?? d.pomodoros[0] ?? DEFAULT_POMODORO
  }

  savePomodoro(preset: PomodoroPreset): PomodoroPreset {
    const normalized = { ...DEFAULT_POMODORO, ...preset }
    this.store.update((d) => {
      const idx = d.pomodoros.findIndex((p) => p.id === normalized.id)
      if (idx >= 0) d.pomodoros[idx] = normalized
      else d.pomodoros.push(normalized)
    })
    this.emit()
    return normalized
  }

  setActivePomodoro(id: string): PomodoroPreset {
    this.store.update((d) => {
      if (d.pomodoros.some((p) => p.id === id)) d.activePomodoroId = id
    })
    this.emit()
    return this.getActivePomodoro()
  }

  createPomodoro(): PomodoroPreset {
    const preset: PomodoroPreset = { ...DEFAULT_POMODORO, id: newId(), name: '新番茄钟' }
    this.store.update((d) => {
      d.pomodoros.push(preset)
      d.activePomodoroId = preset.id
    })
    this.emit()
    return preset
  }

  deletePomodoro(id: string): PomodoroPreset {
    this.store.update((d) => {
      if (d.pomodoros.length <= 1) return
      d.pomodoros = d.pomodoros.filter((p) => p.id !== id)
      if (d.activePomodoroId === id) d.activePomodoroId = d.pomodoros[0].id
    })
    this.emit()
    return this.getActivePomodoro()
  }

  /** 番茄钟窗口上次是否处于打开状态（用于重启后恢复）。 */
  getPomodoroOpen(): boolean {
    return this.store.read().pomodoroOpen
  }

  /** 记录番茄钟窗口的开关状态；不触发广播，打开状态由主进程单独广播。 */
  setPomodoroOpen(open: boolean): void {
    this.store.update((d) => {
      d.pomodoroOpen = open
    })
  }

  /** 番茄钟窗口上次关闭时的位置；无记录时为 null。 */
  getPomodoroPosition(): { x: number; y: number } | null {
    const d = this.store.read()
    if (typeof d.pomodoroX === 'number' && typeof d.pomodoroY === 'number') {
      return { x: d.pomodoroX, y: d.pomodoroY }
    }
    return null
  }

  /** 记录番茄钟窗口的位置；不触发广播。 */
  setPomodoroPosition(x: number, y: number): void {
    this.store.update((d) => {
      d.pomodoroX = x
      d.pomodoroY = y
    })
  }

  getSettings(): Settings {
    const d = this.store.read()
    return { ...d.settings, hasApiKey: !!d.apiKeyEnc }
  }

  getDefaultSettings(): Settings {
    return { ...defaultSettings(), hasApiKey: false }
  }

  setSettings(update: SettingsUpdate): Settings {
    this.store.update((d) => {
      d.settings = {
        provider: update.provider,
        baseURL: update.baseURL,
        model: update.model,
        temperature: update.temperature,
        timezone: update.timezone,
        launchAtLogin: update.launchAtLogin,
        closeToTray: update.closeToTray,
        pomodoroShowMotto: update.pomodoroShowMotto ?? true,
        pomodoroMottoByPersona: update.pomodoroMottoByPersona ?? true
      }
      if (typeof update.apiKey === 'string' && update.apiKey.trim() !== '') {
        d.apiKeyEnc = this.secrets.encrypt(update.apiKey.trim())
      }
    })
    this.emit()
    return this.getSettings()
  }

  /** 自动写入某角色的补充提示词（触发广播，供前端刷新）。 */
  setPersonaSupplements(id: string, supplements: string): void {
    this.store.update((d) => {
      const p = d.personas.find((x) => x.id === id)
      if (p) p.supplements = supplements
    })
    this.emit()
  }

  getApiKey(): string | null {
    const enc = this.store.read().apiKeyEnc
    if (!enc) return null
    try {
      return this.secrets.decrypt(enc)
    } catch (err) {
      console.error('[config] failed to decrypt api key:', err)
      return null
    }
  }

  getLLMConfig(): { baseURL: string; apiKey: string | null; model: string; temperature: number } {
    const s = this.store.read().settings
    return { baseURL: s.baseURL, apiKey: this.getApiKey(), model: s.model, temperature: s.temperature }
  }
}
