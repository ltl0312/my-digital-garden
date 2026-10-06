import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import {
  resolveVaultPath, isValidNodeName, normalizeVaultRel, isStructuralPath,
  frontmatterTitle, rewriteNoteTitle, writeMarkdownAtomic
} from '../../utils/vault'
import { requireAdmin } from '../../utils/auth'
import { prisma } from '../../utils/db'
import { invalidateGardenCache } from '../../utils/cache'
import { processMarkdownFile } from '../../utils/markdown'

// C2 重命名（spec 8.8/8.9）：文件与文件夹改名。
// - 同目录重名一律 409（与新建/粘贴共用「文件名不可重复」规则）
// - 结构目录全员禁改（含 root）
// - 目录改名在同一事务内更新全部子孙 Note.slug（避免依赖 watcher unlink+add 之间「笔记短暂消失」）
// - NoteLink 端点引用 Note.id（非 slug），改名无需触碰反链
//
// ── 文件名与「笔记标题」的关系（用户报障修复）─────────────────────────
// 报障原文：「重命名之后只是在列表中改了名……在笔记正文部分最上面的标题还是修改前的名称，
// 总之，选择的重命名就是简单地修改列表名称而已」。根因：本接口过去只改磁盘文件名 + DB.slug，
// 而显示名派生自 frontmatter —— server/utils/markdown.ts:231
// `const title = frontmatter.title || path.basename(slug)`。旧笔记的 frontmatter 里已经有
// title，于是详情页文章头 / 笔记列表 / 图谱 / 各种选择器永远显示旧名。
//
// 现在的口径（用户确认过语义）：
//   ① 标题与旧文件名相同 —— 文件名就是题名，改名即改题名：
//      正文首个标题（**仅当它的文本确实等于旧文件名**）与 frontmatter.title 一起改。
//   ② 标题与旧文件名不同（用户自己写过的题名，导入笔记里很常见）—— 本接口**一个字都不改**，
//      响应里回 `titleMismatch: true`，由前端询问用户；用户确认后同名再调一次本接口
//      （带 `syncTitle: true`）—— 「同步标题」就是一次普通重命名，不需要第二条写入路径。
//      不询问时保留用户的题名：改个文件名顺手抹掉用户写的题名，比不改更糟。
//   ③ 目录重命名**不动任何子笔记的标题**（用户明确选择：只改路径）。
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ path?: string; name?: string; syncTitle?: boolean }>(event)) || {}
  let oldRel = normalizeVaultRel(body.path || '')
  const name = (body.name || '').trim()
  // syncTitle 的三态语义（在文件分支里解释）：true=连题名一起改、false=只改文件名、
  // undefined=调用方没表态，由服务端按「题名是否就是旧文件名」自己判断（口径 ①②）
  if (!oldRel) throw createError({ statusCode: 400, message: 'Invalid path' })
  if (!isValidNodeName(name)) throw createError({ statusCode: 400, message: 'Invalid name' })

  const tryResolve = (rel: string): string | null => {
    try { return resolveVaultPath(rel) } catch { return null }
  }

  let oldFull = tryResolve(oldRel)
  if (!oldFull) throw createError({ statusCode: 400, message: 'Invalid path' })
  let st = await fs.stat(oldFull).catch(() => null)
  // 树内 slug 无扩展名：文件补 .md 再试（与 DELETE 接口同一约定）
  if (!st && !/\.md$/i.test(oldRel)) {
    oldRel = `${oldRel}.md`
    oldFull = tryResolve(oldRel)
    if (!oldFull) throw createError({ statusCode: 400, message: 'Invalid path' })
    st = await fs.stat(oldFull).catch(() => null)
  }
  if (!st) throw createError({ statusCode: 404, message: 'Node not found' })
  const isDir = st.isDirectory()

  // 结构保护是所有人的红线（spec 8.9 设计决定 ③，含 root）
  if (isDir && isStructuralPath(oldRel)) {
    throw createError({ statusCode: 403, message: '越权操作：结构目录受保护，不可重命名' })
  }

  // 文件：允许省略 .md（树内展示无扩展名），缺省自动补齐
  const newName = !isDir && !/\.md$/i.test(name) ? `${name}.md` : name
  const parent = path.posix.dirname(oldRel)
  const newRel = parent === '.' ? newName : `${parent}/${newName}`

  let newFull: string
  try {
    newFull = resolveVaultPath(newRel)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const exists = await fs.stat(newFull).then(() => true).catch(() => false)
  if (exists) throw createError({ statusCode: 409, message: '同目录下已存在同名文件或文件夹' })

  // 先落盘再改 DB：watcher 的 unlink(old) 按 slug 删不到（slug 已指向新路径）、add(new) 走幂等 upsert
  // Windows：watcher / 索引服务短暂持有目录句柄时 rename 偶发 EPERM——先退避重试，
  // 仍 EPERM 则降级为「复制 + 删除」（对已打开句柄只读安全，等效原子切换）。
  let lastErr: unknown
  for (let i = 0; i < 3; i++) {
    try {
      await fs.rename(oldFull, newFull)
      lastErr = null
      break
    } catch (e: any) {
      lastErr = e
      if (e?.code !== 'EPERM') throw e
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  if (lastErr) {
    if ((lastErr as any)?.code !== 'EPERM') throw lastErr
    if (isDir) {
      await fs.cp(oldFull, newFull, {
        recursive: true,
        filter: (src) => !path.basename(src).startsWith('.')
      })
    } else {
      await fs.copyFile(oldFull, newFull)
    }
    await fs.rm(oldFull, { recursive: true, force: true })
  }

  let newSlug: string
  let titleMismatch = false
  if (isDir) {
    // 目录：全部子孙 slug 前缀替换，单事务（spec 8.8 落地表）
    const oldPrefix = oldRel
    const newPrefix = newRel
    const affected = await prisma.note.findMany({
      where: { OR: [{ slug: oldPrefix }, { slug: { startsWith: `${oldPrefix}/` } }] },
      select: { id: true, slug: true }
    })
    await prisma.$transaction(affected.map(n =>
      prisma.note.update({ where: { id: n.id }, data: { slug: `${newPrefix}${n.slug.slice(oldPrefix.length)}` } })
    ), { maxWait: 10_000, timeout: 30_000 })
    newSlug = newRel
  } else {
    const oldSlug = oldRel.replace(/\.md$/i, '')
    newSlug = newRel.replace(/\.md$/i, '')
    const oldBase = path.posix.basename(oldSlug)
    const newBase = path.posix.basename(newSlug)

    // ── 标题同步：先读文件判定，再落 DB.slug，最后才写文件 + 主动入库 ──
    // 顺序不能颠倒：processMarkdownFile 按路径 upsert，若 DB.slug 还停在旧值，
    // 会把同一篇笔记插成两行（旧 slug 一行 + 新 slug 一行）。
    const raw = await fs.readFile(newFull, 'utf-8').catch(() => null)
    const fmTitle = raw === null ? null : frontmatterTitle(raw)
    // 题名原本就跟着文件名走（没有独立题名）→ 改名即改题名，不用问
    const mirrors = fmTitle === null || fmTitle === oldBase
    // 调用方表态了就照办（true=一起改 / false=只改文件名）；没表态时按默认口径
    const willSync = typeof body.syncTitle === 'boolean' ? body.syncTitle : mirrors
    // 「这次改完后，文件里写的题名仍与新文件名不同」——前端据此提示「标题保持原样」
    titleMismatch = raw !== null && !willSync && fmTitle !== null && fmTitle !== newBase

    await prisma.note.updateMany({ where: { slug: oldSlug }, data: { slug: newSlug } })

    /** 文件没被改写时，让库里的显示名与文件内容保持一致：
     *  frontmatter 有 title 就以它为准（**哪怕它还是旧题名** —— 用户选了「只改文件名」，
     *  这就是他要的结果）；没有 title 行的笔记，显示名本就派生自文件名，改成新名。 */
    const syncDbTitle = async () => {
      const desired = fmTitle ?? newBase
      const cur = await prisma.note.findUnique({ where: { slug: newSlug }, select: { title: true } })
      if (!cur || cur.title === desired) return
      await prisma.note.updateMany({ where: { slug: newSlug }, data: { title: desired } })
      invalidateGardenCache()
    }

    if (raw === null) {
      // 读不到文件内容（极端情况：句柄未释放）→ 不猜题名，交给 watcher 按文件内容入库
      console.warn(`[garden] vault: 重命名后读不到文件，跳过标题同步 ${newFull}`)
    } else if (willSync) {
      // 同步：正文首个标题**仅当它写的就是当前题名时**才改（否则一个字节都不碰，
      // 绝不顶替用户自己写的章节小标题）；frontmatter.title 同理，没有该行也不凭空补。
      // `oldTitle` 用「用户实际看到的那个标题」：人工题名时是 frontmatter 里的值。
      const rewritten = rewriteNoteTitle(raw, { oldTitle: fmTitle ?? oldBase, newTitle: newBase })
      if (rewritten.changed) {
        await writeMarkdownAtomic(newFull, rewritten.content)
        // 主动入库：内容变了，watcher 的 add 事件必然走完整解析（RENDER_VERSION 比对只在
        // 「内容与 metadata 全等」时跳过），这一步让详情页标题立刻是新名，而不是等 1s 轮询。
        // 这里**故意不登记 markIngested**：改名后用户常常紧接着再编辑正文，而 markIngested 会让
        // watcher 跳过该路径后续的事件（命中即 return、不补发），那次编辑就永远进不了库。
        // watcher 再多解析一次是无害的——processMarkdownFile 内容未变时直接跳过。
        // 入库失败不阻断响应：文件已落盘，watcher 仍会同步它。
        try {
          await processMarkdownFile(newFull)
        } catch (e) {
          console.warn(`[garden] vault: 重命名后主动入库失败，交由 watcher 兜底 ${newFull}`, e)
        }
      } else {
        await syncDbTitle()
      }
    } else {
      // 只改文件名（人工题名 + 用户明确没勾「同步标题」）：文件正文与 frontmatter 一字不改。
      await syncDbTitle()
    }
  }

  // slug 是 tree/graph 缓存键，主动失效（与 markdown 入库后口径一致）
  invalidateGardenCache()
  return { ok: true, type: isDir ? 'dir' : 'file', slug: newSlug, titleMismatch }
})
