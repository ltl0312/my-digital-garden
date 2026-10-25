import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireBuiltinAdmin } from '../../../../utils/auth'
import { getBackup, restoreBackup } from '../../../../utils/backup'

/**
 * POST /api/admin/backups/:id/restore
 * 把整库恢复到某份备份。仅初始管理员。
 *
 * body: { confirm: string }  —— 必须等于该备份的 id。
 *
 * 为什么要求回填 id：这是**破坏性**动作（会清空当前 vault 内容）。
 * 前端会弹二次确认，但前端确认不可信（一个误触的脚本、一个手滑的 fetch 都能触发），
 * 所以服务端再要一次「你确实指的是这一份」的证据。
 *
 * 恢复前会自动再备一份当前状态（kind=pre-restore），响应里回传它的 id，
 * 用户如果发现恢复错了，可以再恢复到那份 —— 这是唯一的退路，必须明确告诉调用方。
 */
export default defineEventHandler(async (event) => {
  const key = await requireBuiltinAdmin(event)
  const id = String(getRouterParam(event, 'id') || '')
  const body = (await readBody<{ confirm?: unknown }>(event)) || {}
  if (String(body.confirm || '') !== id) {
    throw createError({ statusCode: 400, message: '确认失败：需要在 confirm 字段回填该备份 ID' })
  }

  const meta = await getBackup(id)
  if (!meta) throw createError({ statusCode: 404, message: '备份不存在' })

  try {
    const result = await restoreBackup(id, key.label || '初始管理员')
    return { ok: true, ...result }
  } catch (e) {
    throw createError({
      statusCode: 500,
      message: `恢复失败：${(e as Error)?.message || '未知错误'}`
    })
  }
})
