import { describe, expect, it } from 'vitest'
import {
  splitSupplements,
  countSupplements,
  retrieveSupplements,
  maybeRetrieveSupplements,
  SUPPLEMENTS_RAG_TOPK
} from '../../src/main/agent/supplements'

describe('splitSupplements', () => {
  it('按分号和换行切条目', () => {
    expect(splitSupplements('a；b;c\nd')).toEqual(['a', 'b', 'c', 'd'])
    expect(splitSupplements('')).toEqual([])
    expect(splitSupplements('只有一条')).toEqual(['只有一条'])
  })
})

describe('countSupplements', () => {
  it('统计条目数量', () => {
    expect(countSupplements('')).toBe(0)
    expect(countSupplements('只有一条')).toBe(1)
    expect(countSupplements('a；b；c')).toBe(3)
    expect(countSupplements('a；b\nc')).toBe(3)
  })
})

describe('retrieveSupplements', () => {
  it('按相关性返回 topK 条', () => {
    const chunks = ['角色只负责记录遗言', '角色喜欢喝茶', '角色住在森林小屋', '角色讨厌喧闹']
    const result = retrieveSupplements(chunks, '记录遗言', 2)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('角色只负责记录遗言')
  })
})

describe('maybeRetrieveSupplements', () => {
  it('条目少时返回 null（表示全文注入）', () => {
    expect(maybeRetrieveSupplements('a；b；c', '查询')).toBeNull()
  })

  it('条目多时返回检索出的相关条目', () => {
    const many = Array.from({ length: 20 }, (_, i) => `人设条目${i}内容`).join('；')
    const result = maybeRetrieveSupplements(many, '人设条目3内容')
    expect(result).toBeTruthy()
    expect(result!.split('；').length).toBeLessThanOrEqual(SUPPLEMENTS_RAG_TOPK)
  })
})
