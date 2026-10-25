/**
 * AI 全库审计（扫描 → 建议 → 可选执行）
 *
 * ## 它解决什么问题
 *
 * 标签/领域建议回答的是「这篇该挂在哪」；审计回答的是「这篇本身该补什么、改什么」——
 * 缺少关键小节、内容过时、结论没写、只列了名词没解释。这类问题必须读正文才能发现，
 * 规则引擎做不了，只能交给模型。
 *
 * ## 三条设计约束（都来自需求原话）
 *
 * 1. **范围可限定**：整库或部分（文件夹 / 标签 / 领域 / 关键词）。
 * 2. **建议与执行分离**：用户可以只看建议（只读模式），也可以让 AI 直接执行。
 * 3. **执行前必须整库备份**：AI 直接改文件是最危险的动作，所以每次「执行」之前
 *    无条件先做一份整库备份（kind=pre-audit），失败就中止，不允许「先改了再说」。
 *
 * ## 为什么不落数据库
 *
 * 一次审计的结果是「几十条建议 + 每条的原文依据」，本质是**一次性的报告**。
 * 塞进数据库要加表、加迁移、加清理策略，而它天然适合按文件存
 * （与备份同一套路：`data/audits/<id>.json`）。恢复备份时也不会把旧审计带回来 ——
 * 审计结论本来就该跟着库的当前状态重新生成。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { prisma } from './db'
import { llmJson } from './llm'
import { createBackup } from './backup'
import { resolveVaultPath, writeMarkdownAtomic } from './vault'

/** 审计报告目录（与备份同盘，便于一起做磁盘容量观察） */
export const AUDIT_DIR = process.env.GARDEN_AUDIT_DIR
  ? path.resolve(process.env.GARDEN_AUDIT_DIR)
  : path.join(process.cwd(), 'data', 'audits')

/** 单次审计最多扫多少篇 —— 直接决定 token 花多少，必须有硬上限 */
const MAX_NOTES = 60
/** 默认扫多少篇（用户不填时） */
const DEFAULT_NOTES = 20
/** 正文送进 prompt 的字符上限（长文截断，否则单篇就能吃掉整个上下文） */
const CONTENT_LIMIT = 4000
/** 并发数：网关侧通常限流，3 个并发既不慢也不至于被拒 */
const CONCURRENCY = 3

export interface AuditScope {
  /** 文件夹路径前缀，如 ['zrw/技术'] */
  folders?: string[]
  /** 标签名（含前缀的完整名，如 'Java/基础'） */
  tags?: string[]
  /** 领域名，如 ['前端'] */
  domains?: string[]
  /** 标题/正文关键词 */
  keyword?: string
  /** 最多扫多少篇 */
  limit?: number
}

export type AuditKind = 'add' | 'modify' | 'fix'

/**
 * 可执行动作。**只有这三种**，且每一种都必须是「可机械执行、可回溯」的：
 * 追加一节、补标签、改领域。刻意不提供「重写正文」——模型重写整篇的风险
 * 远高于收益，而备份恢复再快也不该被用来兜底模型的自由发挥。
 */
export type AuditAction =
  | { type: 'append-section'; heading: string; body: string }
  | { type: 'add-tags'; tags: string[] }
  | { type: 'set-domain'; domain: string }

export interface AuditIssue {
  id: string
  slug: string
  noteTitle: string
  kind: AuditKind
  /** 一句话：要做什么 */
  title: string
  /** 为什么 / 依据（引用原文片段） */
  detail: string
  severity: 'low' | 'medium' | 'high'
  /** null = 只能人工处理（纯判断类建议，无法机械执行） */
  action: AuditAction | null
  applied: boolean
  appliedAt: string | null
  /** 执行失败的如实记录（不静默吞掉） */
  error?: string
}

export interface AuditRun {
  v: 1
  id: string
  createdAt: string
  scope: AuditScope
  actor: string
  model: string
  /** 实际扫到的笔记数 */
  noteCount: number
  /** 送进模型的篇数（受 limit 约束） */
  scannedCount: number
  /** 模型失败的篇数（如实报告，不假装全成功） */
  failedCount: number
  issues: AuditIssue[]
  complete: boolean
  /** 备份 ID（若本次审计执行过写操作） */
  backupId?: string
  /** 整次审计崩掉时的原因（如实记录，界面据此显示"这次没跑成"而不是"没有问题"） */
  error?: string
}

// ── 范围选择 ────────────────────────────────────────────────────────────────

/**
 * 把用户给的筛选条件翻译成 Prisma where。
 * 各条件之间是 **AND**（「zrw/技术 里带 Java 标签的」= 两个条件都满足），
 * 同一条件内多个值是 **OR**。
 */
export function scopeWhere(scope: AuditScope): Record<string, unknown> {
  const and: Record<string, unknown>[] = []

  const folders = (scope.folders || []).map(f => f.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean)
  if (folders.length) {
    and.push({
      OR: folders.flatMap(f => [
        { slug: f },
        { slug: { startsWith: `${f}/` } }
      ])
    })
  }

  const tags = (scope.tags || []).map(t => t.trim()).filter(Boolean)
  if (tags.length) {
    and.push({ tags: { some: { tag: { name: { in: tags } } } } })
  }

  const domains = (scope.domains || []).map(d => d.trim()).filter(Boolean)
  if (domains.length) {
    and.push({ domainLevel1: { in: domains } })
  }

  const keyword = (scope.keyword || '').trim()
  if (keyword) {
    and.push({
      OR: [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } }
      ]
    })
  }

  return and.length ? { AND: and } : {}
}

export interface ScopePreview {
  matched: number
  willScan: number
  limit: number
  sample: Array<{ slug: string; title: string }>
}

/** 先让用户看到「这次会扫多少篇」，再决定要不要花 token */
export async function previewScope(scope: AuditScope): Promise<ScopePreview> {
  const where = scopeWhere(scope)
  const limit = Math.max(1, Math.min(MAX_NOTES, Number(scope.limit) || DEFAULT_NOTES))
  const [matched, sample] = await Promise.all([
    prisma.note.count({ where }),
    prisma.note.findMany({
      where,
      select: { slug: true, title: true },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 10)
    })
  ])
  return { matched, willScan: Math.min(matched, limit), limit, sample }
}

// ── 报告读写 ────────────────────────────────────────────────────────────────

function newId(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

async function runFile(id: string): Promise<string> {
  if (!/^[0-9]{8}-[0-9]{6}-[a-z0-9]{2,8}$/.test(id)) throw new Error('审计 ID 非法')
  return path.join(AUDIT_DIR, `${id}.json`)
}

async function writeRun(run: AuditRun): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true })
  const file = await runFile(run.id)
  // 先写临时文件再 rename：读的人永远看不到写了一半的 JSON
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(run, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

/** 供后台任务使用：给一次审计分配 id（前端要先拿到 id 才能轮询进度） */
export function newAuditId(): string {
  return newId()
}

/** 整次审计抛错时把「跑失败了」写进报告，避免界面把空报告误读成「没有问题」 */
export async function markAuditFailed(id: string, error: string): Promise<void> {
  const run = await getAuditRun(id)
  if (!run) return
  run.complete = true
  run.error = error.slice(0, 500)
  await writeRun(run).catch(() => null)
}

export async function listAuditRuns(limit = 20): Promise<Array<Omit<AuditRun, 'issues'> & { issueCount: number }>> {
  let names: string[]
  try {
    names = await fs.readdir(AUDIT_DIR)
  } catch {
    return []
  }
  const out: Array<Omit<AuditRun, 'issues'> & { issueCount: number }> = []
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue
    try {
      const run = JSON.parse(await fs.readFile(path.join(AUDIT_DIR, name), 'utf8')) as AuditRun
      const { issues, ...rest } = run
      out.push({ ...rest, issueCount: issues.length })
    } catch {
      // 损坏的报告直接跳过：它没有任何恢复价值，也不影响库
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
}

export async function getAuditRun(id: string): Promise<AuditRun | null> {
  try {
    return JSON.parse(await fs.readFile(await runFile(id), 'utf8')) as AuditRun
  } catch {
    return null
  }
}

export async function deleteAuditRun(id: string): Promise<void> {
  await fs.rm(await runFile(id), { force: true })
}

// ── 审计本身 ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  '你是一位严格的技术编辑，正在审阅个人知识库里的笔记。',
  '你的任务是找出这篇笔记**实际存在的**问题，并给出可执行的改进项。',
  '只针对能指认到具体位置的问题提意见，不要泛泛而谈「可以更详细」。',
  '',
  '允许的问题类型（kind）：',
  '  add    = 缺少必要内容（某个关键小节没写、结论缺失、没给示例）',
  '  modify = 现有内容有问题（表述含糊、结论与正文不符、结构混乱）',
  '  fix    = 明确错误（错别字、代码块语言标注错、链接失效、事实错误）',
  '',
  '每条建议必须能落到三种动作之一，否则不要提：',
  '  append-section  追加一小节（给 heading 与 body，body 是完整的 markdown，不要占位符）',
  '  add-tags        补充标签（只能从给定候选标签里选，逐字一致）',
  '  set-domain      调整领域（只能从给定候选领域里选）',
  '若某条建议无法机械执行（例如「建议重写全文」），action 给 null。',
  '',
  '严厉约束：',
  '1. 最多 4 条，按严重程度排序；宁少勿滥，没有真问题就返回空数组。',
  '2. append-section 的 body 必须是可直接粘进笔记的正文，禁止写「此处补充…」这类占位。',
  '3. 不要建议删除用户内容。',
  '4. 只输出 JSON，不要 markdown 代码块，不要解释。',
  'JSON: {"issues":[{"kind":"add","title":"一句话","detail":"依据+具体改什么","severity":"low|medium|high","action":{"type":"append-section","heading":"小节标题","body":"markdown 正文"}|{"type":"add-tags","tags":["候选标签"]}|{"type":"set-domain","domain":"候选领域"}|null}]}'
].join('\n')

interface RawIssue {
  kind?: unknown
  title?: unknown
  detail?: unknown
  severity?: unknown
  action?: unknown
}

function asString(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** 把模型返回的一条建议收敛成可信的 AuditIssue（越界/畸形的丢弃） */
function normalizeIssue(
  raw: RawIssue,
  ctx: { slug: string; noteTitle: string; candidateTags: Set<string>; candidateDomains: Set<string> }
): AuditIssue | null {
  const title = asString(raw.title, 120)
  const detail = asString(raw.detail, 1200)
  if (!title) return null
  const kind: AuditKind = raw.kind === 'modify' || raw.kind === 'fix' ? raw.kind : 'add'
  const severity = raw.severity === 'high' || raw.severity === 'low' ? raw.severity : 'medium'

  let action: AuditAction | null = null
  const a = raw.action as Record<string, unknown> | null | undefined
  if (a && typeof a === 'object') {
    const type = asString(a.type, 40)
    if (type === 'append-section') {
      const heading = asString(a.heading, 120)
      const body = asString(a.body, 6000)
      // 正文太短（<20 字）基本就是占位符，宁可丢弃
      if (heading && body.length >= 20) action = { type: 'append-section', heading, body }
    } else if (type === 'add-tags') {
      const wanted = Array.isArray(a.tags) ? a.tags : []
      const tags: string[] = []
      for (const t of wanted) {
        const name = asString(t, 80)
        // 白名单收敛：模型只能从既有标签里选，避免污染标签体系
        if (name && ctx.candidateTags.has(name) && !tags.includes(name)) tags.push(name)
      }
      if (tags.length) action = { type: 'add-tags', tags }
    } else if (type === 'set-domain') {
      const domain = asString(a.domain, 80)
      if (domain && ctx.candidateDomains.has(domain)) action = { type: 'set-domain', domain }
    }
  }

  return {
    id: createHash('sha1').update(`${ctx.slug}|${title}|${kind}`).digest('hex').slice(0, 12),
    slug: ctx.slug,
    noteTitle: ctx.noteTitle,
    kind,
    title,
    detail,
    severity,
    action,
    applied: false,
    appliedAt: null
  }
}

/** 现有标签名与领域名 —— 作为模型的白名单 */
async function candidateVocabulary(): Promise<{ tags: Set<string>; domains: Set<string> }> {
  const [tags, domains] = await Promise.all([
    prisma.tag.findMany({ select: { name: true } }),
    prisma.note.findMany({ where: { domainLevel1: { not: null } }, select: { domainLevel1: true }, distinct: ['domainLevel1'] })
  ])
  return {
    tags: new Set(tags.map(t => t.name)),
    domains: new Set(domains.map(d => d.domainLevel1).filter((d): d is string => !!d))
  }
}

/**
 * 跑一次审计。**只读**：不改任何文件与数据库，只产出报告。
 *
 * 执行动作是另一个接口（applyAuditIssue），因为它必须先做整库备份 ——
 * 把「扫描」和「写库」拆成两个请求，用户才有机会只看建议不动手。
 */
export async function runAudit(opts: {
  scope: AuditScope
  actor: string
  model: string
  /** 调用方预先生成的 id（后台跑时接口要先回执 id 给前端轮询） */
  id?: string
}): Promise<AuditRun> {
  const where = scopeWhere(opts.scope)
  const limit = Math.max(1, Math.min(MAX_NOTES, Number(opts.scope.limit) || DEFAULT_NOTES))

  const [matched, notes, vocab] = await Promise.all([
    prisma.note.count({ where }),
    prisma.note.findMany({
      where,
      select: { slug: true, title: true, content: true, domainLevel1: true, tags: { select: { tag: { select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: limit
    }),
    candidateVocabulary()
  ])

  const run: AuditRun = {
    v: 1,
    id: opts.id || newId(),
    createdAt: new Date().toISOString(),
    scope: opts.scope,
    actor: opts.actor,
    model: opts.model,
    noteCount: matched,
    scannedCount: notes.length,
    failedCount: 0,
    issues: [],
    complete: false
  }
  await writeRun(run)

  // 并发受限地跑：3 路同时请求，结果按原顺序收集
  let cursor = 0
  const issues: AuditIssue[] = []
  const workers = Array.from({ length: Math.min(CONCURRENCY, notes.length || 1) }, async () => {
    for (;;) {
      const idx = cursor++
      if (idx >= notes.length) return
      const n = notes[idx]!
      const currentTags = n.tags.map(t => t.tag.name)
      const user = [
        `标题：${n.title}`,
        `路径：${n.slug}`,
        `当前标签：${currentTags.length ? currentTags.join('、') : '（无）'}`,
        `当前领域：${n.domainLevel1 || '（未指定）'}`,
        '',
        `候选标签（add-tags 只能从中选）：${[...vocab.tags].join('、') || '（无）'}`,
        `候选领域（set-domain 只能从中选）：${[...vocab.domains].join('、') || '（无）'}`,
        '',
        '正文（可能被截断）：',
        (n.content || '').slice(0, CONTENT_LIMIT)
      ].join('\n')

      const res = await llmJson<{ issues?: RawIssue[] }>(SYSTEM_PROMPT, user, { maxTokens: 1500 })
      if (!res) {
        run.failedCount++
        continue
      }
      const raw = Array.isArray(res.issues) ? res.issues.slice(0, 4) : []
      for (const r of raw) {
        const issue = normalizeIssue(r, {
          slug: n.slug,
          noteTitle: n.title,
          candidateTags: vocab.tags,
          candidateDomains: vocab.domains
        })
        if (issue) issues.push(issue)
      }
    }
  })
  await Promise.all(workers)

  // 去重（同一篇 + 同一标题只留一条），并按严重程度排序
  const seen = new Set<string>()
  const rank = { high: 0, medium: 1, low: 2 } as const
  run.issues = issues
    .filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.slug.localeCompare(b.slug))
  run.complete = true
  await writeRun(run)
  return run
}

// ── 执行（AI 直接改库） ──────────────────────────────────────────────────────

export interface ApplyResult {
  issueId: string
  ok: boolean
  message: string
}

/**
 * 执行若干条建议。
 *
 * **无条件先做整库备份**（需求原话：「ai执行的前需要对整个库进行备份」）。
 * 备份失败 → 直接抛错，一条都不执行。这是硬顺序，不允许「先改一条试试」。
 *
 * 执行完每一条都会：
 *   · 写文件（append-section / add-tags）或写 DB（set-domain）；
 *   · 立刻 processMarkdownFile 重建索引 —— 不等 watcher，否则前端刷新时看到的还是旧内容。
 */
export async function applyAuditIssues(opts: {
  runId: string
  issueIds: string[]
  actor: string
}): Promise<{ backupId: string; results: ApplyResult[] }> {
  const run = await getAuditRun(opts.runId)
  if (!run) throw new Error('审计报告不存在')
  const targets = new Set(opts.issueIds)
  const issues = run.issues.filter(i => targets.has(i.id))
  if (!issues.length) throw new Error('没有匹配的建议可执行')

  // 1) 备份（失败即中止）
  const backup = await createBackup({
    kind: 'pre-audit',
    reason: `AI 审计执行前备份（报告 ${run.id}，${issues.length} 条建议）`,
    actor: opts.actor
  })
  run.backupId = backup.id

  const { processMarkdownFile } = await import('./markdown')
  const results: ApplyResult[] = []

  for (const issue of issues) {
    if (issue.applied) {
      results.push({ issueId: issue.id, ok: false, message: '这条已经执行过了' })
      continue
    }
    if (!issue.action) {
      results.push({ issueId: issue.id, ok: false, message: '这条是纯建议，无法自动执行' })
      continue
    }
    try {
      const full = resolveVaultPath(`${issue.slug}.md`)
      const raw = await fs.readFile(full, 'utf8')

      if (issue.action.type === 'append-section') {
        const sep = raw.endsWith('\n') ? '\n' : '\n\n'
        const addition = `${sep}## ${issue.action.heading}\n\n${issue.action.body}\n`
        await writeMarkdownAtomic(full, raw + addition)
        await processMarkdownFile(full)
      } else if (issue.action.type === 'add-tags') {
        const parsed = matter(raw)
        const existing: string[] = Array.isArray(parsed.data.tags)
          ? (parsed.data.tags as unknown[]).map(String)
          : typeof parsed.data.tags === 'string'
            ? [parsed.data.tags]
            : []
        const merged = [...existing]
        for (const t of issue.action.tags) if (!merged.includes(t)) merged.push(t)
        const fm = { ...parsed.data, tags: merged }
        await writeMarkdownAtomic(full, matter.stringify(parsed.content, fm))
        await processMarkdownFile(full)
      } else {
        // set-domain：领域不在 frontmatter 里（事实源是 DB 字段），所以只写库
        await prisma.note.updateMany({
          where: { slug: issue.slug },
          data: { domainLevel1: issue.action.domain, domainSource: 'manual' }
        })
        const { invalidateGardenCache } = await import('./cache')
        invalidateGardenCache()
      }

      issue.applied = true
      issue.appliedAt = new Date().toISOString()
      delete issue.error
      results.push({ issueId: issue.id, ok: true, message: '已执行' })
    } catch (e) {
      const msg = (e as Error)?.message || '未知错误'
      issue.error = msg
      results.push({ issueId: issue.id, ok: false, message: msg })
    }
  }

  await writeRun(run)
  return { backupId: backup.id, results }
}
