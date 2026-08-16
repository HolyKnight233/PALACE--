import { z } from 'zod'
import type { Tool, ToolContext } from '../agent/registry'
import type { PomodoroPreset } from '../../shared/types'

function formatState(state: { running: boolean; phase: 'work' | 'break'; remainingSeconds: number; cycle: number; presetName: string }): string {
  const m = Math.floor(state.remainingSeconds / 60)
  const s = state.remainingSeconds % 60
  const time = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const phase = state.phase === 'work' ? '工作' : '休息'
  return `番茄钟「${state.presetName}」：${state.running ? '运行中' : '已暂停'}，当前阶段：${phase}，剩余 ${time}，第 ${state.cycle + 1} 轮。`
}

function formatPreset(p: PomodoroPreset, active: boolean): string {
  const loop = p.loopCount === 0 ? '无限循环' : `${p.loopCount} 轮`
  return `[${p.id}] ${p.name}${active ? '（当前使用）' : ''}：工作 ${p.workMinutes} 分钟 / 休息 ${p.breakMinutes} 分钟 / ${loop}`
}

export function pomodoroTools(): Tool<ToolContext>[] {
  return [
    {
      name: 'pomodoro_state',
      description: '查询番茄钟当前状态（是否在运行、工作/休息阶段、剩余时间、第几轮）。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => formatState(ctx.pomodoro.getState())
    },
    {
      name: 'pomodoro_start',
      description: '开始（或继续）番茄钟计时。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        ctx.pomodoro.start()
        return formatState(ctx.pomodoro.getState())
      }
    },
    {
      name: 'pomodoro_pause',
      description: '暂停番茄钟计时。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        ctx.pomodoro.pause()
        return formatState(ctx.pomodoro.getState())
      }
    },
    {
      name: 'pomodoro_reset',
      description: '重置番茄钟：回到当前预设的工作阶段、第 1 轮，并停止计时。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        ctx.pomodoro.reset()
        return formatState(ctx.pomodoro.getState())
      }
    },
    {
      name: 'pomodoro_list',
      description: '列出所有番茄钟预设（含工作时长、休息时长、循环次数，并标注当前使用的预设）。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        const activeId = ctx.pomodoro.getActivePreset().id
        const list = ctx.pomodoro.listPresets().map((p) => formatPreset(p, p.id === activeId))
        return list.length === 0 ? '（没有预设）' : list.join('\n')
      }
    },
    {
      name: 'pomodoro_create',
      description: '新建一个番茄钟预设（可选：名称、工作时长、休息时长、循环次数，未填则用默认 25/5/4），创建后自动设为当前预设并重置计时。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '预设名称（可选）' },
          workMinutes: { type: 'number', description: '工作时长（分钟，可选）' },
          breakMinutes: { type: 'number', description: '休息时长（分钟，可选）' },
          loopCount: { type: 'number', description: '循环次数，0 表示无限循环（可选）' }
        },
        required: []
      },
      schema: z.object({
        name: z.string().optional(),
        workMinutes: z.number().positive().optional(),
        breakMinutes: z.number().positive().optional(),
        loopCount: z.number().int().min(0).optional()
      }),
      handler: async (args, ctx) => {
        const p = ctx.pomodoro.createPreset({
          name: args.name !== undefined ? String(args.name) : undefined,
          workMinutes: args.workMinutes !== undefined ? Number(args.workMinutes) : undefined,
          breakMinutes: args.breakMinutes !== undefined ? Number(args.breakMinutes) : undefined,
          loopCount: args.loopCount !== undefined ? Number(args.loopCount) : undefined
        })
        return `已新建预设：${formatPreset(p, true)}\n${formatState(ctx.pomodoro.getState())}`
      }
    },
    {
      name: 'pomodoro_update',
      description: '修改一个番茄钟预设（id 缺省时修改当前使用的预设）。可改：名称、工作时长、休息时长、循环次数。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '预设 id（可选，缺省为当前预设）' },
          name: { type: 'string', description: '新名称（可选）' },
          workMinutes: { type: 'number', description: '工作时长（分钟，可选）' },
          breakMinutes: { type: 'number', description: '休息时长（分钟，可选）' },
          loopCount: { type: 'number', description: '循环次数，0 表示无限循环（可选）' }
        },
        required: []
      },
      schema: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        workMinutes: z.number().positive().optional(),
        breakMinutes: z.number().positive().optional(),
        loopCount: z.number().int().min(0).optional()
      }),
      handler: async (args, ctx) => {
        const id = args.id !== undefined ? String(args.id) : ctx.pomodoro.getActivePreset().id
        const updated = ctx.pomodoro.updatePreset(id, {
          name: args.name !== undefined ? String(args.name) : undefined,
          workMinutes: args.workMinutes !== undefined ? Number(args.workMinutes) : undefined,
          breakMinutes: args.breakMinutes !== undefined ? Number(args.breakMinutes) : undefined,
          loopCount: args.loopCount !== undefined ? Number(args.loopCount) : undefined
        })
        return updated ? `已更新预设：${formatPreset(updated, updated.id === ctx.pomodoro.getActivePreset().id)}` : `未找到 id 为 ${id} 的预设。`
      }
    },
    {
      name: 'pomodoro_delete',
      description: '删除一个番茄钟预设（id 缺省时删除当前使用的预设；至少保留一个预设）。仅在用户明确要求删除时调用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '预设 id（可选，缺省为当前预设）' } },
        required: []
      },
      schema: z.object({ id: z.string().optional() }),
      handler: async (args, ctx) => {
        const id = args.id !== undefined ? String(args.id) : ctx.pomodoro.getActivePreset().id
        const active = ctx.pomodoro.deletePreset(id)
        return active
          ? `已删除预设，当前使用：${formatPreset(active, true)}`
          : '删除失败：要么该预设不存在，要么至少需要保留一个预设。'
      }
    },
    {
      name: 'pomodoro_switch',
      description: '切换当前使用的番茄钟预设（按 id），切换后重置计时。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '预设 id' } },
        required: ['id']
      },
      schema: z.object({ id: z.string().min(1) }),
      handler: async (args, ctx) => {
        const p = ctx.pomodoro.setActivePreset(String(args.id))
        return p ? `已切换到预设：${formatPreset(p, true)}\n${formatState(ctx.pomodoro.getState())}` : `未找到 id 为 ${String(args.id)} 的预设。`
      }
    },
    {
      name: 'pomodoro_open_window',
      description: '打开（或显示）番茄钟窗口。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        ctx.pomodoroWindow.open()
        return '已打开番茄钟窗口。'
      }
    },
    {
      name: 'pomodoro_close_window',
      description: '关闭番茄钟窗口。关闭后计时会停止并自动重置。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        if (!ctx.pomodoroWindow.isOpen()) return '番茄钟窗口当前未打开。'
        ctx.pomodoroWindow.close()
        return '已关闭番茄钟窗口。'
      }
    },
    {
      name: 'pomodoro_minimize_window',
      description: '最小化番茄钟窗口。',
      parameters: { type: 'object', properties: {}, required: [] },
      schema: z.object({}),
      handler: async (_args, ctx) => {
        if (!ctx.pomodoroWindow.isOpen()) return '番茄钟窗口当前未打开。'
        ctx.pomodoroWindow.minimize()
        return '已最小化番茄钟窗口。'
      }
    },
    {
      name: 'pomodoro_always_on_top',
      description: '设置番茄钟窗口是否置顶（flag=true 置顶，flag=false 取消置顶）。',
      parameters: {
        type: 'object',
        properties: { flag: { type: 'boolean', description: '是否置顶' } },
        required: ['flag']
      },
      schema: z.object({ flag: z.boolean() }),
      handler: async (args, ctx) => {
        if (!ctx.pomodoroWindow.isOpen()) return '番茄钟窗口当前未打开，无法设置置顶。'
        ctx.pomodoroWindow.setAlwaysOnTop(args.flag === true)
        return args.flag === true ? '已将番茄钟窗口置顶。' : '已取消番茄钟窗口置顶。'
      }
    }
  ]
}
