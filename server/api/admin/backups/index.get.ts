import { defineEventHandler } from 'h3'
import { requireBuiltinAdmin } from '../../../utils/auth'
import { backupStorageInfo, listBackups } from '../../../utils/backup'

/**
 * GET /api/admin/backups
 * 备份清单（新→旧）+ 存储信息。仅初始管理员。
 *
 * 只返回元数据，不返回文件内容 —— 528 个文件的 manifest 有几十 KB，
 * 用户点开某一份再看细节（GET /api/admin/backups/:id）。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const [items, storage] = await Promise.all([listBackups(), backupStorageInfo()])
  return { items, storage }
})
