import { join } from 'path'
import { JsonStore, newId } from '../db/store'
import type { CalendarEvent, EventRange } from '../../shared/types'

interface ScheduleShape {
  events: CalendarEvent[]
}

export class ScheduleService {
  private store: JsonStore<ScheduleShape>
  private readonly onChange?: () => void

  constructor(dataDir: string, onChange?: () => void) {
    this.store = new JsonStore<ScheduleShape>(join(dataDir, 'schedule.json'), () => ({ events: [] }))
    this.onChange = onChange
  }

  async load(): Promise<void> {
    await this.store.load()
  }

  private emit(): void {
    this.onChange?.()
  }

  all(): CalendarEvent[] {
    return [...this.store.read().events].sort((a, b) => a.startAt - b.startAt)
  }

  list(range: EventRange): CalendarEvent[] {
    return this.all().filter(
      (e) =>
        (range.from === undefined || e.startAt >= range.from) &&
        (range.to === undefined || e.startAt <= range.to)
    )
  }

  get(id: string): CalendarEvent | undefined {
    return this.store.read().events.find((e) => e.id === id)
  }

  create(input: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): CalendarEvent {
    const now = Date.now()
    const ev: CalendarEvent = { ...input, id: newId(), createdAt: now, updatedAt: now }
    this.store.update((d) => {
      d.events.push(ev)
    })
    this.emit()
    return ev
  }

  update(id: string, patch: Partial<CalendarEvent>): CalendarEvent | null {
    let updated: CalendarEvent | null = null
    this.store.update((d) => {
      const idx = d.events.findIndex((e) => e.id === id)
      if (idx === -1) return
      updated = { ...d.events[idx], ...patch, id, updatedAt: Date.now() }
      d.events[idx] = updated
    })
    if (updated) this.emit()
    return updated
  }

  remove(id: string): boolean {
    let removed = false
    this.store.update((d) => {
      const before = d.events.length
      d.events = d.events.filter((e) => e.id !== id)
      removed = d.events.length !== before
    })
    if (removed) this.emit()
    return removed
  }
}
