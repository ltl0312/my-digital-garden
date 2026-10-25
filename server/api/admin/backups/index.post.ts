import { createError, defineEventHandler, readBody } from 'h3'
import { requireBuiltinAdmin } from '../../../utils/auth'
import { createBackup } from '../../../utils/backup'

/**
 * POST /api/admin/backups
 * 立即创建一份备份。仅初始管理员。
 *
 * body: { reason?: string }
 *
 * 同步执行（不做后台任务）：33MB 的库打包约 1–2 秒，用户点一下就能看到结果，
 * 比引入一个「备份任务队列 + 轮询进度」简单得多，也不会出现「任务丢了」的状态。
 * 若将来库大到几十秒，再改成异步任务。
 */
export default defineEventHandler(async (event) => {
  const key = await requireBuiltinAdmin(event)
  const body = (await readBody<{ reason?: unknown }>(event)) || {}
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : ''
  try {
    const meta = await createBackup({
      kind: 'manual',
      reason: reason || '手动备份',
      actor: key.label || '初始管理员'
    })
    return { ok: true, meta }
  } catch (e) {
    // 磁盘满、目录不可写是这里最可能的失败，必须把原因如实回传，而不是一个 500
    throw createError({
      statusCode: 500,
      message: `备份失败：${(e as Error)?.message || '未知错误'}`
    })
  }
})
