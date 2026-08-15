import { useCallback, useEffect, useRef, useState } from 'react'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolName?: string
  error?: boolean
}

interface Props {
  activeId: string | null
  title: string
  onCreated: (id: string) => void
}

export default function ChatView({ activeId, title, onCreated }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolStatus, setToolStatus] = useState<{ name: string; result?: string } | null>(null)

  const activeIdRef = useRef<string | null>(activeId)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async (id: string): Promise<void> => {
    const msgs = await window.agentApi.getMessages(id)
    const display: DisplayMessage[] = msgs
      .filter((m) => m.role !== 'tool')
      .map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        toolName:
          m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0
            ? m.toolCalls.map((t) => t.name).join('、')
            : undefined
      }))
    setMessages(display)
  }, [])

  // Switch conversation (from the left list). A just-created conversation is
  // already tracked by activeIdRef, so this skips resetting the live stream.
  useEffect(() => {
    if (activeId === activeIdRef.current) return
    activeIdRef.current = activeId
    setStreaming(false)
    setStreamingText('')
    setToolStatus(null)
    if (activeId) {
      void loadMessages(activeId)
    } else {
      setMessages([])
    }
  }, [activeId, loadMessages])

  useEffect(() => {
    const off = window.agentApi.onChatEvent((ev) => {
      if (ev.conversationId !== activeIdRef.current) return
      if (ev.type === 'delta') {
        setStreaming(true)
        setStreamingText((prev) => prev + (ev.content ?? ''))
      } else if (ev.type === 'toolCall') {
        setToolStatus({ name: ev.toolName ?? '' })
      } else if (ev.type === 'toolResult') {
        setToolStatus({ name: ev.toolName ?? '', result: ev.toolResult })
      } else if (ev.type === 'done') {
        setStreaming(false)
        setStreamingText('')
        setToolStatus(null)
        if (activeIdRef.current) void loadMessages(activeIdRef.current)
      } else if (ev.type === 'error') {
        setStreaming(false)
        setStreamingText('')
        setToolStatus(null)
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: 'assistant', content: `出错了：${ev.error ?? '未知错误'}`, error: true }
        ])
      }
    })
    return off
  }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolStatus])

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setStreamingText('')
    setToolStatus(null)
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }])
    setStreaming(true)

    try {
      const { conversationId } = await window.agentApi.chatSend({
        conversationId: activeIdRef.current ?? undefined,
        message: text
      })
      activeIdRef.current = conversationId
      onCreated(conversationId)
    } catch (err) {
      setStreaming(false)
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: `出错了：${String(err)}`, error: true }
      ])
    }
  }

  const handleStop = async (): Promise<void> => {
    if (activeIdRef.current) await window.agentApi.chatStop(activeIdRef.current)
  }

  return (
    <div className="chat-view">
      <div className="chat-main">
        <div className="chat-header">
          <span className="chat-title">{title}</span>
        </div>

        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className={`bubble${m.error ? ' error-bubble' : ''}`}>{m.content}</div>
              {m.toolName && <div className="tool-note">已调用工具：{m.toolName}</div>}
            </div>
          ))}

          {(streamingText || streaming) && (
            <div className="msg assistant">
              <div className="bubble">{streamingText || '思考中…'}</div>
              {toolStatus && (
                <div className="tool-note">
                  {toolStatus.name}
                  {toolStatus.result ? `：${toolStatus.result}` : '…'}
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-inputbar">
          <input
            className="input"
            placeholder="输入消息，例如：明天下午三点提醒我开会"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleSend()
            }}
          />
          {streaming ? (
            <button className="btn btn-danger" onClick={() => void handleStop()}>
              停止
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!input.trim()} onClick={() => void handleSend()}>
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
