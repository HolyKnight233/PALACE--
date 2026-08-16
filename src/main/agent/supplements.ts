// 轻量 RAG：把「补充提示词（人设条目库）」按相关性检索，避免全文注入。

export const SUPPLEMENTS_RAG_MIN_ITEMS = 10
export const SUPPLEMENTS_RAG_TOPK = 6
/** 条目达到该数量时触发一次智能合并压缩。 */
export const MAX_SUPPLEMENT_ITEMS = 100
/** 压缩后的目标条目数。 */
export const COMPRESS_TARGET_ITEMS = 50

/** 字符 bigram（相邻两字）作为特征，衡量中文字面相似度。 */
function bigrams(text: string): Set<string> {
  const s = text.trim()
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2))
  }
  return set
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) {
    if (b.has(x)) inter++
  }
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/** 按分号/换行把补充提示词切成条目。 */
export function splitSupplements(text: string): string[] {
  return text
    .split(/[；;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 返回补充提示词的条目数量。 */
export function countSupplements(text: string): number {
  return splitSupplements(text).length
}

/** 从条目中检索与 query 最相关的 topK 条（按 bigram Jaccard 得分排序）。 */
export function retrieveSupplements(chunks: string[], query: string, topK: number): string[] {
  const q = bigrams(query)
  if (q.size === 0) return chunks.slice(0, topK)
  const scored = chunks.map((c, i) => ({ c, i, score: jaccard(q, bigrams(c)) }))
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, topK).map((x) => x.c)
}

/**
 * 条目少时返回 null（表示全文注入、走原逻辑）；条目多时返回检索出的相关条目（分号拼接）。
 */
export function maybeRetrieveSupplements(supplements: string, query: string): string | null {
  const chunks = splitSupplements(supplements)
  if (chunks.length <= SUPPLEMENTS_RAG_MIN_ITEMS) return null
  return retrieveSupplements(chunks, query, SUPPLEMENTS_RAG_TOPK).join('；')
}
