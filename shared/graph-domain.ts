// 领域规则（**唯一一份**）
// 前端（app/composables/useFacets.ts）与后端（server/api/notes/graph.get.ts）共用本文件，
// 避免「列表页说工程、图谱页说其他」这类两边规则漂移。
//
// 两条规则，按优先级：
//   ① 显式领域：Note.domainLevel1 非空（人工 / 审核通过写入）→ 直接采用；
//   ② 路径派生：vault 内相对路径中 `NN_Knowledge` 段的下一个路径段即领域名；
//   两者都没有 → 兜底 DOMAIN_FALLBACK（「其他」）。
//
// 取最终领域名请统一用 resolveDomain(slug, explicit)，不要只调 domainOfSlug ——
// 后者只是第 ② 条规则的实现，单独使用会漏掉人工指定的领域。

/** 兜底领域名：无法从 slug 解析出领域时统一归到这里 */
export const DOMAIN_FALLBACK = '其他'

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

/** 同一套领域色相的数值形式（SVG / Canvas fill 需要真实颜色，不能吃 CSS 变量名） */
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
  `hsl(${DOMAIN_HUE_DEG[name] ?? DOMAIN_HUE_DEG[DOMAIN_FALLBACK]} 56% ${l}%)`

/** 从笔记 slug 解析领域名与所属目录（约定：<知识区>/<领域>/…；不匹配返回空串） */
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

/** 领域名归一：解析不出时落到兜底领域（图谱着色/分组一律走这里） */
export function normalizeDomain(domain: string | undefined): string {
  return domain || DOMAIN_FALLBACK
}

// ── 显式领域（人工 / 审核指定）：优先级高于路径派生 ──────────────────────────────
//
// 背景：领域原先是**纯路径派生**的，所以「给笔记分配领域」只能靠移动文件，旧 URL 会失效。
// 引入 Note.domainLevel1 后，分配领域变成写一个属性，路径不动。本区块就是这条规则的唯一份：
//   explicit（非空字符串） > 路径派生 > DOMAIN_FALLBACK
// 所有调用方（列表/图谱/详情/侧栏/命令面板）都必须走 resolveDomain，不要再各自拼。

export const DOMAIN_SOURCE_AUTO = 'auto'
export const DOMAIN_SOURCE_MANUAL = 'manual'
export type DomainSource = typeof DOMAIN_SOURCE_AUTO | typeof DOMAIN_SOURCE_MANUAL

/** 判定领域来源：'manual' 当且仅当显式领域非空 */
export function domainSourceOf(explicit?: string | null): DomainSource {
  return typeof explicit === 'string' && explicit.trim() ? DOMAIN_SOURCE_MANUAL : DOMAIN_SOURCE_AUTO
}

export interface ResolvedDomain {
  /** 生效领域名（已归一到兜底值） */
  domain: string
  /** 真实来源：manual = 显式指定；path = 路径派生；fallback = 两者皆无 */
  from: 'manual' | 'path' | 'fallback'
  /** 路径派生的领域（未经显式领域覆盖），用于在 UI 上对比「本来在哪 / 应该在哪」 */
  pathDomain: string
  /** vault 内相对目录（渲染成 `a / b` 形式，非 slug 形式） */
  dirPath: string
  /** 显式领域原始值（未归一；可能是空串/undefined） */
  explicit: string
}

/**
 * 领域解析的唯一入口。
 * @param slug 笔记 slug（vault 相对路径，不含 .md）
 * @param explicit Note.domainLevel1（未经审核或无覆盖时为 null/undefined）
 */
export function resolveDomain(slug: string | undefined, explicit?: string | null): ResolvedDomain {
  const path = domainOfSlug(slug)
  const e = typeof explicit === 'string' ? explicit.trim() : ''
  if (e) {
    return { domain: e, from: 'manual', pathDomain: path.domain, dirPath: path.dirPath, explicit: e }
  }
  return {
    domain: normalizeDomain(path.domain),
    from: path.domain ? 'path' : 'fallback',
    pathDomain: path.domain,
    dirPath: path.dirPath,
    explicit: ''
  }
}

/** 常用简写：只要生效领域名 */
export function domainNameOf(slug: string | undefined, explicit?: string | null): string {
  return resolveDomain(slug, explicit).domain
}

/**
 * 是否属于「已知领域」。已知领域 = 路径里实际出现过的 NN_Knowledge 一级目录，
 * 外加 8 个色族名称（DOMAIN_HUES 的键，除兜底值以外）。
 * 用途：拒绝把领域写成自由文本 —— 领域最终要进色相映射与侧栏聚合，
 * 允许任意字符串会产生无色相、无法聚合的「幽灵领域」。
 */
export function isKnownDomain(name: string | undefined, knownDirs: readonly string[] = []): boolean {
  if (!name) return false
  const n = name.trim()
  if (!n || n === DOMAIN_FALLBACK) return false
  if (knownDirs.includes(n)) return true
  // 色族名称（DOMAIN_HUES 的键里除兜底值）也算已知，便于给不在知识区的笔记指一个领域
  return Object.keys(DOMAIN_HUES).some(k => k !== DOMAIN_FALLBACK && k === n)
}
