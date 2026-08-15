import { formatDateTime } from '../util/datetime'
import type { Persona } from '../../shared/types'

export function buildSystemPrompt(persona: Persona, toolNames: string[]): string {
  const personaBlock = [
    persona.name ? `你的名字是「${persona.name}」。` : '',
    persona.role ? `你的角色定位：${persona.role}。` : '',
    persona.personality.length > 0 ? `性格特点：${persona.personality.join('、')}。` : '',
    persona.speakingStyle ? `说话风格：${persona.speakingStyle}。` : '',
    persona.systemPrompt.trim() ? persona.systemPrompt.trim() : ''
  ]
    .filter(Boolean)
    .join('\n')

  return [
    personaBlock,
    '',
    `当前时间：${formatDateTime(Date.now())}。`,
    `默认语言：${persona.defaultLanguage || '中文'}，请始终用该语言回复用户。`,
    '',
    '你是一个运行在用户 Windows 电脑上的桌面助手。你可以调用以下工具完成日程与文件相关任务：',
    toolNames.join('、') || '（当前无可用工具）',
    '',
    '请遵守以下规则：',
    '- 用自然语言友好地回复用户，永远不要向用户输出工具调用的原始 JSON。',
    '- 涉及日程时，把用户说的相对时间（如“明天下午三点”“下周五”）原样传给工具，由工具解析，不要自己臆造具体时间。',
    '- 文件整理工具只会生成预览计划，绝不会真正移动文件；调用后你必须明确告诉用户“请到「文件」页确认并执行”。',
    '- 不要删除用户的日程或文件，除非用户明确要求。',
    '- 如果工具报错或你不确定，如实说明并向用户询问，不要编造结果。'
  ].join('\n')
}
