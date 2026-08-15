import { useEffect, useState } from 'react'
import type { CalendarEvent } from '../../../shared/types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmt(epoch: number): string {
  const d = new Date(epoch)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  onAdd: () => void
  onEdit: (event: CalendarEvent) => void
}

export default function ScheduleList({ onAdd, onEdit }: Props): React.JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>([])

  const reload = (): void => {
    void window.agentApi.listEvents({}).then(setEvents)
  }

  useEffect(() => {
    reload()
    const off = window.agentApi.onScheduleChanged(() => reload())
    return off
  }, [])

  return (
    <div className="schedule-section">
      <div className="card">
        <div className="section-title">日程</div>
        {events.length === 0 ? (
          <div className="empty">暂无日程</div>
        ) : (
          <div className="event-list">
            {events.map((e) => (
              <div key={e.id} className="event-item">
                <div className="event-time">{fmt(e.startAt)}</div>
                <div className="event-title">
                  <div>{e.title}</div>
                  {e.location && <div className="event-meta">{e.location}</div>}
                </div>
                <button className="btn" onClick={() => onEdit(e)}>
                  详情
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-primary" onClick={onAdd}>
        添加日程
      </button>
    </div>
  )
}
