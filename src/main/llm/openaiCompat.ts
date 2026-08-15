import { newId } from '../db/store'

/** A message as expected by an OpenAI-compatible /chat/completions endpoint. */
export interface ApiMessage {
  role: string
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface StreamResult {
  content: string
  toolCalls: ToolCall[]
  finishReason: string
}

export interface StreamOptions {
  baseURL: string
  apiKey: string
  model: string
  temperature: number
  messages: ApiMessage[]
  tools?: ToolDef[]
  signal?: AbortSignal
  onDelta?: (text: string) => void
}

function buildUrl(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

/**
 * Stream a chat completion from an OpenAI-compatible API.
 * Accumulates both text content and tool calls, forwarding text deltas to onDelta.
 */
export async function streamChatCompletion(opts: StreamOptions): Promise<StreamResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature,
    stream: true
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }

  const resp = await fetch(buildUrl(opts.baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify(body),
    signal: opts.signal
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`LLM API ${resp.status}: ${text.slice(0, 500)}`)
  }
  if (!resp.body) throw new Error('LLM API returned an empty body')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const result: StreamResult = { content: '', toolCalls: [], finishReason: 'stop' }
  const toolCallAcc = new Map<number, { id: string; name: string; arguments: string }>()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      let json: { choices?: Array<Record<string, unknown>> }
      try {
        json = JSON.parse(data) as { choices?: Array<Record<string, unknown>> }
      } catch {
        continue
      }
      const choice = json.choices?.[0]
      if (!choice) continue
      const delta = (choice.delta ?? {}) as {
        content?: string
        tool_calls?: Array<{
          index?: number
          id?: string
          function?: { name?: string; arguments?: string }
        }>
      }
      if (typeof choice.finish_reason === 'string') result.finishReason = choice.finish_reason
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        result.content += delta.content
        opts.onDelta?.(delta.content)
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          const acc = toolCallAcc.get(idx) ?? { id: '', name: '', arguments: '' }
          if (tc.id) acc.id = tc.id
          if (tc.function?.name) acc.name += tc.function.name
          if (tc.function?.arguments) acc.arguments += tc.function.arguments
          toolCallAcc.set(idx, acc)
        }
      }
    }
  }

  for (const acc of toolCallAcc.values()) {
    if (acc.name) {
      result.toolCalls.push({
        id: acc.id || newId(),
        type: 'function',
        function: { name: acc.name, arguments: acc.arguments || '{}' }
      })
    }
  }
  return result
}

export interface PingResult {
  ok: boolean
  message: string
}

/** Minimal non-streaming request used to verify connectivity from settings. */
export async function pingLLM(opts: {
  baseURL: string
  apiKey: string
  model: string
}): Promise<PingResult> {
  try {
    const resp = await fetch(buildUrl(opts.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false
      }),
      signal: AbortSignal.timeout(20000)
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { ok: false, message: `HTTP ${resp.status}: ${text.slice(0, 300)}` }
    }
    return { ok: true, message: '连接成功' }
  } catch (err) {
    return { ok: false, message: (err as Error)?.message ?? String(err) }
  }
}
