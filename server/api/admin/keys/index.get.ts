import { defineEventHandler } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

// 可见范围（spec 8.2 查看，下沉到查询层 where，禁止取全量后前端过滤）：
//   root → 全部；admin → 自己 + 全部普通用户；user → 仅自己（供「我的密钥」身份卡）。
// 密钥脱敏：仅本人可拿到完整密钥（复制用），其余一律打码。
export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)

  const where = actor.role === 'root'
    ? {}
    : actor.role === 'admin'
      ? { OR: [{ id: actor.id }, { role: 'user' }] }
      : { id: actor.id }

  const keys = await prisma.accessKey.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  })

  // 解析创建者备注名（应用层 join，避免 schema 引入自关联 FK）
  const creatorIds = [...new Set(keys.map(k => k.createdBy).filter((v): v is string => !!v))]
  const creators = creatorIds.length
    ? await prisma.accessKey.findMany({ where: { id: { in: creatorIds } }, select: { id: true, label: true } })
    : []
  const creatorLabel = new Map(creators.map(c => [c.id, c.label]))

  return keys.map((k) => {
    const isSelf = k.id === actor.id
    return {
      id: k.id,
      label: k.label,
      role: k.role,
      isActive: k.isActive,
      isBuiltin: k.isBuiltin,
      createdBy: k.createdBy,
      creatorLabel: k.createdBy ? creatorLabel.get(k.createdBy) ?? null : null,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      key: isSelf ? k.key : maskKey(k.key)
    }
  })
})

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}
