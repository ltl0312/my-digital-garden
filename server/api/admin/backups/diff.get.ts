import { createError, defineEventHandler, getQuery } from 'h3'
import { requireBuiltinAdmin } from '../../../utils/auth'
import { diffBackups, getBackup } from '../../../utils/backup'

/**
 * GET /api/admin/backups/diff?from=<id>&to=<id>
 * 两份备份之间的文件差异（新增 / 删除 / 修改 / 未变），供「看备份之间的区别」。
 * 仅初始管理员。
 *
 * 按 path→sha256 比对，不解压归档 —— 两份备份各解压一遍要读 66MB，
 * 而 manifest 里已经存了哈希，直接比就够。
 */
export default defineEventHandler(async (event) => {
  await requireBuiltinAdmin(event)
  const q = getQuery(event)
  const from = String(q.from || '')
  const to = String(q.to || '')
  if (!from || !to) throw createError({ statusCode: 400, message: '需要 from 与 to 两个备份 ID' })

  const [a, b] = await Promise.all([getBackup(from), getBackup(to)])
  if (!a) throw createError({ statusCode: 404, message: `备份 ${from} 不存在` })
  if (!b) throw createError({ statusCode: 404, message: `备份 ${to} 不存在` })

  return {
    from: { id: a.id, createdAt: a.createdAt, kind: a.kind },
    to: { id: b.id, createdAt: b.createdAt, kind: b.kind },
    diff: diffBackups(a, b)
  }
})
