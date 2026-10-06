import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { approveSuggestion, rejectSuggestion, pendingCount } from '../../../utils/suggest'
import { invalidateGardenCache } from '../../../utils/cache'

/**
 * POST /api/admin/suggestions/review
 * 审核建议 —— **通过才会真正改动笔记**（写 vault frontmatter + 落库）。仅初始管理员 / 普通管理员。
 *
 * body（两种形态，便于「逐条通过」与「批量通过」共用一个入口）：
 *   单条：{ id, action: 'approve'|'reject', tags?, domain?, reason? }
 *   批量：{ items: [ 同上... ] }
 *
 * domain 语义（与审核界面一一对应）：
 *   不传      → 采用建议原值（建议说换领域就换，建议说保持就保持）
 *   null      → 明确「不改领域」（即使建议让改，也保持现状）
 *   '前端'    → 指定为该领域
 *
 * 逐条独立：某条失败不会回滚其它条。返回每条的结果，界面按篇提示。
 * 审计：审核人与时间写入 Suggestion.reviewedBy / reviewedAt，驳回理由追加进 rationale。
 */
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const body = (await readBody<{
    id?: unknown
    items?: unknown
    action?: unknown
    tags?: unknown
    domain?: unknown
    reason?: unknown
  }>(event)) || {}

  const rawItems = Array.isArray(body.items) ? body.items : [body]
  if (!rawItems.length) throw createError({ statusCode: 400, message: '没有待审核项' })
  if (rawItems.length > 200) throw createError({ statusCode: 400, message: '单次最多审核 200 条' })

  const parseDomain = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined
    if (v === null) return null
    const s = String(v).trim()
    return s ? s : null
  }

  const results: Array<{
    id: string
    ok: boolean
    action: string
    slug?: string
    tags?: string[]
    domainLevel1?: string | null
    keptDomain?: boolean
    fileWritten?: boolean
    error?: string
  }> = []

  for (const raw of rawItems) {
    const item = (raw || {}) as Record<string, unknown>
    const id = String(item.id || '').trim()
    const action = String(item.action || 'approve').trim()
    if (!id) {
      results.push({ id: '', ok: false, action, error: '缺少建议 id' })
      continue
    }
    try {
      if (action === 'reject') {
        await rejectSuggestion(id, actor.id, typeof item.reason === 'string' ? item.reason : undefined)
        results.push({ id, ok: true, action })
        continue
      }
      if (action !== 'approve') {
        results.push({ id, ok: false, action, error: `未知动作：${action}` })
        continue
      }
      if (!Array.isArray(item.tags)) {
        results.push({ id, ok: false, action, error: 'tags 必须是字符串数组' })
        continue
      }
      const out = await approveSuggestion(
        {
          suggestionId: id,
          tags: (item.tags as unknown[]).filter((t): t is string => typeof t === 'string'),
          domain: parseDomain(item.domain)
        },
        actor.id
      )
      results.push({
        id,
        ok: true,
        action,
        slug: out.slug,
        tags: out.tags,
        domainLevel1: out.domainLevel1,
        keptDomain: out.keptDomain,
        fileWritten: out.fileWritten
      })
    } catch (e) {
      results.push({ id, ok: false, action, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // 通过会改标签/领域 → 列表、图谱、侧栏缓存必须失效（否则界面要等 60s TTL）
  if (results.some(r => r.ok)) invalidateGardenCache()
  const pending = await pendingCount()
  return {
    ok: results.every(r => r.ok),
    results,
    approved: results.filter(r => r.ok && r.action === 'approve').length,
    rejected: results.filter(r => r.ok && r.action === 'reject').length,
    failed: results.filter(r => !r.ok).length,
    pending
  }
})
