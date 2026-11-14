<script setup lang="ts">
// 分类浏览页：首页仪表盘每张卡的落地页。
// 三种轴 —— kind=domain（领域）/ type（type/* 标签）/ maturity（成熟度）—— 都只是
// /api/notes 的一组筛选参数，所以这里不新增接口，只做「轴 → 参数」的翻译与分页。
// 点标题进 /notes/<slug>（NoteRow 自带链接，长按操作不挂：这是浏览入口，不是管理台）。
import { ArrowLeft, ArrowRight, LayoutList, Rows3 } from 'lucide-vue-next'
import { MATURITY_LABEL, UNTYPED, typeHueOf } from '#shared/note-types'

type Kind = 'dir' | 'type' | 'maturity'

const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()

const KINDS: Kind[] = ['dir', 'type', 'maturity']
const KIND_LABEL: Record<Kind, string> = { dir: '目录', type: '类型', maturity: '成熟度' }

const kind = computed<Kind | ''>(() => {
  const raw = typeof route.query.kind === 'string' ? route.query.kind : ''
  return (KINDS as string[]).includes(raw) ? (raw as Kind) : ''
})
const value = computed(() => (typeof route.query.value === 'string' ? route.query.value : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const sort = computed(() => (typeof route.query.sort === 'string' ? route.query.sort : 'updated'))

/**
 * 轴 → 查询参数。三者的语义差别都在后端（/api/notes）里解释：
 *   dir     slug 前缀（目录子树）—— 首页「按目录」卡片就是二级目录路径
 *   type    `type/*` 标签取值；「未分类」= 一个 type/* 都没有
 *   maturity 枚举值
 */
const filterQuery = computed<Record<string, string>>(() => {
  if (!kind.value || !value.value) return {}
  if (kind.value === 'maturity') return { maturity: value.value.toUpperCase() }
  return { [kind.value]: value.value }
})

// 标题色点：成熟度用 StatusBadge 同源的三个令牌，类型按名称哈希，领域按领域色族
const MATURITY_HUES: Record<string, string> = {
  SEEDLING: '--seedling',
  GROWING: '--growing',
  EVERGREEN: '--evergreen'
}
const hue = computed(() => {
  if (kind.value === 'maturity') return MATURITY_HUES[value.value.toUpperCase()] || '--hue-misc'
  return typeHueOf(value.value)
})

const heading = computed(() => {
  if (kind.value === 'maturity') return MATURITY_LABEL[value.value.toUpperCase()] || value.value
  // 目录轴：标题只留叶子目录名（`ltl/01-编程语言` → `01-编程语言`），完整路径放在副标题
  if (kind.value === 'dir') return value.value.slice(value.value.lastIndexOf('/') + 1) || value.value
  return value.value
})

/** 标题下的说明行：目录轴显示完整路径，其余轴显示轴名 */
const subline = computed(() => (kind.value === 'dir' ? value.value : `按${kind.value ? KIND_LABEL[kind.value] : '分类'}`))

const list = ref<any>(null)
const loading = ref(false)

const loadNotes = async () => {
  if (!kind.value || !value.value) {
    list.value = { notes: [], total: 0, totalPages: 0 }
    return
  }
  loading.value = true
  try {
    list.value = await requestFetch('/api/notes', {
      query: { page: page.value, pageSize: 20, sort: sort.value, ...filterQuery.value }
    })
  } finally {
    loading.value = false
  }
}

// SSR 首屏与客户端 query 变化共用同一条路径（与 /notes 一致：手动取数，不依赖 useAsyncData 缓存）
await loadNotes()
watch(() => [route.query.kind, route.query.value, route.query.page, route.query.sort], () => loadNotes())

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

const sortOptions = [
  { key: 'updated', label: '最近更新' },
  { key: 'title', label: '标题' },
  { key: 'reading', label: '阅读时长' }
]

const emptyReason = computed(() => {
  if (!kind.value || !value.value) return '这个分类链接不完整：缺少 kind 或 value 参数。'
  if (kind.value === 'type' && value.value === UNTYPED) return '所有笔记都至少带一个 type/* 标签了。'
  if (kind.value === 'maturity') return `没有成熟度为「${heading.value}」的已发布笔记。`
  return `这一类下暂时还没有已发布的笔记。`
})

useHead({ title: () => (heading.value ? `${heading.value} · 拾光` : '分类浏览 · 拾光') })
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 sm:px-6 py-8">
    <NuxtLink
      to="/"
      class="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink transition-colors duration-micro mb-4"
    >
      <ArrowLeft class="w-3.5 h-3.5" />返回总览
    </NuxtLink>

    <header class="mb-6">
      <div class="flex items-baseline justify-between gap-3 mb-3">
        <div class="min-w-0">
          <p class="text-[12px] text-ink-3 mb-1 truncate">{{ subline }}</p>
          <h1 class="text-ds-2xl font-bold tracking-tight text-ink flex items-center gap-2 min-w-0">
            <i
              class="w-2 h-2 rounded-full hue-chip shrink-0"
              :style="{ '--h': `var(${hue})` }"
              aria-hidden="true"
            ></i>
            <span class="truncate">{{ heading || '未知分类' }}</span>
          </h1>
        </div>
        <span v-if="list" class="text-[12px] text-ink-3 font-mono shrink-0">{{ list.total }} 篇</span>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
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

        <NuxtLink to="/notes" class="text-ds-sm text-accent hover:underline inline-flex items-center gap-1 ml-auto">
          全部笔记<ArrowRight class="w-3.5 h-3.5" />
        </NuxtLink>
      </div>
    </header>

    <div v-if="loading" class="py-10 text-center text-ds-sm text-ink-3">加载中…</div>

    <ul v-else-if="list?.notes?.length" class="space-y-1 mb-8" :class="density === 'compact' ? 'space-y-0.5' : ''">
      <li v-for="note in list.notes" :key="note.slug">
        <NoteRow :note="note" :compact="density === 'compact'" />
      </li>
    </ul>

    <EmptyState v-else :reason="emptyReason" action-text="回到总览" action-to="/" />

    <Pagination
      v-if="list && list.totalPages > 1"
      :page="page"
      :total-pages="list.totalPages"
      @change="(p: number) => updateQuery({ page: String(p) })"
    />
  </div>
</template>
