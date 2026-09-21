import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin, canToggle } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const id = event.context.params?.id
  const body = (await readBody<{ isActive?: boolean }>(event)) || {}
  if (typeof body.isActive !== 'boolean') throw createError({ statusCode: 400, message: 'isActive required' })

  const target = await prisma.accessKey.findUnique({ where: { id } })
  if (!target) throw createError({ statusCode: 404, message: '密钥不存在' })

  // 二维校验：发起者 × 目标（root 保护位 / 自锁防护 / admin 仅可动 user）
  const verdict = canToggle(actor, target)
  if (!verdict.ok) throw createError({ statusCode: 403, message: verdict.why })

  const updated = await prisma.accessKey.update({ where: { id }, data: { isActive: body.isActive } })
  return updated
})
