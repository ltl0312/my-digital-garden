import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '../../../utils/db'

/**
 * 按「文件路径 / 文件名 / tag 标签 / 笔记属性 / 文章内容」匹配笔记，只回 id 列表 ——
 * 供图谱页的颜色规则求值（服务端侧的那几个昂贵维度）。
 *
 * 为什么不复用 /api/notes?q=：那个接口分页回的是列表行，且各维度的命中不可分开；
 * 颜色规则需要的是「命中了哪些节点」这一个集合，且必须能单独指定维度
 * （正文命中往往比文件名命中宽得多，混在一起选不准）。
 *
 * 各维度求值位置：
 * - path / filename / content：DB `contains`（ILIKE %q%）。
 *   `Note_content_trgm_idx` 这个 pg_trgm GIN 索引已存在（见 20260909000000_search_trgm_indexes），
 *   正文查询走索引不是全表扫。
 * - tag：走 NoteTag → Tag 关系（Tag.name 唯一且有索引）。
 * - property：frontmatter 的值可能是字符串 / 数字 / 数组 / 嵌套对象，
 *   Prisma 的 JSON 过滤覆盖不了这些形态，所以只取 `{id, metadata}`（不带正文，几百行很轻）
 *   在 JS 里摊平后匹配。vault 规模（~525 篇）下完全够用。
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  if (!q) return { ids: [], total: 0, truncated: false }

  // fields 白名单：默认只搜正文（路径 / 文件名 / 标签在前端本地算，省一次往返）
  const requested = (typeof query.fields === 'string' ? query.fields : 'content')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean)
  const allowed = ['path', 'filename', 'name', 'tag', 'content', 'property']
  const fields = new Set(requested.filter(f => allowed.includes(f)))
  if (!fields.size) return { ids: [], total: 0, truncated: false }

  const limit = Math.min(5000, Math.max(1, Number(query.limit) || 1000))
  const propKey = typeof query.key === 'string' ? query.key.trim() : ''
  const wantsProperty = fields.has('property')

  const OR: Record<string, unknown>[] = []
  if (fields.has('path')) OR.push({ slug: { contains: q, mode: 'insensitive' as const } })
  // `name` 是 v1 的旧字段名，保留为 filename 的别名，老客户端不会 400
  if (fields.has('filename') || fields.has('name')) {
    OR.push({ title: { contains: q, mode: 'insensitive' as const } })
  }
  if (fields.has('tag')) {
    OR.push({ tags: { some: { tag: { name: { contains: q, mode: 'insensitive' as const } } } } })
  }
  if (fields.has('content')) OR.push({ content: { contains: q, mode: 'insensitive' as const } })

  // 带 property 时 DB 侧不能截断：两边的命中要取并集，截断后算不准 total
  const dbWhere = OR.length ? { isPublished: true, OR } : null

  const [rows, dbTotal, propIds] = await Promise.all([
    dbWhere
      ? prisma.note.findMany({
          where: dbWhere,
          select: { id: true },
          ...(wantsProperty ? {} : { take: limit })
        })
      : Promise.resolve([] as { id: string }[]),
    dbWhere ? prisma.note.count({ where: dbWhere }) : Promise.resolve(0),
    wantsProperty ? matchByProperty(q, propKey) : Promise.resolve([] as string[])
  ])

  if (!wantsProperty) {
    const ids = rows.map(r => r.id)
    return { ids, total: dbTotal, truncated: dbTotal > ids.length }
  }

  const merged = new Set(rows.map(r => r.id))
  for (const id of propIds) merged.add(id)
  const all = [...merged]
  return { ids: all.slice(0, limit), total: all.length, truncated: all.length > limit }
})

/** frontmatter 命中：指定 key 时只看那一个字段，否则扫所有字段 */
async function matchByProperty(q: string, key: string): Promise<string[]> {
  const rows = await prisma.note.findMany({
    where: { isPublished: true },
    select: { id: true, metadata: true }
  })
  const needle = q.toLowerCase()
  const out: string[] = []
  for (const r of rows) {
    const meta = r.metadata
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue
    const record = meta as Record<string, unknown>
    const values = key ? [record[key]] : Object.values(record)
    if (values.some(v => flattenProp(v).some(s => s.toLowerCase().includes(needle)))) out.push(r.id)
  }
  return out
}

/** 把 frontmatter 的值（字符串 / 数字 / 布尔 / 数组 / 嵌套对象）摊平成字符串列表 */
function flattenProp(v: unknown, depth = 0): string[] {
  if (v == null || depth > 3) return []
  if (typeof v === 'string') return [v]
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)]
  if (Array.isArray(v)) return v.flatMap(x => flattenProp(x, depth + 1))
  if (typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).flatMap(x => flattenProp(x, depth + 1))
  }
  return []
}
