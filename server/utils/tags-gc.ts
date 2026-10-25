import { prisma } from './db'

/**
 * 清理「没有任何笔记引用」的标签行。
 *
 * 为什么会有这种行：`Tag` 只在标签第一次被写进某篇笔记时由 `tx.tag.upsert` 创建，
 * 但**没有任何地方在它失去最后一个引用时删掉它**。于是审核通过（重写某篇笔记的标签）、
 * 删除笔记、批量改标签都会留下孤儿行 —— 它们会以「0 条笔记」的形式出现在标签页里，
 * 点进去是一片空白，还会混进自动判定的候选池里被当成「既有标签」推荐出去。
 *
 * 只在「批量改标签/删笔记/审核」这类低频路径调用，不进 watcher 的每篇热路径：
 * `notes: { none: {} }` 是 anti-join，几十行的表上很快，但没必要 524 篇各跑一次。
 */
export async function pruneOrphanTags(): Promise<number> {
  try {
    const res = await prisma.tag.deleteMany({ where: { notes: { none: {} } } })
    if (res.count > 0) {
      console.log(`[garden] tags: 清理了 ${res.count} 个没有任何笔记引用的标签`)
    }
    return res.count
  } catch (e) {
    // 清理失败不该影响主流程（标签页已经有 count>0 过滤兜底）
    console.warn('[garden] tags: 孤儿标签清理失败（不影响本次操作）:', e)
    return 0
  }
}
