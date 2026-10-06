import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import { resolveVaultPath } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { invalidateGardenCache } from '../../../utils/cache'
import { removeMarkdownFile } from '../../../utils/markdown'

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
  // 主动清 DB 行，而不是等 watcher 的 unlink 事件：chokidar 配了 awaitWriteFinish(1000ms)，
  // 文件在稳定窗口内就被删掉时它从未被「登记」，于是**不会产生 unlink** —— 文件没了、行还在，
  // 列表/搜索/图谱继续挂着这篇笔记，点开却 404（实测新建后立刻删除，3 轮里 2 轮残留孤儿行）。
  // 稍后 watcher 的 unlink 若真的到达，removeMarkdownFile 内部是 delete().catch() → 幂等。
  await removeMarkdownFile(full)
  // 删除笔记后立即失效 tree/graph 缓存（否则树里文件仍在，需等 TTL 过期才消失）
  invalidateGardenCache()
  return { ok: true }
})
