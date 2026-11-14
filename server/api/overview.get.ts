import { defineEventHandler } from 'h3'
import { prisma } from '../utils/db'
import { createCache } from '../utils/cache'
import { MATURITY_LABEL, MATURITY_ORDER, TYPE_ORDER, UNTYPED, typeOfTag } from '#shared/note-types'

/**
 * 首页仪表盘的数据源：把「一共多少篇、按什么分了多少」一次算清。
 *
 * 为什么第一根轴用**目录**而不是「领域」：领域（resolveDomain）只认
 * `NN_Knowledge/<领域>` 这一种路径形状，而 vault 现有的主力是 `ltl/01-编程语言`、
 * `zrw/技术` 这类二级目录 —— 实测 1204 篇里有 920 篇会落进「其他」兜底桶，
 * 做成卡片等于给用户一块「其他 920」的墙。二级目录是这张盘子上真实可分的形状，
 * 也天然对得上 /api/notes?dir= 的筛选参数（点进去就是那棵子树）。
 *
 * 为什么要有这个接口：三个分类轴的数据来源各不相同 ——
 *   目录   = slug 的前两段（`ltl/01-编程语言`、`zrw/技术`、`KnowledgeBase/03_Knowledge`）
 *   类型   = `type/*` 标签命名空间（笔记 / 教程 / MOC / 素材，其余算「未分类」）
 *   成熟度 = Note.maturity 枚举
 * 让前端分别去 /api/tags 与 /api/vault/tree 拼，既拿不到兜底桶，也数不出未分类。
 * 这里一次 findMany（字段很窄，千篇量级）就把三个维度同时归并好，另附连接数与孤立数
 * （原来只有知识图谱接口在算，图谱下线后挪到这里 —— 那是全站唯一一处「链接统计」）。
 *
 * 口径提醒：`types` 的计数是**笔记篇数**（一篇带多个 type 标签时只记一次），
 * 与 `tags` 接口按标签引用次数计数不是一回事，别拿两个数字互相校验。
 */

export interface OverviewBucket {
  /** 分类键：目录路径前缀（`ltl/01-编程语言`）/ type 标签取值 / 成熟度枚举 */
  key: string
  /** 展示名（成熟度是中文，其余等于 key） */
  label: string
  count: number
}

export interface OverviewPayload {
  total: number
  /** 双向链接条数（两端都是已发布笔记才计） */
  links: number
  /** 没有任何连接的已发布笔记数 */
  isolated: number
  /** 二级目录（slug 前两段）篇数，按篇数倒序 */
  sections: OverviewBucket[]
  types: OverviewBucket[]
  maturity: OverviewBucket[]
}

// 30s：仪表盘是全站最常打开的页面，但也不能让新建笔记后数字长时间不更新
// （入库完成时 invalidateGardenCache() 会立即清掉，见 server/utils/markdown.ts）
const overviewCache = createCache<OverviewPayload>(30_000)

export default defineEventHandler(async (): Promise<OverviewPayload> => {
  const cached = overviewCache.get()
  if (cached) return cached

  const notes = await prisma.note.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      slug: true,
      maturity: true,
      tags: { select: { tag: { select: { name: true } } } }
    }
  })

  const total = notes.length
  const published = new Set(notes.map(n => n.id))

  // —— 目录（slug 前两段）——
  // 只取两段：再深一层就是「一篇文章一个目录」的粒度，卡片会碎成一地；
  // 只有一段的笔记（根目录散篇）单独成桶，key 就是那一段本身。
  const sectionCounts = new Map<string, number>()
  for (const n of notes) {
    const segs = n.slug.split('/').filter(Boolean)
    const key = segs.length > 1 ? `${segs[0]}/${segs[1]}` : (segs[0] || '(root)')
    sectionCounts.set(key, (sectionCounts.get(key) || 0) + 1)
  }
  const sections: OverviewBucket[] = [...sectionCounts.entries()]
    .map(([key, count]) => ({ key, label: key.slice(key.lastIndexOf('/') + 1), count }))
    .sort((a, b) => b.count - a.count)

  // —— 类型（type/* 标签命名空间）——
  const typeCounts = new Map<string, number>()
  let untyped = 0
  for (const n of notes) {
    const names = n.tags.map(t => t.tag.name)
    const types = names.map(typeOfTag).filter((t): t is string => !!t)
    if (!types.length) {
      untyped++
      continue
    }
    // 同一篇挂了两个 type 标签时按「第一次出现」记一次，各桶之和因此 ≤ total
    for (const t of types) typeCounts.set(t, (typeCounts.get(t) || 0) + 1)
  }
  const known = TYPE_ORDER.filter(t => typeCounts.has(t))
  const extra = [...typeCounts.keys()].filter(t => !TYPE_ORDER.includes(t)).sort(
    (a, b) => (typeCounts.get(b) || 0) - (typeCounts.get(a) || 0)
  )
  const types: OverviewBucket[] = [...known, ...extra]
    .map(key => ({ key, label: key, count: typeCounts.get(key) || 0 }))
  if (untyped > 0) types.push({ key: UNTYPED, label: UNTYPED, count: untyped })

  // —— 成熟度 ——
  const maturityCounts = new Map<string, number>()
  for (const n of notes) maturityCounts.set(n.maturity, (maturityCounts.get(n.maturity) || 0) + 1)
  const maturity: OverviewBucket[] = MATURITY_ORDER
    .filter(m => maturityCounts.has(m))
    .map(m => ({ key: m, label: MATURITY_LABEL[m] || m, count: maturityCounts.get(m) || 0 }))

  // —— 连接与孤立 ——
  // 只统计两端都还在已发布集合里的链接：指向已删除/未发布笔记的悬空边不应计入「连接」，
  // 否则「连接数」会比页面上能看到的任何东西都大。
  const allLinks = await prisma.noteLink.findMany({ select: { sourceId: true, targetId: true } })
  const linked = new Set<string>()
  let links = 0
  for (const l of allLinks) {
    if (!published.has(l.sourceId) || !published.has(l.targetId)) continue
    links++
    linked.add(l.sourceId)
    linked.add(l.targetId)
  }
  const isolated = total - linked.size

  const payload: OverviewPayload = { total, links, isolated, sections, types, maturity }
  overviewCache.set(payload)
  return payload
})
