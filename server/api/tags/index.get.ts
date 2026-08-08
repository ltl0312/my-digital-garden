import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'

export default defineEventHandler(async () => {
  const tags = await prisma.tag.findMany({
    select: { name: true, _count: { select: { notes: true } } },
    orderBy: { notes: { _count: 'desc' } }
  })
  return tags.map(t => ({ name: t.name, count: t._count.notes }))
})
