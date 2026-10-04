import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { requireAuth } from '../../utils/auth'

/**
 * 读取当前用户（访问密钥）的图谱节点自定义颜色。
 * 键是 slug（vault 相对路径），见 prisma/schema.prisma 的 GraphColor 注释。
 */
export default defineEventHandler(async (event) => {
  const key = await requireAuth(event)

  const rows = await prisma.graphColor.findMany({
    where: { keyId: key.id },
    select: { slug: true, color: true, updatedAt: true }
  })

  const colors: Record<string, string> = {}
  let updatedAt: string | null = null
  for (const r of rows) {
    colors[r.slug] = r.color
    const iso = r.updatedAt.toISOString()
    if (!updatedAt || iso > updatedAt) updatedAt = iso
  }

  return { colors, count: rows.length, updatedAt }
})
