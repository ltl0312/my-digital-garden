import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 CLI 不再自动加载 .env，使用 Node 原生 API 显式加载（无需 dotenv 依赖）
if (existsSync('.env')) {
  process.loadEnvFile()
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
