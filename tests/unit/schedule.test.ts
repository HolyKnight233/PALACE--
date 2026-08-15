import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ScheduleService } from '../../src/main/services/schedule'

describe('ScheduleService onChange', () => {
  it('emits on create / update / remove, but not for no-op updates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-schedule-'))
    try {
      let count = 0
      const svc = new ScheduleService(dir, () => {
        count++
      })
      await svc.load()

      const ev = svc.create({ title: '开会', startAt: Date.now(), allDay: false })
      expect(count).toBe(1)

      svc.update(ev.id, { title: '改时间' })
      expect(count).toBe(2)

      svc.update('missing-id', { title: '不存在' })
      expect(count).toBe(2)

      svc.remove(ev.id)
      expect(count).toBe(3)
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  })
})
