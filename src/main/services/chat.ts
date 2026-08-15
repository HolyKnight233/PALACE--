import { join } from 'path'
import { JsonStore, newId } from '../db/store'
import type { ChatMessage, Conversation } from '../../shared/types'

interface ChatShape {
  conversations: Conversation[]
  messages: ChatMessage[]
}

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export class ChatService {
  private store: JsonStore<ChatShape>
  private readonly onChange?: () => void

  constructor(dataDir: string, onChange?: () => void) {
    this.store = new JsonStore<ChatShape>(join(dataDir, 'chat.json'), () => ({
      conversations: [],
      messages: []
    }))
    this.onChange = onChange
  }

  async load(): Promise<void> {
    await this.store.load()
  }

  private emit(): void {
    this.onChange?.()
  }

  ensureConversation(id?: string, firstMessage?: string): string {
    if (id && this.store.read().conversations.some((c) => c.id === id && !c.deletedAt)) return id
    const convId = newId()
    const now = Date.now()
    const title = (firstMessage ?? '').trim().slice(0, 30) || '新对话'
    this.store.update((d) => {
      d.conversations.unshift({ id: convId, title, createdAt: now, updatedAt: now })
    })
    this.emit()
    return convId
  }

  appendMessage(msg: ChatMessage): void {
    this.store.update((d) => {
      d.messages.push(msg)
      const conv = d.conversations.find((c) => c.id === msg.conversationId)
      if (conv) conv.updatedAt = Date.now()
    })
  }

  getMessages(conversationId: string): ChatMessage[] {
    return this.store
      .read()
      .messages.filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /** Active (non-trashed) conversations, most recently updated first. */
  listConversations(): Conversation[] {
    return this.store
      .read()
      .conversations.filter((c) => !c.deletedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Trashed conversations, most recently deleted first. Also lazily purges expired. */
  listTrash(): Conversation[] {
    this.purgeExpired()
    return this.store
      .read()
      .conversations.filter((c) => c.deletedAt !== undefined)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  }

  rename(id: string, title: string): void {
    this.store.update((d) => {
      const c = d.conversations.find((x) => x.id === id)
      if (c) c.title = title
    })
    this.emit()
  }

  /** Move a conversation to the trash (soft delete). */
  trash(id: string): void {
    this.store.update((d) => {
      const c = d.conversations.find((x) => x.id === id)
      if (c) c.deletedAt = Date.now()
    })
    this.emit()
  }

  /** Restore a trashed conversation back to active. */
  restore(id: string): void {
    this.store.update((d) => {
      const c = d.conversations.find((x) => x.id === id)
      if (c) delete c.deletedAt
    })
    this.emit()
  }

  /** Permanently delete a conversation and its messages. */
  purge(id: string): void {
    this.store.update((d) => {
      d.conversations = d.conversations.filter((c) => c.id !== id)
      d.messages = d.messages.filter((m) => m.conversationId !== id)
    })
    this.emit()
  }

  /** Remove trashed conversations whose retention period has elapsed. */
  purgeExpired(now: number = Date.now()): void {
    const cutoff = now - TRASH_RETENTION_MS
    const expiredIds = new Set(
      this.store
        .read()
        .conversations.filter((c) => c.deletedAt !== undefined && c.deletedAt < cutoff)
        .map((c) => c.id)
    )
    if (expiredIds.size === 0) return
    this.store.update((d) => {
      d.conversations = d.conversations.filter((c) => !expiredIds.has(c.id))
      d.messages = d.messages.filter((m) => !expiredIds.has(m.conversationId))
    })
    this.emit()
  }
}
