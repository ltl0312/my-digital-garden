import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
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
  await fs.writeFile(full, stripNul(body.content), 'utf-8')
  return { ok: true, slug }
})
