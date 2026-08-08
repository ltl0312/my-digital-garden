import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  const body = await readBody<{ isActive?: boolean }>(event)
  if (typeof body.isActive !== 'boolean') throw createError({ statusCode: 400, message: 'isActive required' })
  const updated = await prisma.accessKey.update({ where: { id }, data: { isActive: body.isActive } })
  return updated
})
