import { useEffect, useState } from 'react'
import type { CalendarEvent } from '../../../shared/types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalInput(epoch: number): string {
  const d = new Date(epoch)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  event?: CalendarEvent
  /** 新增模式下默认的开始时间。 */
  initialStartAt?: number
  onBack: () => void
  onSaved: () => void
  onDeleted?: () => void
}

export default function ScheduleForm({ event, initialStartAt, onBack, onSaved, onDeleted }: Props): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [startStr, setStartStr] = useState(toLocalInput(initialStartAt ?? Date.now() + 3600000))
  const [duration, setDuration] = useState('60')
  const [reminder, setReminder] = useState('10')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)

  const isEdit = !!event

  useEffect(() => {
    if (!event) return
    setTitle(event.title)
    setStartStr(toLocalInput(event.startAt))
    setDuration(event.endAt ? String(Math.max(0, Math.round((event.endAt - event.startAt) / 60000))) : '0')
    setReminder(event.reminderMinutes ? String(event.reminderMinutes) : '0')
    setLocation(event.location ?? '')
  }, [event])

  const handleSave = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const startAt = new Date(startStr).getTime()
      const durationNum = Number(duration) || 0
      const reminderNum = Number(reminder) || 0
      const payload = {
        title: title.trim(),
        startAt,
        endAt: durationNum > 0 ? startAt + durationNum * 60000 : undefined,
        location: location.trim() || undefined,
        reminderMinutes: reminderNum > 0 ? reminderNum : undefined
      }
      if (isEdit && event) {
        await window.agentApi.updateEvent(event.id, payload)
      } else {
        await window.agentApi.createEvent(payload)
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!event || busy) return
    setBusy(true)
    try {
      await window.agentApi.deleteEvent(event.id)
      onDeleted?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="schedule-form">
      <div className="card">
        <div className="form-header">
          <button className="btn" onClick={onBack}>
            返回
          </button>
          <span className="form-header-title">{isEdit ? '修改日程' : '添加日程'}</span>
        </div>
        <div className="form">
          <div className="field">
            <label>标题</label>
            <input className="input" placeholder="例如：团队周会" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>开始时间</label>
            <input className="input" type="datetime-local" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>持续（分钟）</label>
              <input className="input" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="field">
              <label>提前提醒（分钟）</label>
              <input className="input" type="number" min="0" value={reminder} onChange={(e) => setReminder(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>地点（可选）</label>
            <input className="input" placeholder="例如：3 号会议室" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => void handleSave()}>
              {isEdit ? '保存修改' : '添加'}
            </button>
            {isEdit && (
              <button className="btn btn-danger" disabled={busy} onClick={() => void handleDelete()}>
                删除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
