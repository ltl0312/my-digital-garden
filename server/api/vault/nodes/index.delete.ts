import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import { resolveVaultPath, normalizeVaultRel, isStructuralPath, isDirEffectivelyEmpty } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/db'
import { invalidateGardenCache } from '../../../utils/cache'

// C4 删除节点（spec 8.8/8.9）：文件直接删；文件夹按破坏面分档——
// 空文件夹 admin 可删，非空文件夹仅 root（二次确认由前端承担，篇数在此返回）；
// 结构目录是全员红线（含 root）；普通用户 403（requireAdmin）。
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const body = (await readBody<{ path?: string }>(event)) || {}
  const rel = normalizeVaultRel(body.path || '')
  if (!rel) throw createError({ statusCode: 400, message: '不能删除 vault 根目录' })

  let full: string
  try {
    full = resolveVaultPath(rel)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  // 文件：树内 slug 无扩展名——先试原名，再兜底补 .md（与 rename / copy 接口同一约定）
  let fileFull = full
  let fileRel = rel
  let st = await fs.stat(full).catch(() => null)
  if (!st && !/\.md$/i.test(rel)) {
    const alt = `${full}.md`
    const altSt = await fs.stat(alt).catch(() => null)
    if (altSt) {
      fileFull = alt
      fileRel = `${rel}.md`
      st = altSt
    }
  }
  if (!st) throw createError({ statusCode: 404, message: 'Node not found' })

  // 删除重试：Windows 下 watcher / 杀毒 / 回收站代理可能短暂持有句柄导致偶发失败
  // （实测空目录删除也会偶发 EBUSY/EPERM），退避重试 3 次后再上抛。
  const rmWithRetry = async (target: string, recursive: boolean) => {
    let lastErr: unknown
    for (let i = 0; i < 3; i++) {
      try {
        await fs.rm(target, recursive ? { recursive: true, force: true } : { force: true })
        return
      } catch (e) {
        lastErr = e
        await new Promise(r => setTimeout(r, 300 * (i + 1)))
      }
    }
    throw lastErr
  }

  if (st.isDirectory()) {
    if (isStructuralPath(rel)) {
      throw createError({ statusCode: 403, message: '越权操作：结构目录受保护，不可删除' })
    }
    const empty = await isDirEffectivelyEmpty(full)
    if (!empty && actor.role !== 'root') {
      throw createError({ statusCode: 403, message: '越权操作：非空文件夹仅初始管理员可删除' })
    }
    const noteCount = await prisma.note.count({
      where: { OR: [{ slug: rel }, { slug: { startsWith: `${rel}/` } }] }
    })
    await rmWithRetry(full, true)
    // 目录分支也必须失效缓存：此前只有文件分支调用了 invalidateGardenCache()，
    // 导致删完文件夹后前端 refresh 拿到 10s 内的旧树 —— 侧栏里目录还在，用户会以为删除失败。
    invalidateGardenCache()
    return { ok: true, type: 'dir', notes: noteCount }
  }

  await rmWithRetry(fileFull, false)
  // 写操作后立即失效 tree/graph 缓存，避免前端刷新拿到 10s 内的旧树
  invalidateGardenCache()
  return { ok: true, type: 'file', slug: fileRel.replace(/\.md$/i, '') }
})
