import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { generateSuggestions, suggestAllMissing, autoSuggestRecent, drainSuggestions, queuedCount, explainForSlug } from '../../../utils/suggest'
import { llmStatus } from '../../../utils/llm'

/**
 * POST /api/admin/suggestions
 * 生成标签 / 领域建议（写入待审区，**不改动任何笔记**）。仅初始管理员 / 普通管理员。
 *
 * body:
 *   scope='slugs'  slugs: string[]        为指定笔记生成（单篇 / 多选 / 详情页「重新判定」）
 *   scope='recent' withinMinutes?: number 为最近入库的笔记生成（默认 120 分钟）
 *   scope='all'                           为「当前没有待审建议」的笔记整库补跑
 *   scope='explain' slug: string          **只诊断不落库**：摊开判定过程，回答「为什么没推出标签」
 *   immediate=true                        不走后台队列，直接跑完再返回（手动补跑要即时回执）
 *   useLlm=false                          强制只用规则引擎（排查 LLM 抽风时用）
 *
 * 为什么区分 immediate 与队列：导入后自动触发要走队列（500 篇不能占着请求线程跑几分钟），
 * 而管理员点「生成建议」时希望立刻看到结果，所以手动路径同步跑（仍受并发与条数上限保护）。
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{
    scope?: string
    slug?: unknown
    slugs?: unknown
    withinMinutes?: unknown
    immediate?: unknown
    useLlm?: unknown
  }>(event)) || {}

  const scope = (body.scope || (Array.isArray(body.slugs) ? 'slugs' : '')).trim()
  const useLlm = body.useLlm === false ? false : undefined

  // ── 只诊断不落库 ────────────────────────────────────────────────────────
  if (scope === 'explain') {
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    if (!slug) throw createError({ statusCode: 400, message: 'explain 需要提供 slug' })
    const info = await explainForSlug(slug)
    if (!info) throw createError({ statusCode: 404, message: '笔记不在库中（可能尚未入库或已删除）' })
    return { ok: true, mode: 'explain', explain: info, llm: await llmStatus() }
  }

  // ── 后台队列路径（导入后自动触发） ──────────────────────────────────────
  if (scope === 'recent' && body.immediate !== true) {
    const within = Math.max(1, Math.min(24 * 60, Number(body.withinMinutes) || 120))
    const queued = await autoSuggestRecent(within * 60_000)
    // 立刻踢一次排空：否则要等防抖窗口，接口回执里 queuedCount 看着像没动
    setTimeout(() => { void drainSuggestions() }, 0).unref?.()
    return { ok: true, mode: 'queued', queued, queuedNow: queuedCount(), llm: await llmStatus() }
  }

  // ── 同步路径（管理员手动补跑） ──────────────────────────────────────────
  if (scope === 'all') {
    const r = await suggestAllMissing()
    return { ok: true, mode: 'immediate', considered: r.considered, generated: r.generated, llm: await llmStatus() }
  }

  let slugs: string[]
  if (scope === 'recent') {
    const within = Math.max(1, Math.min(24 * 60, Number(body.withinMinutes) || 120))
    const since = new Date(Date.now() - within * 60_000)
    const { prisma } = await import('../../../utils/db')
    const rows = await prisma.note.findMany({
      where: { AND: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] },
      select: { slug: true },
      take: 500
    })
    slugs = rows.map(r => r.slug)
  } else {
    if (!Array.isArray(body.slugs)) {
      throw createError({ statusCode: 400, message: 'slugs 必须是字符串数组（或用 scope=recent / all）' })
    }
    slugs = (body.slugs as unknown[]).filter((s): s is string => typeof s === 'string' && !!s.trim())
    if (!slugs.length) throw createError({ statusCode: 400, message: '请至少选择一篇笔记' })
    if (slugs.length > 500) throw createError({ statusCode: 400, message: '单次最多处理 500 篇' })
  }

  if (!slugs.length) return { ok: true, mode: 'immediate', processed: 0, results: [], llm: await llmStatus() }

  // force: true —— 走到这里的一定是**管理员显式发起**的判定（选了具体笔记，或点了「为最近笔记生成」）。
  // 后台自动排队走的是上面 scope='recent' 的 queued 分支（force 默认 false，不会覆盖已有待审）。
  const { stats, results } = await generateSuggestions(slugs, { useLlm, force: true })
  return {
    ok: true,
    mode: 'immediate',
    processed: results.filter(r => r.ok).length,
    skipped: results.filter(r => r.skipped).length,
    failed: results.filter(r => !r.ok),
    stats,
    results,
    llm: await llmStatus()
  }
})
