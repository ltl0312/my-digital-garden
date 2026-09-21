// 名称规则（spec 9.2 口径③ / 9.6）：导入、新建笔记、新建文件夹、重命名**四处共用同一个函数**，
// 避免"某条路径漏了重名校验"这种典型漏洞。校验拆两层：
//   ① 纯格式校验（空名 / 非法字符 / 超长 / 点号结尾）→ 与后端共用 shared/import-limits.nameFormatProblem
//   ② 同目录重名校验 → 需要该目录的直接子节点（由调用方传入，通常来自 /api/vault/tree）
import { nameFormatProblem } from '#shared/import-limits'

export interface TreeNodeLike {
  name: string
  type: 'dir' | 'file'
  slug?: string
  children?: TreeNodeLike[]
}

/** 在节点树中按相对路径找到目录节点；'' 表示树根 */
export function findDirNode(nodes: TreeNodeLike[], dirPath: string): TreeNodeLike | null {
  const segs = String(dirPath || '').split('/').filter(Boolean)
  if (!segs.length) return { name: '', type: 'dir', children: nodes }
  let current: TreeNodeLike[] = nodes
  let node: TreeNodeLike | null = null
  for (const seg of segs) {
    node = current.find(n => n.type === 'dir' && n.name === seg) || null
    if (!node) return null
    current = node.children || []
  }
  return node
}

/** 收集目录下所有文件的 slug（用于与导入清单比对重名） */
export function collectFileSlugs(nodes: TreeNodeLike[], prefix = ''): Set<string> {
  const out = new Set<string>()
  const walk = (arr: TreeNodeLike[], base: string) => {
    for (const n of arr) {
      const path = base ? `${base}/${n.name}` : n.name
      if (n.type === 'dir') walk(n.children || [], path)
      else out.add(n.slug || path)
    }
  }
  walk(nodes, prefix)
  return out
}

/** 收集所有目录的相对路径（含中间层） */
export function collectDirPaths(nodes: TreeNodeLike[], prefix = ''): Set<string> {
  const out = new Set<string>()
  const walk = (arr: TreeNodeLike[], base: string) => {
    for (const n of arr) {
      if (n.type !== 'dir') continue
      const path = base ? `${base}/${n.name}` : n.name
      out.add(path)
      walk(n.children || [], path)
    }
  }
  walk(nodes, prefix)
  return out
}

export const useNameRule = () => {
  /**
   * @param name     待校验名称（不含扩展名语义，调用方自行决定）
   * @param siblings 目标目录的直接子节点
   * @param selfName 自身原名（重命名时允许与自身同名 → 视为无问题）
   */
  const nameProblem = (name: string, siblings: TreeNodeLike[] = [], selfName?: string): string => {
    const n = String(name || '').trim()
    const fmt = nameFormatProblem(n)
    if (fmt) return fmt
    if (selfName && n === selfName) return ''
    if (siblings.some(s => s.name === n)) {
      return `「${n}」已存在 —— 同一目录下不允许同名`
    }
    return ''
  }

  return { nameProblem, findDirNode, collectFileSlugs, collectDirPaths }
}
