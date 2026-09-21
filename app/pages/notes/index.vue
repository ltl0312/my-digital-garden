<script setup lang="ts">
import { Search, X, LayoutList, Rows3 } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const activeTag = computed(() => (typeof route.query.tag === 'string' ? route.query.tag : ''))
const activeDir = computed(() => (typeof route.query.dir === 'string' ? route.query.dir : ''))
const activeQ = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const sort = computed(() => (typeof route.query.sort === 'string' ? route.query.sort : 'updated'))

// 局部输入状态（提交式搜索，避免 computed 双向绑定）
const searchInput = ref(activeQ.value)

const requestFetch = useRequestFetch()
const list = ref<any>(null)
const loading = ref(false)

const loadNotes = async () => {
  loading.value = true
  try {
    list.value = await requestFetch('/api/notes', {
      query: {
        page: page.value,
        pageSize: 20,
        q: activeQ.value,
        tag: activeTag.value,
        dir: activeDir.value,
        sort: sort.value
      }
    })
  } finally {
    loading.value = false
  }
}

// SSR 初始数据
await loadNotes()

// 客户端 query 变化（分页/搜索/标签/领域/排序）→ 重新取数（手动模式，不依赖 useAsyncData 缓存语义）
watch(() => route.query, () => loadNotes())

// 密度切换：仅前端本地状态（spec 5.3），持久化到 localStorage
const density = ref<'standard' | 'compact'>('standard')
onMounted(() => {
  const saved = localStorage.getItem('garden-note-density')
  if (saved === 'compact' || saved === 'standard') density.value = saved
})
const setDensity = (d: 'standard' | 'compact') => {
  density.value = d
  if (import.meta.client) localStorage.setItem('garden-note-density', d)
}

const updateQuery = (patch: Record<string, string | undefined>) => {
  const next: Record<string, any> = { ...route.query, ...patch }
  for (const k of Object.keys(next)) {
    if (next[k] === undefined || next[k] === '') delete next[k]
  }
  router.push({ query: next })
}

const submitSearch = () => updateQuery({ q: searchInput.value || undefined, page: undefined })
const clearSearch = () => {
  searchInput.value = ''
  updateQuery({ q: undefined, page: undefined })
}

/** 活动筛选清单（芯片可逐项移除，spec 5.3） */
const activeFilters = computed(() => {
  const out: { key: 'q' | 'tag' | 'dir'; label: string; value: string }[] = []
  if (activeQ.value) out.push({ key: 'q', label: '搜索', value: activeQ.value })
  if (activeTag.value) out.push({ key: 'tag', label: '标签', value: `#${activeTag.value}` })
  if (activeDir.value) out.push({ key: 'dir', label: '领域', value: activeDir.value.split('/').pop() || activeDir.value })
  return out
})

const removeFilter = (key: 'q' | 'tag' | 'dir') => {
  if (key === 'q') searchInput.value = ''
  updateQuery({ [key]: undefined, page: undefined })
}

const clearAll = () => {
  searchInput.value = ''
  updateQuery({ q: undefined, tag: undefined, dir: undefined, page: undefined })
}

const sortOptions = [
  { key: 'updated', label: '最近更新' },
  { key: 'title', label: '标题' },
  { key: 'reading', label: '阅读时长' }
]

const emptyReason = computed(() => {
  if (activeQ.value && activeTag.value) return '当前同时按关键词与标签筛选，两者都需命中。'
  if (activeQ.value) return '没有笔记同时命中该关键词（标题或正文）。'
  if (activeTag.value) return `没有笔记带 #${activeTag.value} 标签。`
  if (activeDir.value) return '该领域下暂时还没有笔记。'
  return 'vault 里还没有已发布的笔记。'
})

useHead({ title: '全部笔记 · 拾光' })
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 sm:px-6 py-8">
    <header class="mb-6">
      <div class="flex items-baseline justify-between gap-3 mb-4">
        <h1 class="text-ds-2xl font-bold tracking-tight text-ink">全部笔记</h1>
        <span v-if="list" class="text-[12px] text-ink-3 font-mono">{{ list.total }} 篇</span>
      </div>

      <!-- 工具栏：搜索（带清除）+ 排序 + 密度切换 -->
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="relative flex-1 min-w-[220px]">
          <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
          <input
            v-model="searchInput"
            placeholder="搜索标题或正文…"
            class="w-full pl-9 pr-9 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
            @keyup.enter="submitSearch"
          />
          <button
            v-if="searchInput"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
            aria-label="清除搜索"
            @click="clearSearch"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 排序分段控件 -->
        <div class="inline-flex items-center rounded-ctl border border-line bg-surface-2 p-0.5" role="group" aria-label="排序方式">
          <button
            v-for="o in sortOptions"
            :key="o.key"
            class="px-2.5 h-7 rounded-[6px] text-[12px] transition-colors duration-micro"
            :class="sort === o.key ? 'bg-accent text-[var(--accent-ink)] font-semibold' : 'text-ink-2 hover:bg-surface-3'"
            :aria-pressed="sort === o.key"
            @click="updateQuery({ sort: o.key === 'updated' ? undefined : o.key, page: undefined })"
          >{{ o.label }}</button>
        </div>

        <!-- 密度切换 -->
        <div class="inline-flex items-center rounded-ctl border border-line bg-surface-2 p-0.5" role="group" aria-label="列表密度">
          <button
            class="w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors duration-micro"
            :class="density === 'standard' ? 'bg-accent text-[var(--accent-ink)]' : 'text-ink-2 hover:bg-surface-3'"
            title="标准密度"
            aria-label="标准密度"
            :aria-pressed="density === 'standard'"
            @click="setDensity('standard')"
          ><LayoutList class="w-4 h-4" /></button>
          <button
            class="w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors duration-micro"
            :class="density === 'compact' ? 'bg-accent text-[var(--accent-ink)]' : 'text-ink-2 hover:bg-surface-3'"
            title="紧凑密度"
            aria-label="紧凑密度"
            :aria-pressed="density === 'compact'"
            @click="setDensity('compact')"
          ><Rows3 class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- 活动筛选：可逐项移除 + 全部清除 -->
      <div v-if="activeFilters.length" class="flex flex-wrap items-center gap-2 mt-3">
        <span class="text-[12px] text-ink-3">筛选：</span>
        <span
          v-for="f in activeFilters"
          :key="f.key"
          class="inline-flex items-center gap-1 h-[24px] pl-2.5 pr-1.5 rounded-full border border-accent/35 bg-[var(--accent-soft)] text-[12px] text-accent"
        >
          {{ f.label }}：{{ f.value }}
          <button
            class="w-4 h-4 rounded-full flex items-center justify-center hover:bg-accent/15 transition-colors duration-micro"
            :aria-label="`移除筛选：${f.label}`"
            @click="removeFilter(f.key)"
          ><X class="w-3 h-3" /></button>
        </span>
        <button class="text-[12px] text-ink-3 hover:text-ink underline underline-offset-2 ml-1" @click="clearAll">全部清除</button>
      </div>
    </header>

    <div v-if="loading" class="py-10 text-center text-ds-sm text-ink-3">加载中…</div>

    <ul v-else-if="list?.notes?.length" class="space-y-1 mb-8" :class="density === 'compact' ? 'space-y-0.5' : ''">
      <li v-for="note in list.notes" :key="note.slug">
        <NoteRow :note="note" :compact="density === 'compact'" />
      </li>
    </ul>

    <EmptyState
      v-else
      :reason="emptyReason"
      :action-text="activeFilters.length ? undefined : '浏览知识图谱'"
      :action-to="activeFilters.length ? undefined : '/graph'"
    >
      <button
        v-if="activeFilters.length"
        class="mt-5 px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro"
        @click="clearAll"
      >清除全部筛选</button>
    </EmptyState>

    <Pagination
      v-if="list && list.totalPages > 1"
      :page="page"
      :total-pages="list.totalPages"
      @change="(p: number) => updateQuery({ page: String(p) })"
    />
  </div>
</template>
