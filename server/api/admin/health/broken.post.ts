import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { requireAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

/**
 * 断链巡检：`POST /api/admin/health/broken`
 *
 * 扫全库已发布笔记的 wiki 链接（`[[target]]` / `[[target|显示名]]`），
 * 用与入库同一套三级解析（精确 slug → basename → aliases）判定目标是否存在，
 * 把**解析失败**的目标汇总成 { target, count, sources } 落到 data/health/broken.json。
 *
 * 为什么不建表：这是可随时重算的派生视图（一次全量扫描 ≈ 若干次批量 IN 查询），
 * 建表就要引入迁移与「链接变化后如何失效」的一致性问题；json 文件足够，
 * 且不碰 schema —— 手写迁移 20260809000000_search_trgm_indexes 里的 GIN trgm 索引
 * 一旦被 migrate diff 判成「多余」，全站搜索会瞬间从索引扫描退化成全表扫描。
 *
 * 为什么不复用 markdown.ts 里的 resolveTargetSlugs：它是该模块的私有函数（未导出），
 * 而本次改动的文件范围被锁死（其他成员正并行改前端）。这里按同样的三级匹配复制了一份，
 * 语义必须与 server/utils/markdown.ts 的 resolveTargetSlugs 保持一致——
 * 任何一侧改了匹配规则（例如新增「按 frontmatter title 匹配」），另一侧必须同步，
 * 否则「巡检说断链、渲染器却能解析」这种自相矛盾的结论就会出现在同一个站点上。
 */

/** 每批扫描条数（契约上限 100）：控制单次 IN 查询的参数规模与内存峰值 */
const BATCH_SIZE = 100
/** 每个断链目标最多回传的来源笔记数（全量列出来会把响应撑爆，看前 10 个足够定位） */
const SOURCES_LIMIT = 10
/** wiki 链接：与 markdown.ts 的 wikiLinkRegex 同形（`[[a]]` / `[[a|b]]`） */
const WIKI_LINK_RE = /\[\[(.*?)(?:\|(.*?))?\]\]/g

/** 巡检结果落盘路径：只写 data/ 之下（契约要求），目录不存在时递归创建 */
function brokenFilePath(): string {
  return path.join(process.cwd(), 'data', 'health', 'broken.json')
}

/**
 * 三级目标解析（复制自 server/utils/markdown.ts 的 resolveTargetSlugs，逐字同义）：
 *   ① 精确 slug；② basename（Obsidian 最短文件名，slug 以 /target 结尾）；③ aliases。
 * 返回 Map<target, 真实 slug | null>，null = 解析失败 = 断链。
 */
async function resolveTargets(targets: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const unique = [...new Set(targets)].map(t => t.trim()).filter(Boolean)
  if (!unique.length) return map

  // 第一级：精确 slug 匹配（批量）
  const exact = await prisma.note.findMany({
    where: { slug: { in: unique } },
    select: { slug: true }
  })
  const exactSet = new Set(exact.map(n => n.slug))
  for (const t of unique) map.set(t, exactSet.has(t) ? t : null)
  const rest1 = unique.filter(t => !exactSet.has(t))
  if (!rest1.length) return map

  // 第二级：basename 匹配（slug 以 /target 结尾）
  const byBasename = await prisma.note.findMany({
    where: { OR: rest1.map(t => ({ slug: { endsWith: `/${t}` } })) },
    select: { slug: true }
  })
  const basenameMap = new Map<string, string>()
  for (const n of byBasename) {
    const base = n.slug.split('/').pop() ?? ''
    if (base && !basenameMap.has(base)) basenameMap.set(base, n.slug)
  }
  for (const t of rest1) {
    const hit = basenameMap.get(t)
    if (hit) map.set(t, hit)
  }
  const rest2 = rest1.filter(t => !basenameMap.has(t))
  if (!rest2.length) return map

  // 第三级：aliases 匹配（metadata JSONB array_contains）
  const byAlias = await prisma.note.findMany({
    where: { OR: rest2.map(t => ({ metadata: { path: ['aliases'], array_contains: [t] } })) },
    select: { slug: true, metadata: true }
  })
  const aliasOwners = new Map<string, string>()
  for (const n of byAlias) {
    const meta = n.metadata as { aliases?: unknown } | null
    const aliases = Array.isArray(meta?.aliases) ? meta.aliases : []
    for (const a of aliases) {
      if (typeof a === 'string' && rest2.includes(a) && !aliasOwners.has(a)) {
        aliasOwners.set(a, n.slug)
      }
    }
  }
  for (const t of rest2) {
    const owner = aliasOwners.get(t)
    // 三级都没命中：显式写回 null，保持「每个 target 都有结论」
    map.set(t, owner ?? null)
  }
  return map
}

/** 从正文提取 wiki 链接目标（同一篇内去重：count 口径 = 引用该目标的笔记篇数） */
function extractTargets(content: string): string[] {
  const targets = new Set<string>()
  WIKI_LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WIKI_LINK_RE.exec(content)) !== null) {
    const target = (m[1] ?? '').trim()
    if (target) targets.add(target)
  }
  return [...targets]
}

export default defineEventHandler(async (event) => {
  // 双重门：全局中间件对 /api/admin/* 的非只读方法已要求管理身份，
  // 这里再显式校验一次（接口自身的门不依赖中间件配置，未来改前缀表也不会静默放开）
  await requireAdmin(event)

  // target → { count: 引用篇数, sources: slug → title }
  const agg = new Map<string, { count: number; sources: Map<string, string> }>()
  let offset = 0
  let scanned = 0

  for (;;) {
    const batch = await prisma.note.findMany({
      where: { isPublished: true },
      // 契约：只取 slug / content（正文要用来提取 wiki 链接；其余列一律不搬）
      select: { slug: true, content: true },
      orderBy: { id: 'asc' },
      skip: offset,
      take: BATCH_SIZE
    })
    if (!batch.length) break
    offset += batch.length
    scanned += batch.length

    // 来源笔记的标题（sources 要展示「哪几篇引用了这个不存在的目标」）：
    // 单独一次窄查询，避免把 title 塞进上面的扫描 select 破坏「只取 slug,content」的约定
    const titles = new Map<string, string>()
    const titleRows = await prisma.note.findMany({
      where: { slug: { in: batch.map(n => n.slug) } },
      select: { slug: true, title: true }
    })
    for (const row of titleRows) titles.set(row.slug, row.title)

    const perNote = batch.map(n => ({ slug: n.slug, targets: extractTargets(n.content) }))
    const allTargets = new Set<string>()
    for (const n of perNote) for (const t of n.targets) allTargets.add(t)

    // 批内一次性解析（与入库同口径的三级匹配），批与批之间共享同一个 agg 累加
    const resolved = await resolveTargets([...allTargets])

    for (const n of perNote) {
      for (const target of n.targets) {
        // 解析成功（任何一级命中）就不是断链；undefined 只可能来自空 target，已被过滤
        if (resolved.get(target) != null) continue
        const entry = agg.get(target) ?? { count: 0, sources: new Map<string, string>() }
        entry.count += 1
        if (!entry.sources.has(n.slug)) {
          entry.sources.set(n.slug, titles.get(n.slug) ?? n.slug)
        }
        agg.set(target, entry)
      }
    }
  }

  const items = [...agg.entries()]
    .map(([target, v]) => ({
      target,
      count: v.count,
      sources: [...v.sources.entries()]
        .slice(0, SOURCES_LIMIT)
        .map(([slug, title]) => ({ slug, title }))
    }))
    // count 降序；并列时按目标名升序，保证同一份库两次巡检得到同一份顺序（便于 diff）
    .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target))

  const scannedAt = new Date().toISOString()
  const payload = { scannedAt, items, total: items.length }

  const file = brokenFilePath()
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    // 原子写：巡检可能被前端定时触发，读侧（GET）不能读到写了一半的 JSON
    const tmp = file + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8')
    await fs.rename(tmp, file)
  } catch (e) {
    console.error('[garden] health: 断链巡检结果写入失败', e)
    // 扫描本身已经成功，但结果没落盘 = GET 读到的仍是上一次的快照。
    // 这里如实报错，不让前端以为「刚刚扫过了、一切正常」。
    throw createError({
      statusCode: 500,
      message: '断链巡检结果写入失败',
      data: { code: 'HEALTH_WRITE_FAILED' }
    })
  }

  console.log(`[garden] health: 断链巡检完成，扫描 ${scanned} 篇，断链目标 ${items.length} 个`)
  return { ok: true, scannedAt, total: items.length }
})
