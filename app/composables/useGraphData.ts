// 知识图谱的数据派生（计划书 T1.3）
// 把原先散落在 app/pages/graph.vue 里的 degreeMap / isolatedCount / 领域清单 / 统计
// 集中成一份，页面与新组件（左栏、右栏、搜索面板、缩略图）共用同一批计算结果。
import type { EdgeKind, GraphData, GraphEdge, GraphNode, GraphStats } from '~/lib/graph-types'
import { MATURITY_LABEL, MATURITY_ORDER } from '~/lib/graph-constants'
import { DOMAIN_FALLBACK, domainColor } from '#shared/graph-domain'

export interface DomainFacetItem {
  name: string
  count: number
  color: string
}

export interface TagFacetItem {
  name: string
  count: number
}

export interface MaturityBucket {
  key: string
  label: string
  count: number
}

/** 邻接项：邻居节点 id + 这条边的语义 */
export interface NeighborRef {
  id: string
  kind: EdgeKind
}

export function useGraphData() {
  // Nuxt 的 typed-route 重载在 vue-tsc 下对这条路由会触发 TS2321（类型比较深度溢出），
  // 属工具链噪声而非真实类型错误；这里把 fetcher 收敛成显式签名，语义不变。
  const requestFetch = useRequestFetch() as unknown as (url: string) => Promise<GraphData>

  const { data, pending, error, refresh } = useAsyncData<GraphData>(
    'graph-data',
    () => requestFetch('/api/notes/graph')
  )

  /** 节点（领域缺失时兜底「其他」，与服务端 normalizeDomain 同口径） */
  const nodes = computed<GraphNode[]>(() =>
    (data.value?.nodes || []).map(n => ({ ...n, domain: n.domain || DOMAIN_FALLBACK }))
  )

  const edges = computed<GraphEdge[]>(() => data.value?.edges || [])

  const nodeById = computed(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes.value) m.set(n.id, n)
    return m
  })

  const nodeBySlug = computed(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes.value) m.set(n.slug, n)
    return m
  })

  /** 无向度数（两种边都计入）：决定半径、常显标签与弹簧归一化 */
  const degreeMap = computed(() => {
    const m = new Map<string, number>()
    for (const e of edges.value) {
      m.set(e.source, (m.get(e.source) || 0) + 1)
      m.set(e.target, (m.get(e.target) || 0) + 1)
    }
    return m
  })

  const degreeOf = (id: string): number => degreeMap.value.get(id) || 0

  /** 邻接表（无向）：2 跳邻居、最短路径、邻域高亮都走它 */
  const adjacency = computed(() => {
    const m = new Map<string, NeighborRef[]>()
    const push = (a: string, b: string, kind: EdgeKind) => {
      const arr = m.get(a)
      if (arr) arr.push({ id: b, kind })
      else m.set(a, [{ id: b, kind }])
    }
    for (const e of edges.value) {
      if (e.source === e.target) continue
      push(e.source, e.target, e.kind)
      push(e.target, e.source, e.kind)
    }
    return m
  })

  /** 入链 / 出链（只统计显式链接，与 A8 的语义一致） */
  const incoming = computed(() => {
    const m = new Map<string, string[]>()
    for (const e of edges.value) {
      if (e.kind !== 'link') continue
      const arr = m.get(e.target)
      if (arr) arr.push(e.source)
      else m.set(e.target, [e.source])
    }
    return m
  })

  const outgoing = computed(() => {
    const m = new Map<string, string[]>()
    for (const e of edges.value) {
      if (e.kind !== 'link') continue
      const arr = m.get(e.source)
      if (arr) arr.push(e.target)
      else m.set(e.source, [e.target])
    }
    return m
  })

  /** 孤立节点（度数为 0）：统计、概览清单与「显示孤立节点」开关都用它 */
  const isolatedIds = computed(() => {
    const s = new Set<string>()
    for (const n of nodes.value) if (!degreeMap.value.has(n.id)) s.add(n.id)
    return s
  })

  /** 领域分组：按数量倒序，颜色沿用 shared 的领域色相 */
  const domains = computed<DomainFacetItem[]>(() => {
    const m = new Map<string, number>()
    for (const n of nodes.value) m.set(n.domain, (m.get(n.domain) || 0) + 1)
    return [...m.entries()]
      .map(([name, count]) => ({ name, count, color: domainColor(name) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  })

  /** 标签清单：按数量倒序（多标签数据来自 T1.1 的 tags[]，不再是 primaryTag） */
  const tags = computed<TagFacetItem[]>(() => {
    const m = new Map<string, number>()
    for (const n of nodes.value) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1)
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  })

  const maturityBuckets = computed<MaturityBucket[]>(() => {
    const counts = new Map<string, number>()
    for (const n of nodes.value) {
      const k = n.maturity || 'SEEDLING'
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return MATURITY_ORDER.map(k => ({ key: k, label: MATURITY_LABEL[k] || k, count: counts.get(k) || 0 }))
  })

  const stats = computed<GraphStats>(() => {
    let linkCount = 0
    for (const e of edges.value) if (e.kind === 'link') linkCount++
    return {
      nodeCount: nodes.value.length,
      edgeCount: edges.value.length,
      linkCount,
      tagEdgeCount: edges.value.length - linkCount,
      isolatedCount: isolatedIds.value.size,
      domainCount: domains.value.length,
      tagCount: tags.value.length
    }
  })

  /** 从某点出发的 n 跳邻居（含起点）；缺省 2 跳 */
  const neighborsOf = (id: string | null | undefined, hops = 2): Set<string> => {
    const out = new Set<string>()
    if (!id || !adjacency.value.has(id)) {
      if (id) out.add(id)
      return out
    }
    out.add(id)
    let frontier = [id]
    for (let d = 0; d < hops; d++) {
      const next: string[] = []
      for (const cur of frontier) {
        for (const nb of adjacency.value.get(cur) || []) {
          if (out.has(nb.id)) continue
          out.add(nb.id)
          next.push(nb.id)
        }
      }
      if (!next.length) break
      frontier = next
    }
    return out
  }

  /** 两节点最短路径（无向 BFS）；无连接返回 null */
  const shortestPath = (fromId: string | null | undefined, toId: string | null | undefined): string[] | null => {
    if (!fromId || !toId) return null
    if (fromId === toId) return [fromId]
    if (!adjacency.value.has(fromId) || !adjacency.value.has(toId)) return null
    const prev = new Map<string, string>()
    const seen = new Set<string>([fromId])
    let frontier = [fromId]
    while (frontier.length) {
      const next: string[] = []
      for (const cur of frontier) {
        for (const nb of adjacency.value.get(cur) || []) {
          if (seen.has(nb.id)) continue
          seen.add(nb.id)
          prev.set(nb.id, cur)
          if (nb.id === toId) {
            const path = [toId]
            let step = toId
            while (prev.has(step)) {
              step = prev.get(step)!
              path.unshift(step)
            }
            return path
          }
          next.push(nb.id)
        }
      }
      frontier = next
    }
    return null
  }

  return {
    data,
    pending,
    error,
    refresh,
    nodes,
    edges,
    nodeById,
    nodeBySlug,
    degreeMap,
    degreeOf,
    adjacency,
    incoming,
    outgoing,
    isolatedIds,
    domains,
    tags,
    maturityBuckets,
    stats,
    neighborsOf,
    shortestPath
  }
}
