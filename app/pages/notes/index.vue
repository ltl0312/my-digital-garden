<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const activeTag = computed(() => (typeof route.query.tag === 'string' ? route.query.tag : ''))

// 局部输入状态（提交式搜索，避免 computed 双向绑定）
const searchInput = ref(typeof route.query.q === 'string' ? route.query.q : '')
const tagInput = ref(typeof route.query.tag === 'string' ? route.query.tag : '')

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
        q: searchInput.value,
        tag: activeTag.value
      }
    })
  } finally {
    loading.value = false
  }
}

// SSR 初始数据
await loadNotes()

// 客户端 query 变化（分页/搜索/标签）→ 重新取数（手动模式，不依赖 useAsyncData 缓存语义）
watch(() => route.query, () => loadNotes())

const { data: tags } = await useAsyncData('tags-all', () => requestFetch('/api/tags'))

const updateQuery = (patch: Record<string, string | undefined>) => {
  router.push({ query: { ...route.query, ...patch } })
}

const submitSearch = () => updateQuery({ q: searchInput.value || undefined, page: undefined })
const submitTag = () => updateQuery({ tag: tagInput.value || undefined, page: undefined })

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

useHead({ title: '全部笔记 · 拾光' })
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <header class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight mb-4">全部笔记</h1>
      <div class="flex flex-wrap gap-3 mb-4">
        <input
          v-model="searchInput"
          placeholder="搜索标题或正文…"
          class="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] text-sm focus:border-[var(--accent-color)] outline-none"
          @keyup.enter="submitSearch"
        />
        <input
          v-model="tagInput"
          placeholder="按标签筛选…"
          class="flex-1 min-w-[150px] px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] text-sm focus:border-[var(--accent-color)] outline-none"
          @keyup.enter="submitTag"
        />
      </div>
      <div v-if="tags?.length" class="flex flex-wrap gap-2">
        <button
          v-for="t in tags.slice(0, 20)"
          :key="t.name"
          class="text-xs px-2 py-1 rounded bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
          :class="{ 'border-[var(--accent-color)] text-[var(--accent-color)]': activeTag === t.name }"
          @click="updateQuery({ tag: activeTag === t.name ? undefined : t.name, page: undefined })"
        >
          #{{ t.name }} <span class="text-[var(--text-secondary)]">({{ t.count }})</span>
        </button>
      </div>
    </header>

    <ul v-if="list?.notes?.length" class="space-y-3 mb-8">
      <li v-for="note in list.notes" :key="note.slug">
        <NuxtLink
          :to="`/notes/${note.slug}`"
          class="block p-4 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
        >
          <div class="flex items-center gap-3 mb-1">
            <span class="px-2 py-0.5 rounded text-xs bg-[var(--bg-primary)] uppercase font-semibold">{{ note.maturity }}</span>
            <span class="text-xs text-[var(--text-secondary)]">{{ formatDate(note.updatedAt) }}</span>
          </div>
          <div class="font-medium mb-1">{{ note.title }}</div>
          <div class="text-xs text-[var(--text-secondary)] line-clamp-2">{{ note.summary || '暂无摘要' }}</div>
          <div class="flex flex-wrap gap-2 mt-2">
            <NuxtLink
              v-for="t in note.tags"
              :key="t.tag.name"
              :to="`/notes?tag=${encodeURIComponent(t.tag.name)}`"
              class="text-xs text-[var(--accent-color)] hover:underline"
            >#{{ t.tag.name }}</NuxtLink>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-sm text-[var(--text-secondary)] mb-8">没有找到匹配的笔记</p>

    <nav v-if="list && list.totalPages > 1" class="flex items-center justify-center gap-4">
      <button
        class="px-3 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] disabled:opacity-40"
        :disabled="page <= 1"
        @click="updateQuery({ page: String(page - 1) })"
      >上一页</button>
      <span class="text-sm text-[var(--text-secondary)]">{{ page }} / {{ list.totalPages }}</span>
      <button
        class="px-3 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] disabled:opacity-40"
        :disabled="page >= list.totalPages"
        @click="updateQuery({ page: String(page + 1) })"
      >下一页</button>
    </nav>
  </div>
</template>
