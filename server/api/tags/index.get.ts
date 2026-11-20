import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'
import { computeTagGroupIndex, tagGroupOf } from '#shared/tag-group'

/**
 * 标签清单（侧栏「标签」面板与筛选下拉共用）。
 *
 * 只返回**至少有一篇笔记引用**的标签：
 *   · `Tag` 行只在标签第一次被写进笔记时创建，失去最后一个引用时不会被删，
 *     所以库里会积累「0 条笔记」的幽灵标签（线上实测有 `Java`、`后端`、`数据库`、
 *     `status/待处理`、`J标签A/B/C` 等 10 个）。它们点进去是一片空白，
 *     摆在标签页里只会让人怀疑数据坏了 —— 用户明确问过「为什么还有 0 条笔记的标签」。
 *   · 真正删除这些行由 `pruneOrphanTags()` 在审核/删除等低频路径上做，
 *     这里只是把结果挡在接口之外（即使 GC 还没跑到，界面也看不到）。
 *
 * 每个标签额外带一个 `group`（分组名）：侧栏按它分组，不再出现「未分组」。
 * 历史遗留的裸标签（无 `命名空间/` 前缀）有近千个，改名要动 2100 篇 Markdown 的
 * frontmatter，所以在展示层推导 —— 规则见 `shared/tag-group.ts`（纯函数，可对账）。
 */
export default defineEventHandler(async () => {
  const [tags, pairs, notes] = await Promise.all([
    prisma.tag.findMany({
      select: { id: true, name: true, _count: { select: { notes: true } } },
      orderBy: { notes: { _count: 'desc' } }
    }),
    // 分组要看「哪些标签同现在一篇里」+「标签所在笔记的目录」，所以取全量的关联对。
    // 线上真实规模：7632 对、2107 篇 —— 每行几十字节，整份取回不足 1MB，比 N 次 count 便宜。
    prisma.noteTag.findMany({ select: { noteId: true, tagId: true } }),
    prisma.note.findMany({ select: { id: true, slug: true } })
  ])

  const tagName = new Map<number, string>()
  for (const t of tags) tagName.set(t.id, t.name)
  const slugOf = new Map<string, string>()
  for (const n of notes) slugOf.set(n.id, n.slug)

  const rows: { name: string; slug: string }[] = []
  for (const p of pairs) {
    const name = tagName.get(p.tagId)
    const slug = slugOf.get(p.noteId)
    if (name && slug) rows.push({ name, slug })
  }
  const index = computeTagGroupIndex(rows)

  return tags
    .filter(t => t._count.notes > 0)
    .map(t => ({
      name: t.name,
      count: t._count.notes,
      group: tagGroupOf(t.name, index)
    }))
})
