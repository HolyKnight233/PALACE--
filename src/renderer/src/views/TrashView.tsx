import { useEffect, useState } from 'react'
import type { Conversation } from '../../../shared/types'

function fmt(epoch: number): string {
  const d = new Date(epoch)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TrashView(): React.JSX.Element {
  const [items, setItems] = useState<Conversation[]>([])

  const reload = (): void => {
    void window.agentApi.listTrash().then(setItems)
  }

  useEffect(() => {
    reload()
    const off = window.agentApi.onChatChanged(() => reload())
    return off
  }, [])

  const handleRestore = async (id: string): Promise<void> => {
    await window.agentApi.restoreConversation(id)
    reload()
  }

  const handlePurge = async (id: string): Promise<void> => {
    await window.agentApi.purgeConversation(id)
    reload()
  }

  return (
    <div className="trash-view">
      <div className="card">
        <div className="section-title">回收站</div>
        <div className="trash-note">删除的对话保留 30 天，期间可恢复或提前彻底删除；到期自动清除。</div>
        {items.length === 0 ? (
          <div className="empty">回收站是空的</div>
        ) : (
          <div className="trash-list">
            {items.map((c) => (
              <div key={c.id} className="trash-item">
                <div>
                  <div className="trash-title">{c.title}</div>
                  <div className="event-meta">删除于 {c.deletedAt ? fmt(c.deletedAt) : ''}</div>
                </div>
                <div className="row-actions">
                  <button className="btn" onClick={() => void handleRestore(c.id)}>
                    恢复
                  </button>
                  <button className="btn btn-danger" onClick={() => void handlePurge(c.id)}>
                    彻底删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
