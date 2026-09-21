import path from 'path'

export const VAULT_DIR = path.resolve(process.cwd(), 'content/vault')

// 将 slug 安全解析为 vault 内绝对路径（拒绝 .. 穿越与绝对路径）
export function resolveVaultPath(slug: string): string {
  const normalized = slug.replace(/\\/g, '/').replace(/^\/+/, '')
  const full = path.resolve(VAULT_DIR, ...normalized.split('/'))
  if (full !== VAULT_DIR && !full.startsWith(VAULT_DIR + path.sep)) {
    throw new Error('Invalid path: outside vault')
  }
  return full
}

// 剥离 NUL 字节（PG text/JSONB 不接受 0x00）
export function stripNul(s: string): string {
  return s.replace(/\0/g, '')
}

// 新建笔记默认 frontmatter 模板
export function noteTemplate(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'tags: []',
    'maturity: SEEDLING',
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n')
}

// ---- 阶段 C：文件树节点操作共享工具（spec 8.8 / 8.9） ----

// 节点/文件名合法性：路径分隔符 + Windows 非法字符 + 控制字符 + 首尾空白与点号结尾（Windows 语义）
export function isValidNodeName(name: string): boolean {
  if (!name || name.trim() !== name || name === '.' || name === '..') return false
  if (/[\/\\:?*<>"|\x00-\x1f]/.test(name)) return false
  if (/[. ]$/.test(name)) return false
  return true
}

// 归一化请求中的相对路径：统一分隔符、去首尾斜杠、剥离 NUL
export function normalizeVaultRel(p: string): string {
  return stripNul(p.replace(/\\/g, '/')).replace(/^\/+|\/+$/g, '')
}

// 结构目录（spec 8.9）：知识库骨架，任何角色（含 root）不可重命名/删除。
// 范围：vault 根自身、vault 一级目录（KnowledgeBase）、其下 NN_ 前缀目录
//（00_Inbox … 06_Assets，对应 spec 示例）；更深目录与无前缀目录属于日常内容，可管理。
export function isStructuralPath(relDir: string): boolean {
  const rel = normalizeVaultRel(relDir)
  if (rel === '') return true
  if (rel === 'KnowledgeBase') return true
  // 仅 KnowledgeBase 下第一层（深度 2）的 NN_ 前缀目录；更深层属于日常内容
  const parts = rel.split('/')
  return parts.length === 2 && parts[0] === 'KnowledgeBase' && /^\d{2}_/.test(parts[1])
}

// 目录是否非空（忽略 dotfile；与 tree.get 的展示口径一致）
export async function isDirEffectivelyEmpty(dirFull: string): Promise<boolean> {
  const fs = await import('fs/promises')
  const entries = await fs.readdir(dirFull, { withFileTypes: true })
  return !entries.some(e => !e.name.startsWith('.'))
}

// 递归创建目录（已存在则忽略）
export async function ensureDir(dirFull: string): Promise<void> {
  const fs = await import('fs/promises')
  await fs.mkdir(dirFull, { recursive: true })
}

// 原子写文本：先写临时文件再 rename，避免 watcher 读到半截内容
// （与 api/vault/notes/index.post.ts 共用同一实现，避免两份逻辑漂移）
export async function writeMarkdownAtomic(fullPath: string, content: string): Promise<void> {
  const fs = await import('fs/promises')
  const tmp = `${fullPath}.tmp`
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, fullPath)
}
