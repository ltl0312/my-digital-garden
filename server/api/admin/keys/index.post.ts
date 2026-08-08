import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin, generateKey } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ label?: string; role?: string }>(event)
  const label = (body.label || '').trim()
  if (!label) throw createError({ statusCode: 400, message: '请填写密钥备注名' })
  const role = body.role === 'admin' ? 'admin' : 'user'

  const key = await prisma.accessKey.create({
    data: {
      key: generateKey(),
      label,
      role
    }
  })
  return key
})
