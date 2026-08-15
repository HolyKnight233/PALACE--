import type { ApiMessage } from '../llm/openaiCompat'
import type { ChatMessage } from '../../shared/types'

/** 历史消息的上下文预算（token 数，不含系统提示）。 */
export const MAX_CONTEXT_TOKENS = 12000
/** 无论 token 预算如何，至少保留最近多少条消息。 */
export const MIN_RECENT_MESSAGES = 12

export interface HistorySelection {
  /** 保留下来、将发给模型的消息（正序）。 */
  selected: ChatMessage[]
  /** 被裁剪掉的更早消息（正序，位于 selected 之前）。 */
  dropped: ChatMessage[]
}

/**
 * 粗略估算一段文本的 token 数（无 tiktoken 依赖）。
 * ASCII 字符按 4 字符 ≈ 1 token，其余（中日韩等）按 1 字符 ≈ 1 token。
 */
export function estimateTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    tokens += code <= 0x7f ? 0.25 : 1
  }
  return tokens
}

function estimateMessageTokens(m: ChatMessage): number {
  let total = estimateTokens(m.content ?? '')
  if (m.toolCallId) total += estimateTokens(m.toolCallId)
  if (m.toolCalls) {
    for (const tc of m.toolCalls) {
      total += estimateTokens(tc.name) + estimateTokens(JSON.stringify(tc.arguments))
    }
  }
  return total
}

/**
 * 从最新消息往前挑选，直到用满 token 预算；但无论如何至少保留最近 MIN_RECENT_MESSAGES 条。
 * 返回 selected（正序）与 dropped（正序的、更早被裁剪消息）。
 */
export function selectHistory(history: ChatMessage[]): HistorySelection {
  const collected: ChatMessage[] = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    if (collected.length >= MIN_RECENT_MESSAGES) {
      const cost = estimateMessageTokens(m)
      if (used + cost > MAX_CONTEXT_TOKENS) break
      used += cost
    }
    collected.push(m)
  }
  collected.reverse()
  const dropped = history.slice(0, history.length - collected.length)
  return { selected: collected, dropped }
}

/**
 * Convert persisted chat messages into the message list sent to an
 * OpenAI-compatible API, keeping the system prompt first.
 *
 * - Keeps at most MAX_CONTEXT_TOKENS of history, but always the latest
 *   MIN_RECENT_MESSAGES.
 * - Drops leading `tool` messages (they would be orphaned tool results).
 * - Serializes assistant tool calls back into the wire format.
 */
/** 把已选定的消息转成 wire 格式（去孤儿 tool + 序列化工具调用）。 */
export function messagesToApi(recent: ChatMessage[], system: string): ApiMessage[] {
  let head = recent
  while (head.length > 0 && head[0].role === 'tool') head = head.slice(1)

  const msgs: ApiMessage[] = [{ role: 'system', content: system }]
  for (const m of head) {
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const hasTools = !!m.toolCalls && m.toolCalls.length > 0
      msgs.push({
        role: 'assistant',
        content: m.content || null,
        ...(hasTools
          ? {
              tool_calls: m.toolCalls!.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
              }))
            }
          : {})
      })
    } else if (m.role === 'tool') {
      msgs.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    }
  }
  return msgs
}

export function toApiMessages(history: ChatMessage[], system: string): ApiMessage[] {
  return messagesToApi(selectHistory(history).selected, system)
}
