import { z } from 'zod'
import type { Tool, ToolContext } from '../agent/registry'

const MAX_RETURN_CHARS = 30000

export function fileTools(): Tool<ToolContext>[] {
  return [
    {
      name: 'file_read',
      description:
        '读取文件内容。path 是文件绝对路径。支持纯文本（.txt/.md）、CSV（.csv）、Word（.docx）、Excel（.xlsx）、PDF（.pdf）；Word/PDF 输出纯文本，CSV/Excel 按“制表符分列、换行分行”输出。读取后可用于总结、整理、回答问题。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件绝对路径' } },
        required: ['path']
      },
      schema: z.object({ path: z.string().min(1) }),
      handler: async (args, ctx) => {
        const path = String(args.path)
        try {
          const text = await ctx.files.readText(path)
          if (text.length > MAX_RETURN_CHARS) {
            const shown = text.slice(0, MAX_RETURN_CHARS)
            return `${shown}\n\n（内容过长已截断，剩余 ${text.length - MAX_RETURN_CHARS} 字符未显示。可对文件分段，或用更具体的问题。）`
          }
          return text
        } catch (err) {
          return `读取失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    },
    {
      name: 'file_write',
      description:
        '生成/写入一个文件。path 是目标文件绝对路径，content 是完整内容。按扩展名区分：.txt/.md 写纯文本；.docx/.pdf 写文档（content 用 Markdown：井号标题、减号或星号列表、空行分段）；.xlsx/.csv 写表格（content 用制表符分隔列、换行分隔行，第一行可作为表头）。若文件已存在会被覆盖，写入前应先提醒用户。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件绝对路径' },
          content: { type: 'string', description: '要写入的完整内容' }
        },
        required: ['path', 'content']
      },
      schema: z.object({ path: z.string().min(1), content: z.string() }),
      handler: async (args, ctx) => {
        const path = String(args.path)
        const content = String(args.content)
        try {
          await ctx.files.writeText(path, content)
          return `已写入文件：${path}（${content.length} 字符）`
        } catch (err) {
          return `写入失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    },
    {
      name: 'file_list',
      description: '列出一个目录下的文件和子目录。path 是目录绝对路径。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '目录绝对路径' } },
        required: ['path']
      },
      schema: z.object({ path: z.string().min(1) }),
      handler: async (args, ctx) => {
        try {
          const names = await ctx.files.listDir(String(args.path))
          return names.length === 0 ? '（空目录）' : names.slice(0, 200).join('\n')
        } catch (err) {
          return `列出目录失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    },
    {
      name: 'file_search',
      description:
        '在目录里搜索文件。path 是目录绝对路径，query 是关键词。mode=name 按文件名匹配（忽略大小写）；mode=content 按文本文件内容匹配。recursive 默认 true（递归子目录）。maxResults 默认 50。返回匹配的文件绝对路径（content 模式附带命中行号与片段）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要搜索的目录绝对路径' },
          query: { type: 'string', description: '搜索关键词' },
          mode: { type: 'string', enum: ['name', 'content'], description: '按文件名还是按内容搜索' },
          recursive: { type: 'boolean', description: '是否递归子目录，默认 true' },
          maxResults: { type: 'integer', description: '最多返回结果数，默认 50' }
        },
        required: ['path', 'query']
      },
      schema: z.object({
        path: z.string().min(1),
        query: z.string().min(1),
        mode: z.enum(['name', 'content']).default('name'),
        recursive: z.boolean().default(true),
        maxResults: z.number().int().min(1).max(200).default(50)
      }),
      handler: async (args, ctx) => {
        try {
          return await ctx.files.search(
            String(args.path),
            String(args.query),
            args.mode as 'name' | 'content',
            args.recursive !== false,
            typeof args.maxResults === 'number' ? args.maxResults : 50
          )
        } catch (err) {
          return `搜索失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    },
    {
      name: 'zip_list',
      description: '列出一个 .zip 压缩包内的条目（目录以 / 结尾）。path 是 zip 文件绝对路径。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'zip 文件绝对路径' } },
        required: ['path']
      },
      schema: z.object({ path: z.string().min(1) }),
      handler: async (args, ctx) => {
        try {
          return await ctx.files.listZip(String(args.path))
        } catch (err) {
          return `列出压缩包失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    },
    {
      name: 'zip_extract',
      description:
        '解压一个 .zip 压缩包。path 是 zip 文件绝对路径，destDir 是解压目标目录（可选，缺省为 zip 同级同名目录）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'zip 文件绝对路径' },
          destDir: { type: 'string', description: '解压目标目录（可选）' }
        },
        required: ['path']
      },
      schema: z.object({ path: z.string().min(1), destDir: z.string().optional() }),
      handler: async (args, ctx) => {
        try {
          return await ctx.files.extractZip(
            String(args.path),
            typeof args.destDir === 'string' && args.destDir ? args.destDir : undefined
          )
        } catch (err) {
          return `解压失败：${(err as Error)?.message ?? String(err)}`
        }
      }
    }
  ]
}
