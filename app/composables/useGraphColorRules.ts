// 图谱颜色规则的**服务端同步存储 + 服务端侧维度求值**（需求 m00991 第 4/5/6 条）。
//
// 数据流：
//   权威 = 服务端 `GraphColorRules`（一行 jsonb，按访问密钥隔离，见 prisma/schema.prisma）
//   本地 = localStorage 缓存，只为在请求回来前先按上次的规则画出来，不闪白
//
// 为什么用「一行有序数组」而不是多行表：规则是**有序**的，数组下标就是优先级，
// 整体替换天然原子、不用算差集，也不用维护排序列。写入因此和 useGraphColors 一样
// 是防抖 + 全量 PUT。
//
// 「文章内容 / 笔记属性」两个维度本地没有原始数据，必须问服务端要命中集合
// （GET /api/notes/graph/match），结果缓存在 `matchSets` 里按规则 id 索引；
// 其余维度由 `app/lib/graph-rules.ts` 的纯函数在本地求值。

import type { ColorRule } from '#shared/graph-colors'
import { normalizeRules } from '#shared/graph-colors'
import { domainColor } from '#shared/graph-domain'
import {
  MATURITY_COLORS,
  MATURITY_LABEL,
  MATURITY_ORDER,
  RULE_MATCH_DEBOUNCE_MS,
  RULE_MATCH_LIMIT
} from '~/lib/graph-constants'
import { newRuleId, serverRuleList, type RuleMatchSets } from '~/lib/graph-rules'
import { readRuleCache, writeRuleCache } from '~/lib/graphState'

/** 提交防抖：连续增删改 / 调优先级时合并成一次请求 */
const PUSH_DEBOUNCE_MS = 600

/** 兜底色（既不是领域也不是成熟度时的最后退路），与 GraphView 的兜底保持一致 */
const FALLBACK_RULE_COLOR = '#8C6D46'

interface RulesResponse {
  rules: ColorRule[]
  count: number
  updatedAt: string | null
}

/**
 * 预置规则：把原来写死的「按领域」「按成熟度」配色搬进规则表（需求第 6 条）。
 *
 * 顺序很关键——领域规则排在成熟度规则前面，这样「有领域按领域、没领域按成熟度」
 * 的既有观感保持不变（数组下标即优先级）。
 */
export function defaultRules(domains: string[]): ColorRule[] {
  const out: ColorRule[] = []
  for (const d of domains) {
    if (!d) continue
    out.push({
      id: newRuleId(),
      enabled: true,
      field: 'domain',
      op: 'equals',
      value: d,
      color: domainColor(d),
      label: `领域 · ${d}`
    })
  }
  for (const m of MATURITY_ORDER) {
    out.push({
      id: newRuleId(),
      enabled: true,
      field: 'maturity',
      op: 'equals',
      value: m,
      color: MATURITY_COLORS[m] ?? FALLBACK_RULE_COLOR,
      label: `成熟度 · ${MATURITY_LABEL[m] ?? m}`
    })
  }
  return out
}

export const useGraphColorRules = () => {
  /** 规则表（数组顺序 = 优先级），权威来自服务端，本地缓存仅作首帧 */
  const rules = ref<ColorRule[]>(readRuleCache())
  const loaded = ref(false)
  const syncing = ref(false)
  /** 有本地改动还没提交成功 */
  const pending = ref(false)
  const error = ref<string | null>(null)
  const lastSyncedAt = ref<string | null>(null)

  /** 规则 id → 命中的笔记 id 集合（仅「文章内容 / 笔记属性」维度需要） */
  const matchSets = ref<RuleMatchSets>({})
  const matchPending = ref(false)
  const matchError = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null
  let matchTimer: ReturnType<typeof setTimeout> | null = null
  let matchSeq = 0
  let lastMatchSignature = ''

  const count = computed(() => rules.value.length)
  const enabledCount = computed(() => rules.value.filter(r => r.enabled).length)
  /** 需要服务端求值的启用规则条数（面板上提示「正在检索」用） */
  const serverRuleCount = computed(() => serverRuleList(rules.value).length)

  const persistLocal = () => writeRuleCache(rules.value)

  const signatureOf = (list: ColorRule[]) =>
    list.map(r => `${r.id}\u0001${r.field}\u0001${r.op}\u0001${r.key ?? ''}\u0001${r.value}`).join('\u0002')

  // ---------- 服务端侧维度（正文 / 笔记属性） ----------

  /**
   * 把所有需要服务端的规则解析成命中集合。
   * 逐条并发请求；用序号丢弃过期响应（用户改关键词时前一次可能更晚回来）。
   */
  async function resolveMatches(): Promise<void> {
    const wanted = serverRuleList(rules.value)
    if (!wanted.length) {
      lastMatchSignature = ''
      matchSets.value = {}
      matchError.value = null
      matchPending.value = false
      return
    }
    const sig = signatureOf(wanted)
    if (sig === lastMatchSignature && wanted.every(r => matchSets.value[r.id])) return

    matchPending.value = true
    const seq = ++matchSeq
    try {
      const results = await Promise.all(wanted.map(async (rule) => {
        const params: Record<string, string | number> = {
          q: rule.value,
          fields: rule.field,
          limit: RULE_MATCH_LIMIT
        }
        if (rule.field === 'property') params.key = rule.key ?? ''
        const res = await $fetch<{ ids: string[] }>('/api/notes/graph/match', { params })
        return [rule.id, new Set(res.ids || [])] as const
      }))
      if (seq !== matchSeq) return
      const next: RuleMatchSets = {}
      for (const [id, set] of results) next[id] = set
      matchSets.value = next
      lastMatchSignature = sig
      matchError.value = null
    } catch (e: unknown) {
      if (seq !== matchSeq) return
      matchError.value = (e as { message?: string })?.message || '规则匹配失败'
    } finally {
      if (seq === matchSeq) matchPending.value = false
    }
  }

  function scheduleMatchResolve() {
    if (matchTimer) clearTimeout(matchTimer)
    matchTimer = setTimeout(() => {
      matchTimer = null
      void resolveMatches()
    }, RULE_MATCH_DEBOUNCE_MS)
  }

  // ---------- 服务端同步 ----------

  async function push(): Promise<void> {
    if (inflight) return inflight
    syncing.value = true
    const payload = rules.value.map(r => ({ ...r }))
    const run = (async () => {
      try {
        await $fetch('/api/graph/color-rules', { method: 'PUT', body: { rules: payload } })
        if (signatureOf(payload) === signatureOf(rules.value)) pending.value = false
        error.value = null
        lastSyncedAt.value = new Date().toISOString()
      } catch (e: unknown) {
        error.value = (e as { message?: string })?.message || '同步失败'
      } finally {
        syncing.value = false
        inflight = null
      }
    })()
    inflight = run
    await run
    // 提交期间用户又改过 → 补一次（同 useGraphColors 的丢更新修复）
    if (pending.value && !timer) {
      timer = setTimeout(() => { timer = null; void push() }, PUSH_DEBOUNCE_MS)
    }
  }

  function schedulePush() {
    pending.value = true
    persistLocal()
    scheduleMatchResolve()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void push() }, PUSH_DEBOUNCE_MS)
  }

  /** 立刻把待提交的改动发出去（离开页面 / 切到后台时调用） */
  async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null }
    for (let i = 0; i < 5 && pending.value; i++) await push()
  }

  /**
   * 首次装载。
   *
   * 播种条件刻意用「服务端**没有这一行**」（updatedAt === null）而不是「规则为空」：
   * 用户把规则全删光时我们提交的是 `[]`，那一行是存在的，
   * 用「为空」判断会导致下次打开又凭空长回一堆默认规则。
   */
  async function init(domains: string[]): Promise<void> {
    let server: ColorRule[] = []
    let neverSaved = false
    try {
      const res = await $fetch<RulesResponse>('/api/graph/color-rules')
      server = normalizeRules(res.rules)
      neverSaved = !res.updatedAt
      lastSyncedAt.value = res.updatedAt
      error.value = null
    } catch (e: unknown) {
      // 拉不到就先用本地缓存把图画出来，别让图谱因为同步失败而变灰
      error.value = (e as { message?: string })?.message || '读取颜色规则失败'
      loaded.value = true
      scheduleMatchResolve()
      return
    }

    if (neverSaved) {
      rules.value = defaultRules(domains)
      persistLocal()
      loaded.value = true
      pending.value = true
      await push()
    } else {
      rules.value = server
      persistLocal()
      loaded.value = true
    }
    await resolveMatches()
  }

  // ---------- 规则增删改 ----------

  /**
   * 新增一条规则。
   *
   * 默认插在**第一条领域 / 成熟度规则之前**，也就是「用户规则区」的末尾：
   * 那两类是播种出来的兜底配色，几乎命中所有节点，若把新规则排在它们后面，
   * 用户加完规则会发现「怎么没生效」。放在它们上面既能立刻生效，
   * 用户规则之间又保持添加顺序。传 `at` 可以精确指定位置。
   */
  function add(rule: Omit<ColorRule, 'id'>, at?: number): ColorRule | null {
    const [created] = normalizeRules([{ ...rule, id: newRuleId() }])
    if (!created) return null
    const next = [...rules.value]
    let index = at
    if (index == null) {
      const firstFallback = next.findIndex(r => r.field === 'domain' || r.field === 'maturity')
      index = firstFallback < 0 ? next.length : firstFallback
    }
    index = Math.max(0, Math.min(next.length, index))
    next.splice(index, 0, created)
    rules.value = next
    schedulePush()
    return created
  }

  function update(id: string, patch: Partial<Omit<ColorRule, 'id'>>): boolean {
    const index = rules.value.findIndex(r => r.id === id)
    if (index < 0) return false
    const [merged] = normalizeRules([{ ...rules.value[index], ...patch, id }])
    if (!merged) return false
    const next = [...rules.value]
    next[index] = merged
    rules.value = next
    schedulePush()
    return true
  }

  function remove(id: string): boolean {
    const next = rules.value.filter(r => r.id !== id)
    if (next.length === rules.value.length) return false
    rules.value = next
    schedulePush()
    return true
  }

  /** 调整优先级：数组下标即优先级，`delta` 为 -1 上移（更优先）/ +1 下移 */
  function move(id: string, delta: number): boolean {
    const from = rules.value.findIndex(r => r.id === id)
    if (from < 0) return false
    const to = Math.max(0, Math.min(rules.value.length - 1, from + delta))
    if (to === from) return false
    const next = [...rules.value]
    const [item] = next.splice(from, 1)
    if (!item) return false
    next.splice(to, 0, item)
    rules.value = next
    schedulePush()
    return true
  }

  function toggle(id: string): boolean {
    const rule = rules.value.find(r => r.id === id)
    if (!rule) return false
    return update(id, { enabled: !rule.enabled })
  }

  /** 重新播种预置的领域 / 成熟度规则（追加到末尾，不动用户自建的规则） */
  function addDefaults(domains: string[]): number {
    const seeded = defaultRules(domains)
    const existing = new Set(
      rules.value.filter(r => r.field === 'domain' || r.field === 'maturity')
        .map(r => `${r.field}\u0001${r.value}`)
    )
    const fresh = seeded.filter(r => !existing.has(`${r.field}\u0001${r.value}`))
    if (!fresh.length) return 0
    rules.value = [...rules.value, ...fresh]
    schedulePush()
    return fresh.length
  }

  /** 整体替换成预置规则（面板上的「恢复默认配色」） */
  function resetToDefaults(domains: string[]): void {
    rules.value = defaultRules(domains)
    schedulePush()
  }

  return {
    rules,
    count,
    enabledCount,
    serverRuleCount,
    matchSets,
    matchPending,
    matchError,
    loaded,
    syncing,
    pending,
    error,
    lastSyncedAt,
    init,
    add,
    update,
    remove,
    move,
    toggle,
    addDefaults,
    resetToDefaults,
    resolveMatches,
    flush,
    push
  }
}
