import { defineNitroPlugin } from '#imports'
import { prisma } from '../utils/db'

// 初始管理员种子密钥：默认 'liutl'（与既有部署一致），可用环境变量 SEED_ADMIN_KEY 覆盖。
// 注意：该默认密钥会随源码进入仓库 —— 公开仓库部署时务必通过 SEED_ADMIN_KEY 覆盖并轮换。
const SEED_KEY = process.env.SEED_ADMIN_KEY || 'liutl'

export default defineNitroPlugin(async () => {
  const existing = await prisma.accessKey.findUnique({ where: { key: SEED_KEY } })
  if (!existing) {
    await prisma.accessKey.create({
      data: {
        key: SEED_KEY,
        label: '初始管理员',
        // spec 8.1：初始管理员是独立的内置 root 身份（迁移会把存量行标为 root + isBuiltin）
        role: 'root'
      }
    })
    console.log('[garden] auth: 已创建初始管理员密钥（role=root）')
  }
})
