import { newId } from '../db/store'
import type { ConfigService } from '../config/config'
import type { ChatService } from '../services/chat'
import type { ToolCall } from '../llm/openaiCompat'
import { streamChatCompletion } from '../llm/openaiCompat'
import type { ToolCallPart } from '../../shared/types'
import { buildSystemPrompt } from './systemPrompt'
import type { ToolContext, ToolRegistry } from './registry'
import { toApiMessages } from './messages'

export interface ChatSink {
  onDelta(text: string): void
  onToolCall(name: string): void
  onToolResult(name: string, result: string): void
}

const MAX_ITERATIONS = 6

export class AgentRunner {
  constructor(
    private readonly config: ConfigService,
    private readonly registry: ToolRegistry<ToolContext>,
    private readonly ctx: ToolContext,
    private readonly chat: ChatService
  ) {}

  async run(userMessage: string, conversationId: string, signal: AbortSignal, sink: ChatSink): Promise<void> {
    const persona = this.config.getPersona()
    const llm = this.config.getLLMConfig()
    if (!llm.apiKey) {
      throw new Error('尚未配置 API Key，请先到「设置」页填写并保存。')
    }

    this.chat.appendMessage({
      id: newId(),
      conversationId,
      role: 'user',
      content: userMessage,
      createdAt: Date.now()
    })

    const system = buildSystemPrompt(persona, this.registry.names())
    const tools = this.registry.toOpenAI()
    const apiMessages = toApiMessages(this.chat.getMessages(conversationId), system)

    let iteration = 0
    while (iteration < MAX_ITERATIONS) {
      iteration++
      if (signal.aborted) throw new Error('已停止')

      const result = await streamChatCompletion({
        baseURL: llm.baseURL,
        apiKey: llm.apiKey,
        model: llm.model,
        temperature: llm.temperature,
        messages: apiMessages,
        tools,
        signal,
        onDelta: (t) => sink.onDelta(t)
      })

      if (result.toolCalls.length === 0) {
        this.chat.appendMessage({
          id: newId(),
          conversationId,
          role: 'assistant',
          content: result.content,
          createdAt: Date.now()
        })
        return
      }

      // Persist the assistant message that requested tool calls.
      const toolParts: ToolCallPart[] = result.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments)
      }))
      this.chat.appendMessage({
        id: newId(),
        conversationId,
        role: 'assistant',
        content: result.content,
        toolCalls: toolParts,
        createdAt: Date.now()
      })
      apiMessages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls
      })

      // Execute each requested tool.
      for (const tc of result.toolCalls) {
        const resultText = await this.executeTool(tc, sink)
        this.chat.appendMessage({
          id: newId(),
          conversationId,
          role: 'tool',
          toolCallId: tc.id,
          content: resultText,
          createdAt: Date.now()
        })
        apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: resultText })
      }
    }

    const fallback = '（处理步骤较多，我先停下来了。请换个说法，或稍后再试。）'
    sink.onDelta(fallback)
    this.chat.appendMessage({
      id: newId(),
      conversationId,
      role: 'assistant',
      content: fallback,
      createdAt: Date.now()
    })
  }

  private async executeTool(tc: ToolCall, sink: ChatSink): Promise<string> {
    const tool = this.registry.get(tc.function.name)
    const args = safeParseArgs(tc.function.arguments)
    sink.onToolCall(tc.function.name)

    if (!tool) {
      const msg = `错误：不存在工具 ${tc.function.name}`
      sink.onToolResult(tc.function.name, msg)
      return msg
    }

    const parsed = tool.schema.safeParse(args)
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join('.') || '参数'}: ${i.message}`)
        .join('；')
      const msg = `参数错误：${details}`
      sink.onToolResult(tc.function.name, msg)
      return msg
    }

    try {
      const resultText = await tool.handler(parsed.data as Record<string, unknown>, this.ctx)
      sink.onToolResult(tc.function.name, resultText)
      return resultText
    } catch (err) {
      const msg = `工具执行出错：${(err as Error)?.message ?? String(err)}`
      sink.onToolResult(tc.function.name, msg)
      return msg
    }
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}
