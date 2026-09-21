import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin, generateKey, canCreate } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const body = (await readBody<{ label?: string; role?: string }>(event)) || {}
  const label = (body.label || '').trim()
  if (!label) throw createError({ statusCode: 400, message: '请填写密钥备注名' })

  // 二维校验：发起者角色 × 目标角色（root 不可被创建，白名单外一律拒绝）
  const verdict = canCreate({ role: actor.role }, body.role || 'user')
  if (!verdict.ok) throw createError({ statusCode: 403, message: verdict.why })

  const key = await prisma.accessKey.create({
    data: {
      key: generateKey(),
      label,
      role: body.role === 'admin' ? 'admin' : 'user',
      createdBy: actor.id
    }
  })
  return key
})
