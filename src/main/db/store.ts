import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname } from 'path'

export function newId(): string {
  return randomUUID()
}

/**
 * A tiny JSON-file document store with atomic writes.
 * Kept engine-agnostic (pure Node) so core logic is testable without Electron.
 * Data lives in memory and is flushed to disk asynchronously on every mutation.
 */
export class JsonStore<T extends object> {
  private data: T
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly initial: () => T
  ) {
    this.data = initial()
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<T>
      this.data = { ...this.initial(), ...parsed }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') {
        console.error(`[store] failed to load ${this.filePath}:`, err)
      }
    }
  }

  read(): T {
    return this.data
  }

  set(next: T): void {
    this.data = next
    void this.persist()
  }

  /** Mutate the in-memory document synchronously, then schedule a save. */
  update(mutator: (draft: T) => void): T {
    mutator(this.data)
    void this.persist()
    return this.data
  }

  async flush(): Promise<void> {
    await this.writing
  }

  private persist(): Promise<void> {
    this.writing = this.writing
      .then(async () => {
        const tmp = this.filePath + '.tmp'
        await fs.mkdir(dirname(this.filePath), { recursive: true })
        await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8')
        await fs.rename(tmp, this.filePath)
      })
      .catch((err) => {
        console.error(`[store] failed to persist ${this.filePath}:`, err)
      })
    return this.writing
  }
}
