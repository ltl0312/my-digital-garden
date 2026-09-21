/**
 * 成熟度判定对账脚本：TS 实现（server/utils/maturity.ts） vs audit 工具基准
 *
 * 用法（Node 22.6+ 类型剥离）：
 *   node --experimental-strip-types scripts/verify-maturity.ts
 *
 * 前置：先用 audit 工具导出基准
 *   python design-preview/tools/maturity-audit.py --json design-preview/tools/maturity-baseline.json
 *
 * 通过标准：289 篇逐篇 maturity 值完全一致（reason 文案允许中英实现差异，不参与比对）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { classifyMaturity, computeInDegrees } from '../server/utils/maturity.ts'

const ROOT = path.resolve(process.cwd(), 'content/vault')
const BASELINE = path.resolve(process.cwd(), 'design-preview/tools/maturity-baseline.json')
const TODAY = process.env.AUDIT_TODAY ? new Date(process.env.AUDIT_TODAY) : new Date()

function walk(dir: string, out: string[] = []): string[] {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === '.maturity-backup' || d.name.startsWith('.')) continue
    const p = path.join(dir, d.name)
    if (d.isDirectory()) walk(p, out)
    else if (d.name.endsWith('.md')) out.push(p)
  }
  return out
}

function parseFrontmatter(raw: string): { fm: string; body: string } {
  if (!raw.startsWith('---')) return { fm: '', body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { fm: '', body: raw }
  return { fm: raw.slice(3, end), body: raw.slice(end + 4) }
}

function parseTags(fm: string): string[] {
  const m = /^tags\s*:\s*(.*)$/m.exec(fm)
  if (!m) return []
  const inline = m[1].trim()
  if (inline && inline !== '|' && inline !== '>') {
    // 行内数组：tags: [a, b]（本库 34 篇 MOC 全是这种写法——上一轮扫描器曾漏掉）
    return inline.replace(/^\[/, '').replace(/\]$/, '').split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  const seg = fm.slice(m.index + m[0].length)
  return [...seg.matchAll(/^\s*-\s+(.+?)\s*$/gm)].map(x => x[1].trim().replace(/^['"]|['"]$/g, ''))
}

function parseCreatedDays(fm: string): number | null {
  const m = /^created\s*:\s*(.+?)\s*$/m.exec(fm)
  if (!m) return null
  const v = m[1].replace(/^["']|["']$/g, '')
  for (const fmt of [/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/, /^(\d{4})-(\d{2})-(\d{2})$/]) {
    const x = fmt.exec(v)
    if (x) {
      const d = new Date(Number(x[1]), Number(x[2]) - 1, Number(x[3]))
      return Math.floor((TODAY.getTime() - d.getTime()) / 86400000)
    }
  }
  return null
}

// ---- 收集（与 audit 相同的遍历范围） ----
const files = walk(ROOT)
const entries: Array<{ rel: string; raw: string }> = files.map(p => ({
  rel: path.relative(ROOT, p).replace(/\\/g, '/'),
  raw: fs.readFileSync(p, 'utf-8')
}))

// ---- 入链（全文口径，与 audit build_index 一致） ----
const deg = computeInDegrees(entries.map(e => ({ slug: e.rel, content: e.raw })))

// ---- 逐篇判定 ----
const verdicts: Record<string, { maturity: string; reason: string }> = {}
for (const e of entries) {
  const { fm } = parseFrontmatter(e.raw)
  const name = path.basename(e.rel).replace(/\.md$/, '')
  const ageDays = parseCreatedDays(fm)
  const r = classifyMaturity({
    rel: e.rel,
    name,
    tags: parseTags(fm),
    markdown: e.raw,
    inDeg: deg.get(e.rel) ?? 0,
    ageDays
  })
  verdicts[e.rel] = { maturity: r.value, reason: r.reason }
}

// ---- 与基准比对 ----
if (!fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify(verdicts, null, 1))
  console.log(`基准不存在，已生成本次结果 → ${BASELINE}（${Object.keys(verdicts).length} 篇）`)
  console.log('再次运行以执行对账。')
  process.exit(0)
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf-8'))
const diffs: string[] = []
const all = new Set([...Object.keys(base), ...Object.keys(verdicts)])
for (const k of all) {
  const b = base[k]?.maturity
  const v = verdicts[k]?.maturity
  if (b !== v) diffs.push(`${k}: audit=${b} ts=${v}`)
}

const from = Object.entries(base).reduce<Record<string, number>>((a, [, v]) => {
  const m = (v as { maturity: string }).maturity
  a[m] = (a[m] ?? 0) + 1
  return a
}, {})
const to = Object.entries(verdicts).reduce<Record<string, number>>((a, [, v]) => {
  a[v.maturity] = (a[v.maturity] ?? 0) + 1
  return a
}, {})

console.log(`对账 ${all.size} 篇 · audit 分布 ${JSON.stringify(from)} · ts 分布 ${JSON.stringify(to)}`)
if (diffs.length) {
  console.log(`❌ ${diffs.length} 篇不一致：`)
  for (const d of diffs.slice(0, 20)) console.log('  ' + d)
  process.exit(1)
}
console.log('✅ TS 判定与 audit 工具逐篇一致（0 差异）')
