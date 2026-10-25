import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBuiltinAdmin } from '../../../../utils/auth'
import { deleteAuditRun, getAuditRun } from '../../../../utils/audit'

/**
 * DELETE /api/admin/audit/runs/:id
 * 删除一份审计报告（只是报告，不影响任何笔记）。仅初始管理员。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const id = String(getRouterParam(event, 'id') || '')
  const run = await getAuditRun(id)
  if (!run) throw createError({ statusCode: 404, message: '审计报告不存在' })
  await deleteAuditRun(id)
  return { ok: true, id }
})
