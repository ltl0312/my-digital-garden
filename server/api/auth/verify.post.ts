import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '../../utils/db'
import { setAuthCookie } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ key?: string }>(event)
  const key = (body.key || '').trim()
  if (!key) throw createError({ statusCode: 400, message: '请输入密钥' })

  const record = await prisma.accessKey.findUnique({ where: { key } })
  if (!record) throw createError({ statusCode: 401, message: '密钥无效' })
  if (!record.isActive) throw createError({ statusCode: 401, message: '密钥已被禁用' })
  // 密钥本身无过期概念（永久有效）；30 天限制作用于登录 token（setAuthCookie 内嵌 exp）

  setAuthCookie(event, record.id)
  await prisma.accessKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
  return { role: record.role, label: record.label }
})
