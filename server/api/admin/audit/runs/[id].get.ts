import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBuiltinAdmin } from '../../../../utils/auth'
import { getAuditRun } from '../../../../utils/audit'

/**
 * GET /api/admin/audit/runs/:id
 * 单次审计的完整报告（含每条建议与执行状态）。仅初始管理员。
 * 前端轮询它：complete=false 表示仍在跑。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const id = String(getRouterParam(event, 'id') || '')
  const run = await getAuditRun(id)
  if (!run) throw createError({ statusCode: 404, message: '审计报告不存在' })
  return { run }
})
