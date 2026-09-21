import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, isValidNodeName, normalizeVaultRel, isStructuralPath } from '../../utils/vault'
import { requireAdmin } from '../../utils/auth'
import { prisma } from '../../utils/db'
import { invalidateGardenCache } from '../../utils/cache'

// C2 重命名（spec 8.8/8.9）：文件与文件夹改名。
// - 同目录重名一律 409（与新建/粘贴共用「文件名不可重复」规则）
// - 结构目录全员禁改（含 root）
// - 目录改名在同一事务内更新全部子孙 Note.slug（避免依赖 watcher unlink+add 之间「笔记短暂消失」）
// - NoteLink 端点引用 Note.id（非 slug），改名无需触碰反链
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ path?: string; name?: string }>(event)) || {}
  let oldRel = normalizeVaultRel(body.path || '')
  const name = (body.name || '').trim()
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
    await prisma.note.updateMany({ where: { slug: oldSlug }, data: { slug: newSlug } })
  }

  // slug 是 tree/graph 缓存键，主动失效（与 markdown 入库后口径一致）
  invalidateGardenCache()
  return { ok: true, type: isDir ? 'dir' : 'file', slug: newSlug }
})
