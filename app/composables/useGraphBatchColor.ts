// 批量上色的**圈选逻辑**（需求：控制面板里也能直接选一批节点批量上色，可按路径/名称/内容筛选）。
//
// 三个字段的取数方式刻意不同：
//   - 路径 / 名称：图谱数据里已经有 slug、dirPath、title、tags，**前端本地过滤**，打字即时出结果；
//   - 正文：图谱接口不带正文，必须问服务端（`/api/notes/graph/match`），因此防抖 + 序号防乱序。
//
// 圈选范围是**全部图谱节点**，不是当前可见节点：颜色是持久化的属性，
// 不应该因为此刻恰好筛掉了某个领域就上不了色。面板上会另外显示「其中 M 个当前可见」。

import {
  BATCH_CONTENT_DEBOUNCE_MS,
  BATCH_CONTENT_MIN_LENGTH
} from '~/lib/graph-constants'

export interface BatchFieldState {
  path: boolean
  name: boolean
  content: boolean
}

/** 圈选只需要这几个字段，不依赖完整的 GraphNode */
export interface BatchNode {
  id: string
  slug: string
  title: string
  dirPath: string
  tags: string[]
}

interface MatchResponse {
  ids: string[]
  total: number
  truncated: boolean
}

export const useGraphBatchColor = (
  nodes: Ref<BatchNode[]>,
  visibleIds: Ref<Set<string>> = ref(new Set<string>())
) => {
  const query = ref('')
  const fields = reactive<BatchFieldState>({ path: true, name: true, content: false })

  /** 正文检索命中的节点 id（服务端返回，已按图谱节点过滤） */
  const contentIds = ref<string[]>([])
  const contentTotal = ref(0)
  const contentTruncated = ref(false)
  const contentPending = ref(false)
  const contentError = ref<string | null>(null)

  const nodeIds = computed(() => new Set(nodes.value.map(n => n.id)))
  const trimmed = computed(() => query.value.trim().toLowerCase())
  const active = computed(() => trimmed.value.length > 0 && (fields.path || fields.name || fields.content))

  // ---------- 正文检索（防抖 + 序号防乱序） ----------
  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  async function runContentQuery() {
    const q = query.value.trim()
    if (!fields.content || q.length < BATCH_CONTENT_MIN_LENGTH) {
      contentIds.value = []
      contentTotal.value = 0
      contentTruncated.value = false
      contentPending.value = false
      contentError.value = null
      return
    }
    const mine = ++seq
    contentPending.value = true
    try {
      const res = await $fetch<MatchResponse>('/api/notes/graph/match', {
        params: { q, fields: 'content', limit: 2000 }
      })
      if (mine !== seq) return // 已有更新的请求发出，丢弃这份过期结果
      const known = nodeIds.value
      contentIds.value = res.ids.filter(id => known.has(id))
      contentTotal.value = res.total
      contentTruncated.value = res.truncated
      contentError.value = null
    } catch (e: unknown) {
      if (mine !== seq) return
      contentIds.value = []
      contentError.value = (e as { message?: string })?.message || '正文检索失败'
    } finally {
      if (mine === seq) contentPending.value = false
    }
  }

  function scheduleContentQuery() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void runContentQuery() }, BATCH_CONTENT_DEBOUNCE_MS)
  }

  watch([query, () => fields.content], () => scheduleContentQuery())

  // ---------- 本地圈选（路径 / 名称） ----------
  const matchedIds = computed<Set<string>>(() => {
    const out = new Set<string>()
    const q = trimmed.value
    if (!q) return out

    if (fields.path) {
      for (const n of nodes.value) {
        if (n.slug.toLowerCase().includes(q) || n.dirPath.toLowerCase().includes(q)) out.add(n.id)
      }
    }
    if (fields.name) {
      for (const n of nodes.value) {
        if (n.title.toLowerCase().includes(q)) { out.add(n.id); continue }
        if (n.tags.some(t => t.toLowerCase().includes(q))) out.add(n.id)
      }
    }
    if (fields.content) {
      for (const id of contentIds.value) out.add(id)
    }
    return out
  })

  const matchedNodes = computed(() => nodes.value.filter(n => matchedIds.value.has(n.id)))
  const matchedCount = computed(() => matchedIds.value.size)
  const matchedVisibleCount = computed(() => matchedNodes.value.filter(n => visibleIds.value.has(n.id)).length)

  /** 面板顶部的一行说明文字 */
  const summary = computed(() => {
    if (!query.value.trim()) return '输入关键词开始圈选'
    if (!active.value) return '请至少勾选一个筛选字段'
    if (contentPending.value) return '正文检索中…'
    if (contentError.value) return `正文检索失败：${contentError.value}`
    if (!matchedCount.value) return '没有匹配的节点'
    const vis = matchedVisibleCount.value
    const tail = vis === matchedCount.value ? '' : ` · 其中 ${vis} 个当前可见`
    const trunc = contentTruncated.value ? `（正文命中 ${contentTotal.value} 篇，仅取前 2000）` : ''
    return `匹配 ${matchedCount.value} 个节点${tail}${trunc}`
  })

  /** 勾选 / 取消一个筛选字段（面板的 checkbox 回调） */
  function toggleField(f: keyof BatchFieldState) {
    fields[f] = !fields[f]
  }

  return {
    query,
    fields,
    active,
    matchedIds,
    matchedNodes,
    matchedCount,
    contentPending,
    contentTotal,
    contentTruncated,
    contentError,
    summary,
    toggleField
  }
}
