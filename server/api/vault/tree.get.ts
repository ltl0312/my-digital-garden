import { defineEventHandler } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { VAULT_DIR } from '../../utils/vault'

interface TreeNode {
  name: string
  type: 'dir' | 'file'
  slug?: string
  children?: TreeNode[]
}

async function buildTree(dir: string, rel: string): Promise<TreeNode[]> {
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
      nodes.push({ name: e.name, type: 'dir', children: await buildTree(full, path.join(rel, e.name)) })
    } else if (e.name.endsWith('.md')) {
      const slug = path.join(rel, e.name).replace(/\\/g, '/').replace(/\.md$/, '')
      nodes.push({ name: e.name.replace(/\.md$/, ''), type: 'file', slug })
    }
  }
  return nodes
}

export default defineEventHandler(async () => {
  return { tree: await buildTree(VAULT_DIR, '') }
})
