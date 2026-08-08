import { defineNitroPlugin } from '#imports'
import { prisma } from '../utils/db'

export default defineNitroPlugin(async () => {
  const existing = await prisma.accessKey.findUnique({ where: { key: 'liutl' } })
  if (!existing) {
    await prisma.accessKey.create({
      data: {
        key: 'liutl',
        label: '初始管理员',
        role: 'admin'
      }
    })
    console.log('[garden] auth: 已创建初始管理员密钥 liutl')
  }
})
