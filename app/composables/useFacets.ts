// 侧栏分段面板的数据派生（spec 第 4 章）：领域 / 标签分组 / 结构统计
// 原则：只用既有只读接口（/api/vault/tree、/api/tags、/api/notes/graph）的真实数据，
// 不做硬编码数字；无法确定归属的归入「其他」并在 UI 上如实标注。
import type { TreeNodeLike } from './useNameRule'

export interface DomainFacet {
  name: string
  /** vault 内相对路径（用于 /notes?dir= 筛选） */
  dir: string
  count: number
  hueVar: string
  share: number
}

export interface TagGroup {
  /** 命名空间前缀（status / type / 前端 …）；无前缀的归入「未分组」 */
  ns: string
  items: { name: string; label: string; count: number }[]
  total: number
}

/** 领域色相（spec 3.1 的 8 个色族）：按名称固定映射，未命中者回退 misc */
export const DOMAIN_HUES: Record<string, string> = {
  前端: '--hue-frontend',
  后端: '--hue-backend',
  数据库: '--hue-database',
  运维: '--hue-devops',
  计算机基础: '--hue-cs',
  软件工程: '--hue-se',
  跨学科纵深: '--hue-cross',
  其他: '--hue-misc'
}

export const hueVarOf = (name: string): string => DOMAIN_HUES[name] || '--hue-misc'

/** 同一套领域色相的数值形式（SVG fill 需要真实颜色，不能吃 CSS 变量名） */
export const DOMAIN_HUE_DEG: Record<string, number> = {
  前端: 160,
  后端: 232,
  数据库: 275,
  运维: 32,
  计算机基础: 195,
  软件工程: 344,
  跨学科纵深: 88,
  其他: 220
}

export const domainColor = (name: string, l = 46): string =>
  `hsl(${DOMAIN_HUE_DEG[name] ?? DOMAIN_HUE_DEG['其他']} 56% ${l}%)`

/** 从笔记 slug 解析领域名与所属目录（约定：<知识区>/<领域>/…；不匹配返回空） */
export function domainOfSlug(slug: string | undefined): { domain: string; dirPath: string } {
  if (!slug) return { domain: '', dirPath: '' }
  const parts = slug.split('/')
  parts.pop() // 去掉文件名
  const kbIdx = parts.findIndex(p => /^\d{2}_Knowledge$/i.test(p))
  const dirPath = parts.join(' / ')
  const domain = parts[kbIdx + 1]
  if (kbIdx >= 0 && domain !== undefined) return { domain, dirPath }
  return { domain: '', dirPath }
}


/** 统计树节点下的笔记数（递归） */
export function countNotes(nodes: TreeNodeLike[] | undefined): number {
  if (!nodes?.length) return 0
  let n = 0
  for (const node of nodes) {
    if (node.type === 'dir') n += countNotes(node.children)
    else n++
  }
  return n
}

/** 找到知识区目录（约定：vault 根下 NN_Knowledge 命名的目录；找不到则返回 null） */
export function findKnowledgeDir(tree: TreeNodeLike[] | undefined, prefix = ''): { node: TreeNodeLike; path: string } | null {
  if (!tree?.length) return null
  for (const node of tree) {
    if (node.type !== 'dir') continue
    const path = prefix ? `${prefix}/${node.name}` : node.name
    if (/^\d{2}_Knowledge$/i.test(node.name)) return { node, path }
    const deeper = findKnowledgeDir(node.children, path)
    if (deeper) return deeper
  }
  return null
}

/**
 * 领域面板：知识区的一级子目录即「领域」（真实数据，动态发现，不硬编码列表）。
 * share 为该领域笔记占全部笔记的比例，用于占比条。
 */
export function buildDomainFacets(tree: TreeNodeLike[] | undefined, totalNotes: number): DomainFacet[] {
  const kb = findKnowledgeDir(tree)
  if (!kb) return []
  const dirs = (kb.node.children || []).filter(c => c.type === 'dir')
  const facets = dirs.map((d) => {
    const count = countNotes([d])
    return {
      name: d.name,
      dir: `${kb.path}/${d.name}`,
      count,
      hueVar: hueVarOf(d.name),
      share: totalNotes ? count / totalNotes : 0
    }
  })
  const inDomains = facets.reduce((a, f) => a + f.count, 0)
  const rest = Math.max(0, totalNotes - inDomains)
  if (rest > 0) {
    facets.push({
      name: '其他',
      dir: '',
      count: rest,
      hueVar: hueVarOf('其他'),
      share: totalNotes ? rest / totalNotes : 0
    })
  }
  return facets.sort((a, b) => b.count - a.count)
}

/** 标签面板：按命名空间前缀分组，组内按数量倒序；组间按组内合计倒序（spec 6：组头带组内计数） */
export function buildTagGroups(tags: { name: string; count: number }[] | undefined): TagGroup[] {
  if (!tags?.length) return []
  const map = new Map<string, TagGroup>()
  for (const t of tags) {
    const idx = t.name.indexOf('/')
    const ns = idx > 0 ? t.name.slice(0, idx) : '未分组'
    const label = idx > 0 ? t.name.slice(idx + 1) : t.name
    if (!map.has(ns)) map.set(ns, { ns, items: [], total: 0 })
    const g = map.get(ns)!
    g.items.push({ name: t.name, label, count: t.count })
    g.total += t.count
  }
  const groups = [...map.values()]
  groups.forEach(g => g.items.sort((a, b) => b.count - a.count))
  return groups.sort((a, b) => b.total - a.total)
}

/** 侧栏状态徽标的成熟度统计（供底部状态栏用；数据来自 /api/tags 的 type/status 命名空间之外） */
export interface GraphStats {
  nodes: number
  edges: number
  isolated: number
}

export function buildGraphStats(graph: { nodes?: any[]; edges?: any[] } | null | undefined): GraphStats {
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  const linked = new Set<string>()
  for (const e of edges) {
    linked.add(e.source)
    linked.add(e.target)
  }
  return {
    nodes: nodes.length,
    edges: edges.length,
    isolated: nodes.filter(n => !linked.has(n.id)).length
  }
}

export const useFacets = () => {
  const requestFetch = useRequestFetch()

  const { data: tree } = useAsyncData('vault-tree', () => requestFetch('/api/vault/tree'))
  const { data: tags } = useAsyncData('sidebar-tags', () => requestFetch('/api/tags'))
  const { data: graph } = useAsyncData('sidebar-graph', () => requestFetch('/api/notes/graph'))

  const totalNotes = computed(() => countNotes((tree.value as any)?.tree))
  const domains = computed(() => buildDomainFacets((tree.value as any)?.tree, totalNotes.value))
  const tagGroups = computed(() => buildTagGroups((tags.value as any) || []))
  const stats = computed(() => buildGraphStats(graph.value as any))

  return { tree, tags, graph, totalNotes, domains, tagGroups, stats }
}
