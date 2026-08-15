import { formatDateTime } from '../util/datetime'
import type { ScheduleService } from './schedule'

export class ReminderService {
  private timer: NodeJS.Timeout | null = null
  private readonly reminded = new Set<string>()

  constructor(
    private readonly schedule: ScheduleService,
    private readonly notify: (title: string, body: string) => void
  ) {}

  start(): void {
    if (this.timer) return
    this.tick()
    this.timer = setInterval(() => this.tick(), 30000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    const now = Date.now()
    for (const ev of this.schedule.all()) {
      if (!ev.reminderMinutes || ev.reminderMinutes <= 0) continue
      const fireAt = ev.startAt - ev.reminderMinutes * 60000
      const key = `${ev.id}:${fireAt}`
      if (this.reminded.has(key)) continue
      if (now >= fireAt && now < fireAt + 60000) {
        this.reminded.add(key)
        this.notify(ev.title, `「${ev.title}」将在 ${ev.reminderMinutes} 分钟后开始（${formatDateTime(ev.startAt)}）`)
      }
    }
  }
}
