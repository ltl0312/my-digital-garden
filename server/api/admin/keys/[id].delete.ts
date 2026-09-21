import { createError, defineEventHandler } from 'h3'
import { requireAdmin, canDelete } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const id = event.context.params?.id

  const target = await prisma.accessKey.findUnique({ where: { id } })
  if (!target) throw createError({ statusCode: 404, message: '密钥不存在' })

  // 二维校验：发起者 × 目标（root 保护位 / 自锁防护 / admin 仅可删 user）
  const verdict = canDelete(actor, target)
  if (!verdict.ok) throw createError({ statusCode: 403, message: verdict.why })

  await prisma.accessKey.delete({ where: { id } }).catch(() => {})
  return { ok: true }
})
