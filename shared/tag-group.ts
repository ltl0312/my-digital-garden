/**
 * 标签分组的展示层推导（纯函数、零 IO、服务端与客户端共用）。
 *
 * 背景：侧栏「标签」面板按 `命名空间/名称` 前缀分组，没有前缀的历史标签全被塞进
 * 「未分组」。这些裸标签是 v2.0.1 之前 AI 管线尚未强制命名空间时写入的，线上真实库有
 * 974 个（1379 次赋值），逐个改写 2100 篇 Markdown 的 frontmatter 风险高、且服务器上
 * 那份 vault 无运维通道，所以分组在**展示层**推导：标签真名（`React`、`专题索引`）
 * 一个字都不动，点击筛选仍按原名走，随部署即生效。
 *
 * 判定顺序（依次尝试，命中即止）：
 *   ① 人工映射表 —— 语义跨目录、共存证据又不够的少数标签
 *   ② 共存证据 —— 同一篇笔记里出现过的**语义命名空间**（排除 type/status 这类结构
 *      命名空间与 `02-前端` 这类目录式命名空间），取支持度最高且 ≥2 者
 *      典型：`闭包` → 编程语言（18 篇同现）、`React` → 前端
 *   ③ 路径派生 —— 标签所属笔记的第一层业务目录名（`ltl/02-前端/Router.md` → 前端）
 *      长尾单例标签（约 870 个）没有共存证据，目录是唯一可靠信号
 *   ④ 标签自身已是某个命名空间（存在 `CSS/布局`）→ 用自己当组名
 *   ⑤ 仍无解 → `其他`
 *
 * 为什么②要 ≥2：单次共现基本是噪声（实测 `性能调优` 与 `网络` 只同现 2 次，
 * 把 `架构` 判成前端这类错误全部来自 sup=1 的样本）。
 * 为什么排除结构命名空间：`type` 在 1856 次赋值里出现，几乎每篇都有，
 * 保留它会让 299 个标签被判成 `type/xxx`（实测）。
 */

/** 结构命名空间：只表达笔记形态/状态，不表达主题，不能当分组名 */
export const TAG_STRUCT_NAMESPACES: ReadonlySet<string> = new Set([
  'type',
  'status',
  'maturity',
  '来源',
  'source'
])

/** 目录式命名空间：`02-前端/concepts` 这种前缀是目录路径，不是主题 */
const DIR_LIKE_NS = /^\d{1,2}[-_]/

/** vault 顶层容器目录，做路径派生时跳过 */
const VAULT_ROOTS: ReadonlySet<string> = new Set(['ltl', 'lyf', 'zrw', 'KnowledgeBase', 'content', 'vault'])

/** ① 人工映射：语义跨目录、共存证据不足的标签 */
const CURATED_GROUPS: ReadonlyMap<string, string> = new Map([
  // 「专题索引」是跨目录的索引类笔记（52 篇散在各处），主题由文档形态决定
  ['专题索引', 'type']
])

/** 共存证据门槛：同一篇里与该标签同现 ≥2 次才采信其命名空间 */
const CO_OCCUR_MIN = 2

/** 标签的命名空间前缀；没有前缀返回 '' */
export function tagNamespace(name: string): string {
  const idx = name.indexOf('/')
  return idx > 0 ? name.slice(0, idx) : ''
}

/** 标签去掉命名空间后的显示名 */
export function tagLabel(name: string): string {
  const idx = name.indexOf('/')
  return idx > 0 ? name.slice(idx + 1) : name
}

/** 结构命名空间 / 目录式命名空间：不参与共存投票 */
export function isStructuralTagNamespace(ns: string): boolean {
  return !ns || TAG_STRUCT_NAMESPACES.has(ns) || DIR_LIKE_NS.test(ns)
}

/** ② 路径派生组名：取第一层业务目录（去掉 `NN-` 序号前缀） */
export function tagPathGroup(slug: string): string {
  const segs = (slug || '').split('/').filter(Boolean)
  let i = 0
  if (VAULT_ROOTS.has(segs[0] || '')) i = 1
  for (; i < segs.length; i++) {
    const m = /^\d{1,2}[-_](.+)$/.exec(segs[i] ?? '')
    const name = m?.[1]?.trim()
    if (name) return name
  }
  return (segs[i] ?? '').trim()
}

/** ① 人工映射查表 */
export function curatedTagGroup(name: string): string {
  return CURATED_GROUPS.get(name) ?? ''
}

/** 每个标签在真实数据里的统计（由调用方一次性喂进来） */
interface TagStat {
  /** 该标签被多少篇笔记引用 */
  count: number
  /** 与该标签同现的语义命名空间 → 同现次数 */
  cooc: Map<string, number>
  /** 该标签所在笔记的路径分组 → 篇数 */
  paths: Map<string, number>
}

export interface TagGroupRow {
  /** 标签全名（可能带 `命名空间/` 前缀） */
  name: string
  /** 该标签所属笔记的 slug */
  slug: string
}

/** 计数取最大者；并列时取组名短的（`前端` 优于 `前端工程化与工具链`），再按字典序稳定排序 */
function pickTop(m: Map<string, number>, min = 1): { key: string; n: number } | null {
  let best: { key: string; n: number } | null = null
  for (const [key, n] of m) {
    if (n < min) continue
    if (!best || n > best.n || (n === best.n && (key.length < best.key.length || (key.length === best.key.length && key < best.key)))) {
      best = { key, n }
    }
  }
  return best
}

/**
 * 一次性算出「标签全名 → 分组名」的映射。
 * 分组只对裸标签有意义；带命名空间的标签直接用自己的命名空间（调用方走 tagNamespace）。
 */
export function computeTagGroupIndex(rows: TagGroupRow[]): Map<string, string> {
  const stats = new Map<string, TagStat>()
  const perSlug = new Map<string, string[]>()

  for (const row of rows) {
    if (!row?.name || row.slug == null) continue
    let list = perSlug.get(row.slug)
    if (!list) { list = []; perSlug.set(row.slug, list) }
    list.push(row.name)
  }

  for (const [slug, names] of perSlug) {
    const pathGroup = tagPathGroup(slug)
    // 同一篇笔记里的语义命名空间（去重，避免一篇贡献多次）
    const nsHere = new Set<string>()
    for (const name of names) {
      const ns = tagNamespace(name)
      if (ns && !isStructuralTagNamespace(ns)) nsHere.add(ns)
    }
    for (const name of names) {
      if (tagNamespace(name)) continue // 有命名空间的标签不需要推断
      let st = stats.get(name)
      if (!st) { st = { count: 0, cooc: new Map(), paths: new Map() }; stats.set(name, st) }
      st.count++
      for (const ns of nsHere) st.cooc.set(ns, (st.cooc.get(ns) ?? 0) + 1)
      if (pathGroup) st.paths.set(pathGroup, (st.paths.get(pathGroup) ?? 0) + 1)
    }
  }

  const index = new Map<string, string>()
  for (const [name, st] of stats) {
    const curated = curatedTagGroup(name)
    if (curated) { index.set(name, curated); continue }
    const cooc = pickTop(st.cooc, CO_OCCUR_MIN)
    if (cooc) { index.set(name, cooc.key); continue }
    const path = pickTop(st.paths)
    if (path) { index.set(name, path.key); continue }
    index.set(name, '其他')
  }
  return index
}

/** 分组的最终取值：有前缀用自己的命名空间，裸标签查推断表，查不到落「其他」 */
export function tagGroupOf(name: string, index: Map<string, string>): string {
  const ns = tagNamespace(name)
  if (ns) return ns
  return index.get(name) || '其他'
}
