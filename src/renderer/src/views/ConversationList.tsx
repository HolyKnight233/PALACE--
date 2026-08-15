import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Conversation, Persona } from '../../../shared/types'
import Dropdown from './Dropdown'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onStartConversation: (personaId: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onStartConversation,
  onRename,
  onDelete
}: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const [personas, setPersonas] = useState<Persona[]>([])

  const [showNewConv, setShowNewConv] = useState(false)
  const [newPersonaId, setNewPersonaId] = useState('')

  const loadPersonas = async (): Promise<void> => {
    const ps = await window.agentApi.getPersonas()
    setPersonas(ps)
  }

  useEffect(() => {
    void loadPersonas()
    const off = window.agentApi.onPersonaChanged(() => void loadPersonas())
    return off
  }, [])

  const commitRename = (): void => {
    if (renamingId) onRename(renamingId, renameText.trim() || '新对话')
    setRenamingId(null)
  }

  const openNew = (): void => {
    setNewPersonaId(personas[0]?.id ?? '')
    setShowNewConv(true)
  }

  const confirmNew = (): void => {
    onStartConversation(newPersonaId)
    setShowNewConv(false)
  }

  return (
    <div className="conv-panel">
      <div className="conv-panel-header" onClick={() => setCollapsed((v) => !v)}>
        <span className="conv-panel-title">对话列表</span>
        <span className="conv-panel-toggle">{collapsed ? '▸' : '▾'}</span>
      </div>

      {!collapsed && (
        <div className="conv-panel-body">
          <button className="btn btn-primary conv-new" onClick={openNew}>
            新建对话
          </button>
          <div className="conv-list">
            {conversations.map((c) =>
              renamingId === c.id ? (
                <input
                  key={c.id}
                  className="input"
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <div
                  key={c.id}
                  className={`conv-row${c.id === activeId ? ' active' : ''}`}
                  onClick={() => onSelect(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setCtxMenu({ x: e.clientX, y: e.clientY, id: c.id })
                  }}
                >
                  <span className="conv-row-title">{c.title}</span>
                  <span className="conv-row-role">{personas.find((p) => p.id === c.personaId)?.name ?? ''}</span>
                </div>
              )
            )}
            {conversations.length === 0 && <div className="conv-empty">暂无对话</div>}
          </div>
        </div>
      )}

      {ctxMenu &&
        createPortal(
          <>
            <div className="ctx-overlay" onClick={() => setCtxMenu(null)} />
            <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
              <div
                className="ctx-item"
                onClick={() => {
                  const cur = conversations.find((c) => c.id === ctxMenu.id)
                  setRenameText(cur?.title ?? '')
                  setRenamingId(ctxMenu.id)
                  setCtxMenu(null)
                }}
              >
                重命名
              </div>
              <div
                className="ctx-item ctx-danger"
                onClick={() => {
                  onDelete(ctxMenu.id)
                  setCtxMenu(null)
                }}
              >
                删除
              </div>
            </div>
          </>,
          document.body
        )}

      {showNewConv &&
        createPortal(
          <>
            <div className="modal-overlay" onClick={() => setShowNewConv(false)} />
            <div className="modal">
              <div className="modal-header">
                <span className="modal-title">开启新对话</span>
                <button className="btn" onClick={() => setShowNewConv(false)}>
                  关闭
                </button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label>对话角色</label>
                  <Dropdown
                    value={newPersonaId}
                    options={personas.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={setNewPersonaId}
                  />
                </div>
                <div className="row-actions">
                  <button className="btn btn-primary" onClick={confirmNew}>
                    开始对话
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
