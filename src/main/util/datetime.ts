import * as chrono from 'chrono-node'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatMonth(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/**
 * Parse a natural-language or ISO datetime string into a Date.
 * Falls back through Chinese parser -> English parser -> Date.parse.
 * Returns null when it cannot be understood.
 */
export function parseDateTime(text: string, ref?: Date): Date | null {
  const refDate = ref ?? new Date()
  const opts = { forwardDate: true }

  const zh = chrono.zh.casual.parse(text, refDate, opts)
  if (zh.length > 0) return zh[0].start.date()

  const en = chrono.en.casual.parse(text, refDate, opts)
  if (en.length > 0) return en[0].start.date()

  const t = Date.parse(text)
  return Number.isNaN(t) ? null : new Date(t)
}
