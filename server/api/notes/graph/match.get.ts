import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../../utils/db'

/**
 * 按「路径 / 名称 / 正文内容」匹配笔记，只回 id 列表 —— 供图谱页批量上色时圈选节点。
 *
 * 为什么不复用 /api/notes?q=：那个接口分页回的是列表行，且正文命中与标题命中不可分开；
 * 批量上色需要的是「命中了哪些节点」这一个集合，且正文检索必须能单独开关
 * （正文命中往往比标题命中宽得多，混在一起选不准）。
 *
 * 正文用 `contains`（ILIKE %q%）——`Note_content_trgm_idx` 这个 pg_trgm GIN 索引
 * 已存在（见 20260809000000_search_trgm_indexes），查询走索引不是全表扫。
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  if (!q) return { ids: [], total: 0, truncated: false }

  // fields 白名单：默认只搜正文（路径/名称在前端本地算，省一次往返）
  const requested = (typeof query.fields === 'string' ? query.fields : 'content')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean)
  const fields = new Set(requested.filter(f => f === 'path' || f === 'name' || f === 'content'))
  if (!fields.size) return { ids: [], total: 0, truncated: false }

  const limit = Math.min(5000, Math.max(1, Number(query.limit) || 1000))

  const OR: Record<string, unknown>[] = []
  if (fields.has('path')) OR.push({ slug: { contains: q, mode: 'insensitive' as const } })
  if (fields.has('name')) OR.push({ title: { contains: q, mode: 'insensitive' as const } })
  if (fields.has('content')) OR.push({ content: { contains: q, mode: 'insensitive' as const } })

  const where = { isPublished: true, OR }

  const [rows, total] = await Promise.all([
    prisma.note.findMany({ where, select: { id: true }, take: limit }),
    prisma.note.count({ where })
  ])

  return { ids: rows.map(r => r.id), total, truncated: total > rows.length }
})
