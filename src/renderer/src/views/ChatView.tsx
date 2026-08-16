import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  toolName?: string
  error?: boolean
}

interface Props {
  activeId: string | null
  title: string
  onCreated: (id: string) => void
  /** 该对话绑定的角色已被删除（在回收站中），对话失效。 */
  personaMissing?: boolean
}

const TIME_GAP_MS = 5 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function formatDividerTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (dayDiff <= 0) return hm
  if (dayDiff === 1) return `昨天 ${hm}`
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

function toolVerb(name: string): string {
  switch (name) {
    case 'file_read':
      return '查看文件'
    case 'file_write':
      return '写入文件'
    case 'file_list':
      return '浏览目录'
    case 'schedule_create':
      return '新建日程'
    case 'schedule_query':
      return '查询日程'
    case 'schedule_update':
      return '更新日程'
    case 'schedule_delete':
      return '删除日程'
    case 'clock_now':
      return '核对时间'
    default:
      return '处理'
  }
}

export default function ChatView({ activeId, title, onCreated, personaMissing = false }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolName, setToolName] = useState<string | null>(null)

  const activeIdRef = useRef<string | null>(activeId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isSwitchingRef = useRef(false)

  const loadMessages = useCallback(async (id: string): Promise<void> => {
    const msgs = await window.agentApi.getMessages(id)
    const display: DisplayMessage[] = msgs
      .filter((m) => m.role !== 'tool')
      .map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        createdAt: m.createdAt,
        toolName:
          m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0
            ? m.toolCalls.map((t) => toolVerb(t.name)).join('、')
            : undefined
      }))
    setMessages(display)
  }, [])

  // Switch conversation (from the left list). A just-created conversation is
  // already tracked by activeIdRef, so this skips resetting the live stream.
  useEffect(() => {
    if (activeId === activeIdRef.current) return
    activeIdRef.current = activeId
    isSwitchingRef.current = true
    setStreaming(false)
    setStreamingText('')
    setToolName(null)
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
        setToolName(ev.toolName ?? '')
      } else if (ev.type === 'done') {
        setStreaming(false)
        setStreamingText('')
        setToolName(null)
        if (activeIdRef.current) void loadMessages(activeIdRef.current)
      } else if (ev.type === 'error') {
        setStreaming(false)
        setStreamingText('')
        setToolName(null)
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: 'assistant', content: `出错了：${ev.error ?? '未知错误'}`, error: true, createdAt: Date.now() }
        ])
      }
    })
    return off
  }, [loadMessages])

  useEffect(() => {
    // 切换/加载对话时直接跳到底部（instant）；流式输出时才平滑跟随。
    const behavior: ScrollBehavior = isSwitchingRef.current ? 'auto' : 'smooth'
    isSwitchingRef.current = false
    bottomRef.current?.scrollIntoView({ behavior })
  }, [messages, streamingText, toolName])

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || streaming || personaMissing) return
    setInput('')
    setStreamingText('')
    setToolName(null)
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text, createdAt: Date.now() }])
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
        { id: `err-${Date.now()}`, role: 'assistant', content: `出错了：${String(err)}`, error: true, createdAt: Date.now() }
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
          {personaMissing && (
            <div className="persona-missing">
              <div className="persona-missing-title">该对话的角色已被删除</div>
              <div className="persona-missing-sub">对话已失效，无法继续发送消息。请到「设置 → 回收站」恢复该角色。</div>
            </div>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const showDivider = !prev || m.createdAt - prev.createdAt > TIME_GAP_MS
            return (
              <Fragment key={m.id}>
                {showDivider && <div className="time-divider">{formatDividerTime(m.createdAt)}</div>}
                <div className={`msg ${m.role}`}>
                  {m.content ? <div className={`bubble${m.error ? ' error-bubble' : ''}`}>{m.content}</div> : null}
                  {m.toolName && <div className="tool-note">已{m.toolName}</div>}
                </div>
              </Fragment>
            )
          })}

          {(streamingText || streaming) && (
            <div className="msg assistant">
              <div className="bubble">{streamingText || '思考中…'}</div>
              {toolName && <div className="tool-status">{`正在${toolVerb(toolName)}…`}</div>}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-inputbar">
          <input
            className="input"
            placeholder={personaMissing ? '该对话已失效' : ''}
            value={input}
            disabled={personaMissing}
            onChange={(e) => setInput(e.target.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const files = Array.from(e.dataTransfer.files)
              if (files.length === 0) return
              const path = window.agentApi.getPathForFile(files[0])
              if (path) {
                setInput((prev) => (prev ? `${prev} ${path}` : path))
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleSend()
            }}
          />
          {streaming ? (
            <button className="btn btn-danger" onClick={() => void handleStop()}>
              停止
            </button>
          ) : (
            <button className="btn btn-primary" disabled={personaMissing || !input.trim()} onClick={() => void handleSend()}>
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
