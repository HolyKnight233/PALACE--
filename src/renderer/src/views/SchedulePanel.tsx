import { useEffect, useState } from 'react'
import type { CalendarEvent } from '../../../shared/types'
import ScheduleForm from './ScheduleForm'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtTime(epoch: number): string {
  const d = new Date(epoch)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

type Mode = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; event: CalendarEvent }

export default function SchedulePanel(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [selected, setSelected] = useState(new Date())
  const [viewMonth, setViewMonth] = useState(new Date())
  const [monthEvents, setMonthEvents] = useState<CalendarEvent[]>([])
  const [calendarOpen, setCalendarOpen] = useState(false)

  const reloadMonth = (): void => {
    const from = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getTime()
    const to = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1).getTime() - 1
    void window.agentApi.listEvents({ from, to }).then(setMonthEvents)
  }

  useEffect(() => {
    reloadMonth()
    const off = window.agentApi.onScheduleChanged(() => reloadMonth())
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth])

  const changeMonth = (delta: number): void => {
    const m = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1)
    setViewMonth(m)
    setSelected(new Date(m.getFullYear(), m.getMonth(), 1))
  }

  const selStart = dayStart(selected)
  const selEnd = selStart + 24 * 60 * 60 * 1000 - 1
  const dayEvents = monthEvents
    .filter((e) => e.startAt >= selStart && e.startAt <= selEnd)
    .sort((a, b) => a.startAt - b.startAt)

  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cells: Array<number | null> = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const hasEvent = (day: number): boolean => {
    const s = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day).getTime()
    return monthEvents.some((e) => e.startAt >= s && e.startAt < s + 24 * 60 * 60 * 1000)
  }

  const isSelected = (day: number): boolean =>
    selected.getFullYear() === viewMonth.getFullYear() &&
    selected.getMonth() === viewMonth.getMonth() &&
    selected.getDate() === day

  if (mode.kind === 'add') {
    return (
      <div className="schedule-panel">
        <ScheduleForm
          initialStartAt={selStart + 9 * 3600000}
          onBack={() => setMode({ kind: 'list' })}
          onSaved={() => setMode({ kind: 'list' })}
        />
      </div>
    )
  }

  if (mode.kind === 'edit') {
    return (
      <div className="schedule-panel">
        <ScheduleForm
          event={mode.event}
          onBack={() => setMode({ kind: 'list' })}
          onSaved={() => setMode({ kind: 'list' })}
          onDeleted={() => setMode({ kind: 'list' })}
        />
      </div>
    )
  }

  return (
    <div className="schedule-panel">
      <button className="btn btn-primary schedule-add" onClick={() => setMode({ kind: 'add' })}>
        添加日程
      </button>

      <div className="calendar-toggle" onClick={() => setCalendarOpen((v) => !v)}>
        <span>
          日历：{viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月
        </span>
        <span>{calendarOpen ? '▾' : '▸'}</span>
      </div>

      {calendarOpen && (
      <div className="calendar">
        <div className="calendar-header">
          <button className="btn" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <span className="calendar-title">
            {viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月
          </span>
          <button className="btn" onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
        <div className="calendar-weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((day, i) =>
            day === null ? (
              <span key={`e${i}`} className="calendar-cell empty" />
            ) : (
              <button
                key={day}
                className={`calendar-cell${isSelected(day) ? ' selected' : ''}`}
                onClick={() => setSelected(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day))}
              >
                <span className="calendar-day">{day}</span>
                {hasEvent(day) && <span className="calendar-dot" />}
              </button>
            )
          )}
        </div>
      </div>
      )}

      <div className="card">
        <div className="section-title">
          {selected.getMonth() + 1}月{selected.getDate()}日
        </div>
        {dayEvents.length === 0 ? (
          <div className="empty">当天暂无日程</div>
        ) : (
          <div className="event-list">
            {dayEvents.map((e) => (
              <div key={e.id} className="event-item">
                <div className="event-time">{fmtTime(e.startAt)}</div>
                <div className="event-title">{e.title}</div>
                <button className="btn" onClick={() => setMode({ kind: 'edit', event: e })}>
                  详情
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
