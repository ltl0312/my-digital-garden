import { defineNitroPlugin } from '#imports'
import { prisma } from '../utils/db'

// 初始管理员种子密钥：**只从环境变量 SEED_ADMIN_KEY 注入，源码不设默认值**。
// 历史教训：曾经内置默认值，随源码进了公开仓库 —— 初始密钥是真实凭据，禁止入库。
//
// 播种规则（v1.0.0 起）：
//   · 仅当密钥表为空（全新部署）时播种一次；表非空直接跳过 —— 存量部署无需配置该变量。
//     （旧逻辑按单键 findUnique 补种，会导致「后台删掉种子密钥后重启又复活」，已废弃）
//   · 表为空且未设置 SEED_ADMIN_KEY 时**拒绝启动**：空库 + 无初始密钥 = 无人能登录，
//     显式失败优于静默裸奔；按报错指引配置后重启即可。
export default defineNitroPlugin(async () => {
  const count = await prisma.accessKey.count()
  if (count > 0) return

  const seedKey = process.env.SEED_ADMIN_KEY?.trim()
  if (!seedKey) {
    throw new Error(
      '[garden] auth: 密钥表为空且未设置 SEED_ADMIN_KEY，拒绝启动。' +
        '请在 .env / 容器 env 中设置 SEED_ADMIN_KEY=<初始 root 密钥> 后重启。' +
        '若这是存量部署且密钥表中已有密钥，请检查 DATABASE_URL 是否连错了数据库。'
    )
  }

  await prisma.accessKey.create({
    data: {
      key: seedKey,
      label: '初始管理员',
      // spec 8.1：初始管理员是独立的内置 root 身份（迁移会把存量行标为 root + isBuiltin）
      role: 'root'
    }
  })
  console.log('[garden] auth: 已创建初始管理员密钥（role=root）')
})
