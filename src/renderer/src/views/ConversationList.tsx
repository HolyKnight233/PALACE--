import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Conversation } from '../../../shared/types'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete
}: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const commitRename = (): void => {
    if (renamingId) onRename(renamingId, renameText.trim() || '新对话')
    setRenamingId(null)
  }

  return (
    <div className="conv-panel">
      <div className="conv-panel-header" onClick={() => setCollapsed((v) => !v)}>
        <span className="conv-panel-title">对话列表</span>
        <span className="conv-panel-toggle">{collapsed ? '▸' : '▾'}</span>
      </div>

      {!collapsed && (
        <div className="conv-panel-body">
          <button className="btn btn-primary conv-new" onClick={onNew}>
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
    </div>
  )
}
