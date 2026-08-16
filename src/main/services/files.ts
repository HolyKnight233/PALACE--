import { promises as fs } from 'fs'
import { basename, dirname, extname, join, resolve, sep } from 'path'
import mammoth from 'mammoth'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { Workbook } from 'exceljs'
import PdfParse from 'pdf-parse/lib/pdf-parse.js'
import PDFDocument from 'pdfkit'
import JSZip from 'jszip'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_SEARCH_RESULTS = 50
const MAX_SEARCH_FILE_BYTES = 1024 * 1024
const MAX_EXTRACT_BYTES = 200 * 1024 * 1024
const MAX_EXTRACT_ENTRIES = 5000

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.log',
  '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.xml',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
  '.py', '.java', '.c', '.h', '.cpp', '.go', '.rs', '.rb', '.php',
  '.sh', '.ps1', '.bat', '.sql', '.vue', '.svelte'
])

/** 文件读写服务：纯 Node 实现，支持文本、Word、Excel、PDF、CSV 与 ZIP。 */
export class FileService {
  private cjkFont: Buffer | null = null

  /** 读取文件内容：按扩展名分发到文本 / Word / Excel / PDF / CSV。 */
  async readText(path: string): Promise<string> {
    let stat
    try {
      stat = await fs.stat(path)
    } catch {
      throw new Error(`文件不存在或无法访问：${path}`)
    }
    if (stat.isDirectory()) throw new Error(`这是一个目录，不是文件：${path}`)
    if (stat.size > MAX_FILE_BYTES) throw new Error(`文件过大（超过 20MB）：${path}`)

    const ext = extname(path).toLowerCase()
    if (ext === '.docx') return this.readDocx(path)
    if (ext === '.xlsx') return this.readXlsx(path)
    if (ext === '.pdf') return this.readPdf(path)
    if (ext === '.csv') return this.readCsv(path)

    const buf = await fs.readFile(path)
    const text = buf.toString('utf8')
    // 非法 UTF-8 字节会被替换为 U+FFFD，据此判断是否二进制。
    if (text.includes('\uFFFD')) {
      throw new Error(`无法读取：${path} 不是 UTF-8 文本文件（可能是二进制文件）。`)
    }
    return text
  }

  /** 写入文件：按扩展名分发到文本 / Word / Excel / CSV / PDF（覆盖；自动创建父目录）。 */
  async writeText(path: string, content: string): Promise<void> {
    const ext = extname(path).toLowerCase()
    if (ext === '.docx') {
      await this.writeDocx(path, content)
      return
    }
    if (ext === '.xlsx') {
      await this.writeXlsx(path, content)
      return
    }
    if (ext === '.csv') {
      await this.writeCsv(path, content)
      return
    }
    if (ext === '.pdf') {
      await this.writePdf(path, content)
      return
    }

    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, content, 'utf8')
  }

  /** 列出目录下的条目名（目录以 / 结尾）。 */
  async listDir(path: string): Promise<string[]> {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
  }

  /** 读取 Word(.docx) 的纯文本（图片不提取，表格单元格文字会包含）。 */
  async readDocx(path: string): Promise<string> {
    const result = await mammoth.extractRawText({ path })
    return result.value
  }

  /** 读取 Excel(.xlsx)：逐工作表输出，单元格按制表符分隔、逐行输出。 */
  async readXlsx(path: string): Promise<string> {
    const workbook = new Workbook()
    await workbook.xlsx.readFile(path)
    const parts: string[] = []
    workbook.eachSheet((sheet) => {
      parts.push(`【工作表：${sheet.name}】`)
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = []
        row.eachCell({ includeEmpty: false }, (cell) => {
          // 用 fullAddress.col（数值列号）保持列对齐（补足前面的空列）。
          const col = cell.fullAddress.col
          while (cells.length < col - 1) cells.push('')
          cells.push(cell.text)
        })
        // 去掉行尾连续的空列，避免无意义的尾随制表符。
        while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
        if (cells.length > 0) parts.push(cells.join('\t'))
      })
    })
    return parts.join('\n')
  }

  /** 读取 PDF 的纯文本（扫描件/图片型 PDF 会抽不到文字）。 */
  async readPdf(path: string): Promise<string> {
    const buf = await fs.readFile(path)
    const result = await PdfParse(buf)
    const text = result.text.trim()
    if (!text) return '（未能从该 PDF 提取到文字：可能是扫描件/图片型 PDF，需要 OCR。）'
    return text
  }

  /** 读取 CSV 并表格化：按 RFC4180 解析，输出「制表符分列、换行分行」。 */
  async readCsv(path: string): Promise<string> {
    const raw = await fs.readFile(path, 'utf8')
    const rows = this.parseCsv(raw.replace(/^\uFEFF/, ''))
    return rows.map((r) => r.join('\t')).join('\n')
  }

  /** 写入 Word(.docx)：content 按轻量 Markdown 解析（#/##/### 标题、- 列表、其余段落）。 */
  async writeDocx(path: string, content: string): Promise<void> {
    const children: Paragraph[] = []
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trimEnd()
      if (line.trim() === '') continue

      const heading = line.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        const level =
          heading[1].length === 1
            ? HeadingLevel.HEADING_1
            : heading[1].length === 2
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3
        children.push(new Paragraph({ text: heading[2], heading: level }))
        continue
      }

      const bullet = line.match(/^[-*]\s+(.+)$/)
      if (bullet) {
        children.push(new Paragraph({ text: bullet[1], bullet: { level: 0 } }))
        continue
      }

      children.push(new Paragraph({ text: line }))
    }

    if (children.length === 0) children.push(new Paragraph({ text: '' }))
    const doc = new Document({ sections: [{ children }] })
    const buffer = await Packer.toBuffer(doc)
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, buffer)
  }

  /** 写入 Excel(.xlsx)：content 为 TSV（制表符分列、换行分行），纯数字自动转数值。 */
  async writeXlsx(path: string, content: string): Promise<void> {
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    for (const row of this.rowsFromTsv(content)) {
      sheet.addRow(row.map((c) => this.parseXlsxCell(c)))
    }
    await fs.mkdir(dirname(path), { recursive: true })
    await workbook.xlsx.writeFile(path)
  }

  /** 写入 CSV：content 为 TSV，按 RFC4180 序列化（含引号转义）。 */
  async writeCsv(path: string, content: string): Promise<void> {
    const csv =
      this.rowsFromTsv(content)
        .map((row) => row.map((c) => this.csvEscape(c)).join(','))
        .join('\r\n') + '\r\n'
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, csv, 'utf8')
  }

  /** 写入 PDF：content 按轻量 Markdown 解析，使用系统 CJK 字体渲染中文。 */
  async writePdf(path: string, content: string): Promise<void> {
    const font = await this.loadCjkFont()
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    const finished = new Promise<Buffer>((resolvePdf, rejectPdf) => {
      doc.on('end', () => resolvePdf(Buffer.concat(chunks)))
      doc.on('error', rejectPdf)
    })

    doc.font(font)
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trimEnd()
      if (line.trim() === '') continue

      const heading = line.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        const size = heading[1].length === 1 ? 20 : heading[1].length === 2 ? 16 : 13
        doc.fontSize(size).text(heading[2], { paragraphGap: 8 })
        continue
      }

      const bullet = line.match(/^[-*]\s+(.+)$/)
      if (bullet) {
        doc.fontSize(12).text(`• ${bullet[1]}`, { indent: 12, paragraphGap: 4 })
        continue
      }

      doc.fontSize(12).text(line, { paragraphGap: 6 })
    }

    doc.end()
    const buffer = await finished
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, buffer)
  }

  /** 在目录里搜索：按文件名子串（name）或文本文件内容（content）。 */
  async search(
    path: string,
    query: string,
    mode: 'name' | 'content',
    recursive = true,
    maxResults = MAX_SEARCH_RESULTS
  ): Promise<string> {
    const q = query.toLowerCase()
    const results: string[] = []
    await this.walk(path, recursive, async (filePath, name) => {
      if (results.length >= maxResults) return
      if (mode === 'name') {
        if (name.toLowerCase().includes(q)) results.push(filePath)
        return
      }

      if (!isTextExt(name)) return
      let stat
      try {
        stat = await fs.stat(filePath)
      } catch {
        return
      }
      if (stat.size > MAX_SEARCH_FILE_BYTES) return
      let text: string
      try {
        text = await fs.readFile(filePath, 'utf8')
      } catch {
        return
      }
      if (text.includes('\uFFFD')) return
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(query)) {
          results.push(`${filePath}：第${i + 1}行：${lines[i].trim().slice(0, 120)}`)
          break
        }
      }
    })

    if (results.length === 0) return '（没有找到匹配项）'
    if (results.length >= maxResults) results.push(`（结果已达 ${maxResults} 条上限，可缩小搜索范围。）`)
    return results.join('\n')
  }

  /** 列出 zip 内的条目（目录以 / 结尾）。 */
  async listZip(path: string): Promise<string> {
    const buf = await fs.readFile(path)
    const zip = await JSZip.loadAsync(buf)
    const lines: string[] = []
    zip.forEach((relativePath, entry) => {
      lines.push(entry.dir ? `${relativePath}/` : relativePath)
    })
    lines.sort()
    if (lines.length === 0) return '（空 zip）'
    const shown = lines.slice(0, 200)
    return shown.join('\n') + (lines.length > 200 ? `\n（共 ${lines.length} 条，仅显示前 200 条）` : '')
  }

  /** 解压 zip 到目标目录（带 zip-slip 与 zip-bomb 防护）。 */
  async extractZip(path: string, destDir?: string): Promise<string> {
    const buf = await fs.readFile(path)
    const zip = await JSZip.loadAsync(buf)
    const base = destDir || join(dirname(path), basename(path).replace(/\.zip$/i, ''))
    const baseResolved = resolve(base)

    const entries: Array<{ p: string; entry: JSZip.JSZipObject }> = []
    zip.forEach((p, entry) => entries.push({ p, entry }))

    // zip-slip 防护：解压目标必须落在 base 目录内。
    for (const { p } of entries) {
      const target = resolve(base, p)
      if (target !== baseResolved && !target.startsWith(baseResolved + sep)) {
        throw new Error(`检测到不安全的压缩包路径，已中止：${p}`)
      }
    }

    let totalBytes = 0
    let count = 0
    for (const { p, entry } of entries) {
      if (count >= MAX_EXTRACT_ENTRIES) throw new Error(`压缩包条目过多（超过 ${MAX_EXTRACT_ENTRIES}），已中止`)
      const target = resolve(base, p)
      if (entry.dir) {
        await fs.mkdir(target, { recursive: true })
        continue
      }
      const data = Buffer.from(await entry.async('uint8array'))
      totalBytes += data.length
      if (totalBytes > MAX_EXTRACT_BYTES) throw new Error(`解压后体积过大（超过 200MB），已中止`)
      await fs.mkdir(dirname(target), { recursive: true })
      await fs.writeFile(target, data)
      count++
    }
    return `已解压到：${base}（${count} 个文件）`
  }

  private parseXlsxCell(s: string): string | number {
    const t = s.trim()
    if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) {
      const n = Number(t)
      if (Number.isFinite(n)) return n
    }
    return s
  }

  private rowsFromTsv(content: string): string[][] {
    const rows: string[][] = []
    for (const raw of content.split(/\r?\n/)) {
      if (raw.trim() === '') continue
      rows.push(raw.split('\t'))
    }
    return rows
  }

  private csvEscape(s: string): string {
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  /** RFC4180 CSV 解析（处理引号、字段内逗号/换行/转义引号）。 */
  private parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          cell += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(cell)
        cell = ''
      } else if (ch === '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else if (ch === '\r') {
        // 忽略 \r（兼容 \r\n）
      } else {
        cell += ch
      }
    }

    if (cell !== '' || row.length > 0) {
      row.push(cell)
      rows.push(row)
    }
    // 去掉末尾因结尾换行产生的空行。
    while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
      rows.pop()
    }
    return rows
  }

  private async loadCjkFont(): Promise<Buffer> {
    if (this.cjkFont) return this.cjkFont
    const candidates = [
      'C:\\Windows\\Fonts\\simhei.ttf',
      'C:\\Windows\\Fonts\\Deng.ttf',
      'C:\\Windows\\Fonts\\msyh.ttc',
      'C:\\Windows\\Fonts\\simsun.ttc'
    ]
    for (const p of candidates) {
      try {
        const buf = await fs.readFile(p)
        this.cjkFont = buf
        return buf
      } catch {
        // 尝试下一个候选字体
      }
    }
    throw new Error('未找到可用的中文字体，无法生成 PDF')
  }

  private async walk(
    dir: string,
    recursive: boolean,
    onFile: (filePath: string, name: string) => Promise<void>
  ): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (recursive) await this.walk(full, recursive, onFile)
      } else if (e.isFile()) {
        await onFile(full, e.name)
      }
    }
  }
}

function isTextExt(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase())
}
