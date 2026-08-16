import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const ITEM_HEIGHT = 32

interface Props {
  value: { hour: number; minute: number }
  onChange: (hour: number, minute: number) => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export default function TimePicker({ value, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const hourColRef = useRef<HTMLDivElement>(null)
  const minuteColRef = useRef<HTMLDivElement>(null)

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(true)
  }

  // 打开时把当前值滚动到居中。
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      hourColRef.current?.scrollTo({ top: value.hour * ITEM_HEIGHT })
      minuteColRef.current?.scrollTo({ top: value.minute * ITEM_HEIGHT })
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 点击外部关闭。
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 窗口缩放时关闭，避免错位。
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [open])

  const handleScroll = (kind: 'hour' | 'minute'): void => {
    const el = kind === 'hour' ? hourColRef.current : minuteColRef.current
    if (!el) return
    const max = kind === 'hour' ? 23 : 59
    const idx = Math.min(max, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)))
    if (kind === 'hour' && idx !== value.hour) onChange(idx, value.minute)
    if (kind === 'minute' && idx !== value.minute) onChange(value.hour, idx)
  }

  const selectItem = (kind: 'hour' | 'minute', idx: number): void => {
    const el = kind === 'hour' ? hourColRef.current : minuteColRef.current
    el?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' })
    if (kind === 'hour') onChange(idx, value.minute)
    else onChange(value.hour, idx)
  }

  return (
    <div className="time-picker">
      <button ref={btnRef} type="button" className="time-picker-btn" onClick={toggle}>
        {pad(value.hour)}:{pad(value.minute)}
      </button>
      {open &&
        pos &&
        createPortal(
          <div className="time-picker-pop" ref={popRef} style={{ top: pos.top, left: pos.left }}>
            <div className="time-picker-cols">
              <div className="time-picker-col" ref={hourColRef} onScroll={() => handleScroll('hour')}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className={`time-picker-item${h === value.hour ? ' active' : ''}`}
                    onClick={() => selectItem('hour', h)}
                  >
                    {pad(h)}
                  </div>
                ))}
              </div>
              <div className="time-picker-col" ref={minuteColRef} onScroll={() => handleScroll('minute')}>
                {MINUTES.map((m) => (
                  <div
                    key={m}
                    className={`time-picker-item${m === value.minute ? ' active' : ''}`}
                    onClick={() => selectItem('minute', m)}
                  >
                    {pad(m)}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
