/**
 * 标签 / 领域自动分配的**编排层**
 *
 * 职责边界（与 maturity 那套一致）：
 *   · 判定逻辑在 server/utils/tag-suggest.ts（纯函数）与 server/utils/llm.ts（可选增强）；
 *   · 本文件负责取数、落「待审区」（Suggestion 表）、审核落库、以及**写回 vault 文件**。
 *
 * 核心不变量（改这个文件前先读这三条）：
 *   ① **写操作只发生在审核动作里**。生成阶段只 INSERT/UPDATE Suggestion，
 *      绝不碰 NoteTag 与 Note.domainLevel1 —— 这就是「需要用户审核通过才行」的落点。
 *   ② 审核通过后**必须写回 .md 的 frontmatter**（vault 是标签的事实源）：
 *      先 matter() 读原 frontmatter，合并 tags 后再 matter.stringify() 落盘，
 *      否则会把用户原有的 aliases / created / maturity 等字段整段抹掉。
 *      领域不写 frontmatter —— 它没有对应的 YAML 字段，事实源是 DB 的 Note.domainLevel1。
 *   ③ 生成是**尽力而为**的：任何一篇失败只记日志，不能中断批处理，也不能让审核清单消失。
 */
import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { prisma } from './db'
import { resolveVaultPath, writeMarkdownAtomic, VAULT_DIR } from './vault'
import { invalidateGardenCache } from './cache'
import { computeMaturityForNote } from './maturity-sync'
import { llmSuggest, llmStatus } from './llm'
import {
  suggestForNote, termsOf, toVaultNotes,
  type VaultContext, type VaultNoteLike, type SuggestResult
} from './tag-suggest'
import { DOMAIN_FALLBACK, isKnownDomain, resolveDomain } from '#shared/graph-domain'

// ── 常量 ────────────────────────────────────────────────────────────────────
/** 送进 LLM 的正文最大字符数（prompt 成本与内存双约束；1.6G 的服务器不能喂整库） */
const LLM_CONTENT_CHARS = 6000
/** 候选标签上限（按库内出现次数排序取前 N；太多会让模型发散且 prompt 变长） */
const LLM_CANDIDATE_TAGS = 60
/** 生成并发（与 import-ingest 的 8 相比更保守：还要串行写库并可能打外部 API） */
const GEN_CONCURRENCY = 4
/** 每次批处理最多处理多少篇（防止一次点「全库」把进程拖死） */
const BATCH_LIMIT = 500

export interface SuggestRow {
  id: string
  noteId: string
  slug: string
  title: string
  currentTags: string[]
  currentDomain: string
  domainFrom: 'manual' | 'path' | 'fallback'
  tags: string[]
  keepCurrentDir: boolean
  domain: string | null
  engine: string
  rationale: string[]
  confidence: number
  status: string
  reviewedBy: string | null
  reviewerLabel: string | null
  reviewedAt: string | null
  appliedValue: { tags?: string[]; domainLevel1?: string | null } | null
  createdAt: string
  updatedAt: string
}

// ── 观测 ────────────────────────────────────────────────────────────────────
export interface GenStats {
  /** 本次实际调用 LLM 的篇数 */
  llmUsed: number
  /** LLM 失败/未配置而回退到规则引擎的篇数 */
  llmFallback: number
  /** 被白名单丢弃的模型越界项累计 */
  llmDropped: number
  /** 生成失败的篇数 */
  failed: number
  /** 生成出的建议里一个标签都没有的篇数（多出现在 vault 标签库还很空时） */
  emptyTags: number
  /** 因为「已有待审建议」而跳过的篇数（非强制刷新时的正常结果） */
  skippedPending: number
}

export function emptyStats(): GenStats {
  return { llmUsed: 0, llmFallback: 0, llmDropped: 0, failed: 0, emptyTags: 0, skippedPending: 0 }
}

// ── 取数：vault 上下文快照 ──────────────────────────────────────────────────

/**
 * 全库快照：候选标签（Tag 表 ∪ frontmatter tags）+ 全库笔记元数据 + 已知领域。
 *
 * **刻意不取 content**：判定只需要「标签分布」（同目录共用标签、领域标签袋），
 * 而被判定的那一篇正文由 generateOne / explainForSlug 单独传入。
 * 早前这里 select 了全库 content，导致每次判定要拉几 MB（525 篇），
 * explain 请求直接超时 —— 这是本文件最容易踩的性能坑，改动前先想清楚。
 */
export async function buildContext(): Promise<VaultContext> {
  const rows = await prisma.note.findMany({
    select: {
      id: true, slug: true, title: true, domainLevel1: true,
      tags: { select: { tag: { select: { name: true } } } }
    }
  })
  const notes: VaultNoteLike[] = toVaultNotes(rows)

  // 候选标签 = Tag 表（有使用计数）∪ 全库 frontmatter tags（防 Tag 表与 metadata 不同步时漏候选）
  const counts = new Map<string, number>()
  const tagRows = await prisma.tag.findMany({ select: { name: true, _count: { select: { notes: true } } } })
  for (const t of tagRows) counts.set(t.name, t._count.notes)
  for (const n of notes) {
    for (const t of n.tags) {
      if (!counts.has(t)) counts.set(t, 1)
    }
  }
  const candidates = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  // 已知领域：全库路径里出现过的 NN_Knowledge 下一层目录名（去重、去掉兜底值）
  const known = new Set<string>()
  for (const n of notes) {
    const d = resolveDomain(n.slug, n.domainLevel1).domain
    if (d && d !== DOMAIN_FALLBACK) known.add(d)
  }
  return { candidates, notes, knownDomains: [...known].sort() }
}

// ── 落待审区 ────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** 是否尝试 LLM 增强（默认按环境变量判定；显式 false 可强制只用规则引擎） */
  useLlm?: boolean
  /**
   * 是否覆盖**已存在的待审建议**（默认 false = 不覆盖）。
   *
   * 为什么默认不覆盖：待审行代表「正在等一个人来审」。后台自动判定（导入后排队、watcher 变更
   * 触发）若把它删掉重建，会打断正在进行的审核 —— 实测到的症状是审核提交报
   * `Invalid prisma.suggestion.update() invocation: An operation failed because it depends on
   * one or more records that were required but not found`（行被后台删了，主键就找不到了）。
   * 而且「刷新建议」本身也可能悄悄换掉审核者正在看的标签，属于不该发生的行为。
   *
   * 只有**管理员显式发起**的判定才传 true（「重新判定标签与领域」、按 slug 手动生成）——
   * 那是明确要求重算，覆盖是预期行为。
   */
  force?: boolean
}

/**
 * 为一批笔记生成建议并写入待审区。
 * 返回逐篇结果（供 API 回执与审计日志）。
 */
export async function generateSuggestions(
  slugs: string[],
  opts: GenerateOptions = {}
): Promise<{ stats: GenStats; results: Array<{ slug: string; ok: boolean; tags: number; domain: string | null; skipped?: boolean; error?: string }> }> {
  const stats = emptyStats()
  const results: Array<{ slug: string; ok: boolean; tags: number; domain: string | null; skipped?: boolean; error?: string }> = []
  const wanted = [...new Set(slugs.map(s => s.trim()).filter(Boolean))].slice(0, BATCH_LIMIT)
  if (!wanted.length) return { stats, results }

  const ctx = await buildContext()
  const bySlug = new Map(ctx.notes.map(n => [n.slug, n]))
  // LLM 状态读一次即可（配置读取带进程内缓存，批量判定不会每篇打库）
  const llmInfo = await llmStatus()
  const llmOn = (opts.useLlm ?? true) && llmInfo.enabled
  const force = opts.force === true
  if (!llmOn && opts.useLlm !== false) stats.llmFallback += wanted.length

  let cursor = 0
  const worker = async () => {
    while (true) {
      const i = cursor++
      const slug = wanted[i]
      if (slug === undefined) return
      try {
        const r = await generateOne(slug, ctx, bySlug, llmOn, llmInfo.model, force, stats)
        results.push(r)
      } catch (e) {
        stats.failed++
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[garden] suggest: 生成失败 ${slug}: ${msg}`)
        results.push({ slug, ok: false, tags: 0, domain: null, error: msg })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(GEN_CONCURRENCY, wanted.length) }, worker))
  return { stats, results }
}

async function generateOne(
  slug: string,
  ctx: VaultContext,
  bySlug: Map<string, VaultNoteLike>,
  llmOn: boolean,
  /** 参与判定的模型名（仅用于写进 rationale，让审核者知道是谁给的结论） */
  llmModel: string,
  /** 是否覆盖已存在的待审建议（见 GenerateOptions.force 的注释） */
  force: boolean,
  stats: GenStats
): Promise<{ slug: string; ok: boolean; tags: number; domain: string | null; skipped?: boolean; error?: string }> {
  const note = bySlug.get(slug)
  if (!note) return { slug, ok: false, tags: 0, domain: null, error: '笔记不在库中（可能尚未入库或已删除）' }

  const full = await prisma.note.findUnique({
    where: { slug },
    select: { id: true, title: true, content: true, domainLevel1: true, tags: { select: { tag: { select: { name: true } } } } }
  })
  if (!full) return { slug, ok: false, tags: 0, domain: null, error: '笔记不在库中' }

  // 已有待审建议且非强制刷新 → 原样保留，什么都不做。
  // 这条是「后台自动判定不打断人工审核」的落点：既避免删掉管理员正在审的行（会让他提交时报
  // Prisma P2025），也避免悄悄换掉他正在看的标签。管理员显式发起的判定才传 force=true。
  if (!force) {
    const pending = await prisma.suggestion.findFirst({
      where: { noteId: full.id, status: 'pending' },
      select: { id: true }
    })
    if (pending) {
      stats.skippedPending++
      return { slug, ok: true, tags: 0, domain: null, skipped: true }
    }
  }

  const currentTags = full.tags.map(t => t.tag.name).filter(Boolean)
  const input = {
    slug,
    title: full.title,
    content: full.content,
    currentTags,
    explicitDomain: full.domainLevel1
  }

  // ① 规则引擎总是跑 —— 它是基线，也是 LLM 不可用时的全部
  const base = suggestForNote(input, ctx)
  let tags = base.tags.map(t => t.name)
  let keepCurrentDir = base.domain.keepCurrentDir
  let domain = base.domain.domain
  let confidence = base.confidence
  const rationale = [...base.rationale]
  let engine = 'rules'

  // ② LLM 增强：只在配置了密钥时尝试，失败就用规则结果（绝不因为模型抽风让清单变空）
  if (llmOn) {
    const llm = await llmSuggest({
      title: full.title,
      content: full.content.slice(0, LLM_CONTENT_CHARS),
      currentTags,
      currentDomain: base.domain.currentDomain,
      candidateTags: ctx.candidates.slice(0, LLM_CANDIDATE_TAGS).map(c => c.name),
      candidateDomains: ctx.knownDomains
    })
    if (llm) {
      stats.llmUsed++
      stats.llmDropped += llm.dropped
      engine = 'rules+llm'
      // 并集：规则命中 + 模型召回（都已在白名单内），保序去重
      const merged = [...llm.tags]
      for (const t of tags) if (!merged.includes(t)) merged.push(t)
      tags = merged.slice(0, 8)
      if (llm.domain) {
        // 人工领域永不覆盖：显式领域已在 suggestForNote 里判过
        if (base.domain.currentFrom !== 'manual') {
          keepCurrentDir = false
          domain = llm.domain
        }
      }
      confidence = Math.round((base.confidence + llm.confidence) / 2)
      rationale.unshift(`LLM（${llmModel}）参与判定`)
      rationale.push(...llm.rationale)
      if (llm.dropped > 0) {
        rationale.push(`模型给出 ${llm.dropped} 项不在候选白名单内，已丢弃（自动化只从既有标签/领域里选，不发明新词）`)
      }
    } else {
      stats.llmFallback++
    }
  }

  if (!tags.length) stats.emptyTags++

  // ③ 落待审区：同 note 的旧 pending 先删（表上有 pending 唯一索引，双保险）
  await prisma.$transaction(async (tx) => {
    await tx.suggestion.deleteMany({ where: { noteId: full.id, status: 'pending' } })
    await tx.suggestion.create({
      data: {
        noteId: full.id,
        tags,
        keepCurrentDir,
        domain: keepCurrentDir ? null : domain,
        engine,
        rationale,
        confidence,
        status: 'pending'
      }
    })
  }, { maxWait: 10000, timeout: 20000 })

  return { slug, ok: true, tags: tags.length, domain: keepCurrentDir ? null : domain }
}

// ── 读取待审区 ──────────────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 列出建议（默认只看 pending；history=true 时连已审的一起给，用于审计） */
export async function listSuggestions(opts: { status?: string; history?: boolean; limit?: number } = {}): Promise<SuggestRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 500)
  const rows = await prisma.suggestion.findMany({
    where: opts.history ? {} : { status: opts.status || 'pending' },
    orderBy: [{ confidence: 'asc' }, { createdAt: 'desc' }], // 低置信度排前面：最需要人工看的先看
    take: limit,
    include: {
      note: { select: { slug: true, title: true, domainLevel1: true, tags: { select: { tag: { select: { name: true } } } } } }
    }
  })

  const reviewerIds = [...new Set(rows.map(r => r.reviewedBy).filter((x): x is string => !!x))]
  const reviewers = reviewerIds.length
    ? await prisma.accessKey.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, label: true } })
    : []
  const reviewerLabel = new Map(reviewers.map(r => [r.id, r.label || '']))

  return rows.map((r) => {
    const resolved = resolveDomain(r.note.slug, r.note.domainLevel1)
    return {
      id: r.id,
      noteId: r.noteId,
      slug: r.note.slug,
      title: r.note.title,
      currentTags: r.note.tags.map(t => t.tag.name).filter(Boolean),
      currentDomain: resolved.domain,
      domainFrom: resolved.from,
      tags: asStringArray(r.tags),
      keepCurrentDir: r.keepCurrentDir,
      domain: r.domain,
      engine: r.engine,
      rationale: asStringArray(r.rationale),
      confidence: r.confidence,
      status: r.status,
      reviewedBy: r.reviewedBy,
      reviewerLabel: r.reviewedBy ? (reviewerLabel.get(r.reviewedBy) || '已注销的密钥') : null,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      appliedValue: (r.appliedValue && typeof r.appliedValue === 'object')
        ? r.appliedValue as { tags?: string[]; domainLevel1?: string | null }
        : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }
  })
}

/** 待审数量（侧栏/入口徽标用；带一次轻查询） */
export async function pendingCount(): Promise<number> {
  return prisma.suggestion.count({ where: { status: 'pending' } })
}

/**
 * 当前 vault 里实际存在的领域名集合。
 *
 * 为什么审核领域要用它做白名单（而不是只认 shared/graph-domain 的 8 个色族名）：
 * 领域是**用户自己建的目录**。用户在知识区新建 `人工智能/` 之后，审核界面会把它列进
 * 下拉（domainOptions 来自目录树），但色族表里没有这个名字 —— 只认色族会把用户
 * 自己刚建的合法领域判成非法，直接报「不在已知领域集合内」。
 * 所以白名单 = 目录里真实存在的领域 ∪ 色族名。
 *
 * **必须扫磁盘而不是只扫笔记 slug**：刚建好的领域目录是空的（还没有笔记落进去），
 * 从 Note.slug 派生根本看不到它 —— 这正是「新建目录后立刻分配领域」的场景，
 * 只查库会把它误判成非法（实测踩到）。
 * 扫盘口径与 shared/graph-domain.ts 的 domainOfSlug 对齐：任意层级中匹配
 * `/^\d{2}_Knowledge$/i` 的目录，其**下一级子目录名**即领域名。
 */
export async function knownDomainsNow(): Promise<string[]> {
  const known = new Set<string>()

  // ① 磁盘：知识区目录下的直接子目录（含刚创建、还没有笔记的空目录）
  const KNOWLEDGE_RE = /^\d{2}_Knowledge$/i
  const MAX_DEPTH = 4
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      let isDir = e.isDirectory()
      if (!isDir && e.isSymbolicLink()) {
        isDir = await fs.stat(path.join(dir, e.name)).then(s => s.isDirectory()).catch(() => false)
      }
      if (!isDir) continue
      const full = path.join(dir, e.name)
      if (KNOWLEDGE_RE.test(e.name)) {
        // 知识区自身的下一级目录 = 领域
        const kids = await fs.readdir(full, { withFileTypes: true }).catch(() => [])
        for (const k of kids) {
          if (k.name.startsWith('.') || !k.isDirectory()) continue
          if (k.name !== DOMAIN_FALLBACK) known.add(k.name)
        }
        continue
      }
      await walk(full, depth + 1)
    }
  }
  await walk(VAULT_DIR, 0)

  // ② 库：已经被分配过显式领域的笔记（兜住「领域目录被删但属性还在」的历史值）
  const rows = await prisma.note.findMany({ select: { slug: true, domainLevel1: true } })
  for (const r of rows) {
    const d = resolveDomain(r.slug, r.domainLevel1).domain
    if (d && d !== DOMAIN_FALLBACK) known.add(d)
  }
  return [...known].sort()
}

// ── 审核：通过 ──────────────────────────────────────────────────────────────

export interface ApproveDecision {
  suggestionId: string
  /** 审核者最终选定的标签（可增可删，不复用建议原值） */
  tags: string[]
  /**
   * 审核者最终选定的领域。
   *   undefined = 采用建议原值；null = 不改领域（保持现状）；字符串 = 指定该领域
   */
  domain?: string | null
}

export interface ApplyOutcome {
  suggestionId: string
  slug: string
  tags: string[]
  domainLevel1: string | null
  keptDomain: boolean
  fileWritten: boolean
}

/**
 * 退回「已认领」状态：把建议还原为 pending。
 * 用于「认领成功之后、真正落库之前」发生失败的情形（文件被删/路径非法/frontmatter 损坏/写盘失败），
 * 让这条建议仍然可以重试，而不是卡在一个既非 pending 也没落值的中间态。
 * 失败静默（best-effort）：这里已经在错误路径上，不该再抛一个错误盖掉原始原因。
 */
async function releaseClaim(suggestionId: string): Promise<void> {
  await prisma.suggestion
    .updateMany({
      where: { id: suggestionId, status: 'approved' },
      data: { status: 'pending', reviewedBy: null, reviewedAt: null }
    })
    .catch(() => {})
}

/**
 * 审核通过：写 vault frontmatter（标签）+ 落库（标签与领域），并把建议标记 approved。
 * 全流程逐篇独立，某一篇失败不影响其它篇（审核界面按篇给结果）。
 */
export async function approveSuggestion(decision: ApproveDecision, reviewerKeyId: string): Promise<ApplyOutcome> {
  const row = await prisma.suggestion.findUnique({
    where: { id: decision.suggestionId },
    include: { note: { select: { id: true, slug: true, domainLevel1: true, title: true, content: true } } }
  })
  if (!row) throw new Error('建议不存在或已被处理')
  if (row.status !== 'pending') throw new Error('该建议已审核过，请刷新列表')

  // ── 归一化审核者的输入（服务端白名单，不信任前端） ──────────────────────
  const tags = [...new Set(decision.tags.map(t => String(t).trim()).filter(Boolean))]
  if (tags.some(t => t.length > 40)) throw new Error('单个标签过长（≤40 字符）')
  if (tags.length > 30) throw new Error('单篇标签过多（≤30 个）')

  const current = resolveDomain(row.note.slug, row.note.domainLevel1)
  // domain 未传 → 用建议原值（keepCurrentDir 时即「不改」）
  const wanted = decision.domain === undefined
    ? (row.keepCurrentDir ? null : row.domain)
    : (decision.domain === null ? null : String(decision.domain).trim() || null)

  let domainLevel1: string | null = row.note.domainLevel1
  let keptDomain = false
  if (wanted === null) {
    // 「保持现状」：显式领域维持原样（可能是人工值，也可能是空的路径派生）
    keptDomain = true
  } else {
    // 白名单 = 目录里真实存在的领域 ∪ 色族名（见 knownDomainsNow 的注释：
    // 用户自建的新领域目录必须被接受，否则审核界面给出的选项会被自己判成非法）
    const known = await knownDomainsNow()
    if (!isKnownDomain(wanted, known)) {
      throw new Error(`领域「${wanted}」不在已知领域集合内（自动化不发明新领域；如需新增请先在知识区建目录）`)
    }
    domainLevel1 = wanted
  }

  // ── ① 先「认领」这条建议，再动任何东西 ────────────────────────────────────
  //
  // 为什么必须抢在写文件之前：待审行可能在这两步之间消失 —— 后台自动判定
  // （导入后排队 / watcher 变更触发）会刷新建议，而**管理员显式发起的判定**更会直接
  // 覆盖掉它。实测症状是 `Invalid prisma.suggestion.update() invocation: An operation
  // failed because it depends on one or more records that were required but not found`
  // （P2025），且更糟的是：若先写文件后更新建议，失败时文件已被改动而库里没记录。
  //
  // 用 status 条件更新（updateMany + where.status='pending'）而不是 update by id：
  //   · count=0 即「这条已经被别人审了 / 被刷新删了」→ 干净地报错，一个字节都没动；
  //   · 顺带挡住「两个管理员同时点通过」导致的重复应用。
  const claimed = await prisma.suggestion.updateMany({
    where: { id: row.id, status: 'pending' },
    data: { status: 'approved', reviewedBy: reviewerKeyId, reviewedAt: new Date() }
  })
  if (claimed.count !== 1) {
    throw new Error('该建议已被重新生成或已被审核（可能后台刚刷新过判定结果），请刷新列表后重试')
  }

  // ── ② 写回 vault frontmatter（vault 是标签的事实源） ─────────────────────
  let fileWritten = false
  let full: string
  try {
    full = resolveVaultPath(row.note.slug + '.md')
  } catch {
    await releaseClaim(row.id)
    throw new Error('笔记路径非法，已中止（未做任何修改）')
  }
  const raw = await fs.readFile(full, 'utf-8').catch(() => null)
  if (raw === null) {
    await releaseClaim(row.id)
    // 文件不在了：硬失败。只改库会造成「库里有标签、文件里没有」的假象，
    // 下次同步该文件被删除时标签又消失，比直接报错更难排查。
    throw new Error('vault 文件不存在（可能已被移动或删除），请先在结构树中确认该笔记')
  }
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    await releaseClaim(row.id)
    throw new Error('frontmatter 解析失败，请先修复文件头部格式')
  }
  const fm: Record<string, unknown> = { ...(parsed.data || {}) }
  if (tags.length) fm.tags = tags
  else delete fm.tags
  const finalContent = Object.keys(fm).length ? matter.stringify(parsed.content, fm) : parsed.content
  try {
    await writeMarkdownAtomic(full, finalContent)
  } catch (e) {
    // 写盘失败：把认领退回去，让这条建议仍可被重试
    await releaseClaim(row.id)
    throw e
  }
  fileWritten = true

  // ── ③ 落库：标签 + 领域 + 落值快照（一个事务，避免「文件改了库没改」的中间态） ──
  try {
    await prisma.$transaction(async (tx) => {
      await tx.noteTag.deleteMany({ where: { noteId: row.note.id } })
      for (const name of tags) {
        const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } })
        await tx.noteTag.create({ data: { noteId: row.note.id, tagId: tag.id } })
      }
      await tx.note.update({
        where: { id: row.note.id },
        data: {
          domainLevel1,
          // 领域写空 = 回到路径派生，来源标记同步回落 auto
          domainSource: domainLevel1 ? 'manual' : 'auto'
        }
      })
      await tx.suggestion.update({
        where: { id: row.id },
        data: { appliedValue: { tags, domainLevel1 } }
      })
    }, { maxWait: 10000, timeout: 30000 })
  } catch (e) {
    // 落库失败：文件已改，尽量把文件恢复原样并退回认领，避免「文件改了库没改」
    await fs.writeFile(full, raw, 'utf-8').catch(() => {})
    await releaseClaim(row.id)
    throw e
  }

  // ── ③ 成熟度：标签是 maturity 判定的一项输入（MOC 判定/关联维度），
  //        标签变了就必须重判，否则会出现「标签已改、成熟度还是旧的」。
  //        人工锁定的笔记（frontmatter maturity 或 maturity-locked）由 judgeMaturity 自动跳过。
  try {
    const explicitRaw = fm.maturity == null ? undefined : String(fm.maturity).trim().toUpperCase()
    const judged = await computeMaturityForNote({
      slug: row.note.slug,
      title: row.note.title,
      tags,
      markdown: finalContent,
      created: typeof fm.created === 'string' ? fm.created : undefined,
      explicit: explicitRaw === 'SEEDLING' || explicitRaw === 'GROWING' || explicitRaw === 'EVERGREEN' ? explicitRaw : undefined,
      locked: fm['maturity-locked'] === true
    })
    if (!judged.manual) {
      await prisma.note.update({ where: { id: row.note.id }, data: { maturity: judged.value } })
    }
  } catch (e) {
    console.warn(`[garden] suggest: 审核后成熟度重判失败（不影响标签/领域落库）${row.note.slug}:`, e)
  }

  invalidateGardenCache()
  return {
    suggestionId: row.id,
    slug: row.note.slug,
    tags,
    domainLevel1,
    keptDomain,
    fileWritten
  }
}

/** 审核驳回：只改建议状态（**不动文件、不动库**），保留审计轨迹 */
export async function rejectSuggestion(suggestionId: string, reviewerKeyId: string, reason?: string): Promise<void> {
  const row = await prisma.suggestion.findUnique({ where: { id: suggestionId }, select: { id: true, status: true, rationale: true } })
  if (!row) throw new Error('建议不存在或已被处理')
  if (row.status !== 'pending') throw new Error('该建议已审核过，请刷新列表')
  const rationale = asStringArray(row.rationale)
  const note = (reason || '').trim()
  // 与 approve 同样的条件更新：挡住「后台刷新把它删了」与「两人同时驳回」
  const done = await prisma.suggestion.updateMany({
    where: { id: suggestionId, status: 'pending' },
    data: {
      status: 'rejected',
      reviewedBy: reviewerKeyId,
      reviewedAt: new Date(),
      rationale: note ? [...rationale, `驳回理由：${note}`] : rationale
    }
  })
  if (done.count !== 1) {
    throw new Error('该建议已被重新生成或已被审核（可能后台刚刷新过判定结果），请刷新列表后重试')
  }
}

// ── 后台生成队列（导入后自动触发 + 手动补跑共用） ────────────────────────────
//
// 为什么是「去重集合 + 防抖 + 后台排空」而不是每篇一个 promise：
//   · 批量导入 500 篇会产生 500 个事件，逐个起任务会把连接池与内存打满
//     （线上服务器只有 1.6G，曾有全量重同步把机器拖到 SSH 无响应的先例）；
//   · 防抖窗口内到达的 slug 合并成一次批处理，一次只跑 GEN_CONCURRENCY 并发。

const pendingSlugs = new Set<string>()
let drainTimer: NodeJS.Timeout | null = null
let draining = false
let debounceMs = 2000

/** 可调防抖窗口（测试用；生产保持 2s） */
export function setSuggestionDebounce(ms: number) {
  debounceMs = Math.max(0, ms)
}

export interface DrainResult {
  processed: number
  stats: GenStats
}

/** 排空队列（导出以便脚本/测试直接驱动，不必等定时器） */
export async function drainSuggestions(): Promise<DrainResult> {
  if (draining) return { processed: 0, stats: emptyStats() }
  if (!pendingSlugs.size) return { processed: 0, stats: emptyStats() }
  draining = true
  const batch = [...pendingSlugs]
  pendingSlugs.clear()
  try {
    const { stats } = await generateSuggestions(batch)
    const processed = batch.length - stats.failed
    console.log(`[garden] suggest: 自动生成完成 · 处理 ${processed}/${batch.length} · LLM ${stats.llmUsed} · 回退 ${stats.llmFallback} · 失败 ${stats.failed}`)
    return { processed, stats }
  } catch (e) {
    console.error('[garden] suggest: 批处理异常', e)
    return { processed: 0, stats: emptyStats() }
  } finally {
    draining = false
    // 排空期间又有新任务进来 → 再排一次
    if (pendingSlugs.size) scheduleDrain()
  }
}

function scheduleDrain() {
  if (drainTimer) clearTimeout(drainTimer)
  drainTimer = setTimeout(() => {
    drainTimer = null
    void drainSuggestions()
  }, debounceMs)
  // 后台任务不该拖住进程退出（PM2 重启时让它自然结束）
  drainTimer.unref?.()
}

/** 入队（幂等：同一 slug 重复入队只算一次）。绝不抛错、绝不阻塞调用方。 */
export function scheduleSuggestions(slugs: string[]) {
  let added = 0
  for (const s of slugs) {
    const v = s.trim()
    if (v && !pendingSlugs.has(v)) { pendingSlugs.add(v); added++ }
  }
  if (!added) return
  // 队列上限保护：超过 BATCH_LIMIT 时不等防抖，立即排空（否则内存里堆着大集合）
  if (pendingSlugs.size >= BATCH_LIMIT && !draining) {
    if (drainTimer) { clearTimeout(drainTimer); drainTimer = null }
    void drainSuggestions()
    return
  }
  scheduleDrain()
}

/** 当前队列长度（测试/观测用） */
export function queuedCount(): number {
  return pendingSlugs.size
}

/**
 * 为「刚刚新入库的笔记」自动生成建议。
 *
 * 触发条件：slug 在库里存在，且 createdAt 与 updatedAt 都落在 `withinMs` 之内
 *   · createdAt 新 → 真正的新文件（add 事件）
 *   · updatedAt 新 → 内容刚变（change 事件）；这时也值得重新判定，因为正文变了
 *   · 两者都旧 → 是重启全量重同步/仅时间戳抖动，跳过（否则每次重启都要全库重判一遍）
 */
export async function autoSuggestRecent(withinMs = 120_000): Promise<number> {
  if (process.env.TAG_SUGGEST_AUTO === '0') return 0
  const since = new Date(Date.now() - withinMs)
  const rows = await prisma.note.findMany({
    where: { AND: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] },
    select: { slug: true },
    take: BATCH_LIMIT
  })
  if (!rows.length) return 0
  scheduleSuggestions(rows.map(r => r.slug))
  return rows.length
}

/** 为指定 slug 生成建议（手动补跑：单篇 / 多选 / 整库） */
export async function suggestForSlugsNow(slugs: string[], opts: GenerateOptions = {}) {
  return generateSuggestions(slugs, opts)
}

/**
 * 「只解释、不落库」的判定诊断（`POST /api/admin/suggestions` 的 `scope:'explain'`）。
 *
 * 为什么需要它：自动化给出「0 条标签建议」时，审核者无法区分三种完全不同的原因 ——
 *   ① vault 标签库为空（需要先给别的笔记打标签）；
 *   ② 有候选但正文/标题一个都没命中（需要人工加标签）；
 *   ③ 现有标签已覆盖（其实没什么可补的）。
 * 三种情况的处置方式完全不同，所以这里把判定过程原样摊开：候选池规模、命中的标签及得分、
 * 各领域相似度、以及纯函数给的 rationale。**不写 Suggestion、不改任何笔记。**
 */
export async function explainForSlug(slug: string) {
  const ctx = await buildContext()
  const note = ctx.notes.find(n => n.slug === slug)
  if (!note) return null
  // 正文单独取（只在需要判定的这一篇上取 content，见 buildContext 的注释）
  const row = await prisma.note.findUnique({ where: { slug }, select: { content: true } })
  const content = row?.content ?? ''
  const input = {
    slug: note.slug,
    title: note.title,
    content,
    currentTags: note.tags,
    explicitDomain: note.domainLevel1 ?? null
  }
  const result = suggestForNote(input, ctx)
  const pathDomain = resolveDomain(note.slug, note.domainLevel1)
  // 自查用：把「引擎实际看到的输入」也一并回出来。
  // 之所以必须暴露它：判定不出来时，「正文没入库 / 分词没命中 / 阈值太高」是三种完全
  // 不同的原因，只看结论无法区分（曾因此把一次真实的内容不匹配误判为引擎失效）。
  const bodySnippet = content.replace(/\s+/g, ' ').slice(0, 200)
  return {
    slug: note.slug,
    title: note.title,
    currentTags: note.tags,
    currentDomain: pathDomain.domain,
    domainFrom: pathDomain.from,
    domainLevel1: note.domainLevel1 ?? null,
    /** 引擎实际看到的正文开头（不含 frontmatter，已折行截断） */
    bodySnippet,
    /** 引擎实际看到的正文字符数 —— 为 0 说明正文没入库 */
    bodyChars: content.length,
    titleTerms: [...new Set(termsOf(note.title))].slice(0, 20),
    /** 正文里前若干关键词（便于核对「该命中的词到底有没有被切出来」） */
    bodyTermsSample: [...new Set(termsOf(content))].slice(0, 40),
    /** 候选池规模：0 表示 vault 里根本没有可推荐的既有标签 */
    candidatePool: ctx.candidates.length,
    /** 候选池里出现频次最高的若干标签（给审核者一个「库里有什么」的直观印象） */
    topCandidates: ctx.candidates.slice(0, 15).map(c => ({ name: c.name, count: c.count })),
    knownDomains: ctx.knownDomains,
    vaultNotes: ctx.notes.length,
    suggestedTags: result.tags,
    suggestedDomain: result.domain,
    confidence: result.confidence,
    rationale: result.rationale
  }
}

/** 整库补跑（只处理「当前没有 pending 建议」的笔记，避免覆盖管理员正在看的清单） */
export async function suggestAllMissing(limit = BATCH_LIMIT): Promise<{ considered: number; generated: number }> {
  const rows = await prisma.note.findMany({
    where: { suggestions: { none: { status: 'pending' } } },
    select: { slug: true },
    take: limit,
    orderBy: { updatedAt: 'desc' }
  })
  if (!rows.length) return { considered: 0, generated: 0 }
  const { stats } = await generateSuggestions(rows.map(r => r.slug))
  return { considered: rows.length, generated: rows.length - stats.failed }
}
