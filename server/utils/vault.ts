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

// ---- 题名：YAML 与 Prisma 的类型安全（全站唯一归一入口）----

/**
 * 标题归一化 —— 全站唯一的题名归一入口。
 *
 * 为什么必须有：frontmatter 的 `title:` 经 YAML 解析后**不一定是字符串**——
 * `title: 111` → int、`title: true` → bool、`title: 2026-10-06` → Date。
 * 而 `Note.title` 是 String，把解析结果直接透传给 Prisma 会抛
 * `Argument 'title': Invalid value provided. Expected String, provided Int.`，
 * 整篇笔记入库失败；`processMarkdownFile` 只 console.error + return false、不重试，
 * 于是这一行**永远不会进 DB** —— 文件在磁盘上、结构树里看得见，点开却 404，
 * 详情页 throw createError，页面一片空白。线上真实案例：标题「111」的笔记。
 */
export function normalizeNoteTitle(value: unknown, slug: string): string {
  const fallback = path.basename(slug)
  if (value === null || value === undefined) return fallback
  // Date（`title: 2026-10-06`）取日期部分，String(date) 会输出冗长的英文全称
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  return text.trim() || fallback
}

/**
 * 写 frontmatter 时的 YAML 标量安全写法：会被 YAML 解析成 int / bool / 日期的题名
 * 加双引号，从源头上避免上面那类入库失败。例：`111` → `"111"`；
 * `Rust 所有权模型` 原样输出（不加引号，保持既有文件的风格）。
 */
export function yamlTitleScalar(title: string): string {
  const risky =
    title === '' ||
    /^(?:true|false|yes|no|on|off|null|~)$/i.test(title) ||
    /^[-+]?(?:\d+|\d*\.\d+(?:[eE][-+]?\d+)?)$/.test(title) ||
    /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(title) ||
    /^[!&*?|>%@`"'#\[\]{},:-]/.test(title) ||
    /: | #/.test(title) ||
    title !== title.trim()
  if (!risky) return title
  return `"${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// 新建笔记默认 frontmatter 模板
export function noteTemplate(title: string): string {
  const safe = normalizeNoteTitle(title, title)
  return [
    '---',
    `title: ${yamlTitleScalar(safe)}`,
    'tags: []',
    // 不要预置 maturity：frontmatter 里的显式值会被当作「人工指定」永久锁定，
    // 自动生长判定（maturity-sync）就不会再介入（用户曾因此误以为笔记长不起来）。
    // 需要人工锁定的笔记再手动在 frontmatter 加这一行。
    '---',
    '',
    `# ${safe}`,
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
  // parts[1] 的存在性已由 length === 2 保证；?? '' 只为满足 noUncheckedIndexedAccess
  return parts.length === 2 && parts[0] === 'KnowledgeBase' && /^\d{2}_/.test(parts[1] ?? '')
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

// ── 标题同步（重命名笔记的唯一实现处）───────────────────────────────
// 背景：重命名曾经只改「磁盘文件名 + DB.slug」，文件内的 frontmatter `title:` 与正文
// `# 标题` 一字未动。而显示名全部派生自 frontmatter —— server/utils/markdown.ts:231
// `const title = frontmatter.title || path.basename(slug)` —— 旧笔记 frontmatter 已有 title，
// 于是详情页文章头、笔记列表、图谱、各种选择器永远显示旧名，只有结构树（按路径显示）变了。
// 用户原话：「选择的重命名就是简单地修改列表名称而已」。

/** 拆出 frontmatter 块与它之后的正文；没有 frontmatter 时返回 null */
function splitFrontmatter(raw: string): { fm: string; body: string } | null {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw)
  if (!m) return null
  return { fm: m[1] ?? '', body: raw.slice(m[0].length) }
}

/** frontmatter 里显式声明且非空的标题（无声明时返回 null） */
export function frontmatterTitle(raw: string): string | null {
  const fm = splitFrontmatter(raw)?.fm
  if (fm === undefined) return null
  for (const line of fm.split(/\r?\n/)) {
    const kv = /^title[ \t]*:[ \t]*(.*)$/i.exec(line)
    if (!kv) continue
    let v = (kv[1] ?? '').trim()
    if (!v) continue
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    return v.trim() || null
  }
  return null
}

/**
 * 正文里第一个标题行的位置（ATX `# 标题` / `## 标题`，或下一行是下划线的 setext 写法）。
 * 范围与 ArticleReader 去重时认定的「文章标题行」一致（H1/H2），且跳过围栏代码块 ——
 * 否则会给示例代码里的 `# 注释` 换标题。
 */
function firstHeadingLine(body: string): { index: number; text: string; setext: boolean } | null {
  const lines = body.split(/\r?\n/)
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const f = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      const ch = (f[1] ?? '')[0] ?? null
      if (fence === null) fence = ch
      else if (ch === fence) fence = null
      continue
    }
    if (fence !== null) continue
    const atx = /^[ \t]{0,3}#{1,2}[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line)
    if (atx) return { index: i, text: (atx[1] ?? '').trim(), setext: false }
    const next = lines[i + 1] ?? ''
    if (line.trim() && /^[ \t]{0,3}(=+|-{2,})[ \t]*$/.test(next)) {
      return { index: i, text: line.trim(), setext: true }
    }
  }
  return null
}

/** 正文里第一个标题的文本（无则 null） */
export function firstHeadingText(raw: string): string | null {
  const body = splitFrontmatter(raw)?.body ?? raw
  return firstHeadingLine(body)?.text ?? null
}

/**
 * 把笔记的标题从 `oldTitle` 改成 `newTitle`：frontmatter 的 `title:` 与正文里那个
 * 「文章标题行」一起改。**两处都只在确认它们写的就是 oldTitle 时才动**：
 *  - 正文那个标题的文本不等于 oldTitle（用户拿首行当章节小标题、或正文标题与文件名不同）
 *    → 正文一个字节都不碰，绝不冒名顶替；
 *  - frontmatter 没有 title 行 → 不凭空补一行（那种笔记的显示名本来就派生自文件名，
 *    改名之后自然跟上，不需要也不该替用户写一个他没写过的字段）。
 *
 * 返回新的原文与「是否真的改了」——`changed=false` 时调用方需要自己保证显示名跟上
 * （重命名场景见 server/api/vault/rename.put.ts 的落库兜底）。
 */
export function rewriteNoteTitle(
  raw: string,
  opts: { oldTitle: string; newTitle: string }
): { content: string; changed: boolean } {
  const { oldTitle, newTitle } = opts
  if (!oldTitle || !newTitle || oldTitle === newTitle) return { content: raw, changed: false }

  const split = splitFrontmatter(raw)
  const body = split ? split.body : raw
  const head = firstHeadingLine(body)
  const rewriteBody = !!head && head.text === oldTitle
  const fmTitle = frontmatterTitle(raw)
  const rewriteFm = !!split && fmTitle !== null && fmTitle === oldTitle
  if (!rewriteBody && !rewriteFm) return { content: raw, changed: false }

  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  let nextBody = body
  if (rewriteBody && head) {
    const lines = body.split(/\r?\n/)
    const original = lines[head.index] ?? ''
    // setext 的级别由下一行的下划线决定，只换文字行；ATX 保留原级别与可能的收尾井号
    lines[head.index] = head.setext
      ? newTitle
      : original.replace(/^([ \t]{0,3}#{1,2}[ \t]+).*?([ \t]*#*[ \t]*)$/, `$1${newTitle}$2`)
    nextBody = lines.join(eol)
  }

  if (!split) return { content: nextBody, changed: true }
  const fm = rewriteFm ? rewriteFrontmatterTitleLine(split.fm, newTitle) : split.fm
  return { content: `---${eol}${fm}${eol}---${eol}${nextBody}`, changed: true }
}

/** 重写 frontmatter 块内的 title 行（保留其它行与原有引号风格；调用方已确保该行存在） */
function rewriteFrontmatterTitleLine(fm: string, newTitle: string): string {
  const eol = fm.includes('\r\n') ? '\r\n' : '\n'
  const lines = fm.split(/\r?\n/)
  const idx = lines.findIndex(l => /^title[ \t]*:/i.test(l))
  if (idx < 0) return fm
  const m = /^([ \t]*title[ \t]*:[ \t]*)(.*)$/i.exec(lines[idx] ?? '')
  const prefix = m?.[1] ?? 'title: '
  const value = (m?.[2] ?? '').trim()
  const quote = value.startsWith('"') ? '"' : (value.startsWith("'") ? "'" : '')
  lines[idx] = `${prefix}${titleScalar(newTitle, quote)}`
  return lines.join(eol)
}

/** 按原引号风格输出 YAML 标量；没引号且内容需要引号时补双引号（标题里可能有 # : 等指示符） */
function titleScalar(v: string, quote: string): string {
  if (quote === '"') return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  if (quote === "'") return `'${v.replace(/'/g, "''")}'`
  const risky = /^[\s#&*!|>%@`\[\]{},'"]/.test(v) || /^-[ \t]/.test(v) || /:[ \t]/.test(v) || /\s#/.test(v)
  if (!risky) return v
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
