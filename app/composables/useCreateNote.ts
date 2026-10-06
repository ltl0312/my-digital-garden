/**
 * 新建笔记并打开它 —— 顶栏「新建」与结构树内联新建共用这一份实现。
 *
 * 为什么要有「等可读」这一步：新建接口只写 vault 文件，入库由 watcher 串行队列完成，
 * 因此刚拿到的 slug 在 `/api/notes/<slug>` 上会短暂 404（实测 1–1.5s）。此时若直接跳
 * 详情页，客户端路由会被这个 404 中止 —— 地址栏变成新笔记，页面内容却停在列表页，
 * 之后再也不会自行恢复（表现就是「新建的笔记一片空白、没有编辑入口」）。
 * 服务端现在已在 POST 返回前主动入库（见 server/api/vault/notes/index.post.ts），
 * 这里再兜一层有界等待，覆盖 watcher 兜底路径与慢盘。
 *
 * 抽成 composable 的原因：这两条入口此前只有顶栏加了等待，结构树内联新建是直接跳转 ——
 * 同一个缺陷写两遍就会漏一处。
 */
export const useCreateNote = () => {
  /** 轮询直到该笔记可读。超时返回 false —— 宁可让详情页以可重试的错误页收场，
   *  也好过静默停在一个伪装成「空笔记」的列表页。 */
  const waitNoteReadable = async (slug: string, timeoutMs = 8000) => {
    const enc = slug.split('/').map(encodeURIComponent).join('/')
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await $fetch(`/api/notes/${enc}`)
        return true
      } catch {
        await new Promise(r => setTimeout(r, 250))
      }
    }
    return false
  }

  const noteUrl = (slug: string) => `/notes/${slug.split('/').map(encodeURIComponent).join('/')}`

  /** POST 新建 + 刷新结构树，返回新笔记 slug（不跳转） */
  const createNote = async (path: string, title: string) => {
    const { slug } = await $fetch<{ slug: string }>('/api/vault/notes', {
      method: 'POST',
      body: { path, title }
    })
    await refreshNuxtData('vault-tree')
    return slug
  }

  /** 等可读后跳详情页 */
  const openNote = async (slug: string) => {
    await waitNoteReadable(slug)
    await navigateTo(noteUrl(slug))
  }

  /** 新建 → 等可读 → 打开（结构树内联新建用的就是这一条） */
  const createAndOpen = async (path: string, title: string) => {
    const slug = await createNote(path, title)
    await openNote(slug)
    return slug
  }

  return { waitNoteReadable, createNote, openNote, createAndOpen, noteUrl }
}
