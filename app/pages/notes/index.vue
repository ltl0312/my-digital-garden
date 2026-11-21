<script setup lang="ts">
import { Search, X, LayoutList, Rows3 } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

// 触屏长按逐行操作（交付物第 22 屏）；notesRev 在删除后自增，触发下方重新取数
const { openNoteSheet, notesRev } = useNoteActions()

// 取数（参数拼装 / loading / error / route.query 监听）全部收在 useNoteList：
// 这套语义要被「全部笔记」与 health 筛选共用，散在页面里必然漂移。
// keepPreviousData 也在那里实现：换页 / 换筛选时旧列表留着，只在列表顶部走 2px 进度条。
const {
  list,
  error: loadError,
  firstLoad,
  refreshing,
  reload: loadNotes,
  page,
  q: activeQ,
  tag: activeTag,
  dir: activeDir,
  sort,
  health: activeHealth
} = useNoteList({ pageSize: 20 })

// 局部输入状态（提交式搜索，避免 computed 双向绑定）
const searchInput = ref(activeQ.value)

// SSR 初始数据：首屏没有旧数据可保留，骨架只顶一次，所以这里仍然 await
await loadNotes()

// 长按面板删除笔记后重新取数（列表数据不归 useAsyncData 管，refreshNuxtData 覆盖不到）
watch(notesRev, () => loadNotes())

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

/** health 参数的展示名（芯片与空态共用一份，免得两处文案各说各的） */
const HEALTH_LABEL: Record<'isolated' | 'linked', string> = {
  isolated: '孤立笔记',
  linked: '双向链接'
}

/** 活动筛选清单（芯片可逐项移除，spec 5.3）；health 是入口带过来的筛选，同样可清除 */
const activeFilters = computed(() => {
  const out: { key: 'q' | 'tag' | 'dir' | 'health'; label: string; value: string }[] = []
  if (activeQ.value) out.push({ key: 'q', label: '搜索', value: activeQ.value })
  if (activeTag.value) out.push({ key: 'tag', label: '标签', value: `#${activeTag.value}` })
  if (activeDir.value) out.push({ key: 'dir', label: '领域', value: activeDir.value.split('/').pop() || activeDir.value })
  // health 没有「字段：值」的结构（它不是用户输入的取值），label 留空，芯片只显示「孤立笔记」
  if (activeHealth.value) out.push({ key: 'health', label: '', value: HEALTH_LABEL[activeHealth.value] })
  return out
})

const removeFilter = (key: 'q' | 'tag' | 'dir' | 'health') => {
  if (key === 'q') searchInput.value = ''
  updateQuery({ [key]: undefined, page: undefined })
}

const clearAll = () => {
  searchInput.value = ''
  updateQuery({ q: undefined, tag: undefined, dir: undefined, health: undefined, page: undefined })
}

const sortOptions = [
  { key: 'updated', label: '最近更新' },
  { key: 'title', label: '标题' },
  { key: 'reading', label: '阅读时长' }
]

const emptyReason = computed(() => {
  // health 分支必须排在最前：不加这一支，从首页「孤立笔记 / 双向链接」卡点进来而结果为空时，
  // 空态会落到最后那句「vault 里还没有已发布的笔记」—— 明明是「没有孤立笔记」，却被说成库是空的。
  if (activeHealth.value === 'isolated') return '没有孤立笔记 —— 每一篇都至少连着一条入链或出链，没有落单的。'
  if (activeHealth.value === 'linked') return '没有带链接的笔记 —— 目前还没有任何笔记之间建立双链。'
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
        <span v-if="list" class="text-ds-xs text-ink-3 font-mono">{{ list.total }} 篇</span>
      </div>

      <!-- 工具栏：搜索（带清除）+ 排序 + 密度切换 -->
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="relative flex-1 min-w-[220px]">
          <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
          <input
            v-model="searchInput"
            placeholder="搜索标题或正文…"
            class="w-full pl-9 pr-9 py-2 rounded-ctl bg-surface-2 border border-line-strong text-ds-sm text-ink placeholder-ink-3 focus:border-accent/60 transition-colors duration-micro"
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
            class="px-2.5 h-7 rounded-xs text-ds-xs transition-colors duration-micro"
            :class="sort === o.key ? 'bg-accent text-[var(--accent-ink)] font-semibold' : 'text-ink-2 hover:bg-surface-3'"
            :aria-pressed="sort === o.key"
            @click="updateQuery({ sort: o.key === 'updated' ? undefined : o.key, page: undefined })"
          >{{ o.label }}</button>
        </div>

        <!-- 密度切换 -->
        <div class="inline-flex items-center rounded-ctl border border-line bg-surface-2 p-0.5" role="group" aria-label="列表密度">
          <button
            class="w-7 h-7 rounded-xs flex items-center justify-center transition-colors duration-micro"
            :class="density === 'standard' ? 'bg-accent text-[var(--accent-ink)]' : 'text-ink-2 hover:bg-surface-3'"
            title="标准密度"
            aria-label="标准密度"
            :aria-pressed="density === 'standard'"
            @click="setDensity('standard')"
          ><LayoutList class="w-4 h-4" /></button>
          <button
            class="w-7 h-7 rounded-xs flex items-center justify-center transition-colors duration-micro"
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
        <span class="text-ds-xs text-ink-3">筛选：</span>
        <span
          v-for="f in activeFilters"
          :key="f.key"
          class="inline-flex items-center gap-1 h-[24px] pl-2.5 pr-1.5 rounded-full border border-accent/35 bg-[var(--accent-soft)] text-ds-xs text-accent-text"
        >
          <template v-if="f.label">{{ f.label }}：</template>{{ f.value }}
          <button
            class="w-4 h-4 rounded-full flex items-center justify-center hover:bg-accent/15 transition-colors duration-micro"
            :aria-label="`移除筛选：${f.label}`"
            @click="removeFilter(f.key)"
          ><X class="w-3 h-3" /></button>
        </span>
        <button class="text-ds-xs text-ink-3 hover:text-ink underline underline-offset-2 ml-1" @click="clearAll">全部清除</button>
      </div>
    </header>

    <!-- 去闪烁：只有「首次加载」（本地还没有任何数据）才整屏骨架。换页 / 换筛选时旧 list 一直留着，
         骨架只能顶这一种场景 —— 列表从 8 行骨架塌回 0 再撑开，滚动位置和刚点的标签会一起跑掉 -->
    <NoteListSkeleton v-if="firstLoad" :rows="8" />

    <EmptyState
      v-else-if="loadError"
      variant="error"
      title="没能取到笔记列表"
      reason="请求没有返回结果，可能是网络中断或服务正在重启。已有的笔记不会因此丢失。"
      @retry="loadNotes"
    />

    <div v-else-if="list?.notes?.length">
      <!-- 2px 槽位常驻（无请求时为空）：若整条 div 随请求出现/消失，行内容会上下跳 2px -->
      <div class="h-[2px] mb-2" aria-hidden="true">
        <div v-if="refreshing" class="h-full rounded-full bg-accent animate-pulse" />
      </div>
      <ul class="space-y-1 mb-8" :class="density === 'compact' ? 'space-y-0.5' : ''" :aria-busy="refreshing">
        <li v-for="note in list.notes" :key="note.slug">
          <!-- highlight 传当前搜索词：NoteRow 用它把 snippet 里的命中片段标出来 -->
          <NoteRow
            :note="note"
            :compact="density === 'compact'"
            :highlight="activeQ"
            actions
            @longpress="openNoteSheet"
          />
        </li>
      </ul>
    </div>

    <EmptyState
      v-else
      :reason="emptyReason"
      :action-text="activeFilters.length ? undefined : '回到总览'"
      :action-to="activeFilters.length ? undefined : '/'"
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
