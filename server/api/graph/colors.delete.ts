import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { requireAuth } from '../../utils/auth'

/** 清空当前用户的全部图谱节点自定义颜色（控制面板「清除全部自定义颜色」）。 */
export default defineEventHandler(async (event) => {
  const key = await requireAuth(event)
  const res = await prisma.graphColor.deleteMany({ where: { keyId: key.id } })
  return { ok: true, removed: res.count }
})
