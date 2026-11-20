// 侧栏分段面板与首页仪表盘的数据派生（spec 第 4 章）：领域 / 标签分组 / 结构统计
// 原则：只用既有只读接口（/api/vault/tree、/api/tags、/api/overview）的真实数据，
// 不做硬编码数字；无法确定归属的归入「其他」并在 UI 上如实标注。
import type { TreeNodeLike } from './useNameRule'
import { typeHueOf } from '#shared/note-types'

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

// 领域派生规则**不在本文件定义**：唯一份在 shared/domain.ts（前后端共用），
// 这里只做 re-export，保证既有调用点（app 内 `from '~/composables/useFacets'`）不受影响。
import {
  DOMAIN_FALLBACK,
  DOMAIN_HUES,
  DOMAIN_HUE_DEG,
  domainColor,
  domainOfSlug,
  hueVarOf,
  normalizeDomain
} from '#shared/domain'

export {
  DOMAIN_FALLBACK,
  DOMAIN_HUES,
  DOMAIN_HUE_DEG,
  domainColor,
  domainOfSlug,
  hueVarOf,
  normalizeDomain
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

/**
 * 标签面板：按分组归并，组内按数量倒序；组间按组内合计倒序（spec 6：组头带组内计数）。
 *
 * 分组名优先取接口给的 `group`（`/api/tags` 用 shared/tag-group.ts 的纯函数推导，
 * 历史裸标签也能落到「前端 / 编程语言 / 中间件」这类真实分组里）。
 * 接口没给 group 时（旧缓存 / 尚未部署的响应）退回按 `命名空间/` 前缀切分。
 */
export function buildTagGroups(tags: { name: string; count: number; group?: string }[] | undefined): TagGroup[] {
  if (!tags?.length) return []
  const map = new Map<string, TagGroup>()
  for (const t of tags) {
    const idx = t.name.indexOf('/')
    const ns = (t.group || '').trim() || (idx > 0 ? t.name.slice(0, idx) : '未分组')
    const label = idx > 0 ? t.name.slice(idx + 1) : t.name
    if (!map.has(ns)) map.set(ns, { ns, items: [], total: 0 })
    const g = map.get(ns)!
    g.items.push({ name: t.name, label, count: t.count })
    g.total += t.count
  }
  const groups = [...map.values()]
  groups.forEach(g => {
    g.items.sort((a, b) => b.count - a.count)
    // 同一组里出现同名标签（`前端/CSS` 与历史裸标签 `CSS` 现在会被归进同一个组）
    // 时，整组改用全名显示，否则两个 chip 看着一模一样、点进去却是不同筛选结果。
    const seen = new Map<string, number>()
    for (const it of g.items) seen.set(it.label, (seen.get(it.label) || 0) + 1)
    for (const it of g.items) if ((seen.get(it.label) || 0) > 1) it.label = it.name
  })
  return groups.sort((a, b) => b.total - a.total)
}

/**
 * 全站结构统计（侧栏底部状态栏 + 首页仪表盘顶端）。
 * 数据来自 /api/overview：那里顺手把连接数算掉了 —— 原来只有知识图谱接口在算，
 * 图谱下线后如果没人接，这个数字就会永远显示 0。
 */
export interface VaultStats {
  /** 已发布笔记总数 */
  total: number
  /** 双向链接条数（两端都已发布） */
  links: number
  /** 没有任何链接的笔记数 */
  isolated: number
}

/** 从 /api/overview 的响应里取统计；响应还没回来时退化为树计数 + 0 链接 */
export function toVaultStats(
  overview: { total?: number; links?: number; isolated?: number } | null | undefined,
  fallbackTotal = 0
): VaultStats {
  return {
    total: overview?.total ?? fallbackTotal,
    links: overview?.links ?? 0,
    isolated: overview?.isolated ?? 0
  }
}

export const useFacets = () => {
  const requestFetch = useRequestFetch()

  const { data: tree } = useAsyncData('vault-tree', () => requestFetch('/api/vault/tree'))
  const { data: tags } = useAsyncData('sidebar-tags', () => requestFetch('/api/tags'))
  // 首页仪表盘与状态栏共用这一份：一次请求拿到 总量/连接/领域/类型/成熟度
  const { data: overview } = useAsyncData('overview', () => requestFetch('/api/overview'))

  const totalNotes = computed(() => countNotes((tree.value as any)?.tree))
  const domains = computed(() => buildDomainFacets((tree.value as any)?.tree, totalNotes.value))
  const tagGroups = computed(() => buildTagGroups((tags.value as any) || []))

  /**
   * 目录面板：直接用 /api/overview 的 sections（slug 前两段分桶）。
   * 不再从领域树现算 —— vault 的主力是 `ltl/01-编程语言` 这类二级目录，
   * 领域口径会把其中九成并进「其他」，侧栏那栏点进去等于没筛。
   */
  const sections = computed<DomainFacet[]>(() => {
    const list = ((overview.value as any)?.sections || []) as { key: string; label: string; count: number }[]
    const total = (overview.value as any)?.total || 0
    return list.map(s => ({
      name: s.label,
      dir: s.key,
      count: s.count,
      hueVar: typeHueOf(s.key),
      share: total ? s.count / total : 0
    }))
  })

  const stats = computed(() => toVaultStats(overview.value as any, totalNotes.value))

  return { tree, tags, overview, totalNotes, domains, sections, tagGroups, stats }
}
