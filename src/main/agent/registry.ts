import type { z } from 'zod'
import type { ScheduleService } from '../services/schedule'
import type { FileService } from '../services/files'

/** Dependencies available to every tool handler. */
export interface ToolContext {
  schedule: ScheduleService
  files: FileService
}

export interface Tool<C = ToolContext> {
  name: string
  description: string
  /** JSON Schema for the LLM function-calling definition. */
  parameters: Record<string, unknown>
  /** zod schema used to validate the model's arguments before execution. */
  schema: z.ZodTypeAny
  handler: (args: Record<string, unknown>, ctx: C) => Promise<string>
}

export class ToolRegistry<C = ToolContext> {
  private tools = new Map<string, Tool<C>>()

  register(tool: Tool<C>): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool<C> | undefined {
    return this.tools.get(name)
  }

  list(): Tool<C>[] {
    return [...this.tools.values()]
  }

  names(): string[] {
    return [...this.tools.keys()]
  }

  /** Serialize tools into the OpenAI function-calling format. */
  toOpenAI(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return this.list().map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }))
  }
}
