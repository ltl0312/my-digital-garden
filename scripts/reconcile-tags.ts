/**
 * NoteTag 对账清理（A4）：消除「frontmatter 已删除、数据库仍残留」的标签关联。
 *
 * 背景：线上 type/MOC 计数 46，而 vault frontmatter 实际只有 34 篇——差的 12 篇是
 * 历史残留（单篇同步虽是全删重建，但未重新同步过的文件仍带着旧关联）。
 *
 * 用法（先 dry-run 看差异，再 --apply）：
 *   node --experimental-strip-types scripts/reconcile-tags.ts           # 只报告
 *   node --experimental-strip-types scripts/reconcile-tags.ts --apply   # 删除多余关联
 *
 * 规则：以 vault 当前 frontmatter 为准（与 watcher 同步口径一致）；
 *       仅删除「DB 有、frontmatter 没有」的关联；不删除 Tag 本身（全局共享）。
 */
import fs from 'node:fs'
import path from 'node:path'

// 裸 Node 不加载 .env：手动解析（只读 DATABASE_URL / AUTH_SECRET，不打印值）
const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const APPLY = process.argv.includes('--apply')

async function main() {
  const { prisma } = await import('../server/utils/db.ts')
  const matter = (await import('gray-matter')).default

  const vault = path.resolve(process.cwd(), 'content/vault')
  const notes = await prisma.note.findMany({
    select: { id: true, slug: true, tags: { select: { tagId: true, tag: { select: { name: true } } } } }
  })

  // frontmatter 期望标签（与 watcher 相同的解析器：gray-matter）
  const expected = new Map<string, string[]>()
  let missingFile = 0
  for (const n of notes) {
    const p = path.join(vault, n.slug + '.md')
    if (!fs.existsSync(p)) {
      missingFile++
      continue
    }
    let tags: unknown = []
    try {
      tags = matter(fs.readFileSync(p, 'utf-8')).data.tags
    } catch {
      /* 解析失败按空处理，与 watcher 行为一致（不重建） */
      tags = undefined
    }
    expected.set(
      n.id,
      Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string' && !!t.trim()) : []
    )
  }

  let stale = 0
  const staleRows: Array<{ slug: string; tag: string }> = []
  for (const n of notes) {
    if (!expected.has(n.id)) continue // 文件已不在 vault：属删除流程职责，不在此处理
    const want = new Set(expected.get(n.id)!)
    for (const t of n.tags) {
      if (!want.has(t.tag.name)) {
        stale++
        staleRows.push({ slug: n.slug, tag: t.tag.name })
      }
    }
  }

  console.log(`笔记 ${notes.length} 篇 · vault 缺文件的 ${missingFile} 篇 · 多余关联 ${stale} 条`)
  const byTag = new Map<string, number>()
  for (const r of staleRows) byTag.set(r.tag, (byTag.get(r.tag) ?? 0) + 1)
  for (const [t, c] of [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`   ${t}: ${c} 条`)
  }
  if (staleRows.slice(0, 10).length) {
    console.log('   示例：')
    for (const r of staleRows.slice(0, 10)) console.log(`     ${r.slug} ✕ ${r.tag}`)
  }

  if (!APPLY) {
    console.log('（dry-run：未改动。确认后加 --apply 删除多余关联）')
    await prisma.$disconnect()
    return
  }

  let deleted = 0
  for (const n of notes) {
    if (!expected.has(n.id)) continue
    const want = new Set(expected.get(n.id)!)
    const staleIds = n.tags.filter(t => !want.has(t.tag.name)).map(t => t.tagId)
    if (staleIds.length) {
      const r = await prisma.noteTag.deleteMany({
        where: { noteId: n.id, tagId: { in: staleIds } }
      })
      deleted += r.count
    }
  }
  console.log(`✅ 已删除 ${deleted} 条多余关联`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
