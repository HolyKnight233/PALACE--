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

describe('ConfigService personas', () => {
  it('creates, edits, and deletes personas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-persona-'))
    try {
      const svc = new ConfigService(dir, secrets)
      await svc.load()

      expect(svc.getPersonas()).toHaveLength(1)
      expect(svc.getPersona().id).toBe('default')

      const created = svc.createPersona()
      expect(svc.getPersonas()).toHaveLength(2)
      expect(svc.getPersona().id).toBe('default')

      svc.setPersona({ ...created, name: '工作助手' })
      expect(svc.getPersonas().find((p) => p.id === created.id)?.name).toBe('工作助手')

      svc.deletePersona(created.id)
      expect(svc.getPersonas()).toHaveLength(1)
      expect(svc.getPersona().id).toBe('default')

      // 最后一个角色不可删除
      svc.deletePersona('default')
      expect(svc.getPersonas()).toHaveLength(1)
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  })

  it('migrates legacy single-persona config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-persona-migrate-'))
    try {
      writeFileSync(
        join(dir, 'config.json'),
        JSON.stringify({
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
            model: 'deepseek-v4-flash',
            temperature: 0.7,
            timezone: 'Asia/Shanghai'
          },
          apiKeyEnc: null
        }),
        'utf8'
      )

      const svc = new ConfigService(dir, secrets)
      await svc.load()
      expect(svc.getPersonas()).toHaveLength(1)
      expect(svc.getPersona().name).toBe('旧助手')
      expect(svc.getPersona().id).toBe('default')
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  })
})
