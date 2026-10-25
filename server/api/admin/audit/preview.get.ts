import { defineEventHandler, getQuery } from 'h3'
import { requireBuiltinAdmin } from '../../../utils/auth'
import { previewScope, type AuditScope } from '../../../utils/audit'

/**
 * GET /api/admin/audit/preview?folders=a,b&tags=x,y&domains=p,q&keyword=k&limit=20
 * 先告诉用户「这次会扫多少篇」，再让他决定是否花 token。仅初始管理员。
 */
function split(v: unknown): string[] {
  return String(v ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const q = getQuery(event)
  const scope: AuditScope = {
    folders: split(q.folders),
    tags: split(q.tags),
    domains: split(q.domains),
    keyword: String(q.keyword ?? '').trim(),
    limit: Number(q.limit) || undefined
  }
  return { scope, preview: await previewScope(scope) }
})
