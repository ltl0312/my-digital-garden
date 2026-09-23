import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import { resolveVaultPath } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { invalidateGardenCache } from '../../../utils/cache'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parts = event.context.params?.slug
  const slug = Array.isArray(parts) ? parts.join('/') : parts
  if (!slug) throw createError({ statusCode: 400, message: 'Invalid Slug' })

  let full: string
  try {
    full = resolveVaultPath(slug + '.md')
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }
  // 删除重试：Windows 下 watcher / 杀毒可能短暂持有句柄导致偶发 EBUSY/EPERM
  // （与 nodes/index.delete.ts 同一套退避策略，此前这里没有重试 → 偶发 500）
  let lastErr: unknown
  for (let i = 0; i < 3; i++) {
    try {
      await fs.rm(full, { force: true })
      lastErr = null
      break
    } catch (e) {
      lastErr = e
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
  }
  if (lastErr) throw lastErr
  // 删除笔记后立即失效 tree/graph 缓存（否则树里文件仍在，需等 TTL 过期才消失）
  invalidateGardenCache()
  return { ok: true }
})
