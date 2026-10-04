import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { createCache } from '../../utils/cache'
// 领域派生规则唯一份在 shared/graph-domain.ts（与 app/composables/useFacets.ts 同源）
import { domainOfSlug, normalizeDomain } from '#shared/graph-domain'

export interface GraphNode {
  id: string
  title: string
  slug: string
  maturity: string
  /** 首个标签（既有字段，保持兼容） */
  primaryTag: string | null
  /** 全部标签名（原实现只留 tags[0]，多标签信息丢失） */
  tags: string[]
  /** 由 slug 派生，与列表页同规则；解析不出时落「其他」 */
  domain: string
  /** vault 内相对目录路径，供树布局与详情栏路径行使用 */
  dirPath: string
  /** 显式链接入度 */
  inDegree: number
  /** 显式链接出度 */
  outDegree: number
  /** ISO 字符串，供时间轴布局使用 */
  updatedAt: string
  readingTime: number
  summary: string | null
}

export interface GraphEdge {
  source: string
  target: string
  /** link = 显式 [[链接]]；tag = 标签共有（同一非空标签且两者之间无显式链接） */
  kind: 'link' | 'tag'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * 单个标签下允许生成「标签共有」边的最大节点数。
 * 泛用标签（如被几十篇笔记共用的主题词）两两相连会产生 O(n²) 条边且语义稀薄，
 * 超过该阈值整组跳过，避免图谱边爆炸拖垮首帧。
 */
export const MAX_TAG_GROUP_SIZE = 40

// 图谱缓存：60s TTL + watcher 入库后手动失效（图谱页每次进入都请求全量数据）
const graphCache = createCache<GraphData>(60_000)

/** 无向边键：用于剔除「已有显式链接」的标签共有对 */
const linkKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)

export default defineEventHandler(async () => {
  const cached = graphCache.get()
  if (cached) return cached

  const notes = await prisma.note.findMany({
    where: { isPublished: true },
    select: {
      id: true, title: true, slug: true, maturity: true,
      summary: true, readingTime: true, updatedAt: true,
      tags: { include: { tag: true } }
    }
  })

  const links = await prisma.noteLink.findMany({
    select: { sourceId: true, targetId: true }
  })

  const edges: GraphEdge[] = []
  const inDeg = new Map<string, number>()
  const outDeg = new Map<string, number>()
  const linked = new Set<string>()

  // 1) 显式链接边（有方向，入/出度只按显式链接统计）
  for (const l of links) {
    if (l.sourceId === l.targetId) continue
    edges.push({ source: l.sourceId, target: l.targetId, kind: 'link' })
    outDeg.set(l.sourceId, (outDeg.get(l.sourceId) || 0) + 1)
    inDeg.set(l.targetId, (inDeg.get(l.targetId) || 0) + 1)
    linked.add(linkKey(l.sourceId, l.targetId))
  }

  // 2) 标签共有边：同一非空标签下的节点两两相连，剔除已有显式链接的对
  const tagGroups = new Map<string, string[]>()
  for (const n of notes) {
    for (const nt of n.tags) {
      const name = nt.tag?.name
      if (!name) continue
      const group = tagGroups.get(name)
      if (group) group.push(n.id)
      else tagGroups.set(name, [n.id])
    }
  }
  for (const ids of tagGroups.values()) {
    if (ids.length < 2 || ids.length > MAX_TAG_GROUP_SIZE) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!
        const b = ids[j]!
        if (linked.has(linkKey(a, b))) continue
        edges.push({ source: a, target: b, kind: 'tag' })
      }
    }
  }

  const data: GraphData = {
    nodes: notes.map((n) => {
      const meta = domainOfSlug(n.slug)
      const tags = n.tags.map(t => t.tag?.name).filter((t): t is string => !!t).sort()
      return {
        id: n.id,
        title: n.title,
        slug: n.slug,
        maturity: n.maturity,
        primaryTag: tags[0] ?? null,
        tags,
        domain: normalizeDomain(meta.domain),
        dirPath: meta.dirPath,
        inDegree: inDeg.get(n.id) || 0,
        outDegree: outDeg.get(n.id) || 0,
        updatedAt: n.updatedAt.toISOString(),
        readingTime: n.readingTime,
        summary: n.summary ?? null
      }
    }),
    edges
  }
  graphCache.set(data)
  return data
})
