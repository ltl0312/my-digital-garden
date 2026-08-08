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
