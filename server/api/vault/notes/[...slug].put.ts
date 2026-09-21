import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import matter from 'gray-matter'
import { resolveVaultPath, stripNul } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parts = event.context.params?.slug
  const slug = Array.isArray(parts) ? parts.join('/') : parts
  if (!slug) throw createError({ statusCode: 400, message: 'Invalid Slug' })

  const body = await readBody<{ content?: string }>(event)
  if (typeof body.content !== 'string') {
    throw createError({ statusCode: 400, message: 'content required' })
  }

  let full: string
  try {
    full = resolveVaultPath(slug + '.md')
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  // 保留原 frontmatter：正文来自数据库（gray-matter 已剥离 YAML），直接覆盖写文件会丢失头部
  const existing = await fs.readFile(full, 'utf-8').catch(() => '')
  let frontmatter: Record<string, any> = {}
  try {
    frontmatter = matter(existing).data || {}
  } catch {
    // 原文件 frontmatter 损坏：按无 frontmatter 处理（正文仍可保存）
  }

  const cleanContent = stripNul(body.content)
  const finalContent = Object.keys(frontmatter).length
    ? matter.stringify(cleanContent, frontmatter)
    : cleanContent

  // 原子写入：先写同目录临时文件再 rename，避免 watcher 读到写入一半的内容
  const tmp = full + '.tmp'
  await fs.writeFile(tmp, finalContent, 'utf-8')
  await fs.rename(tmp, full)
  return { ok: true, slug }
})
