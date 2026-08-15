import { describe, expect, it } from 'vitest'
import { selectHistory, toApiMessages } from '../../src/main/agent/messages'
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
})

describe('selectHistory (token budget + recent floor)', () => {
  it('keeps all short messages within the token budget', () => {
    const history: ChatMessage[] = Array.from({ length: 50 }, (_, i) =>
      make({ id: `${i}`, role: 'user', content: `m${i}` })
    )
    const { selected, dropped } = selectHistory(history)
    expect(selected).toHaveLength(50)
    expect(dropped).toHaveLength(0)
  })

  it('always keeps at least the most recent MIN_RECENT_MESSAGES when over budget', () => {
    // 每条超长中文消息 ≈ 2000 token，20 条远超 12K 预算。
    const long = '长'.repeat(2000)
    const history: ChatMessage[] = Array.from({ length: 20 }, (_, i) =>
      make({ id: `${i}`, role: 'user', content: long })
    )
    const { selected, dropped } = selectHistory(history)
    expect(selected.length).toBeGreaterThanOrEqual(12)
    expect(selected.length).toBeLessThan(20)
    expect(dropped.length).toBe(20 - selected.length)
    expect(dropped.length).toBeGreaterThan(0)
    // 最新一条永远保留在末尾。
    expect(selected[selected.length - 1].id).toBe('19')
  })
})
