import { z } from 'zod'
import type { Tool, ToolContext } from '../agent/registry'
import { formatDateTime } from '../util/datetime'

export function clockTool(): Tool<ToolContext> {
  return {
    name: 'clock_now',
    description: '获取当前日期和时间。当用户提到“现在/今天/本周/明天”等相对时间时，先调用它确认当前时间。',
    parameters: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    handler: async () => `当前时间：${formatDateTime(Date.now())}`
  }
}
