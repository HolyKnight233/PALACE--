import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption {
  value: string
  label: string
}

interface Props {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export default function Dropdown({ value, options, onChange, disabled, className }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 窗口缩放时菜单位置会错位，直接关闭。
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('resize', close)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div className={`dropdown${className ? ` ${className}` : ''}`}>
      <button ref={btnRef} type="button" className="dropdown-btn" disabled={disabled} onClick={toggle}>
        <span className="dropdown-value">{selected?.label ?? ''}</span>
        <span className="dropdown-caret" />
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div className="dropdown-menu" ref={menuRef} style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}>
            {options.map((o) => (
              <div
                key={o.value}
                className={`dropdown-item${o.value === value ? ' active' : ''}`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
