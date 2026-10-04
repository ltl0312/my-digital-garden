// 图谱筛选与可见范围（计划书 T2.3）
// 规则要点：
// · 领域 / 成熟度多选取**交集**（AND），计数用该组全量节点数，不做动态联动预测
// · 关系类型（显式链接 / 标签共有）各自开关，**至少保留一种**，全关时给提示而非空图
// · 可见范围三选一：全图 / 选中节点 2 跳邻居 / 两节点最短路径
// · 空结果**不清空画布**：保留上一次视图 + 提示条（由页面消费 isEmpty/conflictHint 渲染）
import type { EdgeKind, GraphFilterState, GraphNode, GraphEdge, ScopeMode } from '~/lib/graph-types'
import { MATURITY_LABEL } from '~/lib/graph-constants'
import { patchGraphState, readGraphState } from '~/lib/graphState'

const DEFAULT_FILTER: GraphFilterState = {
  scope: 'all',
  domains: [],
  maturities: [],
  tags: [],
  edgeKinds: ['link', 'tag'],
  showLabels: true,
  showIsolated: true
}

export function useGraphFilter(
  graph: ReturnType<typeof useGraphData>,
  selectedId: Ref<string | null>
) {
  const saved = readGraphState().filter
  const state = reactive<GraphFilterState>({ ...DEFAULT_FILTER, ...(saved || {}) })
  // 旧数据可能存了空数组：至少保留一种关系类型
  if (!state.edgeKinds.length) state.edgeKinds = ['link']

  watch(state, () => patchGraphState({ filter: { ...state, domains: [...state.domains], maturities: [...state.maturities], tags: [...state.tags], edgeKinds: [...state.edgeKinds] } }), { deep: true })

  /** 尝试关掉最后一种关系类型时的提示（清空后自动消失） */
  const edgeKindHint = ref('')
  let hintTimer: ReturnType<typeof setTimeout> | null = null
  const flashEdgeHint = (msg: string) => {
    edgeKindHint.value = msg
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => { edgeKindHint.value = '' }, 3200)
  }
  onScopeDispose(() => { if (hintTimer) clearTimeout(hintTimer) })

  // ---- 最短路径选点 ----
  const pathFrom = ref<string | null>(null)
  const pathTo = ref<string | null>(null)

  const pathNodeIds = computed<string[] | null>(() => {
    if (state.scope !== 'path') return null
    return graph.shortestPath(pathFrom.value, pathTo.value)
  })

  const pathEdgeSet = computed(() => {
    const ids = pathNodeIds.value
    const set = new Set<string>()
    if (!ids || ids.length < 2) return set
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i]!
      const b = ids[i + 1]!
      set.add(a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
    }
    return set
  })

  const pathEdgeKey = (e: GraphEdge) => (e.source < e.target ? `${e.source}\u0000${e.target}` : `${e.target}\u0000${e.source}`)

  /** 选点模式：路径范围下还没选满两个点 */
  const pickingPath = computed(() => state.scope === 'path' && (!pathFrom.value || !pathTo.value))

  const setPathPoint = (id: string) => {
    if (state.scope !== 'path') return
    if (!pathFrom.value || pathTo.value) {
      pathFrom.value = id
      pathTo.value = null
      return
    }
    if (id === pathFrom.value) return
    pathTo.value = id
  }

  const clearPath = () => {
    pathFrom.value = null
    pathTo.value = null
  }

  // ---- 关系类型 ----
  const isKindOn = (k: EdgeKind) => state.edgeKinds.includes(k)
  const toggleKind = (k: EdgeKind) => {
    if (state.edgeKinds.includes(k)) {
      if (state.edgeKinds.length === 1) {
        flashEdgeHint('至少要保留一种关系类型：显式链接或标签共有')
        return
      }
      state.edgeKinds = state.edgeKinds.filter(x => x !== k)
    } else {
      state.edgeKinds = [...state.edgeKinds, k]
    }
  }

  // ---- 领域 / 成熟度 ----
  const toggleDomain = (name: string) => {
    state.domains = state.domains.includes(name)
      ? state.domains.filter(d => d !== name)
      : [...state.domains, name]
  }
  const onlyDomain = (name: string) => { state.domains = [name] }
  const toggleMaturity = (key: string) => {
    state.maturities = state.maturities.includes(key)
      ? state.maturities.filter(m => m !== key)
      : [...state.maturities, key]
  }

  // ---- 标签（来自节点详情「标签行」或搜索面板「标签」组） ----
  const toggleTag = (name: string) => {
    state.tags = state.tags.includes(name)
      ? state.tags.filter(t => t !== name)
      : [...state.tags, name]
  }
  const clearTags = () => { state.tags = [] }

  const setScope = (s: ScopeMode) => {
    state.scope = s
    if (s !== 'path') clearPath()
  }

  const clearAll = () => {
    state.domains = []
    state.maturities = []
    state.tags = []
    state.edgeKinds = ['link', 'tag']
    state.scope = 'all'
    state.showLabels = true
    state.showIsolated = true
    clearPath()
  }

  // ---- 派生：可见子集 ----
  const filtersActive = computed(() =>
    state.domains.length > 0
    || state.maturities.length > 0
    || state.tags.length > 0
    || state.edgeKinds.length < 2
    || !state.showIsolated
    || state.scope !== 'all'
  )

  /** 领域 ∩ 成熟度 ∩ 标签 过滤后的节点 */
  const facetNodes = computed<GraphNode[]>(() => graph.nodes.value.filter((n) => {
    if (state.domains.length && !state.domains.includes(n.domain)) return false
    if (state.maturities.length && !state.maturities.includes(n.maturity || 'SEEDLING')) return false
    if (state.tags.length && !state.tags.every(t => n.tags.includes(t))) return false
    return true
  }))

  /** 可见范围约束（2 跳邻居 / 最短路径）；全图时为 null 表示不限制 */
  const scopeIds = computed<Set<string> | null>(() => {
    if (state.scope === 'neighbors') {
      if (!selectedId.value) return null
      return graph.neighborsOf(selectedId.value, 2)
    }
    if (state.scope === 'path') {
      const ids = pathNodeIds.value
      return ids && ids.length ? new Set(ids) : null
    }
    return null
  })

  const visibleNodes = computed<GraphNode[]>(() => facetNodes.value.filter((n) => {
    if (!state.showIsolated && graph.isolatedIds.value.has(n.id)) return false
    if (scopeIds.value && !scopeIds.value.has(n.id)) return false
    return true
  }))

  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))

  const visibleEdges = computed<GraphEdge[]>(() => {
    const allowed = new Set(state.edgeKinds)
    const ids = visibleNodeIds.value
    return graph.edges.value.filter(e =>
      allowed.has(e.kind) && ids.has(e.source) && ids.has(e.target)
    )
  })

  /** 当前筛选 / 范围下没有任何节点（用于「筛选无结果」状态，不清空画布） */
  const isEmpty = computed(() => filtersActive.value && graph.nodes.value.length > 0 && visibleNodes.value.length === 0)

  /** 「哪两个条件冲突」的具体说明（计划书 T4.1） */
  const conflictHint = computed(() => {
    if (!isEmpty.value) return ''
    const d = state.domains
    const m = state.maturities
    if (d.length && m.length) {
      return `${d.map(x => `「${x}」`).join('')}与${m.map(x => `「${MATURITY_LABEL[x] || x}」`).join('')}同时选中，但两者没有重叠的笔记`
    }
    if (state.tags.length && (d.length || m.length)) {
      return `${state.tags.map(x => `#${x}`).join('')}与已选领域/成熟度同时生效，但没有笔记同时满足`
    }
    if (state.tags.length) return `同时带有${state.tags.map(x => `#${x}`).join('')}的笔记不存在`
    if (d.length) return `选中的领域（${d.join('、')}）下没有笔记`
    if (m.length) return `选中的成熟度（${m.map(x => MATURITY_LABEL[x] || x).join('、')}）下没有笔记`
    if (state.scope === 'neighbors') return '当前选中节点没有可显示的邻居'
    if (state.scope === 'path') {
      if (!pathFrom.value || !pathTo.value) return '请依次点选两个节点以查找最短路径'
      return '所选两点之间没有连接，试试 2 跳邻居'
    }
    return '当前筛选下没有匹配节点'
  })

  /** 冲突时的次按钮文案：只看第一个选中的领域 */
  const conflictShortcut = computed(() => (state.domains.length > 1 ? state.domains[0]! : ''))

  return {
    state,
    edgeKindHint,
    filtersActive,
    facetNodes,
    visibleNodes,
    visibleNodeIds,
    visibleEdges,
    isEmpty,
    conflictHint,
    conflictShortcut,
    scopeIds,
    pathFrom,
    pathTo,
    pathNodeIds,
    pathEdgeSet,
    pathEdgeKey,
    pickingPath,
    isKindOn,
    toggleKind,
    toggleDomain,
    onlyDomain,
    toggleMaturity,
    toggleTag,
    clearTags,
    setScope,
    setPathPoint,
    clearPath,
    clearAll
  }
}
