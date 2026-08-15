import { useEffect, useRef, useState } from 'react'
import type { PomodoroPreset } from '../../../shared/types'
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

  const [name, setName] = useState('')
  const [workMinutes, setWorkMinutes] = useState('25')
  const [breakMinutes, setBreakMinutes] = useState('5')
  const [loopCount, setLoopCount] = useState('4')

  const activeRef = useRef<PomodoroPreset | null>(null)
  const phaseRef = useRef<'work' | 'break'>('work')
  const cycleRef = useRef(0)
  const remainingRef = useRef(0)
  const showMottoRef = useRef(true)
  const lastPersonaIdRef = useRef<string | null>(null)

  const reset = (p: PomodoroPreset): void => {
    activeRef.current = p
    phaseRef.current = 'work'
    cycleRef.current = 0
    remainingRef.current = p.workMinutes * 60
    setPhase('work')
    setCycle(0)
    setRemaining(p.workMinutes * 60)
    setRunning(false)
  }

  const refreshMotto = async (): Promise<void> => {
    if (!showMottoRef.current || !lastPersonaIdRef.current) return
    setMotto(await window.agentApi.generateMotto())
  }

  const load = async (): Promise<void> => {
    const ps = await window.agentApi.getPomodoros()
    const act = await window.agentApi.getActivePomodoro()
    setPresets(ps)
    setActiveId(act.id)
    reset(act)
    const s = await window.agentApi.getSettings()
    const show = s.pomodoroShowMotto ?? true
    setShowMotto(show)
    showMottoRef.current = show
    void window.agentApi.setPomodoroCompact(!show)
    const ctx = await window.agentApi.getPomodoroContext()
    document.documentElement.style.setProperty('--accent', ctx.color)
    lastPersonaIdRef.current = ctx.personaId
    setHasPersona(ctx.personaId !== null)
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

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      let r = remainingRef.current
      if (r > 1) {
        r -= 1
        remainingRef.current = r
        setRemaining(r)
        return
      }
      const act = activeRef.current
      if (!act) return
      if (phaseRef.current === 'work') {
        void window.agentApi.notify('番茄钟', '工作结束，开始休息')
        phaseRef.current = 'break'
        setPhase('break')
        r = act.breakMinutes * 60
      } else {
        const next = cycleRef.current + 1
        cycleRef.current = next
        setCycle(next)
        const done = act.loopCount !== 0 && next >= act.loopCount
        if (done) {
          void window.agentApi.notify('番茄钟', '全部循环完成')
          setRunning(false)
          setRemaining(0)
          remainingRef.current = 0
          return
        }
        void window.agentApi.notify('番茄钟', '休息结束，开始工作')
        phaseRef.current = 'work'
        setPhase('work')
        r = act.workMinutes * 60
      }
      remainingRef.current = r
      setRemaining(r)
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  const selectPreset = (id: string): void => {
    void window.agentApi.setActivePomodoro(id)
  }

  const createPreset = (): void => {
    void window.agentApi.createPomodoro()
  }

  const deletePreset = (): void => {
    if (presets.length > 1) void window.agentApi.deletePomodoro(activeId)
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
  }

  const handleReset = (): void => {
    const a = activeRef.current
    if (a) reset(a)
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
            onChange={selectPreset}
          />
          <button className="btn" onClick={createPreset}>
            新建预设
          </button>
          <button className="btn" onClick={openEdit}>
            编辑
          </button>
          <button className="btn btn-danger" disabled={presets.length <= 1} onClick={deletePreset}>
            删除
          </button>
        </div>

        <div className="pomodoro-display">
          <div className="pomodoro-phase">{phase === 'work' ? '工作' : '休息'}</div>
          <div className="pomodoro-time">{fmt(remaining)}</div>
          <div className="pomodoro-cycle">第 {cycle + 1} 轮</div>
        </div>

        <div className="pomodoro-controls">
          <button className="pomodoro-icon-btn" onClick={handleReset} title="重置">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button className="pomodoro-play-btn" onClick={() => setRunning((v) => !v)} title={running ? '暂停' : '开始'}>
            {running ? (
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {showMotto && (
          <div className="pomodoro-motto">
            <span className="pomodoro-motto-text">
              {hasPersona && motto.motto
                ? motto.personaName
                  ? `${motto.personaName}：${motto.motto}`
                  : motto.motto
                : ''}
            </span>
            {hasPersona && (
              <button className="pomodoro-motto-refresh" onClick={() => void refreshMotto()} title="换一句">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.6-6.3" />
                  <path d="M21 3v5h-5" />
                </svg>
              </button>
            )}
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
              <div className="hint">确定要关闭番茄钟吗？你可以在设置里重新打开。</div>
              <div className="row-actions">
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
