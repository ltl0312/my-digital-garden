import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const keys = await prisma.accessKey.findMany({ orderBy: { createdAt: 'desc' } })
  return keys
})
