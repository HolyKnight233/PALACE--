import { describe, expect, it } from 'vitest'
import { formatDateTime, formatMonth, parseDateTime } from '../../src/main/util/datetime'

describe('parseDateTime', () => {
  // 2026-08-14 is a Friday.
  const ref = new Date(2026, 7, 14, 10, 0, 0)

  it('parses an ISO date', () => {
    const d = parseDateTime('2026-01-05', ref)
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(0)
    expect(d!.getDate()).toBe(5)
  })

  it('parses Chinese "明天下午三点"', () => {
    const d = parseDateTime('明天下午三点', ref)
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(15)
    expect(d!.getHours()).toBe(15)
  })

  it('parses Chinese "下周五"', () => {
    const d = parseDateTime('下周五', ref)
    expect(d).not.toBeNull()
    expect(d!.getDay()).toBe(5)
    expect(d!.getTime()).toBeGreaterThan(ref.getTime())
  })

  it('parses English "tomorrow 5pm"', () => {
    const d = parseDateTime('tomorrow 5pm', ref)
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(15)
    expect(d!.getHours()).toBe(17)
  })

  it('returns null for nonsense', () => {
    expect(parseDateTime('这不是时间', ref)).toBeNull()
  })
})

describe('formatMonth', () => {
  it('formats YYYY-MM', () => {
    expect(formatMonth(new Date(2026, 7, 14).getTime())).toBe('2026-08')
  })
})

describe('formatDateTime', () => {
  it('formats YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime(new Date(2026, 7, 14, 9, 5).getTime())).toBe('2026-08-14 09:05')
  })
})
