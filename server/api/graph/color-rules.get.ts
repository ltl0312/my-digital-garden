import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { requireAuth } from '../../utils/auth'
import { normalizeRules } from '#shared/graph-colors'

/**
 * 读取当前用户（访问密钥）的图谱颜色规则。
 * 数组顺序即优先级（下标 0 最高），所以直接原样回，前端不再排序。
 *
 * 读的时候同样过一遍 normalizeRules：规则里的颜色最终会进 SVG `fill`，
 * 不能相信库里的值（可能是旧版本写的、或有人直接改过库）。
 */
export default defineEventHandler(async (event) => {
  const key = await requireAuth(event)

  const row = await prisma.graphColorRules.findUnique({ where: { keyId: key.id } })
  const rules = normalizeRules(row?.rules)

  return {
    rules,
    count: rules.length,
    updatedAt: row ? row.updatedAt.toISOString() : null
  }
})
