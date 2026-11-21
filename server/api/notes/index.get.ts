import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../utils/db'
import { cleanSummary } from '../../utils/markdown'
import { isAdminRole } from '../../utils/auth'
// 领域解析唯一入口（显式领域 > 路径派生 > 兜底「其他」），与首页统计/详情页同源
import { resolveDomain } from '#shared/domain'
// 类型 / 成熟度两条分类轴的口径（与 /api/overview、首页仪表盘同源）
import { TYPE_NAMESPACE, UNTYPED, isMaturity } from '#shared/note-types'

/** 摘要片段：命中词左右各 60 字，总长上限 120 字（契约值，前端按此留位） */
const SNIPPET_SIDE = 60
const SNIPPET_MAX = 120

/**
 * 正文纯文本片段：以命中词为中心截取。
 *
 * 为什么先过 cleanSummary：列表片段是纯文本展示位，Markdown 标记（`##`、`**`、
 * `[[]]`、表格竖线）直接吐给前端会变成一屏乱码。cleanSummary 是摘要清洗的同源实现，
 * 这里复用它保证「列表摘要」与「搜索片段」的净化口径完全一致。
 *
 * 命中词被窗口切掉时（关键词本身很长、或命中在正文很靠后的位置）把窗口右移，
 * 优先保证「命中词完整可见」，否则用户看到的片段里压根找不到自己搜的词。
 */
function makeSnippet(raw: string, needle: string): string | null {
  const plain = cleanSummary(raw)
  if (!plain) return null
  const at = plain.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return null
  let start = Math.max(0, at - SNIPPET_SIDE)
  let end = Math.min(plain.length, start + SNIPPET_MAX)
  if (at + needle.length > end) {
    end = Math.min(plain.length, at + needle.length)
    start = Math.max(0, end - SNIPPET_MAX)
  }
  return plain.slice(start, end)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page)) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize)) || 10))
  const tag = typeof query.tag === 'string' && query.tag.trim() ? query.tag.trim() : undefined
  const q = typeof query.q === 'string' && query.q.trim() ? query.q.trim() : undefined
  // 目录前缀筛选（供侧栏「领域」面板点击即筛选；E2 新增）
  const dir = typeof query.dir === 'string' && query.dir.trim()
    ? query.dir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    : undefined

  // 管理身份（全局中间件已把密钥放进 context）——决定是否回传「是否有待审建议」这类管理侧信息
  const actor = (event.context as { authKey?: { role?: string } }).authKey
  const isAdmin = isAdminRole(actor?.role)

  /**
   * 领域筛选（可选，配合 dir 一起传）：按**生效领域**过滤，而不是只看目录。
   *
   * 为什么要这样：本项目的领域有两条来源 —— 显式指定（`Note.domainLevel1`，人工/审核写入）
   * 与路径派生（知识区下一级目录）。若这里只按 `slug startsWith dir` 过滤，
   * 那些「人在别的目录、领域被显式改成 X」的笔记就会漏掉，筛出来的结果与界面显示的领域不符。
   * 所以命中条件 = `domainLevel1 = domain` **或**（未显式指定 且 路径落在该领域的目录下）。
   */
  const domain = typeof query.domain === 'string' && query.domain.trim() ? query.domain.trim() : undefined

  /**
   * 成熟度筛选（首页「按成熟度」卡片进入的分类页）。
   * 只认三个枚举值；非法值当作「不筛」，免得手改 URL 得到一张空列表。
   */
  const maturityRaw = typeof query.maturity === 'string' ? query.maturity.trim().toUpperCase() : ''
  const maturity = isMaturity(maturityRaw)
    ? (maturityRaw as 'SEEDLING' | 'GROWING' | 'EVERGREEN')
    : undefined

  /**
   * 类型筛选（首页「按类型」卡片）。type 是 `type/*` 标签的取值；
   * 「未分类」不是一个标签，而是「一个 type/* 都没有」的口径 ——
   * 必须与 /api/overview 的 types 计数完全一致（那边是 types.length === 0，这边用 none + startsWith）。
   */
  const typeRaw = typeof query.type === 'string' && query.type.trim() ? query.type.trim() : undefined
  const wantUntyped = typeRaw === UNTYPED

  /**
   * 连接健康度筛选（图谱下线后唯一的「孤立笔记」入口）：
   *   isolated = 零入度且零出度；linked = 至少一条入边或出边。
   *
   * 口径必须与 /api/overview 的 `isolated = total - linked.size` 完全一致，
   * 所以两端的连接都要**按已发布过滤**：overview 里一条边只有在
   * 「两端都是 isPublished 笔记」时才把两端都记为已连接，
   * 若这里写成裸的 `incoming: { none: {} }`，一篇只被**未发布**草稿引用的笔记
   * 在 overview 里算孤立、在这里却算已连接 —— 两个页面的数字对不上。
   * 全库都已发布时，两种写法等价。
   */
  const healthRaw = typeof query.health === 'string' ? query.health.trim() : ''
  const health = healthRaw === 'isolated' || healthRaw === 'linked' ? healthRaw : ''
  const healthFilter = health === 'isolated'
    ? {
        incoming: { none: { source: { isPublished: true } } },
        outgoing: { none: { target: { isPublished: true } } }
      }
    : health === 'linked'
      ? {
          OR: [
            { incoming: { some: { source: { isPublished: true } } } },
            { outgoing: { some: { target: { isPublished: true } } } }
          ]
        }
      : null

  const dirFilter = dir ? { slug: { startsWith: `${dir}/` } } : null
  const domainFilter = domain
    ? {
        OR: [
          { domainLevel1: domain },
          ...(dirFilter ? [{ AND: [{ domainLevel1: null }, dirFilter] }] : [])
        ]
      }
    : dirFilter

  /**
   * 待审筛选（**仅管理员可用**）：none = 还没有待审建议的笔记；has = 已有待审建议的笔记。
   * 用途是「指定笔记生成建议」的多选器 —— 管理员最需要的是「哪些还没判定过」。
   * 对普通用户忽略该参数：待审队列是管理侧状态，不该成为普通用户可查询的信息。
   */
  const pendingFilterRaw = typeof query.pending === 'string' ? query.pending.trim() : ''
  const pendingFilter = isAdmin && (pendingFilterRaw === 'none' || pendingFilterRaw === 'has')
    ? pendingFilterRaw
    : ''

  // 组合条件一律走 AND 数组：领域筛选与关键词搜索**各自都可能产生 OR**，
  // 若把两个 OR 平铺在同一个对象里，后者会覆盖前者（搜索时会静默丢掉领域筛选）。
  // 同理 tag 与 type 都落在 `tags` 这个键上：平铺会互相覆盖，所以一起进 AND。
  // health 的 linked 分支同样是一个 OR，也必须进 AND。
  const where = {
    isPublished: true,
    ...(maturity ? { maturity } : {}),
    ...(pendingFilter === 'none' ? { suggestions: { none: { status: 'pending' } } } : {}),
    ...(pendingFilter === 'has' ? { suggestions: { some: { status: 'pending' } } } : {}),
    AND: [
      ...(domainFilter ? [domainFilter] : []),
      ...(healthFilter ? [healthFilter] : []),
      ...(tag ? [{ tags: { some: { tag: { name: tag } } } }] : []),
      ...(typeRaw && !wantUntyped
        ? [{ tags: { some: { tag: { name: `${TYPE_NAMESPACE}${typeRaw}` } } } }]
        : []),
      ...(wantUntyped
        ? [{ tags: { none: { tag: { name: { startsWith: TYPE_NAMESPACE } } } } }]
        : []),
      ...(q
        ? [{
            // 搜索命中面：标题 / 正文 / slug / 标签名。
            // slug 与标签是「能搜到、但片段里没有正文命中」的两类 ——
            // 它们不产生 snippet/matchField（见下方映射），但不该被排除在结果之外：
            // 用户搜「Rust」时，一篇标题叫「书单」、标签挂了 Rust 的笔记正是他想找的。
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { content: { contains: q, mode: 'insensitive' as const } },
              { slug: { contains: q, mode: 'insensitive' as const } },
              { tags: { some: { tag: { name: { contains: q, mode: 'insensitive' as const } } } } }
            ]
          }]
        : [])
    ]
  }

  // 排序（spec 5.3 工具栏：最近更新 / 标题 / 阅读时长）；缺省按最近更新
  const sortRaw = typeof query.sort === 'string' ? query.sort : 'updated'
  const orderBy =
    sortRaw === 'title' ? { title: 'asc' as const }
      : sortRaw === 'reading' ? { readingTime: 'desc' as const }
        : { updatedAt: 'desc' as const }

  // 列表与计数无需事务（批量 $transaction 在 Prisma 7 + 驱动适配器下会间歇性 P2028 超时）
  const notes = await prisma.note.findMany({
    where,
    select: {
      id: true, slug: true, title: true, summary: true, maturity: true,
      readingTime: true, updatedAt: true, domainLevel1: true,
      tags: { include: { tag: true } }
    },
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize
  })
  const total = await prisma.note.count({ where })

  /**
   * 搜索片段与命中位置：只对**当前页**、且标题未命中的行去取正文。
   *
   * 为什么单独一次窄查询而不是把 content 塞进上面的 select：列表 select 是全站最热的
   * 查询，正文动辄几十 KB，pageSize 上限 100 时会把一页响应撑到数 MB；
   * 这里只在不带 q 时**完全不查**，带 q 时也只按 id 捞正文并按 120 字截断后丢弃。
   *
   * 命中优先级：标题 > 正文。标签 / slug 命中不产出这两个字段（契约：没有正文命中就不返回）。
   */
  const qLower = q ? q.toLowerCase() : ''
  const isTitleHit = (title: string) => !!qLower && title.toLowerCase().includes(qLower)
  const snippetMap = new Map<string, { snippet: string; matchField: 'content' }>()
  if (q && notes.length) {
    const needContent = notes.filter(n => !isTitleHit(n.title)).map(n => n.id)
    if (needContent.length) {
      const rows = await prisma.note.findMany({
        where: { id: { in: needContent } },
        select: { id: true, content: true }
      })
      for (const row of rows) {
        const snippet = makeSnippet(row.content, q)
        if (snippet) snippetMap.set(row.id, { snippet, matchField: 'content' })
      }
    }
  }

  /**
   * 有 q 时把标题命中的排到本页前面。
   *
   * 为什么在内存里重排：Prisma 的 orderBy 表达不了「title contains q」这种条件排序
   * （CASE WHEN 不在 orderBy 的能力内），要表达只能上 raw SQL。
   * 关键约束：**只重排当前页，不碰 skip/take 与 total** —— 排序是展示层偏好，
   * 若为了跨页排序去改 offset，翻页会出现重复/漏项。因此用稳定分区：标题命中在前，
   * 其余维持数据库给出的顺序（默认 updatedAt desc，显式传 sort 时按该 sort）。
   */
  const ordered = q
    ? [...notes.filter(n => isTitleHit(n.title)), ...notes.filter(n => !isTitleHit(n.title))]
    : notes

  // 管理侧附加信息：这一页里哪些笔记已有待审建议（多选器据此显示徽标、避免重复判定）。
  // 只查当前页的 id，代价一次小查询；**对普通用户不返回**（待审队列属管理侧状态）。
  let pendingIds = new Set<string>()
  if (isAdmin && notes.length) {
    const rows = await prisma.suggestion.findMany({
      where: { status: 'pending', noteId: { in: notes.map(n => n.id) } },
      select: { noteId: true }
    })
    pendingIds = new Set(rows.map(r => r.noteId))
  }

  // 出参统一清洗摘要：DB 里的历史摘要由旧版 buildSummary 生成，含 markdown/HTML 标记
  // （列表里会显示成 `<h2>标题</h2>`，看起来像标题重复）→ 这里兜底洗一遍，无需重算全库
  return {
    notes: ordered.map((n) => {
      // 领域在服务端解析：NoteRow 这类组件只有 slug，算不出人工指定的领域
      const d = resolveDomain(n.slug, n.domainLevel1)
      const titleHit = isTitleHit(n.title)
      const contentHit = snippetMap.get(n.id)
      return {
        ...n,
        summary: n.summary ? cleanSummary(n.summary) : n.summary,
        domain: d.domain,
        domainFrom: d.from,
        // 标题命中给标题片段（标题通常远短于 120，命中词必然完整可见）；
        // 正文命中给正文片段；两类都没命中（标签 / slug 命中）则两个字段都不出现。
        ...(titleHit
          ? { snippet: cleanSummary(n.title).slice(0, SNIPPET_MAX), matchField: 'title' as const }
          : contentHit
            ? { snippet: contentHit.snippet, matchField: contentHit.matchField }
            : {}),
        ...(isAdmin ? { hasPending: pendingIds.has(n.id) } : {})
      }
    }),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
})
