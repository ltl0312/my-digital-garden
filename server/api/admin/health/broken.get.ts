import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { requireAdmin } from '../../../utils/auth'

/**
 * 读取断链巡检结果：`GET /api/admin/health/broken`
 *
 * 纯读：不扫描、不写盘。扫描是显式的 `POST`（见 broken.post.ts），
 * 因为全库扫描是 O(笔记数) 的批量查询，把它挂在 GET 上会让每次打开健康页都触发一轮全表读。
 *
 * 文件不存在 = 从未巡检过，这不是错误：返回空结构 + scannedAt:null，
 * 前端据此显示「还没扫描过，点这里开始」而不是弹一个 500。
 */

/** 与 broken.post.ts 的 brokenFilePath() 必须指向同一路径（两份独立文件，改动需同步） */
function brokenFilePath(): string {
  return path.join(process.cwd(), 'data', 'health', 'broken.json')
}

interface BrokenFile {
  scannedAt?: unknown
  items?: unknown
  total?: unknown
}

export default defineEventHandler(async (event) => {
  // 全局中间件对 /api/admin/* 的只读方法（GET/HEAD/OPTIONS）是放行的，
  // 所以这个 GET 的鉴权必须落在 handler 里，不能指望 ADMIN_ONLY_PREFIXES。
  await requireAdmin(event)

  const file = brokenFilePath()

  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { scannedAt: null, items: [], total: 0 }
    }
    console.error('[garden] health: 断链巡检结果读取失败', e)
    throw createError({
      statusCode: 500,
      message: '断链巡检结果读取失败',
      data: { code: 'HEALTH_READ_FAILED' }
    })
  }

  let parsed: BrokenFile
  try {
    parsed = JSON.parse(raw) as BrokenFile
  } catch {
    // 半截文件（历史上非原子写入的残留）不能让健康页整页崩掉，但也不能假装数据正常
    throw createError({
      statusCode: 500,
      message: '断链巡检结果文件损坏，请重新扫描',
      data: { code: 'HEALTH_FILE_INVALID' }
    })
  }

  const items = Array.isArray(parsed.items) ? parsed.items : []
  return {
    scannedAt: typeof parsed.scannedAt === 'string' ? parsed.scannedAt : null,
    items,
    total: typeof parsed.total === 'number' ? parsed.total : items.length
  }
})
