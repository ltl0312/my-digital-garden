import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, noteTemplate, stripNul, writeMarkdownAtomic } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { invalidateGardenCache } from '../../../utils/cache'

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
  return { slug }
})
