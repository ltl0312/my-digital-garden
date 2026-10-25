import { defineEventHandler, readBody } from 'h3'
import { requireBuiltinAdmin } from '../../../../utils/auth'
import { listAuditRuns } from '../../../../utils/audit'

/**
 * GET /api/admin/audit/runs
 * 历史审计报告清单（不含每条建议，只有计数）。仅初始管理员。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  return { items: await listAuditRuns(20) }
})
