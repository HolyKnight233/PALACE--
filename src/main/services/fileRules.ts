import { basename, extname } from 'path'
import { formatMonth } from '../util/datetime'
import type { OrganizeRule } from '../../shared/types'

export function sanitizeFolderName(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_').trim()
  return cleaned || 'other'
}

/**
 * Decide which subfolder a file should be moved into, or null when it should
 * be skipped. Pure and independent of the filesystem so it is easy to test.
 */
export function resolveSubfolder(rule: OrganizeRule, filePath: string, mtimeMs: number): string | null {
  switch (rule.mode) {
    case 'by-extension': {
      const ext = extname(filePath).replace(/^\./, '').toLowerCase()
      return ext ? sanitizeFolderName(ext) : 'no-extension'
    }
    case 'by-date':
      return formatMonth(mtimeMs)
    case 'by-name-pattern': {
      if (!rule.regexPattern) return 'matched'
      try {
        const m = basename(filePath).match(new RegExp(rule.regexPattern))
        if (!m) return null
        return m[1] ? sanitizeFolderName(m[1]) : 'matched'
      } catch {
        return null
      }
    }
    default:
      return null
  }
}
