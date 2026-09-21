/**
 * maturity 与数据库的编排层（纯判定在 ./maturity.ts，本文件负责取数与写入）
 */
import { prisma } from './db'
import { invalidateGardenCache } from './cache'
import { classifyMaturity, computeInDegrees, type MaturityValue } from './maturity'

const DB_VALUES: ReadonlySet<string> = new Set(['SEEDLING', 'GROWING', 'EVERGREEN'])

export type DbMaturity = 'SEEDLING' | 'GROWING' | 'EVERGREEN'

/** 判定结果 → DB 枚举映射：INDEXED/EXCLUDED 不参与成熟度，落库为中性 SEEDLING（界面按标题/标签呈现「索引」） */
function toDbValue(v: string): DbMaturity {
  return v === 'EVERGREEN' ? 'EVERGREEN' : v === 'GROWING' ? 'GROWING' : 'SEEDLING'
}

export interface MaturityContext {
  slug: string
  title: string
  tags: string[]
  markdown: string
  /** frontmatter created 原始值（解析失败传 undefined） */
  created?: string
  /** frontmatter 中的显式 maturity（大写后），无则 undefined */
  explicit?: string
  /** maturity-locked: true —— 人工固定，自动判定永不覆盖 */
  locked?: boolean
}

function parseAgeDays(created?: string, now = new Date()): number | null {
  if (!created) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(created.trim())
  if (!m) return null
  return Math.floor((now.getTime() - new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()) / 86400000)
}

/** 判定一篇（不做任何写入）。显式人工值直接尊重（与文档 10.5 治理机制一致）。 */
export function judgeMaturity(ctx: MaturityContext, inDeg: number): { value: DbMaturity; manual: boolean } {
  if (ctx.locked) {
    return { value: toDbValue(ctx.explicit ?? 'SEEDLING'), manual: true }
  }
  if (ctx.explicit && DB_VALUES.has(ctx.explicit)) {
    return { value: ctx.explicit as DbMaturity, manual: true }
  }
  const r = classifyMaturity({
    rel: ctx.slug + '.md',
    name: ctx.title,
    tags: ctx.tags,
    markdown: ctx.markdown,
    inDeg,
    ageDays: parseAgeDays(ctx.created)
  })
  return { value: toDbValue(r.value), manual: false }
}

/**
 * 单篇缺省判定（processMarkdownFile 在 frontmatter 无 maturity 时调用）。
 * in_deg 用 DB NoteLink 当前值——wikilink 口径、可能是旧值（暂态）；
 * 全量重算 recomputeAllMaturity 会用「obsidian + wikilink」双口径统一修正。
 */
export async function computeMaturityForNote(ctx: MaturityContext): Promise<{
  value: DbMaturity
  manual: boolean
}> {
  const j0 = judgeMaturity(ctx, 0)
  if (j0.manual) return j0
  const note = await prisma.note.findUnique({ where: { slug: ctx.slug }, select: { id: true } })
  let inDeg = 0
  if (note) {
    const agg = await prisma.noteLink.groupBy({
      by: ['targetId'],
      _count: { _all: true },
      where: { targetId: note.id }
    })
    inDeg = agg.reduce((a, x) => a + (x._count?._all ?? 0), 0)
  }
  return judgeMaturity(ctx, inDeg)
}

/**
 * 全量重算（audit 工具同口径：入链 = obsidian:// + [[wikilink]] 双口径 basename 唯一匹配）。
 * 只更新「无显式 maturity 且未 locked」的笔记——人工值永远优先（文档 10.5）。
 * 挂载点：watcher 全量同步完成后（dev）+ POST /api/admin/maturity/recompute（生产手动触发）。
 */
export async function recomputeAllMaturity(): Promise<{ scanned: number; updated: number; skippedManual: number }> {
  const notes = await prisma.note.findMany({
    select: { slug: true, title: true, content: true, metadata: true }
  })
  const deg = computeInDegrees(notes.map(n => ({ slug: n.slug, content: n.content })))

  let updated = 0
  let skippedManual = 0
  const now = new Date()
  for (const n of notes) {
    const fm = (n.metadata && typeof n.metadata === 'object' ? n.metadata : {}) as Record<string, unknown>
    const explicit = typeof fm.maturity === 'string' ? fm.maturity.toUpperCase() : undefined
    const locked = fm['maturity-locked'] === true
    const j = judgeMaturity(
      {
        slug: n.slug,
        title: n.title,
        tags: Array.isArray(fm.tags) ? fm.tags.filter((x): x is string => typeof x === 'string') : [],
        markdown: n.content,
        created: typeof fm.created === 'string' ? fm.created : undefined,
        explicit,
        locked
      },
      deg.get(n.slug) ?? 0
    )
    if (j.manual) {
      skippedManual++
      continue
    }
    const current = await prisma.note.findUnique({ where: { slug: n.slug }, select: { maturity: true } })
    if (!current || current.maturity === j.value) continue
    await prisma.note.update({ where: { slug: n.slug }, data: { maturity: j.value } })
    updated++
  }
  invalidateGardenCache()
  return { scanned: notes.length, updated, skippedManual }
}
