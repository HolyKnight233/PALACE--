import { describe, expect, it } from 'vitest'
import { toApiMessages } from '../../src/main/agent/messages'
import type { ChatMessage } from '../../src/shared/types'

function make(partial: Omit<ChatMessage, 'conversationId' | 'createdAt'>): ChatMessage {
  return { conversationId: 'c1', createdAt: 0, ...partial }
}

describe('toApiMessages', () => {
  it('prepends the system message', () => {
    const out = toApiMessages([], 'SYS')
    expect(out[0]).toEqual({ role: 'system', content: 'SYS' })
  })

  it('converts user/assistant/tool messages to the wire format', () => {
    const history: ChatMessage[] = [
      make({ id: '1', role: 'user', content: 'hi' }),
      make({ id: '2', role: 'assistant', content: 'hello', toolCalls: [{ id: 'tc1', name: 'clock_now', arguments: {} }] }),
      make({ id: '3', role: 'tool', toolCallId: 'tc1', content: 'result' })
    ]
    const out = toApiMessages(history, 'SYS')
    expect(out).toHaveLength(4)
    expect(out[1]).toEqual({ role: 'user', content: 'hi' })
    expect(out[2].role).toBe('assistant')
    expect(out[2].tool_calls).toEqual([{ id: 'tc1', type: 'function', function: { name: 'clock_now', arguments: '{}' } }])
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: 'tc1', content: 'result' })
  })

  it('drops leading orphaned tool messages', () => {
    const history: ChatMessage[] = [
      make({ id: '1', role: 'tool', toolCallId: 'x', content: 'orphan' }),
      make({ id: '2', role: 'user', content: 'hi' })
    ]
    const out = toApiMessages(history, 'SYS')
    expect(out).toHaveLength(2)
    expect(out[1].role).toBe('user')
  })

  it('truncates long history to the most recent messages', () => {
    const history: ChatMessage[] = Array.from({ length: 50 }, (_, i) =>
      make({ id: `${i}`, role: 'user', content: `m${i}` })
    )
    const out = toApiMessages(history, 'SYS')
    expect(out).toHaveLength(31)
    expect(out[1].content).toBe('m20')
  })
})
