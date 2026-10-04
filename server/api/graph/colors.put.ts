import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '../../utils/db'
import { requireAuth } from '../../utils/auth'
import { MAX_COLOR_SLUG_LENGTH, MAX_NODE_COLORS, normalizeColor } from '#shared/graph-colors'

/**
 * 覆盖写入当前用户的图谱节点自定义颜色。
 *
 * body: `{ colors: Record<slug, color> }` —— 客户端每次提交**完整**状态（幂等），
 * 因此这里按「差集」落库：只删该删的、只插该插的，而不是无脑全表删了重建。
 *
 * 为什么不用 `prisma.$transaction([...])` 批量事务：本项目在 Prisma 7 + driver adapter
 * 下批量事务会间歇性 P2028 超时（见 server/api/notes/index.get.ts 的同款注释）。
 * 两条语句的顺序也刻意选过——先删后插，中途失败最多丢颜色，不会插进半份脏数据。
 */
export default defineEventHandler(async (event) => {
  const key = await requireAuth(event)
  const body = await readBody(event).catch(() => null)
  const raw = (body as { colors?: unknown } | null)?.colors

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw createError({ statusCode: 400, message: 'body.colors 必须是 { slug: color } 对象' })
  }

  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > MAX_NODE_COLORS) {
    throw createError({ statusCode: 413, message: `自定义颜色最多 ${MAX_NODE_COLORS} 条` })
  }

  // 逐条清洗：非法颜色 / 超长 slug 直接丢弃（不 400，避免一条脏数据废掉整次保存）
  const next = new Map<string, string>()
  let dropped = 0
  for (const [slug, value] of entries) {
    const color = normalizeColor(value)
    if (!slug || slug.length > MAX_COLOR_SLUG_LENGTH || !color) {
      dropped++
      continue
    }
    next.set(slug, color)
  }

  const existing = await prisma.graphColor.findMany({
    where: { keyId: key.id },
    select: { slug: true, color: true }
  })
  const before = new Map(existing.map(row => [row.slug, row.color]))

  // 差集：颜色变了、或服务端有而这次没提交的（= 被清掉了），先删
  const stale: string[] = []
  for (const row of existing) {
    if (next.get(row.slug) !== row.color) stale.push(row.slug)
  }

  if (stale.length) {
    await prisma.graphColor.deleteMany({ where: { keyId: key.id, slug: { in: stale } } })
  }

  const toInsert = [...next.entries()].filter(([slug, color]) => before.get(slug) !== color)

  if (toInsert.length) {
    await prisma.graphColor.createMany({
      data: toInsert.map(([slug, color]) => ({ keyId: key.id, slug, color, updatedAt: new Date() }))
    })
  }

  return { ok: true, count: next.size, dropped }
})
