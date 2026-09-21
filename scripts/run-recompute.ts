/** recomputeAllMaturity 的命令行 runner（esbuild 打包后运行） */
import fs from 'node:fs'
import path from 'node:path'

// 裸 Node 不加载 .env：手动解析。必须在动态 import db 之前完成——
// ESM 静态 import 会提升，导致 PrismaClient 在 DATABASE_URL 就绪前初始化。
const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

async function main() {
  const { recomputeAllMaturity } = await import('../server/utils/maturity-sync')
  const { prisma } = await import('../server/utils/db')
  const r = await recomputeAllMaturity()
  console.log(`扫描 ${r.scanned} · 更新 ${r.updated} · 人工值跳过 ${r.skippedManual}`)
  const dist = await prisma.note.groupBy({ by: ['maturity'], _count: { _all: true } })
  console.log('DB 分布:', dist.map((x) => `${x.maturity}=${x._count._all}`).join(' · '))
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
