import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listSuggestions, pendingCount } from '../../../utils/suggest'

/**
 * GET /api/admin/suggestions
 * 待审建议清单（默认只看 pending）。仅初始管理员 / 普通管理员。
 *
 * query:
 *   status=pending|approved|rejected  只取某个状态（history=1 时忽略）
 *   history=1                         连已审核的一起返回，用于审计轨迹
 *   limit                             默认 200，上限 500
 */
export default defineEventHandler(async (event) => {
  // 权限：这是「管理员与初始管理员才能进行的操作」的入口，服务端权威校验
  await requireAdmin(event)
  const q = getQuery(event)
  const history = String(q.history ?? '') === '1'
  const status = typeof q.status === 'string' && q.status.trim() ? q.status.trim() : 'pending'
  const limit = Number(q.limit) || 200

  const [items, pending] = await Promise.all([
    listSuggestions({ status, history, limit }),
    pendingCount()
  ])
  return { items, pending }
})
