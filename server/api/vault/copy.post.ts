import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, normalizeVaultRel } from '../../utils/vault'
import { requireAdmin } from '../../utils/auth'
import { invalidateGardenCache } from '../../utils/cache'

// C3 复制 / 粘贴（spec 8.8）：文件深拷贝快照、文件夹递归复制（服务端实现，前端剪贴板仅存路径意图）。
// - 同名一律拒绝（409）：同目录粘贴自身即被此规则拦截
// - 不允许粘贴到自身或其子目录（400）
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ path?: string; targetDir?: string }>(event)) || {}
  const targetDir = normalizeVaultRel(body.targetDir || '')
  let srcRelNorm = normalizeVaultRel(body.path || '')
  if (!srcRelNorm) throw createError({ statusCode: 400, message: 'Invalid path' })

  let srcFull: string
  let st: Awaited<ReturnType<typeof fs.stat>> | null = null
  try {
    srcFull = resolveVaultPath(srcRelNorm)
    st = await fs.stat(srcFull).catch(() => null)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }
  // 树内 slug 无扩展名：文件补 .md 再试（与 rename / delete 接口同一约定）
  if (!st && !/\.md$/i.test(srcRelNorm)) {
    try {
      const alt = resolveVaultPath(`${srcRelNorm}.md`)
      const altSt = await fs.stat(alt).catch(() => null)
      if (altSt) {
        srcRelNorm = `${srcRelNorm}.md`
        srcFull = alt
        st = altSt
      }
    } catch {
      throw createError({ statusCode: 400, message: 'Invalid path' })
    }
  }
  const srcRel = srcRelNorm
  if (!st) throw createError({ statusCode: 404, message: 'Node not found' })
  const isDir = st.isDirectory()

  if (isDir && (targetDir === srcRel || targetDir.startsWith(`${srcRel}/`))) {
    throw createError({ statusCode: 400, message: '不能粘贴到自身或其子目录' })
  }

  let targetFull: string
  try {
    targetFull = resolveVaultPath(targetDir) // '' → vault 根
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }
  const tst = await fs.stat(targetFull).catch(() => null)
  if (!tst || !tst.isDirectory()) throw createError({ statusCode: 404, message: 'Target directory not found' })

  const name = path.posix.basename(srcRel)
  const destRel = targetDir ? `${targetDir}/${name}` : name
  let destFull: string
  try {
    destFull = resolveVaultPath(destRel)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const exists = await fs.stat(destFull).then(() => true).catch(() => false)
  if (exists) throw createError({ statusCode: 409, message: '目标目录已存在同名项' })

  if (isDir) {
    // 递归复制；跳过 dotfile（与 tree/watcher 口径一致）
    await fs.cp(srcFull, destFull, {
      recursive: true,
      filter: (src) => !path.basename(src).startsWith('.')
    })
  } else {
    await fs.copyFile(srcFull, destFull)
  }
  // 写操作后立即失效 tree/graph 缓存，避免前端刷新拿到 10s 内的旧树
  invalidateGardenCache()
  return { ok: true, path: destRel }
})
