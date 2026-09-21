import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { recomputeAllMaturity } from '../../../utils/maturity-sync'

/**
 * POST /api/admin/maturity/recompute
 * 成熟度全量重算（管理员手动触发，对应文档 10.5 的季度复核）。
 * 只更新无显式 frontmatter maturity 且未 locked 的笔记——人工值永远优先。
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const r = await recomputeAllMaturity()
  return { ok: true, ...r }
})
