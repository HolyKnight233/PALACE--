import { promises as fs } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import { JsonStore, newId } from '../db/store'
import { resolveSubfolder } from './fileRules'
import type {
  FileEntry,
  FileExecuteResult,
  FileMovePreview,
  FileMoveRecord,
  FileUndoResult,
  OrganizeRule
} from '../../shared/types'

interface FilesShape {
  journal: FileMoveRecord[]
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function uniquePath(p: string): Promise<string> {
  const ext = extname(p)
  const stem = p.slice(0, p.length - ext.length)
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!(await exists(candidate))) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

export class FileService {
  private store: JsonStore<FilesShape>

  constructor(dataDir: string) {
    this.store = new JsonStore<FilesShape>(join(dataDir, 'files.json'), () => ({ journal: [] }))
  }

  async load(): Promise<void> {
    await this.store.load()
  }

  private async computePlan(rule: OrganizeRule): Promise<FileMovePreview[]> {
    const source = resolve(rule.sourceFolder)
    const base = resolve(rule.targetBase || rule.sourceFolder)
    const entries = await fs.readdir(source, { withFileTypes: true })
    const previews: FileMovePreview[] = []
    for (const ent of entries) {
      if (!ent.isFile()) continue
      const src = join(source, ent.name)
      const st = await fs.stat(src).catch(() => null)
      if (!st) continue
      const sub = resolveSubfolder(rule, src, st.mtimeMs)
      if (sub === null) continue
      const dest = join(base, sub, ent.name)
      previews.push({ source: src, destination: dest, size: st.size, conflict: await exists(dest) })
    }
    return previews
  }

  async preview(rule: OrganizeRule): Promise<FileMovePreview[]> {
    return this.computePlan(rule)
  }

  async execute(rule: OrganizeRule): Promise<FileExecuteResult> {
    const plan = await this.computePlan(rule)
    const batchId = newId()
    const failed: FileMoveRecord[] = []
    let moved = 0

    for (const p of plan) {
      const rec: FileMoveRecord = {
        id: newId(),
        batchId,
        source: p.source,
        destination: p.destination,
        fileName: basename(p.source),
        size: p.size,
        status: 'moved',
        createdAt: Date.now()
      }
      try {
        await fs.mkdir(dirname(p.destination), { recursive: true })
        let finalDest = p.destination
        if (await exists(finalDest)) finalDest = await uniquePath(finalDest)
        rec.destination = finalDest
        await fs.rename(p.source, finalDest)
        moved++
      } catch (err) {
        rec.status = 'failed'
        rec.error = (err as Error)?.message ?? String(err)
        failed.push(rec)
      }
      this.store.update((d) => {
        d.journal.push(rec)
      })
    }
    return { batchId, moved, failed }
  }

  async undoLast(): Promise<FileUndoResult> {
    const journal = this.store.read().journal
    const movedBatches = new Set(journal.filter((r) => r.status === 'moved').map((r) => r.batchId))
    let latestBatch: string | null = null
    let latestAt = -1
    for (const b of movedBatches) {
      const rec = journal.find((r) => r.batchId === b)
      if (rec && rec.createdAt > latestAt) {
        latestAt = rec.createdAt
        latestBatch = b
      }
    }
    if (!latestBatch) return { batchId: null, restored: 0 }

    const recs = journal.filter((r) => r.batchId === latestBatch && r.status === 'moved')
    let restored = 0
    for (const r of recs) {
      try {
        if (!(await exists(r.destination))) continue
        let finalDest = r.source
        if (await exists(finalDest)) finalDest = await uniquePath(finalDest)
        await fs.mkdir(dirname(finalDest), { recursive: true })
        await fs.rename(r.destination, finalDest)
        restored++
      } catch (err) {
        console.error('[files] undo failed for', r.source, err)
      }
    }
    return { batchId: latestBatch, restored }
  }

  async list(folder: string): Promise<FileEntry[]> {
    const dir = resolve(folder)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const result: FileEntry[] = []
    for (const ent of entries) {
      const full = join(dir, ent.name)
      let size = 0
      if (ent.isFile()) {
        const st = await fs.stat(full).catch(() => null)
        size = st?.size ?? 0
      }
      result.push({ name: ent.name, isDirectory: ent.isDirectory(), size })
    }
    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
}
