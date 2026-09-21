/**
 * maturity 判定 —— 纯函数（零依赖，可被脚本/测试直接导入对账）
 *
 * 与 design-preview/tools/maturity-audit.py 是同一套标准（设计方案文档第 10 章）：
 *   · 适用范围：模板 / 附件 / 工具文档 / 绘图文件 → EXCLUDED（不参与评价）
 *   · 索引页：文件名 MOC-* 或含 type/MOC → INDEXED（按收录条数分档，不进成熟度色阶）
 *   · 常青：五块齐全 + 关联≥4维无空缺 + 有跨学科溯源 + 内容充实 + 被引用≥2 + 存在≥14天
 *   · 成长：结构已成形 + 关联填充率≥50% + 正文≥400 字
 *   · 幼苗：其余（附具体缺口）
 *
 * 注意：入链口径 = 正文 obsidian://open?file= 与 [[wikilink]] 两类都算
 *（这套库的正文关联主要用 obsidian 链接，只数 wikilink 会得出「88% 零引用」的假象）。
 */

export type MaturityValue = 'SEEDLING' | 'GROWING' | 'EVERGREEN' | 'INDEXED' | 'EXCLUDED'

export interface MaturityThresholds {
  evChars: number
  evEv: number
  evCtxMin: number
  evIndeg: number
  evDays: number
  grChars: number
  grCtxFill: number
  grBlocks: number
  indexFullRows: number
  indexSomeRows: number
}

export const TH: MaturityThresholds = {
  evChars: 800,
  evEv: 2,
  evCtxMin: 4,
  evIndeg: 2,
  evDays: 14,
  grChars: 400,
  grCtxFill: 0.5,
  grBlocks: 3,
  indexFullRows: 15,
  indexSomeRows: 4
}

/** 与 audit 工具一致的适用范围排除清单（rel 含 .md 后缀、相对 vault） */
const NON_NOTE: Array<[RegExp, string]> = [
  [/(^|\/)\.maturity-backup\//, '备份文件'],
  [/^KnowledgeBase\/05_Templates\//, '模板骨架'],
  [/^KnowledgeBase\/06_Assets\//, '附件目录'],
  [/^KnowledgeBase\/(CLAUDE\.md|\.claude\/)/, '工具/规范文档'],
  [/^KnowledgeBase\/skills\//, '技能文档'],
  [/\.excalidraw\.md$/, '绘图文件']
]

export function scopeOf(rel: string): { included: boolean; why?: string } {
  for (const [re, why] of NON_NOTE) {
    if (re.test(rel)) return { included: false, why }
  }
  return { included: true }
}

const BLOCK_KEYS = ['知识体系定位', '概述', '设计初衷', '实现', '关联上下文'] as const

/** 取 '## xxx' 到下一个 '## ' 之间的内容 */
function sectionOf(body: string, key: string): string | null {
  const head = new RegExp(`^##\\s*[^\\n]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*$`, 'm')
  const m = head.exec(body)
  if (!m) return null
  const rest = body.slice(m.index + m[0].length)
  const nxt = /^##\s/m.exec(rest)
  return nxt ? rest.slice(0, nxt.index) : rest
}

export interface ClassifyInput {
  /** 相对 vault 路径，含 .md（与 audit 工具口径一致），如 KnowledgeBase/03_Knowledge/x.md */
  rel: string
  /** 文件名（去 .md），如 "MOC - TypeScript" */
  name: string
  tags: string[]
  /** 正文（可含 frontmatter，与 audit 全文口径一致） */
  markdown: string
  /** 入链数（调用方按 obsidian + wikilink 双口径解析后传入） */
  inDeg: number
  /** frontmatter created 距今天数；解析失败传 null（视为满足——与 audit 的 10^6 兜底一致） */
  ageDays: number | null
}

export interface ClassifyResult {
  value: MaturityValue
  reason: string
}

export function classifyMaturity(input: ClassifyInput): ClassifyResult {
  const scope = scopeOf(input.rel)
  if (!scope.included) return { value: 'EXCLUDED', reason: scope.why! }

  const isMoc =
    /^MOC\s*-\s*/.test(input.name) || input.tags.some(t => t.split('/').pop() === 'MOC')
  if (isMoc) {
    const rows = (input.markdown.match(/^\|.*\|$/gm) || []).length
    if (rows >= TH.indexFullRows) return { value: 'INDEXED', reason: `索引完整 · 收录 ${rows} 条` }
    if (rows >= TH.indexSomeRows) return { value: 'INDEXED', reason: `索引已建 · 收录 ${rows} 条，仍可补充` }
    return { value: 'INDEXED', reason: `索引仅 ${rows} 条，尚未成形` }
  }

  const raw = input.markdown
  // 兼容两种输入：全文（含 frontmatter，对账脚本口径）或纯正文（watcher 的 rawMarkdown）。
  // 结构指标一律用剥离 frontmatter 后的正文（与 audit 工具一致）。
  const body = raw.startsWith('---')
    ? raw.slice(raw.indexOf('\n---', 3) + 4)
    : raw
  const chars = (body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').match(/\S/g) || []).length
  const code = (body.match(/```/g) || []).length / 2
  const tables = (body.match(/^\|.*\|$/gm) || []).length

  const blocks: Record<string, string | null> = {}
  let blocksN = 0
  for (const k of BLOCK_KEYS) {
    blocks[k] = sectionOf(body, k)
    if (blocks[k] !== null) blocksN++
  }
  const ctxRaw = blocks['关联上下文'] ?? ''
  // 逐行统计（与 audit 一致）。不能用 [\s\S] 正则：会跨行贪婪吞并多行，
  // 使「关联无空缺」恒为 false——对账时曾让 23 篇常青全部掉档。
  const ctxLines = ctxRaw.split('\n').filter(l => l.trim().startsWith('- **'))
  const ctxRows = ctxLines.length
  const ctxFilled = ctxLines.filter(l => !l.includes('待补充')).length
  const fill = ctxRows ? ctxFilled / ctxRows : 0
  const full5 = blocksN === 5
  const trace = sectionOf(body, '跨学科溯源') !== null
  const days = input.ageDays ?? 1e6

  const ev: Record<string, boolean> = {
    五块齐全: full5,
    有跨学科溯源: trace,
    '关联≥4维且无空缺': ctxRows >= TH.evCtxMin && ctxFilled === ctxRows,
    内容充实: chars >= TH.evChars && code + tables >= TH.evEv,
    '被引用≥2': input.inDeg >= TH.evIndeg,
    '经过时间检验≥14天': days >= TH.evDays
  }
  if (Object.values(ev).every(Boolean)) {
    return { value: 'EVERGREEN', reason: '结构自洽 + 关联完整 + 有溯源 + 被引用' }
  }
  const missing = Object.entries(ev).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length === 1) return { value: 'GROWING', reason: `仅差「${missing[0]}」即可升常青` }

  const g = {
    有关联区块: ctxRows > 0,
    关联填充达标: fill >= TH.grCtxFill,
    结构已成形: full5 || blocksN >= TH.grBlocks,
    内容可读: chars >= TH.grChars
  }
  const hard =
    Number(g.有关联区块) + Number(g.结构已成形) + Number(g.内容可读)
  if (hard === 3 && g.关联填充达标) {
    return { value: 'GROWING', reason: '结构/关联已成，待补：' + missing.slice(0, 2).join('、') }
  }
  if (hard === 3) {
    return { value: 'GROWING', reason: `结构已成，关联上下文空缺（${ctxFilled}/${ctxRows}）` }
  }
  if (hard === 2 && chars >= 800 && code + tables >= 2) {
    return { value: 'GROWING', reason: `内容充实但骨架不全（${blocksN}/5 区块）` }
  }

  const why: string[] = []
  if (!full5) {
    const missBlocks = BLOCK_KEYS.filter(k => blocks[k] === null).slice(0, 2)
    why.push('缺 ' + missBlocks.join('、'))
  }
  if (ctxRows === 0) why.push('无关联上下文')
  else if (fill < TH.grCtxFill) why.push(`关联仅 ${ctxFilled}/${ctxRows}`)
  if (chars < TH.grChars) why.push(`正文 ${chars} 字`)
  return { value: 'SEEDLING', reason: why.join('；') || '未达结构门槛' }
}

/** 从正文解析出链目标（obsidian:// 与 [[wikilink]] 双口径，与 audit 一致） */
export function extractLinkTargets(markdown: string): string[] {
  const obs = [...markdown.matchAll(/obsidian:\/\/open\?file=([^"&\n]+)/g)].map(m => m[1])
  const wl = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1])
  return [...obs, ...wl]
}

/**
 * 全量入链计数：entries = 每篇 { slug, content }；basename 唯一才匹配（与 audit 一致）。
 * 返回 slug → 入链数。
 */
export function computeInDegrees(entries: Array<{ slug: string; content: string }>): Map<string, number> {
  const byBase = new Map<string, string[]>()
  for (const e of entries) {
    const base = e.slug.split('/').pop()!.replace(/\.md$/, '')
    const hit = byBase.get(base)
    if (hit) hit.push(e.slug)
    else byBase.set(base, [e.slug])
  }
  const deg = new Map<string, number>()
  for (const e of entries) {
    const targets = new Set(extractLinkTargets(e.content).map(t => t.replace(/\.md$/, '').trim()))
    for (const t of targets) {
      const base = t.split('/').pop()!.replace(/\.md$/, '')
      const hit = byBase.get(base)
      if (hit && hit.length === 1 && hit[0] !== e.slug) {
        deg.set(hit[0], (deg.get(hit[0]) ?? 0) + 1)
      }
    }
  }
  return deg
}
