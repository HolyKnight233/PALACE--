import type { ConfigService } from '../config/config'
import type { PomodoroPreset, PomodoroState } from '../../shared/types'

/**
 * 番茄钟计时引擎（运行在主进程）。
 * 计时状态与倒计时逻辑都放在这里，使 Agent 工具与番茄钟窗口共用同一份状态，
 * 即使番茄钟窗口关闭，计时与通知仍能继续。
 */
export class PomodoroTimer {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private phase: 'work' | 'break' = 'work'
  private remaining = 0
  private cycle = 0

  constructor(
    private readonly config: ConfigService,
    private readonly onChange?: (state: PomodoroState) => void,
    private readonly onNotify?: (title: string, body: string) => void
  ) {
    this.loadActivePreset()
  }

  private preset(): PomodoroPreset {
    return this.config.getActivePomodoro()
  }

  private loadActivePreset(): void {
    const p = this.preset()
    this.phase = 'work'
    this.cycle = 0
    this.remaining = p.workMinutes * 60
    this.running = false
  }

  /** 重置到当前激活预设（工作阶段、第 0 轮）。 */
  reset(): void {
    this.stop()
    this.loadActivePreset()
    this.emit()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.ensureTimer()
    this.emit()
  }

  pause(): void {
    if (!this.running) return
    this.running = false
    this.stop()
    this.emit()
  }

  toggle(): void {
    if (this.running) this.pause()
    else this.start()
  }

  getState(): PomodoroState {
    return {
      running: this.running,
      phase: this.phase,
      remainingSeconds: this.remaining,
      cycle: this.cycle,
      presetName: this.preset().name
    }
  }

  // ---- 预设管理（委托给 ConfigService，并在影响当前预设时重置计时） ----

  listPresets(): PomodoroPreset[] {
    return this.config.getPomodoros()
  }

  getActivePreset(): PomodoroPreset {
    return this.config.getActivePomodoro()
  }

  /** 切换当前预设并重置计时；id 不存在时返回 null。 */
  setActivePreset(id: string): PomodoroPreset | null {
    const exists = this.config.getPomodoros().some((p) => p.id === id)
    if (!exists) return null
    const p = this.config.setActivePomodoro(id)
    this.reset()
    return p
  }

  /** 新建预设（设为当前），并重置计时。 */
  createPreset(opts?: { name?: string; workMinutes?: number; breakMinutes?: number; loopCount?: number }): PomodoroPreset {
    let p = this.config.createPomodoro()
    if (opts) {
      p = this.config.savePomodoro({
        ...p,
        name: opts.name && opts.name.trim() ? opts.name.trim() : p.name,
        workMinutes: opts.workMinutes ?? p.workMinutes,
        breakMinutes: opts.breakMinutes ?? p.breakMinutes,
        loopCount: opts.loopCount ?? p.loopCount
      })
    }
    this.reset()
    return p
  }

  /** 修改预设；若修改的是当前预设则重置计时。id 不存在时返回 null。 */
  updatePreset(
    id: string,
    patch: { name?: string; workMinutes?: number; breakMinutes?: number; loopCount?: number }
  ): PomodoroPreset | null {
    const cur = this.config.getPomodoros().find((p) => p.id === id)
    if (!cur) return null
    const updated = this.config.savePomodoro({
      ...cur,
      name: patch.name && patch.name.trim() ? patch.name.trim() : cur.name,
      workMinutes: patch.workMinutes ?? cur.workMinutes,
      breakMinutes: patch.breakMinutes ?? cur.breakMinutes,
      loopCount: patch.loopCount ?? cur.loopCount
    })
    if (this.config.getActivePomodoro().id === id) this.reset()
    return updated
  }

  /** 删除预设（至少保留一个）；若删的是当前预设则重置计时。返回删除后的当前预设或 null。 */
  deletePreset(id: string): PomodoroPreset | null {
    const presets = this.config.getPomodoros()
    if (presets.length <= 1) return null
    const target = presets.find((p) => p.id === id)
    if (!target) return null
    const wasActive = this.config.getActivePomodoro().id === id
    const active = this.config.deletePomodoro(id)
    if (wasActive) this.reset()
    return active
  }

  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 1000)
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (!this.running) return

    if (this.remaining > 1) {
      this.remaining -= 1
      this.emit()
      return
    }

    const p = this.preset()
    if (this.phase === 'work') {
      this.onNotify?.('番茄钟', '工作结束，开始休息')
      this.phase = 'break'
      this.remaining = p.breakMinutes * 60
    } else {
      const next = this.cycle + 1
      this.cycle = next
      const done = p.loopCount !== 0 && next >= p.loopCount
      if (done) {
        this.onNotify?.('番茄钟', '全部循环完成')
        this.running = false
        this.stop()
        this.remaining = 0
        this.emit()
        return
      }
      this.onNotify?.('番茄钟', '休息结束，开始工作')
      this.phase = 'work'
      this.remaining = p.workMinutes * 60
    }
    this.emit()
  }

  private emit(): void {
    this.onChange?.(this.getState())
  }
}
