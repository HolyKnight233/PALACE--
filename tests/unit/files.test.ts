import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FileService } from '../../src/main/services/files'
import JSZip from 'jszip'

describe('FileService', () => {
  it('readText 读取文本文件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-files-'))
    try {
      const p = join(dir, 'a.txt')
      writeFileSync(p, '你好，世界', 'utf8')
      const svc = new FileService()
      expect(await svc.readText(p)).toBe('你好，世界')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('readText 文件不存在时报错', async () => {
    const svc = new FileService()
    await expect(svc.readText('Z:/不存在的文件.txt')).rejects.toThrow(/不存在/)
  })

  it('readText 二进制文件报错', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-files-'))
    try {
      const p = join(dir, 'bin.dat')
      writeFileSync(p, Buffer.from([0x00, 0x01, 0xff, 0xfe]))
      const svc = new FileService()
      await expect(svc.readText(p)).rejects.toThrow(/UTF-8/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writeText 写入并回读（自动创建父目录）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-files-'))
    try {
      const p = join(dir, 'sub', 'b.txt')
      const svc = new FileService()
      await svc.writeText(p, '内容')
      expect(readFileSync(p, 'utf8')).toBe('内容')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('listDir 列出目录条目', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-files-'))
    try {
      writeFileSync(join(dir, 'a.txt'), 'x')
      const svc = new FileService()
      expect(await svc.listDir(dir)).toContain('a.txt')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('docx 写入后读回（标题/列表/段落）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-docx-'))
    try {
      const p = join(dir, 'a.docx')
      const svc = new FileService()
      await svc.writeText(p, '# 标题\n- 项目一\n- 项目二\n普通段落')
      const text = await svc.readText(p)
      expect(text).toContain('标题')
      expect(text).toContain('项目一')
      expect(text).toContain('项目二')
      expect(text).toContain('普通段落')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('xlsx 写入后读回（TSV 行列）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-xlsx-'))
    try {
      const p = join(dir, 'a.xlsx')
      const svc = new FileService()
      await svc.writeText(p, '姓名\t年龄\n张三\t30\n李四\t25')
      const text = await svc.readText(p)
      expect(text).toContain('【工作表：Sheet1】')
      expect(text).toContain('姓名\t年龄')
      expect(text).toContain('张三\t30')
      expect(text).toContain('李四\t25')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('csv 写入后读回（逗号与引号字段）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-csv-'))
    try {
      const p = join(dir, 'a.csv')
      const svc = new FileService()
      await svc.writeText(p, '姓名\t备注\n张三\t你好, 世界\n李四\t他说"嗨"')
      const text = await svc.readText(p)
      expect(text).toContain('姓名\t备注')
      expect(text).toContain('张三\t你好, 世界')
      expect(text).toContain('李四\t他说"嗨"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('csv 读取含换行的引号字段', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-csv2-'))
    try {
      const p = join(dir, 'b.csv')
      writeFileSync(p, '名称,内容\n"第一行\n第二行",abc\n', 'utf8')
      const svc = new FileService()
      const text = await svc.readText(p)
      expect(text).toContain('第一行\n第二行\tabc')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pdf 写入后读回（中文）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-pdf-'))
    try {
      const p = join(dir, 'a.pdf')
      const svc = new FileService()
      await svc.writeText(p, '# 标题\n普通段落内容')
      const text = await svc.readText(p)
      expect(text).toContain('标题')
      expect(text).toContain('普通段落内容')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('zip 列出并解压', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-zip-'))
    try {
      const zip = new JSZip()
      zip.file('a.txt', '内容A')
      zip.file('sub/b.txt', '内容B')
      const zipPath = join(dir, 'x.zip')
      writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))

      const svc = new FileService()
      const listing = await svc.listZip(zipPath)
      expect(listing).toContain('a.txt')
      expect(listing).toContain('sub/b.txt')

      const msg = await svc.extractZip(zipPath)
      expect(msg).toContain('已解压')
      expect(readFileSync(join(dir, 'x', 'a.txt'), 'utf8')).toBe('内容A')
      expect(readFileSync(join(dir, 'x', 'sub', 'b.txt'), 'utf8')).toBe('内容B')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('zip 解压拒绝目录穿越（zip-slip）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-zipslip-'))
    try {
      const zip = new JSZip()
      zip.file('../evil.txt', 'x')
      const zipPath = join(dir, 'bad.zip')
      writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))
      const svc = new FileService()
      await expect(svc.extractZip(zipPath)).rejects.toThrow(/不安全/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('search 按名字与按内容', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-search-'))
    try {
      writeFileSync(join(dir, 'report-2026.txt'), '今天完成日程整理\n明天继续')
      writeFileSync(join(dir, 'other.md'), '# 笔记\n无关内容')
      mkdirSync(join(dir, 'sub'), { recursive: true })
      writeFileSync(join(dir, 'sub', 'report-2025.txt'), '去年日程')
      const svc = new FileService()

      const byName = await svc.search(dir, 'report', 'name')
      expect(byName).toContain('report-2026.txt')
      expect(byName).toContain('report-2025.txt')
      expect(byName).not.toContain('other.md')

      const byContent = await svc.search(dir, '日程', 'content')
      expect(byContent).toContain('report-2026.txt')
      expect(byContent).toContain('report-2025.txt')
      expect(byContent).not.toContain('other.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
