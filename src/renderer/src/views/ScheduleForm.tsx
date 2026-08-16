import { useState } from 'react'
import type { CalendarEvent } from '../../../shared/types'
import TimePicker from './TimePicker'

function dayStart(epoch: number): number {
  const d = new Date(epoch)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function hm(epoch: number): { hour: number; minute: number } {
  const d = new Date(epoch)
  return { hour: d.getHours(), minute: d.getMinutes() }
}

interface Props {
  event?: CalendarEvent
  /** 新增模式下默认的开始时间（用于确定日期与默认时刻）。 */
  initialStartAt?: number
  onBack: () => void
  onSaved: () => void
  onDeleted?: () => void
}

export default function ScheduleForm({ event, initialStartAt, onBack, onSaved, onDeleted }: Props): React.JSX.Element {
  const isEdit = !!event
  const baseDate = dayStart(event?.startAt ?? initialStartAt ?? Date.now())

  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [startHour, setStartHour] = useState<number>(() => (event ? hm(event.startAt).hour : 9))
  const [startMinute, setStartMinute] = useState<number>(() => (event ? hm(event.startAt).minute : 0))
  const [endHour, setEndHour] = useState<number>(() => {
    if (event?.endAt) return hm(event.endAt).hour
    return (event ? hm(event.startAt).hour + 1 : 10) % 24
  })
  const [endMinute, setEndMinute] = useState<number>(() => (event?.endAt ? hm(event.endAt).minute : event ? hm(event.startAt).minute : 0))
  const [reminder, setReminder] = useState(event?.reminderMinutes ? String(event.reminderMinutes) : '0')
  const [busy, setBusy] = useState(false)

  const handleSave = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const startAt = baseDate + startHour * 3600000 + startMinute * 60000
      let endAt = baseDate + endHour * 3600000 + endMinute * 60000
      if (endAt <= startAt) endAt += 24 * 3600000
      const reminderNum = Number(reminder) || 0
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        startAt,
        endAt,
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
            <label>具体内容（可选）</label>
            <textarea className="textarea" placeholder="例如：讨论项目进度……" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>开始时间</label>
            <TimePicker
              value={{ hour: startHour, minute: startMinute }}
              onChange={(h, m) => {
                setStartHour(h)
                setStartMinute(m)
              }}
            />
          </div>
          <div className="field">
            <label>结束时间</label>
            <TimePicker
              value={{ hour: endHour, minute: endMinute }}
              onChange={(h, m) => {
                setEndHour(h)
                setEndMinute(m)
              }}
            />
          </div>
          <div className="field">
            <label>提前提醒（分钟）</label>
            <input className="input" type="number" min="0" value={reminder} onChange={(e) => setReminder(e.target.value)} />
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
