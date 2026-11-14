import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../utils/db'
import { cleanSummary } from '../../utils/markdown'
import { isAdminRole } from '../../utils/auth'
// 领域解析唯一入口（显式领域 > 路径派生 > 兜底「其他」），与首页统计/详情页同源
import { resolveDomain } from '#shared/domain'
// 类型 / 成熟度两条分类轴的口径（与 /api/overview、首页仪表盘同源）
import { TYPE_NAMESPACE, UNTYPED, isMaturity } from '#shared/note-types'

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
  const where = {
    isPublished: true,
    ...(maturity ? { maturity } : {}),
    ...(pendingFilter === 'none' ? { suggestions: { none: { status: 'pending' } } } : {}),
    ...(pendingFilter === 'has' ? { suggestions: { some: { status: 'pending' } } } : {}),
    AND: [
      ...(domainFilter ? [domainFilter] : []),
      ...(tag ? [{ tags: { some: { tag: { name: tag } } } }] : []),
      ...(typeRaw && !wantUntyped
        ? [{ tags: { some: { tag: { name: `${TYPE_NAMESPACE}${typeRaw}` } } } }]
        : []),
      ...(wantUntyped
        ? [{ tags: { none: { tag: { name: { startsWith: TYPE_NAMESPACE } } } } }]
        : []),
      ...(q
        ? [{
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { content: { contains: q, mode: 'insensitive' as const } }
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
    notes: notes.map((n) => {
      // 领域在服务端解析：NoteRow 这类组件只有 slug，算不出人工指定的领域
      const d = resolveDomain(n.slug, n.domainLevel1)
      return {
        ...n,
        summary: n.summary ? cleanSummary(n.summary) : n.summary,
        domain: d.domain,
        domainFrom: d.from,
        ...(isAdmin ? { hasPending: pendingIds.has(n.id) } : {})
      }
    }),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
})
