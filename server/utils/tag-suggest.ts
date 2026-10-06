/**
 * 标签 / 领域自动分配的**规则引擎**（纯函数，零 IO，可单测/可对账）
 *
 * 设计立场与 server/utils/maturity.ts 一致：判定逻辑本身不碰数据库、不发请求，
 * 只吃一个「vault 上下文快照」，吐一个确定性的结论。这样同一份输入永远得到同一个建议，
 * 出问题能拿真实库跑对账脚本定位，而不是靠复现「当时的网络/模型状态」。
 *
 * 为什么规则先行：
 *   · 零成本、零外部依赖，`.env` 什么都不配也能用；
 *   · 结果可解释 —— 每条建议都带 reason，审核者能判断「为什么给我推这个标签」；
 *   · LLM 只作为**增强**（server/utils/llm.ts），可用时用它重排/补漏，不可用时本引擎兜底。
 *
 * 两条核心启发式（都在真实 Obsidian 库里成立）：
 *   ① 目录是弱标签、标签是强目录：同一目录下笔记共用得越多的标签，越可能是本篇该有的、
 *      但**尚未标上**的标签（本例只推「本篇没有的」，已标上的不重复推）。
 *   ② 领域 = 该笔记与其最相似笔记群所在的那个领域。用「标签重合度（余弦式）」度量相似度，
 *      与路径派生结果比对：一致就不提建议（keepCurrentDir=true），不一致才提示可换。
 *
 * 明确不做的事：**不发明新标签**。推荐只在 vault 既有标签（Tag 表 ∪ 全部 frontmatter tags）
 * 里选。理由是标签体系一旦被自动生成的新词污染，侧栏标签云与图谱的标签共有边都会退化；
 * 需要新标签时由审核者在界面上手输（那条路走 PATCH 元数据接口，不经过本引擎）。
 */
import { DOMAIN_FALLBACK, domainOfSlug } from '#shared/graph-domain'

// ── 阈值（集中在这里，便于按真实库调参并对账） ──────────────────────────────
//
// 评分口径（matchStrength + suggestForNote）必须让「正文里出现该标签的完整词」
// **单独就足以达阈** —— 这是最直白也最可靠的信号。早前把正文命中只给 1 分、
// 而 tagMinScore=2，导致 `前端/TypeScript` 这种正文原文出现 `TypeScript` 的候选
// 得分 1.44 被丢弃（实测踩到）。现在命中强度本身就 ≥ 阈值。
export const SUGGEST_TH = {
  /** 应推标签的最低得分（= 一次末段词命中即可达阈） */
  tagMinScore: 2,
  /** 单篇最多推几个标签 */
  tagMax: 5,
  /** 候选标签名字符串**原样**出现在标题 → 最强信号（作者直接在标题里点了名） */
  titleWhole: 5,
  /** 候选标签的**末段词**出现在标题 */
  titleLast: 4,
  /** 候选标签名的某一段**原样**出现在正文（如 `前端/Vue` 的 `vue`） */
  bodyWhole: 2,
  /** 候选标签的**末段词**作为完整词出现在正文或标题 */
  bodyLast: 3,
  /** 同目录兄弟笔记每多一篇命中 +1 分（log2 收敛，避免「全库通用标签」靠数量霸榜） */
  siblingWeight: 1,
  /** 一篇笔记最多看多少个兄弟目录样本，避免超大目录把分数堆爆 */
  siblingSample: 120,
  /** 领域相似度：低于此值不提「换领域」建议（宁可不提，也不要噪音） */
  domainMinScore: 0.15,
  /** 领域相似度：候选必须比当前领域高出这么多才提建议 */
  domainMargin: 0.05,
  /** 归一化到 0-100 置信度时的上限参考分 */
  confidenceRef: 8
} as const

export interface CandidateTag {
  /** vault 既有标签名（含 `ns/name` 形式） */
  name: string
  count: number
}

export interface VaultNoteLike {
  id: string
  slug: string
  title: string
  tags: string[]
  /** 显式领域（Note.domainLevel1），无则 null */
  domainLevel1?: string | null
  /**
   * 注意：这里**没有 content**。
   * 快照里的其它笔记只用来算「同目录共用标签」与「领域标签分布」，都只需要 tags，
   * 取全库正文会让每次判定拉几 MB 数据（曾因此让 explain 请求直接超时）。
   * 被判定的那一篇正文由调用方通过 SuggestInput.content 单独传入。
   */
}

export interface VaultContext {
  /** 全部候选标签（来自 Tag 表 + frontmatter tags 并集），带库内出现次数 */
  candidates: CandidateTag[]
  /** 全库笔记（用于同目录兄弟与领域相似度） */
  notes: VaultNoteLike[]
  /** 已知领域目录名（NN_Knowledge 下一层，来自 vault 树 / 全库 slug），用于领域白名单 */
  knownDomains: string[]
}

export interface SuggestInput {
  slug: string
  title: string
  /** 正文（Markdown，可含 frontmatter —— 内部会剥离） */
  content: string
  /** 本篇 frontmatter 里已声明的标签 */
  currentTags: string[]
  /** 本篇显式领域（Note.domainLevel1） */
  explicitDomain?: string | null
}

export interface TagSuggestion {
  name: string
  score: number
  reason: string
}

export interface DomainSuggestion {
  /** true = 建议保持当前目录（与路径派生一致，或没有更优候选） */
  keepCurrentDir: boolean
  /** 建议的领域名；keepCurrentDir=true 时为 null */
  domain: string | null
  /** 当前生效领域（显式优先，其次路径派生，最后兜底） */
  currentDomain: string
  /** 当前领域来自显式指定还是路径派生 */
  currentFrom: 'manual' | 'path' | 'fallback'
  /** 各候选领域的相似度得分（已排序，仅用于展示/排查） */
  scores: { domain: string; score: number }[]
  reason: string
}

export interface SuggestResult {
  tags: TagSuggestion[]
  domain: DomainSuggestion
  /** 0-100：标签与领域两侧取加权平均，供界面排序与「低置信度需细看」提示 */
  confidence: number
  /** 判定依据（人话，直接展示在审核卡片上） */
  rationale: string[]
}

// ── 文本 → 词集合 ──────────────────────────────────────────────────────────

/** 剥离 YAML frontmatter（只用于分词，不改写原文） */
function bodyOf(markdown: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown)
  return m ? markdown.slice(m[0].length) : markdown
}

/** 取出一段文本里的「词」：ASCII 单词（含 . / - 连接的版本号与技术名）+ CJK 连续片段与二元组 */
export function termsOf(text: string): string[] {
  if (!text) return []
  const out: string[] = []
  const ascii = text.match(/[A-Za-z][A-Za-z0-9]*(?:[._+-][A-Za-z0-9]+)*/g) || []
  for (const w of ascii) out.push(w.toLowerCase())
  // CJK：连续汉字片段，既取整段也取相邻二元组（中文没有空格，二元组是性价比最高的近似词）
  for (const run of text.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    out.push(run)
    for (let i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2))
  }
  return out
}

/** 标签名的可匹配形态：`前端/Vue3` → ['前端/vue3','vue3','前端']（小写，去空白） */
function tagTerms(tag: string): string[] {
  const t = tag.trim().toLowerCase()
  if (!t) return []
  const segs = t.split('/').filter(Boolean)
  const last = segs[segs.length - 1] ?? t
  return [...new Set([t, last, segs[0] ?? t].filter(Boolean))]
}

/**
 * 候选标签与「本篇文本」的相关度。返回 null = 不相关。
 *
 * 两条硬规则（都是踩过坑才定下来的）：
 *
 * ① **末段必须是完整词**，或整串/末段作为子串原样出现在原文里 —— 否则 `status/evergreen`
 *    会被 `split('/')` 拆出的短段误命中（`evergreen` 撞上正文里的英文单词）。
 *
 * ② **带命名空间且末段是中文时，命名空间也必须命中**。
 *    这是最关键的一条：命名空间承载了真正的语义，丢掉它就退化成「通用词匹配」——
 *    `Java/安全` 会因为正文里出现「安全」二字而命中，`Java/基础` 会因为「基础」而命中。
 *    生产实测：200 条建议被用户**全部驳回**，其中 `Java/基础` 出现 63 次、
 *    `type/MOC` 52 次，连「四种测试方式」被推 `Java/基础`、「React Router 指南」被推 `Java/安全`。
 *    而末段是 ASCII 技术词时（`前端/TypeScript` 的 `typescript`、`前端/CSS` 的 `css`）
 *    本身就足够有区分度，允许单独命中 —— 否则一篇讲 TypeScript 但不在前端目录下的笔记
 *    就永远拿不到 `前端/TypeScript`（这属于过度收紧，会误杀正确结果）。
 */
function matchStrength(
  tag: string,
  titleTerms: Set<string>,
  bodyTerms: Set<string>,
  rawLower: string,
  slugLower: string
): number | null {
  const segs = tag.trim().toLowerCase().split('/').filter(Boolean)
  const leaf = segs.length ? segs[segs.length - 1]! : ''
  const whole = tag.trim().toLowerCase()
  if (!whole) return null

  // ② 中文末段必须带命名空间证据（命名空间可来自标题/正文/路径 —— 笔记放在 `前端/` 目录下
  //    本身就是「这是前端笔记」的证据）
  if (segs.length >= 2 && !/^[\x20-\x7e]+$/.test(leaf)) {
    const ns = segs[0]!
    const nsHit = ns.length >= 2
      && (titleTerms.has(ns) || bodyTerms.has(ns) || slugLower.includes(ns))
    if (!nsHit) return null
  }

  // ① 末段作为完整词出现（最可靠的词汇级命中）
  const lastInTitle = leaf.length >= 2 && (titleTerms.has(leaf) || [...titleTerms].some(t => t.includes(leaf)))
  const lastInBody = leaf.length >= 2 && bodyTerms.has(leaf)
  const wholeHit = whole.length >= 2 && rawLower.includes(whole)

  if (!(lastInTitle || lastInBody || wholeHit)) return null

  let s = 0
  if (wholeHit) s += SUGGEST_TH.bodyWhole
  if (lastInTitle) s += SUGGEST_TH.titleLast
  else if (lastInBody) s += SUGGEST_TH.bodyLast
  if (whole.length >= 2 && [...titleTerms].some(t => t.includes(whole))) s += SUGGEST_TH.titleWhole
  return s > 0 ? s : null
}

// ── 主判定 ────────────────────────────────────────────────────────────────

/**
 * 判定一篇笔记该补哪些标签、领域是否该调整。
 * 纯函数：同样的 input + context 必然得到同样的 result。
 */
export function suggestForNote(input: SuggestInput, ctx: VaultContext): SuggestResult {
  const body = bodyOf(input.content || '')
  // 用于匹配的正文：剥掉 wiki 链接与 markdown 链接（含图片）的**目标**。
  // 理由：链接是「引用」而不是「内容」—— 正文里出现 `[[MOC - Vue3]]` 不代表这篇就是 MOC。
  // 早前不剥离，`type/MOC` 被推给 52 篇只是引用了 MOC 的笔记（用户实测全被驳回）。
  const matchText = body
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
  const titleTerms = new Set(termsOf(input.title || ''))
  const bodyTerms = new Set(termsOf(matchText))
  const rawLower = `${input.title || ''}\n${matchText}`.toLowerCase()
  // 路径也参与「命名空间」判定：笔记放在 `前端/` 目录下本身就是「这是前端笔记」的证据
  const slugLower = (input.slug || '').toLowerCase()

  const current = new Set(input.currentTags.map(t => t.trim()).filter(Boolean))
  const currentLower = new Set([...current].map(t => t.toLowerCase()))

  // ── ① 同目录兄弟笔记：目录是「弱标签」，兄弟共用的标签是强信号 ──────────────
  const dirPrefix = input.slug.includes('/') ? input.slug.slice(0, input.slug.lastIndexOf('/') + 1) : ''
  const siblings = ctx.notes.filter(n => n.id !== '' && n.slug !== input.slug && (dirPrefix ? n.slug.startsWith(dirPrefix) : true))
  const siblingTags = siblings.length ? siblings : []
  // 兄弟样本上限：超大目录（如收件箱）不能把分数堆爆
  const sampled = siblingTags.length > SUGGEST_TH.siblingSample
    ? siblingTags.slice(0, SUGGEST_TH.siblingSample)
    : siblingTags

  const siblingHit = new Map<string, number>()
  const siblingSampleOf = new Map<string, string>()
  for (const s of sampled) {
    for (const t of s.tags) {
      const key = t.trim()
      if (!key) continue
      siblingHit.set(key, (siblingHit.get(key) ?? 0) + 1)
      if (!siblingSampleOf.has(key)) siblingSampleOf.set(key, s.title)
    }
  }

  // ── ② 逐候选打分 ────────────────────────────────────────────────────────
  //
  // 按**末段（leaf）**而不是整串去重：`Java` 与 `后端/Java` 是同一概念的两个命名空间层级，
  // 同时落到一篇笔记上就显示成「两个 Java 标签」。用户实测（m01824）：「第八阶段 - 文档 1：
  // Flyway 数据库迁移完全指南」同时有 `Java`(Tag id 26) 与 `后端/Java`(id 42) —— 查库确认
  // **没有任何字面重复**（没有只差大小写/空白的标签名、同笔记同名标签对数 = 0），纯粹是层级冗余。
  const leafOf = (t: string) => (t.split('/').filter(Boolean).pop() || t).trim().toLowerCase()
  /** 现有标签已覆盖的末段 */
  const currentLeaves = new Set([...current].map(leafOf))

  const scored: TagSuggestion[] = []
  for (const c of ctx.candidates) {
    const name = c.name.trim()
    if (!name) continue
    // 已有标签不重复推（含大小写不同的等价写法）
    if (currentLower.has(name.toLowerCase())) continue
    // 末段已被现有标签覆盖 → 不再推它的另一种层级写法（已有 `后端/Java` 就不推 `Java`）
    if (currentLeaves.has(leafOf(name))) continue

    const strength = matchStrength(name, titleTerms, bodyTerms, rawLower, slugLower)

    // ⚠️ **必须有正文/标题证据才可能是候选**；同目录共用只能**加分**，绝不能单独入选。
    //
    // 早前的判据是「strength !== null || sib > 0」，而阈值 2 分配偶权重 1 时
    // `sib >= 3` 就能独立达标 —— 结果把每个目录里最常见的标签无差别喷到完全无关的笔记上：
    // 生产实测 200 条建议被用户**全部驳回**，其中 `Java/基础` 出现 63 次、`type/MOC` 52 次，
    // 连「四种测试方式」被推 `Java/基础`、「React Router 完全指南」被推 `Java/安全`。
    // 那种「目录里大家都有的标签」是目录级猜测，不是这篇笔记的内容，属于噪音而非建议。
    if (strength === null) continue

    const sib = siblingHit.get(name) ?? 0
    let score = strength
    const why: string[] = [strength >= SUGGEST_TH.titleLast ? '标题命中' : '正文命中']
    if (sib > 0) {
      // 兄弟命中按出现次数增长但收敛（log 增长避免「全库通用标签」靠数量霸榜）
      score += SUGGEST_TH.siblingWeight * Math.log2(1 + sib)
      why.push(`同目录 ${sib} 篇已用`)
    }
    if (c.count > 0) {
      // 库内越通用的标签越值得信任，但只给很小的加成，不能盖过内容命中
      score += Math.min(1, Math.log2(1 + c.count) / 10)
    }
    if (score < SUGGEST_TH.tagMinScore) continue
    scored.push({ name, score: Math.round(score * 100) / 100, reason: why.join(' · ') })
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  // 候选之间同一末段只保留得分最高者：`Java` 与 `后端/Java` 不该同时入选。
  // 排序已按分数降序，因此保留的是证据最强的那一个（更具体或更常用者）。
  const seenLeaves = new Set<string>()
  const deduped = scored.filter((s) => {
    const lf = leafOf(s.name)
    if (seenLeaves.has(lf)) return false
    seenLeaves.add(lf)
    return true
  })
  const tags = deduped.slice(0, SUGGEST_TH.tagMax)

  // ── ③ 领域：与「标签向量最相似的笔记群」所在领域比对 ──────────────────────
  const domain = suggestDomain(input, ctx, current, bodyTerms, titleTerms, rawLower, slugLower)

  // ── ④ 置信度：标签侧取最高分（相对参考分封顶），领域侧按相似度差值 ──────────
  const tagConf = tags.length ? Math.min(1, (tags[0]?.score ?? 0) / SUGGEST_TH.confidenceRef) : 0
  const domConf = domain.keepCurrentDir
    ? 0.5 // 保持现状是「安全的默认」，给中等置信度；不给 0 以免拉低整体可信度
    : Math.min(1, (domain.scores[0]?.score ?? 0) * 2)
  const confidence = Math.round((tags.length ? (tagConf * 0.7 + domConf * 0.3) : domConf) * 100)

  const rationale: string[] = []
  if (tags.length) {
    rationale.push(`标签来自 ${sampled.length} 篇同目录笔记的共用标签 + 正文/标题命中（候选池 ${ctx.candidates.length} 个既有标签），已排除本篇已有的 ${current.size} 个标签`)
  } else {
    rationale.push(current.size
      ? `已扫描 ${ctx.candidates.length} 个既有标签，未发现需要补充的（本篇现有 ${current.size} 个标签已覆盖同目录共用标签）；同目录样本 ${sampled.length} 篇`
      : `已扫描 ${ctx.candidates.length} 个既有标签，没有与标题/正文匹配上的候选；同目录样本 ${sampled.length} 篇`)
    if (ctx.candidates.length === 0) {
      rationale.push('提示：vault 标签库为空，先给几篇笔记打上标签，自动推荐才会有效果')
    }
  }
  rationale.push(domain.reason)

  return { tags, domain, confidence, rationale }
}

function suggestDomain(
  input: SuggestInput,
  ctx: VaultContext,
  current: Set<string>,
  bodyTerms: Set<string>,
  titleTerms: Set<string>,
  /** 与候选打分同一份「已剥链接」的匹配文本（口径必须一致，否则领域向量与标签建议会打架） */
  rawLower: string,
  slugLower: string
): DomainSuggestion {
  const path = domainOfSlug(input.slug)
  const explicit = typeof input.explicitDomain === 'string' ? input.explicitDomain.trim() : ''
  const currentDomain = explicit || path.domain || DOMAIN_FALLBACK
  const currentFrom: 'manual' | 'path' | 'fallback' = explicit ? 'manual' : path.domain ? 'path' : 'fallback'

  const curLower = new Set([...current].map(t => t.toLowerCase()))
  // 本篇「查询向量」= 现有标签 ∪ 正文/标题命中的候选标签名（后者让未打标签的新笔记也能被归域）
  const query = new Set<string>(curLower)
  for (const c of ctx.candidates) {
    const n = c.name.trim().toLowerCase()
    if (!n || query.has(n)) continue
    if (matchStrength(c.name, titleTerms, bodyTerms, rawLower, slugLower) !== null) {
      query.add(n)
    }
  }

  // 领域 → 标签权重表（标签在多少篇该领域笔记里出现过）
  const domainTags = new Map<string, Map<string, number>>()
  for (const n of ctx.notes) {
    const d = (typeof n.domainLevel1 === 'string' && n.domainLevel1.trim())
      ? n.domainLevel1.trim()
      : (domainOfSlug(n.slug).domain || DOMAIN_FALLBACK)
    let bag = domainTags.get(d)
    if (!bag) { bag = new Map(); domainTags.set(d, bag) }
    for (const t of n.tags) {
      const k = t.trim().toLowerCase()
      if (k) bag.set(k, (bag.get(k) ?? 0) + 1)
    }
  }

  const scores: { domain: string; score: number }[] = []
  for (const [d, bag] of domainTags) {
    if (d === DOMAIN_FALLBACK) continue // 「其他」不是可指派的目标领域
    // 余弦式相似度：query 与领域标签袋的夹角，天然对领域大小不敏感
    let dot = 0
    for (const q of query) dot += bag.get(q) ?? 0
    const qNorm = Math.sqrt(query.size || 1)
    let bNorm = 0
    for (const v of bag.values()) bNorm += v * v
    bNorm = Math.sqrt(bNorm || 1)
    const score = qNorm && bNorm ? dot / (qNorm * bNorm) : 0
    if (score > 0) scores.push({ domain: d, score: Math.round(score * 1000) / 1000 })
  }
  scores.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))

  const best = scores.find(s => s.domain !== currentDomain)
  const bestScore = best?.score ?? 0
  const curScore = scores.find(s => s.domain === currentDomain)?.score ?? 0

  // 显式领域（人工/审核已定）永不覆盖 —— 与 maturity 的「人工值优先」同一治理原则
  if (currentFrom === 'manual') {
    return {
      keepCurrentDir: true,
      domain: null,
      currentDomain,
      currentFrom,
      scores,
      reason: `领域「${currentDomain}」为人工指定，自动判定不覆盖（如需更换请手动改）`
    }
  }
  if (!best || bestScore < SUGGEST_TH.domainMinScore || bestScore - curScore < SUGGEST_TH.domainMargin) {
    return {
      keepCurrentDir: true,
      domain: null,
      currentDomain,
      currentFrom,
      scores,
      reason: currentFrom === 'path'
        ? `目录派生的领域「${currentDomain}」与标签特征一致，无需调整`
        : `无法从标签特征判定领域（未达阈值），建议保持现状`
    }
  }
  return {
    keepCurrentDir: false,
    domain: best.domain,
    currentDomain,
    currentFrom,
    scores,
    reason: `标签特征更接近领域「${best.domain}」（相似度 ${bestScore}，当前「${currentDomain}」为 ${Math.round(curScore * 1000) / 1000}）`
  }
}

/** 从全库 note 行归一化出 VaultContext 需要的 notes 数组（供服务端编排层调用） */
export function toVaultNotes(rows: Array<{
  id: string
  slug: string
  title: string
  domainLevel1?: string | null
  tags: Array<{ tag: { name: string } | null }>
}>): VaultNoteLike[] {
  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    domainLevel1: r.domainLevel1 ?? null,
    tags: r.tags.map(t => t.tag?.name).filter((n): n is string => !!n)
  }))
}
