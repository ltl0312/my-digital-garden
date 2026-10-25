import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'

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
 */
export default defineEventHandler(async () => {
  const tags = await prisma.tag.findMany({
    select: { name: true, _count: { select: { notes: true } } },
    orderBy: { notes: { _count: 'desc' } }
  })
  return tags
    .filter(t => t._count.notes > 0)
    .map(t => ({ name: t.name, count: t._count.notes }))
})
