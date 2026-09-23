import { defineEventHandler } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { prisma } from '../../../utils/db'

// 可见范围（spec 8.2 查看，下沉到查询层 where，禁止取全量后前端过滤）：
//   root → 全部；admin → 自己 + 全部普通用户；user → 仅自己（供「我的密钥」身份卡）。
// 密钥明文：能出现在结果里的记录，对当前角色都属于「可管理范围」（查询层已按角色收窄），
// 因此一律返回明文 —— 否则管理员看不见也复制不到用户密钥，无法把密钥交付给用户
// （用户实际反馈：显示与复制出来都是 41BK••••••••TGVL）。maskKey 仅作越界兜底。
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
      // 查询层已保证：user 只会拿到自己那条 → 列表里出现的密钥都可直接给当前身份看。
      // 仅保留一条理论越界兜底（user 拿到他人记录时才打码），便于未来调整可见范围时不泄露。
      key: actor.role !== 'user' || isSelf ? k.key : maskKey(k.key)
    }
  })
})

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}
