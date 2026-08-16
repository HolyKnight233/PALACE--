import { useEffect, useRef, useState } from 'react'
import { Pause, Pencil, Pin, PinOff, Play, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import type { PomodoroPreset, PomodoroState } from '../../../shared/types'
import Dropdown from './Dropdown'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PomodoroWindow(): React.JSX.Element {
  const [presets, setPresets] = useState<PomodoroPreset[]>([])
  const [activeId, setActiveId] = useState('')
  const [phase, setPhase] = useState<'work' | 'break'>('work')
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  const [cycle, setCycle] = useState(0)
  const [showEdit, setShowEdit] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [motto, setMotto] = useState<{ personaName: string; motto: string }>({ personaName: '', motto: '' })
  const [showMotto, setShowMotto] = useState(true)
  const [hasPersona, setHasPersona] = useState(false)
  const [pinned, setPinned] = useState(false)

  const [name, setName] = useState('')
  const [workMinutes, setWorkMinutes] = useState('25')
  const [breakMinutes, setBreakMinutes] = useState('5')
  const [loopCount, setLoopCount] = useState('4')

  const activeRef = useRef<PomodoroPreset | null>(null)
  const showMottoRef = useRef(true)
  const lastPersonaIdRef = useRef<string | null>(null)
  const loadedRef = useRef(false)

  const refreshMotto = async (): Promise<void> => {
    if (!showMottoRef.current || !lastPersonaIdRef.current) return
    setMotto(await window.agentApi.generateMotto())
  }

  const togglePin = (): void => {
    const next = !pinned
    setPinned(next)
    void window.agentApi.pomodoroWindow.setAlwaysOnTop(next)
  }

  const load = async (): Promise<void> => {
    const ps = await window.agentApi.getPomodoros()
    const act = await window.agentApi.getActivePomodoro()
    setPresets(ps)
    setActiveId(act.id)
    activeRef.current = act
    const s = await window.agentApi.getSettings()
    const show = s.pomodoroShowMotto ?? true
    setShowMotto(show)
    showMottoRef.current = show
    const ctx = await window.agentApi.getPomodoroContext()
    document.documentElement.style.setProperty('--accent', ctx.color)
    lastPersonaIdRef.current = ctx.personaId
    const has = ctx.personaId !== null
    setHasPersona(has)
    loadedRef.current = true
    // 没有选中对话（无角色）时不显示格言区域，窗口下方削去一部分。
    void window.agentApi.setPomodoroCompact(!(show && has))
    setPinned(await window.agentApi.pomodoroWindow.isAlwaysOnTop())
    if (ctx.personaId && showMottoRef.current) void refreshMotto()
  }

  useEffect(() => {
    void load()
    const off = window.agentApi.onPomodoroChanged(() => void load())
    const t = setInterval(() => void refreshMotto(), 5 * 60 * 1000)
    return () => {
      off()
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 计时状态由主进程驱动：订阅状态推送，并在挂载时拉取一次初始状态。
  useEffect(() => {
    const apply = (st: PomodoroState): void => {
      setRunning(st.running)
      setPhase(st.phase)
      setRemaining(st.remainingSeconds)
      setCycle(st.cycle)
    }
    void window.agentApi.getPomodoroState().then(apply)
    return window.agentApi.onPomodoroState(apply)
  }, [])

  // 当「显示格言」或「是否选中对话」变化时，同步窗口高度（有无格言区域）。
  useEffect(() => {
    if (!loadedRef.current) return
    void window.agentApi.setPomodoroCompact(!(showMotto && hasPersona))
  }, [showMotto, hasPersona])

  const selectPreset = async (id: string): Promise<void> => {
    await window.agentApi.setActivePomodoro(id)
    await window.agentApi.pomodoroReset()
  }

  const createPreset = async (): Promise<void> => {
    await window.agentApi.createPomodoro()
    await window.agentApi.pomodoroReset()
  }

  const deletePreset = async (): Promise<void> => {
    if (presets.length <= 1) return
    await window.agentApi.deletePomodoro(activeId)
    await window.agentApi.pomodoroReset()
  }

  const openEdit = (): void => {
    const a = activeRef.current
    if (a) {
      setName(a.name)
      setWorkMinutes(String(a.workMinutes))
      setBreakMinutes(String(a.breakMinutes))
      setLoopCount(String(a.loopCount))
    }
    setShowEdit(true)
  }

  const saveEdit = async (): Promise<void> => {
    const a = activeRef.current
    if (a) {
      await window.agentApi.savePomodoro({
        ...a,
        name: name.trim() || a.name,
        workMinutes: Number(workMinutes) || 25,
        breakMinutes: Number(breakMinutes) || 5,
        loopCount: Number(loopCount) || 0
      })
    }
    setShowEdit(false)
    await window.agentApi.pomodoroReset()
  }

  const handleReset = (): void => {
    void window.agentApi.pomodoroReset()
  }

  useEffect(() => {
    const off = window.agentApi.onThemeChanged((payload) => {
      document.documentElement.style.setProperty('--accent', payload.color)
      setHasPersona(payload.personaId !== null)
      if (payload.personaId !== lastPersonaIdRef.current) {
        lastPersonaIdRef.current = payload.personaId
        if (payload.personaId) void refreshMotto()
      }
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pomodoro-shell">
      <div className="pomodoro-window">
        <div className="pomodoro-titlebar">
        <span className="pomodoro-window-title">番茄钟</span>
        <div className="pomodoro-window-controls">
          <button
            className={`pomodoro-win-btn${pinned ? ' pinned' : ''}`}
            onClick={togglePin}
            title={pinned ? '取消置顶' : '置顶'}
          >
            {pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button
            className="pomodoro-win-btn"
            onClick={() => void window.agentApi.pomodoroWindow.minimize()}
            title="最小化"
          >
            ─
          </button>
          <button className="pomodoro-win-btn close" onClick={() => setShowConfirm(true)} title="关闭">
            ×
          </button>
        </div>
      </div>

      <div className="pomodoro-body">
        <div className="pomodoro-presets">
          <Dropdown
            value={activeId}
            options={presets.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(id) => void selectPreset(id)}
          />
          <button className="pomodoro-preset-btn" onClick={() => void createPreset()} title="新建预设">
            <Plus size={15} />
          </button>
          <button className="pomodoro-preset-btn" onClick={openEdit} title="编辑">
            <Pencil size={15} />
          </button>
          <button className="pomodoro-preset-btn danger" disabled={presets.length <= 1} onClick={() => void deletePreset()} title="删除">
            <Trash2 size={15} />
          </button>
        </div>

        <div className="pomodoro-display">
          <div className="pomodoro-phase">{phase === 'work' ? '工作' : '休息'}</div>
          <div className="pomodoro-time">{fmt(remaining)}</div>
          <div className="pomodoro-cycle">第 {cycle + 1} 轮</div>
        </div>

        <div className="pomodoro-controls">
          <button className="pomodoro-icon-btn" onClick={handleReset} title="重置">
            <RotateCcw size={20} />
          </button>
          <button className="pomodoro-play-btn" onClick={() => void window.agentApi.pomodoroToggle()} title={running ? '暂停' : '开始'}>
            {running ? (
              <Pause size={26} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={26} fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>

        {showMotto && hasPersona && (
          <div className="pomodoro-motto">
            <span className="pomodoro-motto-text">
              {motto.motto
                ? motto.personaName
                  ? `${motto.personaName}：${motto.motto}`
                  : motto.motto
                : ''}
            </span>
            <button className="pomodoro-motto-refresh" onClick={() => void refreshMotto()} title="换一句">
              <RotateCw size={14} />
            </button>
          </div>
        )}

        {showEdit && (
          <div className="form pomodoro-edit">
            <div className="field">
              <label>预设名称</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>工作时长（分钟）</label>
                <input className="input" type="number" min="1" value={workMinutes} onChange={(e) => setWorkMinutes(e.target.value)} />
              </div>
              <div className="field">
                <label>休息时长（分钟）</label>
                <input className="input" type="number" min="1" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>循环次数（0 = 无限循环）</label>
              <input className="input" type="number" min="0" value={loopCount} onChange={(e) => setLoopCount(e.target.value)} />
            </div>
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => void saveEdit()}>
                保存预设
              </button>
              <button className="btn" onClick={() => setShowEdit(false)}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>

        {showConfirm && (
          <>
            <div className="pomodoro-confirm-overlay" onClick={() => setShowConfirm(false)} />
            <div className="pomodoro-confirm">
              <div className="pomodoro-confirm-title">关闭番茄钟</div>
              <div className="pomodoro-confirm-text">确定要关闭番茄钟吗？你可以在主窗口右下角点击番茄按钮重新打开。</div>
              <div className="pomodoro-confirm-actions">
                <button className="btn btn-primary" onClick={() => void window.agentApi.pomodoroWindow.close()}>
                  确定关闭
                </button>
                <button className="btn" onClick={() => setShowConfirm(false)}>
                  取消
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
