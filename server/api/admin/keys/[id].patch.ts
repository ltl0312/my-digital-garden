import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin, canToggle, canChangeRole } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

// 密钥修改：启用/禁用（isActive）与权限等级变更（role）可单独提交，也可同时提交。
// - isActive 沿用 canToggle 的二维校验（root 管 admin/user；admin 仅管 user；无人可动他人？见 auth.ts）
// - role 仅 root 可改（canChangeRole）：可在 admin ⇄ user 间升降级
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const id = event.context.params?.id
  const body = (await readBody<{ isActive?: boolean; role?: string }>(event)) || {}

  const hasActive = typeof body.isActive === 'boolean'
  const hasRole = body.role !== undefined
  if (!hasActive && !hasRole) {
    throw createError({ statusCode: 400, message: 'isActive 或 role 至少需要提供一个' })
  }

  const target = await prisma.accessKey.findUnique({ where: { id } })
  if (!target) throw createError({ statusCode: 404, message: '密钥不存在' })

  if (hasActive) {
    const verdict = canToggle(actor, target)
    if (!verdict.ok) throw createError({ statusCode: 403, message: verdict.why })
  }
  if (hasRole) {
    const verdict = canChangeRole(actor, target, body.role as string)
    if (!verdict.ok) throw createError({ statusCode: 403, message: verdict.why })
  }

  const data: { isActive?: boolean; role?: string } = {}
  if (hasActive) data.isActive = body.isActive
  if (hasRole) data.role = body.role

  return prisma.accessKey.update({ where: { id }, data })
})
