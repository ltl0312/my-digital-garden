import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireBuiltinAdmin } from '../../../../../utils/auth'
import { applyAuditIssues } from '../../../../../utils/audit'

/**
 * POST /api/admin/audit/runs/:id/apply
 * 让 AI 直接执行选中的建议。仅初始管理员。
 *
 * body: { issueIds: string[] }
 *
 * **执行前无条件整库备份**（在 applyAuditIssues 里做，不是这里）——
 * 备份失败就抛错，一条都不改。响应里回传 backupId，用户可以据此回滚。
 */
export default defineEventHandler(async (event) => {
  const key = await requireBuiltinAdmin(event)
  const id = String(getRouterParam(event, 'id') || '')
  const body = (await readBody<{ issueIds?: unknown }>(event)) || {}
  const issueIds = Array.isArray(body.issueIds)
    ? body.issueIds.filter((s): s is string => typeof s === 'string' && !!s.trim())
    : []
  if (!issueIds.length) throw createError({ statusCode: 400, message: '请至少选择一条建议' })
  if (issueIds.length > 100) throw createError({ statusCode: 400, message: '单次最多执行 100 条' })

  try {
    const result = await applyAuditIssues({ runId: id, issueIds, actor: key.label || '初始管理员' })
    return { ok: true, ...result }
  } catch (e) {
    throw createError({ statusCode: 500, message: (e as Error)?.message || '执行失败' })
  }
})
