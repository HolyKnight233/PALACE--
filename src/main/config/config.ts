import { join } from 'path'
import { JsonStore, newId } from '../db/store'
import type { Persona, ProviderId, Settings, SettingsUpdate } from '../../shared/types'

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
  themeColor: '#4f7cff'
}

function defaultSettings(): ConfigShape['settings'] {
  return {
    provider: 'deepseek' as ProviderId,
    baseURL: PROVIDER_DEFAULTS.deepseek.baseURL,
    model: PROVIDER_DEFAULTS.deepseek.model,
    temperature: 0.7,
    timezone: 'Asia/Shanghai',
    launchAtLogin: false,
    closeToTray: true
  }
}

interface ConfigShape {
  personas: Persona[]
  activePersonaId: string
  settings: {
    provider: ProviderId
    baseURL: string
    model: string
    temperature: number
    timezone: string
    launchAtLogin: boolean
    closeToTray: boolean
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
      activePersonaId: 'default',
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
      d.personas = d.personas.map((p) => ({ ...DEFAULT_PERSONA, ...p }))
      if (!d.personas.some((p) => p.id === d.activePersonaId)) {
        d.activePersonaId = d.personas[0].id
      }
      d.settings = { ...defaultSettings(), ...d.settings }
    })
  }

  private emit(): void {
    this.onChange?.()
  }

  getPersonas(): Persona[] {
    return [...this.store.read().personas]
  }

  /** 当前激活的人设（用于系统提示词与主题色）。 */
  getPersona(): Persona {
    const d = this.store.read()
    return d.personas.find((p) => p.id === d.activePersonaId) ?? d.personas[0] ?? DEFAULT_PERSONA
  }

  /** 新建或更新一个人设（按 id 幂等 upsert）。 */
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

  setActivePersona(id: string): Persona {
    this.store.update((d) => {
      if (d.personas.some((p) => p.id === id)) d.activePersonaId = id
    })
    this.emit()
    return this.getPersona()
  }

  createPersona(): Persona {
    const persona: Persona = { ...DEFAULT_PERSONA, id: newId(), name: '新预设' }
    this.store.update((d) => {
      d.personas.push(persona)
      d.activePersonaId = persona.id
    })
    this.emit()
    return persona
  }

  deletePersona(id: string): Persona {
    this.store.update((d) => {
      if (d.personas.length <= 1) return
      d.personas = d.personas.filter((p) => p.id !== id)
      if (d.activePersonaId === id) d.activePersonaId = d.personas[0].id
    })
    this.emit()
    return this.getPersona()
  }

  getDefaultPersona(): Persona {
    return { ...DEFAULT_PERSONA }
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
        closeToTray: update.closeToTray
      }
      if (typeof update.apiKey === 'string' && update.apiKey.trim() !== '') {
        d.apiKeyEnc = this.secrets.encrypt(update.apiKey.trim())
      }
    })
    return this.getSettings()
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
