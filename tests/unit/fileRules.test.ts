import { describe, expect, it } from 'vitest'
import { resolveSubfolder, sanitizeFolderName } from '../../src/main/services/fileRules'

describe('sanitizeFolderName', () => {
  it('replaces path-unfriendly characters', () => {
    expect(sanitizeFolderName('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i')
  })

  it('falls back to "other" when blank', () => {
    expect(sanitizeFolderName('   ')).toBe('other')
  })
})

describe('resolveSubfolder by-extension', () => {
  it('maps a file extension to a folder', () => {
    expect(resolveSubfolder({ sourceFolder: 'C:/x', mode: 'by-extension' }, 'C:/x/report.PDF', 0)).toBe('pdf')
  })

  it('uses "no-extension" for files without an extension', () => {
    expect(resolveSubfolder({ sourceFolder: 'C:/x', mode: 'by-extension' }, 'C:/x/README', 0)).toBe('no-extension')
  })
})

describe('resolveSubfolder by-date', () => {
  it('maps mtime to YYYY-MM', () => {
    const mtime = new Date(2026, 7, 14).getTime()
    expect(resolveSubfolder({ sourceFolder: 'C:/x', mode: 'by-date' }, 'C:/x/a.txt', mtime)).toBe('2026-08')
  })
})

describe('resolveSubfolder by-name-pattern', () => {
  it('uses the first capture group', () => {
    expect(
      resolveSubfolder(
        { sourceFolder: 'C:/x', mode: 'by-name-pattern', regexPattern: '^报告-(\\d{4})' },
        'C:/x/报告-2025.txt',
        0
      )
    ).toBe('2025')
  })

  it('uses "matched" when there is no capture group', () => {
    expect(
      resolveSubfolder({ sourceFolder: 'C:/x', mode: 'by-name-pattern', regexPattern: '发票' }, 'C:/x/发票123.pdf', 0)
    ).toBe('matched')
  })

  it('returns null when the pattern does not match', () => {
    expect(
      resolveSubfolder({ sourceFolder: 'C:/x', mode: 'by-name-pattern', regexPattern: '^报告' }, 'C:/x/其他.txt', 0)
    ).toBeNull()
  })

  it('returns null for an invalid regex', () => {
    expect(
      resolveSubfolder({ sourceFolder: 'C:/x', mode: 'by-name-pattern', regexPattern: '(' }, 'C:/x/a.txt', 0)
    ).toBeNull()
  })
})
