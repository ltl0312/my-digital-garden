import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../utils/db'
import { cleanSummary } from '../../utils/markdown'

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

  const where = {
    isPublished: true,
    ...(dir ? { slug: { startsWith: `${dir}/` } } : {}),
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { content: { contains: q, mode: 'insensitive' as const } }
      ]
    } : {})
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
      readingTime: true, updatedAt: true,
      tags: { include: { tag: true } }
    },
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize
  })
  const total = await prisma.note.count({ where })

  // 出参统一清洗摘要：DB 里的历史摘要由旧版 buildSummary 生成，含 markdown/HTML 标记
  // （列表里会显示成 `<h2>标题</h2>`，看起来像标题重复）→ 这里兜底洗一遍，无需重算全库
  return {
    notes: notes.map(n => ({ ...n, summary: n.summary ? cleanSummary(n.summary) : n.summary })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
})
