import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page)) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize)) || 10))
  const tag = typeof query.tag === 'string' && query.tag.trim() ? query.tag.trim() : undefined
  const q = typeof query.q === 'string' && query.q.trim() ? query.q.trim() : undefined

  const where = {
    isPublished: true,
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } }
      ]
    } : {})
  }

  // 列表与计数无需事务（批量 $transaction 在 Prisma 7 + 驱动适配器下会间歇性 P2028 超时）
  const notes = await prisma.note.findMany({
    where,
    select: {
      id: true, slug: true, title: true, summary: true, maturity: true,
      readingTime: true, updatedAt: true,
      tags: { include: { tag: true } }
    },
    orderBy: { updatedAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize
  })
  const total = await prisma.note.count({ where })

  return { notes, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
})
