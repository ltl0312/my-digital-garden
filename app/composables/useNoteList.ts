// 笔记列表取数的单源实现（「全部笔记」与任何按 query 取列表的页面共用）
//
// 为什么要把取数从页面里搬出来：参数拼装、loading/error/data、route.query 监听
// 原先散在 notes/index.vue 里，每多一个入口（health 筛选、搜索命中片段）就要再抄一遍，
// 三份拷贝漂移的结果是「A 页面记得传 dir、B 页面忘了」。这里只留一份。
//
// **keepPreviousData 是这套取数的核心语义**：切分页 / 换标签 / 改排序时，新数据回来之前
// 旧 list 一直留着（页面只在顶部显示 2px 进度条），而不是把 list 置 null 让整屏退回骨架。
// 整屏骨架只在「首次加载」（list 仍为 null）时出现 —— 那才是真的没有内容可显示。
// 骨架闪烁不只是难看：列表高度从 8 行骨架塌回 0 再撑开，滚动位置会丢，用户刚点的标签
// 也跟着跑走。
export type NoteHealthFilter = 'isolated' | 'linked'

/** 列表单行（与 /api/notes 出参、NoteRow 的 props 对齐；snippet/matchField 为搜索态新增） */
export interface NoteListItem {
  slug: string
  title: string
  summary?: string | null
  /** 搜索命中片段：纯文本 ≤120 字，命中词左右各 60 字。无命中时后端不返回 */
  snippet?: string | null
  /** 命中位置：只在有 snippet 时出现，用来判断该高亮标题还是正文片段 */
  matchField?: 'title' | 'content'
  maturity: string
  readingTime?: number | null
  updatedAt: string
  tags?: { tag: { name: string; count?: number } }[]
  [key: string]: unknown
}

export interface NoteListResult {
  notes: NoteListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface NoteListFilters {
  page: number
  q: string
  tag: string
  dir: string
  sort: string
  /** '' = 不筛；isolated = 零入度且零出度；linked = 至少有一条链接 */
  health: NoteHealthFilter | ''
}

export interface UseNoteListOptions {
  /** 每页条数，缺省 20（与「全部笔记」列表一致） */
  pageSize?: number
}

/** query 里的值可能是 string | string[] | null，统一收敛成单串 */
const one = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '')

export function useNoteList(options: UseNoteListOptions = {}) {
  const pageSize = options.pageSize ?? 20
  const route = useRoute()
  // SSR 首屏必须带上当前请求的 cookie/密钥，所以用 useRequestFetch 而不是裸 $fetch
  const requestFetch = useRequestFetch()

  const page = computed(() => Math.max(1, Number(one(route.query.page)) || 1))
  const q = computed(() => one(route.query.q))
  const tag = computed(() => one(route.query.tag))
  const dir = computed(() => one(route.query.dir))
  const sort = computed(() => one(route.query.sort) || 'updated')
  const health = computed<NoteHealthFilter | ''>(() => {
    const h = one(route.query.health)
    // 只认这两个值：手改 URL 传别的值时按「不筛」处理，免得得到一张空列表还以为库空了
    return h === 'isolated' || h === 'linked' ? h : ''
  })

  const filters = computed<NoteListFilters>(() => ({
    page: page.value,
    q: q.value,
    tag: tag.value,
    dir: dir.value,
    sort: sort.value,
    health: health.value
  }))

  const list = ref<NoteListResult | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)

  // 竞态控制：慢请求后到时会覆盖新结果（快速连点分页时列表会「倒退一页」）。
  // keepPreviousData 下这个错误更显眼 —— 旧数据一直在屏幕上，看不出是谁写回来的。
  let seq = 0

  const buildQuery = () => {
    const query: Record<string, string | number> = { page: page.value, pageSize, sort: sort.value }
    if (q.value) query.q = q.value
    if (tag.value) query.tag = tag.value
    if (dir.value) query.dir = dir.value
    if (health.value) query.health = health.value
    return query
  }

  const reload = async () => {
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const res = await requestFetch<NoteListResult>('/api/notes', { query: buildQuery() })
      if (mine !== seq) return
      // 只在拿到新数据这一刻替换 list —— 请求开始时**不动**旧数据
      list.value = res
    } catch (e) {
      if (mine !== seq) return
      // 失败不静默：模板里错误态的优先级高于列表，用户看到的是「取数失败 + 重试」，
      // 而不是一张内容照旧、实际已经不再反映当前筛选条件的列表
      error.value = e
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  // 首次加载 = 有请求在飞且本地还没有任何数据 → 页面用整屏骨架
  const firstLoad = computed(() => loading.value && !list.value)
  // 后台换数 = 有请求在飞但旧数据还在 → 页面只在列表顶部显示 2px 进度条
  const refreshing = computed(() => loading.value && !!list.value)
  const isEmpty = computed(() => !!list.value && (list.value.notes?.length ?? 0) === 0)

  // query 变化（分页 / 搜索 / 标签 / 目录 / 排序 / health）→ 重新取数
  watch(() => route.query, () => { void reload() })

  return { list, loading, error, firstLoad, refreshing, isEmpty, reload, filters, page, q, tag, dir, sort, health }
}

// ── 命中片段渲染 ────────────────────────────────────────────────────────────
// NoteRow 与 CommandPalette 都要「高亮命中词」，所以放在这里共用一份。
// 安全约定：**先把原始文本切片、逐段转义，再拼 <mark>**。
//   · 不能先转义再查找：snippet 里可能出现 <、&、"，转义后原文变了形，indexOf 会漏命中；
//   · 不能把命中词先包成 <mark> 再整体转义：<mark> 自己也会被转义成 &lt;mark&gt;，
//     页面上就会出现字面标签。
// 结果是：拼进去的 HTML 只由本函数产生，用户/服务端文本永远走转义分支。
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => HTML_ESCAPES[c]!)

export function highlightHtml(text: string, needle: string): string {
  const plain = text || ''
  const n = (needle || '').trim()
  if (!n || !plain) return escapeHtml(plain)
  const lower = plain.toLowerCase()
  const nl = n.toLowerCase()
  let out = ''
  let i = 0
  while (i < plain.length) {
    const at = lower.indexOf(nl, i)
    if (at < 0) {
      out += escapeHtml(plain.slice(i))
      break
    }
    out += escapeHtml(plain.slice(i, at))
    out += `<mark class="bg-[var(--accent-soft)] text-accent rounded-xs px-0.5">${escapeHtml(plain.slice(at, at + n.length))}</mark>`
    i = at + n.length
  }
  return out
}
