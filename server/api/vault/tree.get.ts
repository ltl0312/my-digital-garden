import { defineEventHandler } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { VAULT_DIR } from '../../utils/vault'
import { prisma } from '../../utils/db'

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
    if (e.isDirectory()) {
      nodes.push({ name: e.name, type: 'dir', children: await buildTree(full, path.join(rel, e.name), maturityMap) })
    } else if (e.name.endsWith('.md')) {
      const slug = path.join(rel, e.name).replace(/\\/g, '/').replace(/\.md$/, '')
      nodes.push({ name: e.name.replace(/\.md$/, ''), type: 'file', slug, maturity: maturityMap.get(slug) })
    }
  }
  return nodes
}

export default defineEventHandler(async () => {
  // 一次查询全部笔记的 slug → maturity 映射（避免每文件一次查询）
  const notes = await prisma.note.findMany({ select: { slug: true, maturity: true } })
  const maturityMap = new Map(notes.map(n => [n.slug, n.maturity]))
  return { tree: await buildTree(VAULT_DIR, '', maturityMap) }
})
