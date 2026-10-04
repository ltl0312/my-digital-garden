// 领域派生规则（**唯一一份**）
// 前端（app/composables/useFacets.ts）与后端（server/api/notes/graph.get.ts）共用本文件，
// 避免「列表页说工程、图谱页说其他」这类两边规则漂移。
// 规则：vault 内相对路径中 `NN_Knowledge` 段的下一个路径段即领域名。

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
