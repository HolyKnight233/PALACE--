import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ChatService } from '../../src/main/services/chat'

const DAY = 24 * 60 * 60 * 1000

describe('ChatService trash lifecycle', () => {
  it('renames, trashes, restores, purges, and auto-expires conversations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-chat-'))
    try {
      const svc = new ChatService(dir)
      await svc.load()

      const id = svc.createConversation({ personaId: 'default', firstMessage: '第一条消息' }).id
      svc.appendMessage({ id: 'm1', conversationId: id, role: 'user', content: 'hi', createdAt: 1 })

      expect(svc.listConversations()).toHaveLength(1)
      expect(svc.listTrash()).toHaveLength(0)

      // rename
      svc.rename(id, '新标题')
      expect(svc.listConversations()[0].title).toBe('新标题')

      // trash (soft delete): hidden from active, kept in trash with messages intact
      svc.trash(id)
      expect(svc.listConversations()).toHaveLength(0)
      expect(svc.listTrash()).toHaveLength(1)
      expect(svc.getMessages(id)).toHaveLength(1)

      // restore
      svc.restore(id)
      expect(svc.listConversations()).toHaveLength(1)
      expect(svc.listTrash()).toHaveLength(0)

      // trash again, then purge explicitly
      svc.trash(id)
      svc.purge(id)
      expect(svc.listTrash()).toHaveLength(0)
      expect(svc.getMessages(id)).toHaveLength(0)

      // auto-expiry: still kept after 10 days, purged after 31 days
      const id2 = svc.createConversation({ personaId: 'default', firstMessage: '第二条' }).id
      svc.trash(id2)
      expect(svc.listTrash()).toHaveLength(1)

      svc.purgeExpired(Date.now() + 10 * DAY)
      expect(svc.listTrash()).toHaveLength(1)

      svc.purgeExpired(Date.now() + 31 * DAY)
      expect(svc.listTrash()).toHaveLength(0)
      expect(svc.getMessages(id2)).toHaveLength(0)
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  })

  it('emits onChange for list-affecting mutations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-chat-emit-'))
    try {
      let count = 0
      const svc = new ChatService(dir, () => {
        count++
      })
      await svc.load()

      const id = svc.createConversation({ personaId: 'default', firstMessage: 'x' }).id
      expect(count).toBe(1)

      svc.rename(id, 't')
      expect(count).toBe(2)

      svc.trash(id)
      expect(count).toBe(3)

      svc.restore(id)
      expect(count).toBe(4)

      svc.trash(id)
      expect(count).toBe(5)

      svc.purge(id)
      expect(count).toBe(6)
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  })
})
