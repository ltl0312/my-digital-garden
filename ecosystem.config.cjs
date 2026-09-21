// ============================================================
// PM2 生产进程配置（digital-garden）
// 用法：pm2 start ecosystem.config.cjs
// 安全说明：所有凭据从 .env 读取，本文件禁止硬编码任何密码
// 内存适配：PM2_INSTANCES（默认 1，小内存服务器）/ PM2_MAX_MEMORY（默认 450M）可经 .env 覆盖
// ============================================================
const fs = require('fs')
const path = require('path')

// 加载 .env（Node ≥ 20.12 原生支持，无需 dotenv 依赖）
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

if (!process.env.DATABASE_URL) {
  console.error('[garden] ecosystem: 缺少 DATABASE_URL（请检查 .env）')
  process.exit(1)
}

module.exports = {
  apps: [
    {
      name: 'digital-garden',
      port: process.env.PORT || '3000',
      exec_mode: 'cluster',
      instances: process.env.PM2_INSTANCES || '1',
      max_memory_restart: process.env.PM2_MAX_MEMORY || '450M',
      // 经 scripts/start-prod.mjs 启动：先设置 _importMeta_.url 再加载 nitro 产物，
      // 否则内联的 Prisma 客户端在 Windows 上会因 file:///_entry.js 占位路径抛
      // ERR_INVALID_FILE_URL_PATH（Linux 虽不抛，但统一入口更稳）
      script: './scripts/start-prod.mjs',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
        NODE_OPTIONS: process.env.NODE_OPTIONS || '',
      },
    },
  ],
}
