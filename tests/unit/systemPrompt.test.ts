import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../../src/main/agent/systemPrompt'
import type { Persona } from '../../src/shared/types'

const persona: Persona = {
  id: 'default',
  name: '小助手',
  role: '个人助理',
  personality: ['友善'],
  speakingStyle: '简洁',
  systemPrompt: '额外的规则',
  defaultLanguage: '中文',
  themeColor: '#000000'
}

describe('buildSystemPrompt', () => {
  it('includes persona identity and custom prompt', () => {
    const p = buildSystemPrompt(persona, ['clock_now'])
    expect(p).toContain('小助手')
    expect(p).toContain('个人助理')
    expect(p).toContain('友善')
    expect(p).toContain('额外的规则')
  })

  it('includes current time and default language', () => {
    const p = buildSystemPrompt(persona, [])
    expect(p).toContain('当前时间')
    expect(p).toContain('中文')
  })

  it('lists tool names', () => {
    const p = buildSystemPrompt(persona, ['clock_now', 'schedule_create'])
    expect(p).toContain('clock_now')
    expect(p).toContain('schedule_create')
  })

  it('includes human-like reply style rules', () => {
    const p = buildSystemPrompt(persona, [])
    expect(p).toContain('像真人聊天')
    expect(p).toContain('不要使用 Markdown')
    expect(p).toContain('emoji')
  })

  it('injects rolling summary when provided', () => {
    const p = buildSystemPrompt(persona, [], { summary: '此前讨论过旅行计划' })
    expect(p).toContain('更早对话的摘要')
    expect(p).toContain('此前讨论过旅行计划')
  })

  it('injects persona supplements when enabled', () => {
    const p = buildSystemPrompt({ ...persona, supplements: '角色补充内容', supplementsEnabled: true }, [])
    expect(p).toContain('角色补充内容')
  })

  it('omits persona supplements when disabled', () => {
    const p = buildSystemPrompt({ ...persona, supplements: '角色补充内容', supplementsEnabled: false }, [])
    expect(p).not.toContain('角色补充内容')
  })
})
