import { defineEventHandler } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { VAULT_DIR } from '../../utils/vault'
import { prisma } from '../../utils/db'
import { createCache } from '../../utils/cache'

interface TreeNode {
  name: string
  type: 'dir' | 'file'
  slug?: string
  maturity?: string
  children?: TreeNode[]
}

async function buildTree(dir: string, rel: string, maturityMap: Map<string, string>): Promise<TreeNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    // Windows 的 junction / 符号链接：dirent.isDirectory() 为 false（报 symlink），
    // 需 stat 跟随链接后判断真实类型，否则 vault 目录本身是指向真实仓库的链接时整棵树为空
    let isDir = e.isDirectory()
    if (!isDir && e.isSymbolicLink()) {
      isDir = await fs.stat(full).then(s => s.isDirectory()).catch(() => false)
    }
    if (isDir) {
      nodes.push({ name: e.name, type: 'dir', children: await buildTree(full, path.join(rel, e.name), maturityMap) })
    } else if (e.name.endsWith('.md')) {
      const slug = path.join(rel, e.name).replace(/\\/g, '/').replace(/\.md$/, '')
      nodes.push({ name: e.name.replace(/\.md$/, ''), type: 'file', slug, maturity: maturityMap.get(slug) })
    }
  }
  return nodes
}

// 树缓存：10s TTL + watcher 入库后手动失效（每次路由导航 SSR 都请求本接口，避免重复扫盘）
const treeCache = createCache<TreeNode[]>(10_000)

export default defineEventHandler(async () => {
  const cached = treeCache.get()
  if (cached) return { tree: cached }

  // 一次查询全部笔记的 slug → maturity 映射（避免每文件一次查询）
  const notes = await prisma.note.findMany({ select: { slug: true, maturity: true } })
  const maturityMap = new Map(notes.map(n => [n.slug, n.maturity]))
  const tree = await buildTree(VAULT_DIR, '', maturityMap)
  treeCache.set(tree)
  return { tree }
})
