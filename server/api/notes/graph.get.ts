import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'

export default defineEventHandler(async () => {
  const notes = await prisma.note.findMany({
    where: { isPublished: true },
    select: {
      id: true, title: true, slug: true, maturity: true,
      tags: { include: { tag: true } }
    }
  })

  const links = await prisma.noteLink.findMany({
    select: { sourceId: true, targetId: true }
  })

  return {
    nodes: notes.map(n => ({
      id: n.id,
      title: n.title,
      slug: n.slug,
      maturity: n.maturity,
      primaryTag: n.tags[0]?.tag.name || null
    })),
    edges: links.map(l => ({ source: l.sourceId, target: l.targetId }))
  }
})
