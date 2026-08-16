import { formatDateTime } from '../util/datetime'
import type { Persona } from '../../shared/types'

export interface SystemPromptOptions {
  /** 滚动摘要（被裁剪出窗口的更早历史）。 */
  summary?: string
  /** 补充提示词内容（可能是 RAG 检索后的相关条目，或全文）。 */
  supplements?: string
}

export function buildSystemPrompt(persona: Persona, toolNames: string[], options: SystemPromptOptions = {}): string {
  const personaBlock = [
    persona.name ? `你的名字是「${persona.name}」。` : '',
    persona.role ? `你的角色定位：${persona.role}。` : '',
    persona.personality.length > 0 ? `性格特点：${persona.personality.join('、')}。` : '',
    persona.speakingStyle ? `说话风格：${persona.speakingStyle}。` : '',
    persona.systemPrompt.trim() ? persona.systemPrompt.trim() : ''
  ]
    .filter(Boolean)
    .join('\n')

  const supplements = options.supplements?.trim()
  const supplementsEnabled = persona.supplementsEnabled ?? true
  const summary = options.summary?.trim()

  const extraBlocks: string[] = []
  if (supplementsEnabled && supplements) {
    extraBlocks.push('当前角色的补充提示词（对话中逐渐补全的人设细节，请始终遵守）：', supplements)
  }
  if (summary) {
    extraBlocks.push('以下是更早对话的摘要（仅作背景参考，无需逐字复述）：', summary)
  }

  return [
    personaBlock,
    ...(extraBlocks.length > 0 ? ['', ...extraBlocks] : []),
    '',
    `当前时间：${formatDateTime(Date.now())}。`,
    `默认语言：${persona.defaultLanguage || '中文'}，请始终用该语言回复用户。`,
    '',
    '回复风格（除非上面人设自定义里明确要求，否则请遵守）：',
    '- 像真人聊天一样自然、口语化，避免“AI 味”太重。',
    '- 不要使用 Markdown 语法：不要用 ** 加粗、# 标题、- 或数字列表、``` 代码块等。',
    '- 不要使用或尽量少用 emoji 和特殊符号。',
    '- 除非人设或用户明确要求，否则不要主动介绍自己是“AI 助手”“桌面助手”之类的身份。',
    '',
    '你可以使用以下工具完成任务（仅在你需要时调用）：',
    toolNames.join('、') || '（当前无可用工具）',
    '',
    '请遵守以下规则：',
    '- 用自然语言友好地回复用户，永远不要向用户输出工具调用的原始 JSON。',
    '- 涉及日程时，把用户说的相对时间（如“明天下午三点”“下周五”）原样传给工具，由工具解析，不要自己臆造具体时间。',
    '- 不要删除用户的日程，除非用户明确要求。',
    '- 涉及文件时，读取文件后基于其内容总结或回答；生成文件前，若目标文件已存在，请先提醒用户，避免覆盖重要内容。读取或生成 .docx/.pdf/.xlsx/.csv 时按工具说明的格式约定处理（Word/PDF 用标题/列表/段落，Excel/CSV 用行列）；需要时可用搜索工具按文件名或内容查找文件、查看或解压 zip。',
    '- 如果工具报错或你不确定，如实说明并向用户询问，不要编造结果。'
  ].join('\n')
}
