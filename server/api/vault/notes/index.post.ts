import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, noteTemplate, stripNul } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ path?: string; title?: string }>(event)
  const dir = stripNul((body.path || '').replace(/^\/+/, '').replace(/\\/g, '/')).replace(/\.md$/i, '')
  const title = stripNul((body.title || '未命名笔记').trim())

  if (!title || title.includes('/') || title.includes('\\') || title.includes(':')) {
    throw createError({ statusCode: 400, message: 'Invalid title' })
  }

  let dirFull: string
  let full: string
  try {
    dirFull = resolveVaultPath(dir) // 目录路径（可能是 vault 根）
    const slug = dir ? `${dir}/${title}` : title
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

  await fs.writeFile(full, noteTemplate(title), 'utf-8')
  return { slug }
})
