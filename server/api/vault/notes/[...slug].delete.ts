import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import { resolveVaultPath } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'

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
  await fs.rm(full, { force: true })
  return { ok: true }
})
