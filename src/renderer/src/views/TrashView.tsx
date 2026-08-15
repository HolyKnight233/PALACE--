import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Conversation, Persona } from '../../../shared/types'

function fmt(epoch: number): string {
  const d = new Date(epoch)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Confirm =
  | { kind: 'restore-conv' | 'purge-conv'; id: string; label: string }
  | { kind: 'restore-persona' | 'purge-persona'; id: string; label: string }

export default function TrashView(): React.JSX.Element {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const reload = (): void => {
    void window.agentApi.listTrash().then(setConvs)
    void window.agentApi.listTrashPersonas().then(setPersonas)
  }

  useEffect(() => {
    reload()
    const offChat = window.agentApi.onChatChanged(() => reload())
    const offPersona = window.agentApi.onPersonaChanged(() => reload())
    return () => {
      offChat()
      offPersona()
    }
  }, [])

  const runConfirm = async (): Promise<void> => {
    if (!confirm) return
    const { kind, id } = confirm
    if (kind === 'restore-conv') await window.agentApi.restoreConversation(id)
    else if (kind === 'purge-conv') await window.agentApi.purgeConversation(id)
    else if (kind === 'restore-persona') await window.agentApi.restorePersona(id)
    else if (kind === 'purge-persona') await window.agentApi.purgePersona(id)
    setConfirm(null)
    reload()
  }

  const confirmText = (): string => {
    if (!confirm) return ''
    switch (confirm.kind) {
      case 'restore-conv':
        return `确定恢复对话「${confirm.label}」吗？`
      case 'purge-conv':
        return `确定彻底删除对话「${confirm.label}」吗？此操作不可撤销。`
      case 'restore-persona':
        return `确定恢复角色「${confirm.label}」吗？恢复后，与该角色关联的对话会自动恢复正常。`
      case 'purge-persona':
        return `确定彻底删除角色「${confirm.label}」吗？此操作不可撤销。`
    }
  }

  return (
    <>
      <div className="trash-note">删除的角色和对话都保留 30 天，期间可恢复或彻底删除；到期自动清除。</div>

      <div className="section-title">角色</div>
      {personas.length === 0 ? (
        <div className="empty">暂无删除的角色</div>
      ) : (
        <div className="trash-list">
          {personas.map((p) => (
            <div key={p.id} className="trash-item">
              <div>
                <div className="trash-title">{p.name}</div>
                <div className="event-meta">删除于 {p.deletedAt ? fmt(p.deletedAt) : ''}</div>
              </div>
              <div className="row-actions">
                <button className="btn" onClick={() => setConfirm({ kind: 'restore-persona', id: p.id, label: p.name })}>
                  恢复
                </button>
                <button className="btn btn-danger" onClick={() => setConfirm({ kind: 'purge-persona', id: p.id, label: p.name })}>
                  彻底删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">对话</div>
      {convs.length === 0 ? (
        <div className="empty">暂无删除的对话</div>
      ) : (
        <div className="trash-list">
          {convs.map((c) => (
            <div key={c.id} className="trash-item">
              <div>
                <div className="trash-title">{c.title}</div>
                <div className="event-meta">删除于 {c.deletedAt ? fmt(c.deletedAt) : ''}</div>
              </div>
              <div className="row-actions">
                <button className="btn" onClick={() => setConfirm({ kind: 'restore-conv', id: c.id, label: c.title })}>
                  恢复
                </button>
                <button className="btn btn-danger" onClick={() => setConfirm({ kind: 'purge-conv', id: c.id, label: c.title })}>
                  彻底删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm &&
        createPortal(
          <>
            <div className="modal-overlay" onClick={() => setConfirm(null)} />
            <div className="modal">
              <div className="modal-header">
                <span className="modal-title">确认操作</span>
              </div>
              <div className="modal-body">
                <div className="hint">{confirmText()}</div>
                <div className="row-actions">
                  <button className="btn btn-primary" onClick={() => void runConfirm()}>
                    确定
                  </button>
                  <button className="btn" onClick={() => setConfirm(null)}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}
