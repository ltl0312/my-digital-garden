import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, noteTemplate, stripNul, writeMarkdownAtomic } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { invalidateGardenCache } from '../../../utils/cache'
import { processMarkdownFile } from '../../../utils/markdown'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ path?: string; title?: string }>(event)) || {}
  const dir = stripNul((body.path || '').replace(/^\/+/, '').replace(/\\/g, '/')).replace(/\.md$/i, '')
  const title = stripNul((body.title || '未命名笔记').trim())

  // 文件名字符校验：路径分隔符（/ \）+ Windows 非法字符（? * < > " |）+ 控制字符
  const INVALID_TITLE_CHARS = /[\/\\:?*<>"|\x00-\x1f]/
  if (!title || INVALID_TITLE_CHARS.test(title)) {
    throw createError({ statusCode: 400, message: 'Invalid title' })
  }

  let dirFull: string
  let full: string
  let slug: string
  try {
    dirFull = resolveVaultPath(dir) // 目录路径（可能是 vault 根）
    slug = dir ? `${dir}/${title}` : title
    full = resolveVaultPath(slug + '.md')
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  if (path.extname(full).toLowerCase() !== '.md') {
    throw createError({ statusCode: 400, message: 'Only .md files allowed' })
  }

  const dirExists = await fs.stat(dirFull).then(() => true).catch(() => false)
  if (!dirExists) {
    throw createError({ statusCode: 404, message: 'Directory not found' })
  }

  try {
    await fs.access(full)
    throw createError({ statusCode: 409, message: 'Note already exists' })
  } catch (e: any) {
    if (e?.statusCode) throw e
  }

  // 原子写入：先写临时文件再 rename，避免 watcher 读到半截内容（与批量导入共用同一实现）
  await writeMarkdownAtomic(full, noteTemplate(title))
  // 写操作后立即失效 tree/graph 缓存，避免前端刷新拿到 10s 内的旧树
  invalidateGardenCache()

  // 主动入库，而不是等 watcher：调用方拿到 slug 后要立刻打开这篇笔记，而 watcher 是
  // 串行队列 + awaitWriteFinish，实测 `GET /api/notes/<slug>` 在 1–1.5s 内都是 404
  // （t=48/343/836ms 404，1513ms 才 200）。前端若在这段窗口里跳转详情页，客户端路由会被
  // 404 中止 —— 地址栏是那篇笔记、页面内容却停在列表页并且不会恢复。
  // 这里**故意不登记 markIngested**：新建之后用户往往立刻开始写正文，而 markIngested 会让
  // watcher 跳过该路径后续的事件（且命中即 return、不补发），用户的第一次保存就再也进不了库。
  // watcher 随后对同一文件多解析一次是无害的——processMarkdownFile 内容未变时会直接跳过。
  // 入库失败不阻断响应：文件已经落盘，watcher 仍会把它同步进来。
  try {
    await processMarkdownFile(full)
  } catch (e) {
    console.warn(`[garden] vault: 新建笔记主动入库失败，交由 watcher 兜底 ${full}`, e)
  }

  return { slug }
})
