import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBuiltinAdmin } from '../../../utils/auth'
import { deleteBackup, getBackup } from '../../../utils/backup'

/**
 * DELETE /api/admin/backups/:id
 * 手动删除一份备份（不受保留份数限制）。仅初始管理员。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const id = String(getRouterParam(event, 'id') || '')
  const meta = await getBackup(id)
  if (!meta) throw createError({ statusCode: 404, message: '备份不存在' })
  await deleteBackup(id)
  return { ok: true, id }
})
