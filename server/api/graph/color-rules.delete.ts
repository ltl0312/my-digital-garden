import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { requireAuth } from '../../utils/auth'

/**
 * 丢弃当前用户的整张颜色规则表（连那一行一起删掉）。
 *
 * 注意与 `PUT { rules: [] }` 的区别：PUT 空数组会留下一行空规则，
 * 表示「用户主动清空了规则」；DELETE 之后 `GET` 的 `updatedAt` 回到 null，
 * 前端会重新播种默认的领域 / 成熟度配色——也就是「恢复出厂设置」。
 */
export default defineEventHandler(async (event) => {
  const key = await requireAuth(event)
  const res = await prisma.graphColorRules.deleteMany({ where: { keyId: key.id } })
  return { ok: true, removed: res.count }
})
