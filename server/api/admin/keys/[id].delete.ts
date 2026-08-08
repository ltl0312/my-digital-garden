import { createError, defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = event.context.params?.id
  if (id === admin.id) throw createError({ statusCode: 400, message: '不能删除当前登录使用的密钥' })
  await prisma.accessKey.delete({ where: { id } }).catch(() => {})
  return { ok: true }
})
