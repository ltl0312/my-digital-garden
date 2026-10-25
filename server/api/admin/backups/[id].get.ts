import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBuiltinAdmin } from '../../../utils/auth'
import { getBackup } from '../../../utils/backup'

/**
 * GET /api/admin/backups/:id
 * 单份备份详情 —— 含完整文件清单（路径 / 大小 / sha256），供「看备份的具体内容」。
 * 仅初始管理员。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const id = String(getRouterParam(event, 'id') || '')
  const meta = await getBackup(id)
  if (!meta) throw createError({ statusCode: 404, message: '备份不存在' })
  return { meta }
})
