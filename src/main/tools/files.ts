import { basename } from 'path'
import { z } from 'zod'
import type { Tool, ToolContext } from '../agent/registry'

export function filesTools(): Tool<ToolContext>[] {
  return [
    {
      name: 'files_organize',
      description:
        '预览整理某个文件夹里的文件（只生成计划，绝不移动文件）。mode 取值：by-extension 按扩展名分组、by-date 按文件修改月份分组、by-name-pattern 按文件名正则分组（需 regexPattern，第一个捕获组作为子文件夹名）。',
      parameters: {
        type: 'object',
        properties: {
          sourceFolder: { type: 'string', description: '要整理的文件夹绝对路径' },
          mode: { type: 'string', enum: ['by-extension', 'by-date', 'by-name-pattern'] },
          regexPattern: { type: 'string', description: 'mode 为 by-name-pattern 时的正则表达式' },
          targetBase: { type: 'string', description: '分组子文件夹的存放根目录，默认等于 sourceFolder' }
        },
        required: ['sourceFolder', 'mode']
      },
      schema: z.object({
        sourceFolder: z.string().min(1),
        mode: z.enum(['by-extension', 'by-date', 'by-name-pattern']),
        regexPattern: z.string().optional(),
        targetBase: z.string().optional()
      }),
      handler: async (args, ctx) => {
        try {
          const preview = await ctx.files.preview({
            sourceFolder: String(args.sourceFolder),
            mode: args.mode as 'by-extension' | 'by-date' | 'by-name-pattern',
            regexPattern: typeof args.regexPattern === 'string' ? args.regexPattern : undefined,
            targetBase: typeof args.targetBase === 'string' ? args.targetBase : undefined
          })
          if (preview.length === 0) return `在 ${String(args.sourceFolder)} 中没有找到需要整理的文件。`
          const sample = preview
            .slice(0, 10)
            .map((p) => `  ${basename(p.source)} → ${p.destination}${p.conflict ? '（目标已存在，会自动改名）' : ''}`)
            .join('\n')
          const more = preview.length > 10 ? `\n  …以及另外 ${preview.length - 10} 个文件` : ''
          return (
            `预览到 ${preview.length} 个文件可整理（仅为预览，尚未移动）：\n` +
            sample +
            more +
            '\n请告诉用户：到「文件」页点击“执行整理”才会真正移动文件。'
          )
        } catch (err) {
          return `整理预览失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    },
    {
      name: 'files_list',
      description: '列出某个文件夹的内容（仅一层）。',
      parameters: {
        type: 'object',
        properties: { folder: { type: 'string', description: '文件夹绝对路径' } },
        required: ['folder']
      },
      schema: z.object({ folder: z.string().min(1) }),
      handler: async (args, ctx) => {
        try {
          const entries = await ctx.files.list(String(args.folder))
          if (entries.length === 0) return `${String(args.folder)} 是空文件夹。`
          return entries
            .slice(0, 50)
            .map((e) => `  ${e.isDirectory ? '[目录]' : '[文件]'} ${e.name}${e.isDirectory ? '' : `（${e.size} 字节）`}`)
            .join('\n')
        } catch (err) {
          return `列出失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    }
  ]
}
