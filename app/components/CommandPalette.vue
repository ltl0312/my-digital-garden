<script setup lang="ts">
// 命令面板（spec 6 SearchTrigger + CommandPalette / 5.7）：
// 分组结果（按领域）· 高亮命中 · 键盘导航（↑↓ / ↵ / ESC）· 底部快捷键提示
import { Search, FileText } from 'lucide-vue-next'
import { domainOfSlug } from '~/composables/useFacets'

const open = defineModel<boolean>('open', { default: false })
const q = ref('')
const results = ref<any[]>([])
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
    try {
      const requestFetch = useRequestFetch()
      const data = await requestFetch('/api/notes', { query: { q: q.value, pageSize: 8 } })
      if (seq === requestSeq) {
        results.value = data.notes || []
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

/** 高亮命中：把标题里匹配查询词的片段包成 mark */
const segs = (title: string) => {
  const query = q.value.trim()
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
      class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,var(--ink)_38%,transparent)] flex items-start justify-center pt-6 px-3 sm:pt-20 sm:px-4"
      @click.self="open = false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索笔记"
        class="w-full max-w-xl rounded-overlay border border-line bg-surface shadow-ds3 overflow-hidden"
      >
        <div class="p-4 border-b border-line flex items-center gap-3">
          <Search class="w-4 h-4 text-accent shrink-0" />
          <input
            ref="inputRef"
            v-model="q"
            placeholder="搜索笔记、标签、想法…"
            aria-label="搜索关键词"
            class="w-full bg-transparent text-ds-base text-ink placeholder-ink-3 focus:outline-none"
            @input="search"
            @keydown="onKeydown"
          />
          <kbd class="text-[12px] font-mono text-ink-3 bg-surface-3 px-2 py-1 rounded-ctl cursor-pointer shrink-0" @click="open = false">ESC</kbd>
        </div>

        <div ref="listRef" class="max-h-[58vh] sm:max-h-80 overflow-y-auto p-2">
          <template v-for="g in groups" :key="g.domain">
            <p class="px-2.5 pt-2 pb-1 text-[12px] font-semibold text-ink-3">{{ g.domain }}</p>
            <button
              v-for="n in g.items"
              :key="n.slug"
              data-cmd-item
              class="w-full text-left px-2.5 py-2 rounded-ctl flex items-center gap-3 transition-colors duration-micro"
              :class="idxOf(n.slug) === active ? 'bg-[var(--accent-soft)]' : 'hover:bg-surface-3'"
              @click="go(n.slug)"
              @mousemove="active = idxOf(n.slug)"
            >
              <FileText class="w-4 h-4 shrink-0" :class="idxOf(n.slug) === active ? 'text-accent' : 'text-ink-3'" />
              <span class="min-w-0 flex-1">
                <span class="block text-ds-sm font-semibold text-ink truncate">
                  <template v-for="(s, i) in segs(n.title)" :key="i">
                    <mark v-if="s.hit" class="bg-[var(--accent-soft)] text-accent rounded-[3px] px-0.5">{{ s.t }}</mark>
                    <template v-else>{{ s.t }}</template>
                  </template>
                </span>
                <span class="block text-[12px] text-ink-3 line-clamp-1">{{ n.summary || n.slug }}</span>
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
        <div class="px-4 py-2.5 border-t border-line flex items-center gap-3 text-[12px] text-ink-3">
          <span class="flex items-center gap-1"><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">↑</kbd><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">↓</kbd>选择</span>
          <span class="flex items-center gap-1"><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">↵</kbd>打开</span>
          <span class="flex items-center gap-1"><kbd class="font-mono bg-surface-3 px-1.5 py-0.5 rounded">ESC</kbd>关闭</span>
          <span class="ml-auto font-mono">{{ flat.length }} 条结果</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
