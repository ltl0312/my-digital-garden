import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../utils/db'

/**
 * 阅读顺序上的「上一篇 / 下一篇」：`GET /api/notes/neighbors?slug=<slug>`
 *
 * 序列定义 = 全库 `isPublished: true` 的笔记按 `updatedAt desc` 排成一列，
 * 与 `GET /api/notes`（缺省排序）**完全同序**，所以「列表里点进第 3 篇、
 * 按下一篇」拿到的一定是列表里的第 4 篇。
 *
 * prev / next 的方向刻意写死成「列内位置」而不是「更新时间」：
 *   prev = 序列中位于本篇**之前**的一篇（更新时间更近）
 *   next = 序列中位于本篇**之后**的一篇（更早）
 * 前端把它当作「翻页方向」使用即可；不要反过来按时间直觉理解。
 *
 * updatedAt 相同的并列项用 slug 升序兜底：全量重同步（应用重启触发）会让
 * 一批笔记落在同一毫秒，缺了兜底键，同一篇的 prev/next 在两次请求之间会抖动。
 */
export interface NeighborRef {
  slug: string
  title: string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const raw = typeof query.slug === 'string' ? query.slug.trim() : ''
  // 容错：前端可能把 slug 里的分隔符写成反斜杠，或带了首尾斜杠
  const slug = raw ? raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : ''
  if (!slug) {
    throw createError({ statusCode: 400, message: 'slug 不能为空', data: { code: 'INVALID_SLUG' } })
  }

  // 只取 slug/title 两列：全库千篇量级时这是一次很窄的查询，
  // 但也不能 select 正文 —— 那是几百 MB 级别的无谓搬运。
  const rows = await prisma.note.findMany({
    where: { isPublished: true },
    select: { slug: true, title: true },
    orderBy: [{ updatedAt: 'desc' }, { slug: 'asc' }]
  })

  const index = rows.findIndex(r => r.slug === slug)
  if (index < 0) {
    throw createError({ statusCode: 404, message: '笔记不存在或未发布', data: { code: 'NOTE_NOT_FOUND' } })
  }

  // noUncheckedIndexedAccess 下 rows[i] 是可能缺省的，越界必须自己收敛成 null
  const pick = (i: number): NeighborRef | null => {
    const row = rows[i]
    return row ? { slug: row.slug, title: row.title } : null
  }

  return { prev: pick(index - 1), next: pick(index + 1) }
})
