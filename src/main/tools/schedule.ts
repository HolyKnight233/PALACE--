import { z } from 'zod'
import type { Tool, ToolContext } from '../agent/registry'
import type { CalendarEvent } from '../../shared/types'
import { formatDateTime, parseDateTime } from '../util/datetime'

/** 单条日程的详细描述，供查询类工具返回给模型。 */
function formatEventDetail(e: CalendarEvent): string {
  const time = e.endAt ? `${formatDateTime(e.startAt)} 至 ${formatDateTime(e.endAt)}` : `${formatDateTime(e.startAt)}（无结束时间）`
  const lines = [`[${e.id}] ${e.title}`, `时间：${time}`, `状态：${e.completed ? '已完成' : '未完成'}`]
  if (e.description) lines.push(`具体内容：${e.description}`)
  if (e.reminderMinutes) lines.push(`提前提醒：${e.reminderMinutes} 分钟`)
  return lines.join('\n')
}

export function scheduleTools(): Tool<ToolContext>[] {
  return [
    {
      name: 'schedule_create',
      description:
        '创建一条日程。when 可以是自然语言（如“明天下午三点”）或 ISO 时间字符串（如 2026-01-05T15:00:00）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '日程标题' },
          when: { type: 'string', description: '开始时间：自然语言或 ISO 时间字符串' },
          durationMinutes: { type: 'number', description: '持续时间（分钟），可选' },
          allDay: { type: 'boolean', description: '是否全天，默认 false' },
          reminderMinutes: { type: 'number', description: '提前多少分钟提醒，可选' }
        },
        required: ['title', 'when']
      },
      schema: z.object({
        title: z.string().min(1),
        when: z.string().min(1),
        durationMinutes: z.number().optional(),
        allDay: z.boolean().optional(),
        reminderMinutes: z.number().optional()
      }),
      handler: async (args, ctx) => {
        const start = parseDateTime(String(args.when))
        if (!start) return `无法理解时间「${String(args.when)}」，请向用户确认具体时间。`
        const startAt = start.getTime()
        const duration = typeof args.durationMinutes === 'number' ? args.durationMinutes : undefined
        const endAt = duration !== undefined ? startAt + duration * 60000 : undefined
        const ev = ctx.schedule.create({
          title: String(args.title),
          startAt,
          endAt,
          allDay: args.allDay === true,
          reminderMinutes: typeof args.reminderMinutes === 'number' ? args.reminderMinutes : undefined,
          description: undefined
        })
        return `已创建日程「${ev.title}」：${formatDateTime(ev.startAt)}${ev.endAt ? ` 至 ${formatDateTime(ev.endAt)}` : ''}`
      }
    },
    {
      name: 'schedule_query',
      description: '查询日程。可按时间范围（from/to，自然语言或 ISO）或关键词筛选；结果包含时间、是否已完成、具体内容等详细信息。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '开始时间（可选）' },
          to: { type: 'string', description: '结束时间（可选）' },
          keyword: { type: 'string', description: '标题/具体内容关键词（可选）' }
        },
        required: []
      },
      schema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        keyword: z.string().optional()
      }),
      handler: async (args, ctx) => {
        const from = args.from ? parseDateTime(String(args.from))?.getTime() : undefined
        const to = args.to ? parseDateTime(String(args.to))?.getTime() : undefined
        let events = ctx.schedule.all()
        if (from !== undefined) events = events.filter((e) => e.startAt >= from)
        if (to !== undefined) events = events.filter((e) => e.startAt <= to)
        if (typeof args.keyword === 'string' && args.keyword) {
          const kw = args.keyword.toLowerCase()
          events = events.filter((e) => `${e.title} ${e.description ?? ''}`.toLowerCase().includes(kw))
        }
        if (events.length === 0) return '没有找到符合条件的日程。'
        return events
          .slice(0, 20)
          .map(formatEventDetail)
          .join('\n\n')
      }
    },
    {
      name: 'schedule_get',
      description: '按 id 查询单条日程的详细信息（含时间、是否已完成、具体内容、提前提醒）。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '日程 id（来自 schedule_query 的结果）' } },
        required: ['id']
      },
      schema: z.object({ id: z.string().min(1) }),
      handler: async (args, ctx) => {
        const e = ctx.schedule.get(String(args.id))
        return e ? formatEventDetail(e) : `未找到 id 为 ${String(args.id)} 的日程。`
      }
    },
    {
      name: 'schedule_update',
      description: '修改一条已有日程。id 必填，其余字段可选；when 可传自然语言或 ISO 时间；completed 用于标记完成/未完成。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '日程 id（来自 schedule_query 的结果）' },
          title: { type: 'string', description: '新标题（可选）' },
          when: { type: 'string', description: '新的开始时间（可选）' },
          durationMinutes: { type: 'number', description: '新的持续时间，分钟（可选）' },
          allDay: { type: 'boolean', description: '是否全天（可选）' },
          description: { type: 'string', description: '具体内容（可选）' },
          completed: { type: 'boolean', description: '是否已完成（可选）' },
          reminderMinutes: { type: 'number', description: '提前提醒分钟数（可选）' }
        },
        required: ['id']
      },
      schema: z.object({
        id: z.string().min(1),
        title: z.string().optional(),
        when: z.string().optional(),
        durationMinutes: z.number().optional(),
        allDay: z.boolean().optional(),
        description: z.string().optional(),
        completed: z.boolean().optional(),
        reminderMinutes: z.number().optional()
      }),
      handler: async (args, ctx) => {
        const id = String(args.id)
        const cur = ctx.schedule.get(id)
        if (!cur) return `未找到 id 为 ${id} 的日程。`

        let startAt = cur.startAt
        let endAt = cur.endAt
        if (args.when !== undefined) {
          const d = parseDateTime(String(args.when))
          if (!d) return `无法理解时间「${String(args.when)}」。`
          startAt = d.getTime()
          endAt = args.durationMinutes !== undefined ? startAt + Number(args.durationMinutes) * 60000 : undefined
        } else if (args.durationMinutes !== undefined) {
          endAt = startAt + Number(args.durationMinutes) * 60000
        }

        const patch: Partial<CalendarEvent> = { startAt }
        if (args.when !== undefined || args.durationMinutes !== undefined) patch.endAt = endAt
        if (args.title !== undefined) patch.title = String(args.title)
        if (args.allDay !== undefined) patch.allDay = args.allDay === true
        if (args.description !== undefined) patch.description = String(args.description)
        if (args.completed !== undefined) patch.completed = args.completed === true
        if (args.reminderMinutes !== undefined) patch.reminderMinutes = Number(args.reminderMinutes)

        const updated = ctx.schedule.update(id, patch)
        return updated
          ? `已更新日程「${updated.title}」：${formatDateTime(updated.startAt)}${updated.endAt ? ` 至 ${formatDateTime(updated.endAt)}` : ''}`
          : `未找到 id 为 ${id} 的日程。`
      }
    },
    {
      name: 'schedule_delete',
      description: '删除一条日程。仅在用户明确要求删除时才调用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '日程 id' } },
        required: ['id']
      },
      schema: z.object({ id: z.string().min(1) }),
      handler: async (args, ctx) => {
        const ok = ctx.schedule.remove(String(args.id))
        return ok ? '已删除该日程。' : `未找到 id 为 ${String(args.id)} 的日程。`
      }
    }
  ]
}
