<script setup lang="ts">
// 命令面板（spec 6 SearchTrigger + CommandPalette / 5.7）：
// 分组结果（按领域）· 高亮命中 · 键盘导航（↑↓ / ↵ / ESC）· 底部快捷键提示
import { Search, FileText } from 'lucide-vue-next'
import { domainOfSlug } from '~/composables/useFacets'
import { highlightHtml } from '~/composables/useNoteList'

const open = defineModel<boolean>('open', { default: false })
const q = ref('')
const results = ref<any[]>([])
/** 这批结果是用哪个词搜出来的：片段高亮必须跟着结果走，
 *  否则用户多打一个字（新请求还在 200ms 防抖里）就会拿新词去标旧片段，标出风马牛不相及的词 */
const hitQuery = ref('')
const loading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const active = ref(0)
const listRef = ref<HTMLElement | null>(null)

// 防抖 + 请求竞态控制：快速输入时丢弃过期响应（旧结果不覆盖新结果）
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0

watch(open, async (v) => {
  if (!v) {
    q.value = ''
    hitQuery.value = ''
    results.value = []
    active.value = 0
    return
  }
  await nextTick()
  inputRef.value?.focus()
  await search()
})

const search = async () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    const seq = ++requestSeq
    loading.value = true
    // 记下这次请求实际用的词：返回时 q 可能已经又被改过（下一轮还在防抖里），
    // 高亮必须按「结果对应的词」算，否则会把旧片段标上风马牛不相及的新词
    const needle = q.value.trim()
    try {
      const requestFetch = useRequestFetch()
      // 出参类型同首页：显式声明所需字段（results 本身即 any[]）
      const data = await requestFetch<{ notes: any[] }>('/api/notes', { query: { q: needle, pageSize: 8 } })
      if (seq === requestSeq) {
        results.value = data.notes || []
        hitQuery.value = needle
        active.value = 0
      }
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }, 200)
}

/** 分组结果：按领域归类，保持服务端返回的组内顺序 */
const groups = computed(() => {
  const map = new Map<string, any[]>()
  for (const n of results.value) {
    const d = domainOfSlug(n.slug).domain || '其他'
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(n)
  }
  return [...map.entries()].map(([domain, items]) => ({ domain, items }))
})

/** 扁平顺序（与 DOM 一致）用于键盘导航索引 */
const flat = computed(() => groups.value.flatMap(g => g.items))
const idxOf = (slug: string) => flat.value.findIndex(n => n.slug === slug)

/** 高亮命中：把标题里匹配查询词的片段包成 mark；用 hitQuery（结果对应的词）而不是当前输入框 */
const segs = (title: string) => {
  const query = hitQuery.value
  if (!query) return [{ t: title, hit: false }]
  const out: { t: string; hit: boolean }[] = []
  const lower = title.toLowerCase()
  const needle = query.toLowerCase()
  let i = 0
  while (i < title.length) {
    const at = lower.indexOf(needle, i)
    if (at < 0) {
      out.push({ t: title.slice(i), hit: false })
      break
    }
    if (at > i) out.push({ t: title.slice(i, at), hit: false })
    out.push({ t: title.slice(at, at + query.length), hit: true })
    i = at + query.length
  }
  return out
}

/** 片段高亮：先按纯文本转义再只把命中段包进 <mark>（不能把服务端字符串直接 v-html） */
const snippetHtml = (snippet: string) => highlightHtml(snippet, hitQuery.value)

const go = (slug: string) => {
  open.value = false
  navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
}

const move = (step: number) => {
  const n = flat.value.length
  if (!n) return
  active.value = (active.value + step + n) % n
  nextTick(() => {
    listRef.value?.querySelectorAll('[data-cmd-item]')[active.value]?.scrollIntoView({ block: 'nearest' })
  })
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); const n = flat.value[active.value]; if (n) go(n.slug) }
  else if (e.key === 'Escape') { e.preventDefault(); open.value = false }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[1000] bg-[color-mix(in_srgb,var(--ink)_38%,transparent)] flex items-start justify-center pt-6 px-3 sm:pt-20 sm:px-4"
      @click.self="open = false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索笔记"
        class="w-full max-w-xl rounded-overlay border border-line-strong bg-surface shadow-ds3 overflow-hidden"
      >
        <div class="p-4 border-b border-line flex items-center gap-3">
          <Search class="w-4 h-4 text-accent-text shrink-0" />
          <input
            ref="inputRef"
            v-model="q"
            placeholder="搜索笔记、标签、想法…"
            aria-label="搜索关键词"
            class="w-full bg-transparent text-ds-base text-ink placeholder-ink-3"
            @input="search"
            @keydown="onKeydown"
          />
          <kbd class="text-ds-xs font-mono text-ink-3 bg-surface-3 px-2 py-1 rounded-ctl cursor-pointer shrink-0" @click="open = false">ESC</kbd>
        </div>

        <div ref="listRef" class="max-h-[58vh] sm:max-h-80 overflow-y-auto p-2">
          <template v-for="g in groups" :key="g.domain">
            <p class="px-2.5 pt-2 pb-1 text-ds-xs font-semibold text-ink-3">{{ g.domain }}</p>
            <button
              v-for="n in g.items"
              :key="n.slug"
              data-cmd-item
              class="w-full text-left px-2.5 py-2 rounded-ctl flex items-center gap-3 transition-colors duration-micro"
              :class="idxOf(n.slug) === active ? 'bg-[var(--accent-soft)]' : 'hover:bg-surface-3'"
              @click="go(n.slug)"
              @mousemove="active = idxOf(n.slug)"
            >
              <FileText class="w-4 h-4 shrink-0" :class="idxOf(n.slug) === active ? 'text-accent-text' : 'text-ink-3'" />
              <span class="min-w-0 flex-1">
                <span class="block text-ds-sm font-semibold text-ink truncate">
                  <template v-for="(s, i) in segs(n.title)" :key="i">
                    <mark v-if="s.hit" class="bg-[var(--accent-soft)] text-accent-text rounded-xs px-0.5">{{ s.t }}</mark>
                    <template v-else>{{ s.t }}</template>
                  </template>
                </span>
                <!-- 有命中片段就显示片段：调色板里最要紧的是「这个词出现在哪句话里」，
                     摘要往往与关键词无关，看不出为什么这条会被搜出来 -->
                <span
                  v-if="n.snippet"
                  class="block text-ds-xs text-ink-3 line-clamp-2 [&_mark]:bg-[var(--accent-soft)] [&_mark]:text-accent-text [&_mark]:rounded-xs [&_mark]:px-0.5"
                  v-html="snippetHtml(n.snippet)"
                ></span>
                <span v-else class="block text-ds-xs text-ink-3 line-clamp-1">{{ n.summary || n.slug }}</span>
              </span>
              <StatusBadge :maturity="n.maturity" compact />
            </button>
          </template>

          <p v-if="loading && !results.length" class="p-8 text-center text-ds-sm text-ink-3">搜索中…</p>
          <p v-else-if="!results.length" class="p-8 text-center text-ds-sm text-ink-3">
            没有匹配的笔记 —— 换个关键词，或到全部笔记里按领域浏览。
          </p>
        </div>

        <!-- 底部快捷键提示 -->
        <div class="px-4 py-2.5 border-t border-line flex items-center gap-3 text-ds-xs text-ink-3">
          <span class="flex items-center gap-1"><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">↑</kbd><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">↓</kbd>选择</span>
          <span class="flex items-center gap-1"><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">↵</kbd>打开</span>
          <span class="flex items-center gap-1"><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">ESC</kbd>关闭</span>
          <span class="ml-auto font-mono">{{ flat.length }} 条结果</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
