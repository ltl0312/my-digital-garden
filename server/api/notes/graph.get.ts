import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { createCache } from '../../utils/cache'

interface GraphData {
  nodes: { id: string; title: string; slug: string; maturity: string; primaryTag: string | null }[]
  edges: { source: string; target: string }[]
}

// 图谱缓存：60s TTL + watcher 入库后手动失效（图谱页每次进入都请求全量数据）
const graphCache = createCache<GraphData>(60_000)

export default defineEventHandler(async () => {
  const cached = graphCache.get()
  if (cached) return cached

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

  const data: GraphData = {
    nodes: notes.map(n => ({
      id: n.id,
      title: n.title,
      slug: n.slug,
      maturity: n.maturity,
      primaryTag: n.tags[0]?.tag.name || null
    })),
    edges: links.map(l => ({ source: l.sourceId, target: l.targetId }))
  }
  graphCache.set(data)
  return data
})
