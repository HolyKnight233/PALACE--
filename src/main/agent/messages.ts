import type { ApiMessage } from '../llm/openaiCompat'
import type { ChatMessage } from '../../shared/types'

export const MAX_HISTORY_MESSAGES = 30

/**
 * Convert persisted chat messages into the message list sent to an
 * OpenAI-compatible API, keeping the system prompt first.
 *
 * - Truncates very long histories to the most recent MAX_HISTORY_MESSAGES.
 * - Drops leading `tool` messages (they would be orphaned tool results).
 * - Serializes assistant tool calls back into the wire format.
 */
export function toApiMessages(history: ChatMessage[], system: string): ApiMessage[] {
  let recent = history.length > MAX_HISTORY_MESSAGES ? history.slice(-MAX_HISTORY_MESSAGES) : history
  while (recent.length > 0 && recent[0].role === 'tool') recent = recent.slice(1)

  const msgs: ApiMessage[] = [{ role: 'system', content: system }]
  for (const m of recent) {
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
