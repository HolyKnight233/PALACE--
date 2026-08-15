import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ConfigService } from '../../src/main/config/config'
import type { SecretStore } from '../../src/main/config/config'

const secrets: SecretStore = {
  encrypt: (s) => Buffer.from(s, 'utf8').toString('base64'),
  decrypt: (s) => Buffer.from(s, 'base64').toString('utf8')
}

describe('ConfigService.load', () => {
  it('fills missing settings fields with defaults (closeToTray defaults to true)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-config-'))
    try {
      // An "old" config.json written before launchAtLogin/closeToTray existed.
      const oldConfig = {
        persona: {
          id: 'default',
          name: '旧助手',
          role: '',
          personality: [],
          speakingStyle: '',
          systemPrompt: '',
          defaultLanguage: '中文',
          themeColor: '#000000'
        },
        settings: {
          provider: 'deepseek',
          baseURL: 'https://api.deepseek.com',
          model: 'deepseek-chat',
          temperature: 0.7,
          timezone: 'Asia/Shanghai'
        },
        apiKeyEnc: null
      }
      writeFileSync(join(dir, 'config.json'), JSON.stringify(oldConfig), 'utf8')

      const svc = new ConfigService(dir, secrets)
      await svc.load()

      const s = svc.getSettings()
      expect(s.closeToTray).toBe(true)
      expect(s.launchAtLogin).toBe(false)
      expect(s.provider).toBe('deepseek')
      expect(s.model).toBe('deepseek-chat')
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup; a pending async write may briefly hold the dir on Windows */
      }
    }
  })
})
