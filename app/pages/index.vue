<script setup lang="ts">
// 首页 = 笔记总览仪表盘（替代原先的 Hero + 图谱入口）
// 数据只来自两个接口：/api/overview（三个分类轴的计数 + 链接统计）与 /api/notes（最近更新）。
// 每张分类卡都能点进 /browse?kind=&value=，那里是这一类的完整笔记列表，再点标题进正文。
import { ArrowRight, Search, Sparkles, Library, KeyRound, Activity, Layers, FileText, Link2 } from 'lucide-vue-next'
import { typeHueOf } from '#shared/note-types'

const requestFetch = useRequestFetch()
const commandOpen = useState<boolean>('shell-command-open', () => false)

// /api/notes 的出参含 Prisma 深层 include（tags.tag），经 Nitro SerializeObject 后类型会退化，
// 这里显式声明列表所需字段（与 NoteRow 的 props 对齐），避免模板里 list?.notes 被判为不存在
interface RecentNote {
  slug: string
  title: string
  summary?: string | null
  maturity: string
  readingTime?: number | null
  updatedAt: string
  tags?: { tag: { name: string; count?: number } }[]
}

interface Bucket {
  key: string
  label: string
  count: number
}

const { data: list } = await useAsyncData('notes-recent', () =>
  requestFetch<{ notes: RecentNote[] }>('/api/notes', { query: { pageSize: 6 } })
)

const { tags, tagsPending, stats, overview } = useFacets()

const total = computed(() => stats.value.total)
const sectionBuckets = computed<Bucket[]>(() => (overview.value as any)?.sections || [])
/** 目录桶有长尾（只有 1 篇的小目录），默认只铺前 9 个，其余折叠 */
const SECTION_PREVIEW = 9
const showAllSections = ref(false)
const visibleSections = computed(() =>
  showAllSections.value ? sectionBuckets.value : sectionBuckets.value.slice(0, SECTION_PREVIEW)
)
const typeBuckets = computed<Bucket[]>(() => (overview.value as any)?.types || [])
const maturityBuckets = computed<Bucket[]>(() => (overview.value as any)?.maturity || [])

// 三个"小统计"：链接与孤立笔记是原来图谱页独有的数字，图谱下线后挪到这里
const stats4 = computed(() => [
  { label: '笔记总数', value: total.value, to: '/notes', icon: FileText },
  { label: '双向链接', value: stats.value.links, to: '/notes', icon: Link2 },
  { label: '孤立笔记', value: stats.value.isolated, to: '/notes', icon: Layers },
  { label: '分区目录', value: sectionBuckets.value.length, to: '/notes', icon: Sparkles }
])

// 分类卡跳转：统一走 /browse，参数用 kind + value，URL 可分享、可刷新
const browseTo = (kind: 'dir' | 'type' | 'maturity', value: string) => ({
  path: '/browse',
  query: { kind, value }
})

const share = (count: number) => (total.value ? Math.round((count / total.value) * 1000) / 10 : 0)

// 类型轴没有天然色相：按名称哈希取色（与分类页标题同色，见 shared/note-types.ts）
const typeHue = (key: string) => typeHueOf(key)

// 成熟度：色相与 StatusBadge 同源（--seedling / --growing / --evergreen）
const MATURITY_HUES: Record<string, string> = {
  SEEDLING: '--seedling',
  GROWING: '--growing',
  EVERGREEN: '--evergreen'
}
const maturityHue = (key: string) => MATURITY_HUES[key] || '--hue-misc'

const topTags = computed(() => [...(tags.value || [])].sort((a: any, b: any) => b.count - a.count).slice(0, 12))

const quickLinks = [
  { to: '/notes', label: '全部笔记', desc: '按目录 / 标签 / 关键词浏览', icon: Library },
  { to: '/admin', label: '访问密钥', desc: '查看自己的身份与权限边界', icon: KeyRound }
]

useHead({ title: '拾光' })
</script>

<template>
  <div class="max-w-[1120px] mx-auto px-4 sm:px-6 py-10">
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-10">
      <!-- 主列 -->
      <div class="min-w-0">
        <!-- 标题条 -->
        <header class="mb-8">
          <p class="font-serif italic text-ds-base text-accent mb-2">Non-linear Knowledge Sanctuary</p>
          <h1 class="text-[32px] sm:text-[38px] leading-[1.15] font-extrabold tracking-tight text-ink mb-2">
            拾光
          </h1>
          <p class="text-ds-sm text-ink-2 leading-summary max-w-[52ch]">
            这里有多少笔记、都长在哪些枝上 —— 点任意一块进去看它的全部标题。
          </p>
          <div class="flex flex-wrap items-center gap-2.5 mt-5">
            <NuxtLink
              to="/notes"
              class="px-4 py-2.5 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro inline-flex items-center gap-1.5"
            >
              全部笔记<ArrowRight class="w-4 h-4" />
            </NuxtLink>
            <button
              class="px-4 py-2.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
              @click="commandOpen = true"
            >
              <Search class="w-4 h-4" />搜索
              <kbd class="ml-1 text-[12px] font-mono bg-surface px-1.5 py-0.5 rounded border border-line">⌘K</kbd>
            </button>
          </div>
        </header>

        <!-- 小统计条 -->
        <section class="mb-10 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NuxtLink
            v-for="s in stats4"
            :key="s.label"
            :to="s.to"
            class="px-4 py-3 rounded-card border border-line bg-surface hover:border-accent/40 transition-colors duration-base"
          >
            <p class="text-ds-2xl font-bold text-ink leading-title tabular-nums">{{ s.value }}</p>
            <p class="text-[12px] text-ink-3 mt-0.5 flex items-center gap-1">
              <component :is="s.icon" class="w-3 h-3" />{{ s.label }}
            </p>
          </NuxtLink>
        </section>

        <!-- ① 按目录（slug 前两段；不用「领域」—— vault 主力是 ltl/01-编程语言 这类二级目录，
             领域口径会把其中 9 成塞进「其他」兜底桶） -->
        <section class="mb-10">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="text-ds-xl font-semibold text-ink">按目录</h2>
            <NuxtLink to="/notes" class="text-ds-sm text-accent hover:underline inline-flex items-center gap-1">
              逐条浏览<ArrowRight class="w-3.5 h-3.5" />
            </NuxtLink>
          </div>
          <div v-if="sectionBuckets.length" class="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <NuxtLink
              v-for="d in visibleSections"
              :key="d.key"
              :to="browseTo('dir', d.key)"
              class="group relative overflow-hidden px-4 py-3.5 rounded-card border border-line bg-surface hover:border-accent/50 transition-colors duration-base"
              :style="{ '--h': `var(${typeHueOf(d.key)})` }"
            >
              <span class="absolute inset-x-0 top-0 h-[3px] hue-bar" aria-hidden="true"></span>
              <span class="text-ds-sm font-semibold text-ink flex items-center gap-1.5 min-w-0">
                <i class="w-1.5 h-1.5 rounded-full hue-chip shrink-0" aria-hidden="true"></i>
                <span class="truncate" :title="d.key">{{ d.label }}</span>
              </span>
              <div class="mt-1 flex items-baseline gap-2">
                <span class="text-ds-2xl font-bold text-ink leading-none tabular-nums">{{ d.count }}</span>
                <span class="text-[11px] text-ink-3">{{ share(d.count) }}%</span>
              </div>
              <p class="mt-1 text-[11px] text-ink-3 truncate" :title="d.key">{{ d.key }}</p>
            </NuxtLink>
          </div>
          <p v-else class="text-ds-sm text-ink-3">还没有可统计的目录。</p>
          <button
            v-if="sectionBuckets.length > SECTION_PREVIEW"
            type="button"
            class="mt-2 text-[12px] text-ink-3 hover:text-accent inline-flex items-center gap-1"
            @click="showAllSections = !showAllSections"
          >
            {{ showAllSections ? '收起长尾目录' : `展开其余 ${sectionBuckets.length - SECTION_PREVIEW} 个目录` }}
          </button>
        </section>

        <!-- ② 按类型 -->
        <section class="mb-10">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="text-ds-xl font-semibold text-ink">按类型</h2>
            <span class="text-[12px] text-ink-3">来自 type/* 标签</span>
          </div>
          <div v-if="typeBuckets.length" class="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <NuxtLink
              v-for="t in typeBuckets"
              :key="t.key"
              :to="browseTo('type', t.key)"
              class="group relative overflow-hidden px-4 py-3.5 rounded-card border border-line bg-surface hover:border-accent/50 transition-colors duration-base"
              :style="{ '--h': `var(${typeHue(t.key)})` }"
            >
              <span class="absolute inset-x-0 top-0 h-[3px] hue-bar" aria-hidden="true"></span>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-ds-sm font-semibold text-ink truncate flex items-center gap-1.5">
                  <i class="w-1.5 h-1.5 rounded-full hue-chip shrink-0" aria-hidden="true"></i>{{ t.label }}
                </span>
                <span class="text-ds-2xl font-bold text-ink leading-none tabular-nums">{{ t.count }}</span>
              </div>
              <p class="mt-1.5 text-[12px] text-ink-3">占全部 {{ share(t.count) }}%</p>
            </NuxtLink>
          </div>
          <p v-else class="text-ds-sm text-ink-3">还没有打上 type/* 标签的笔记。</p>
        </section>

        <!-- ③ 按成熟度 -->
        <section class="mb-10">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="text-ds-xl font-semibold text-ink">按成熟度</h2>
            <span class="text-[12px] text-ink-3">幼苗 → 生长中 → 常青</span>
          </div>
          <ul v-if="maturityBuckets.length" class="space-y-1.5">
            <li v-for="m in maturityBuckets" :key="m.key">
              <NuxtLink
                :to="browseTo('maturity', m.key)"
                class="flex items-center gap-3 px-4 py-3 rounded-card border border-line bg-surface hover:border-accent/50 transition-colors duration-base"
                :style="{ '--h': `var(${maturityHue(m.key)})` }"
              >
                <span class="text-ds-sm font-semibold text-ink w-16 shrink-0 flex items-center gap-1.5">
                  <i class="w-1.5 h-1.5 rounded-full hue-chip shrink-0" aria-hidden="true"></i>{{ m.label }}
                </span>
                <span class="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <span class="block h-full hue-bar" :style="{ width: `${share(m.count)}%` }"></span>
                </span>
                <span class="text-ds-sm font-mono text-ink-2 tabular-nums w-10 text-right">{{ m.count }}</span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="text-ds-sm text-ink-3">还没有可统计的成熟度。</p>
        </section>

        <!-- 最近更新 -->
        <section>
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="text-ds-xl font-semibold text-ink">最近更新</h2>
            <NuxtLink to="/notes" class="text-ds-sm text-accent hover:underline inline-flex items-center gap-1">
              全部笔记<ArrowRight class="w-3.5 h-3.5" />
            </NuxtLink>
          </div>

          <ul v-if="list?.notes?.length" class="space-y-1">
            <li v-for="note in list.notes" :key="note.slug">
              <NoteRow :note="note" />
            </li>
          </ul>
          <EmptyState
            v-else
            title="花园还是空的"
            reason="向 content/vault 目录添加 Markdown 笔记后，这里会自动出现最近更新的内容。"
            action-text="了解如何导入"
            action-to="/admin"
          />
        </section>
      </div>

      <!-- 右栏 -->
      <aside class="min-w-0 space-y-6">
        <section class="rounded-card border border-line bg-surface p-4">
          <h3 class="text-ds-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5 text-accent" />快速入口
          </h3>
          <ul class="space-y-1">
            <li v-for="q in quickLinks" :key="q.to">
              <NuxtLink
                :to="q.to"
                class="flex items-start gap-2.5 px-2.5 py-2 rounded-ctl hover:bg-surface-3 transition-colors duration-micro group"
              >
                <component :is="q.icon" class="w-4 h-4 mt-0.5 text-ink-3 group-hover:text-accent transition-colors duration-micro" />
                <span class="min-w-0">
                  <span class="block text-ds-sm font-medium text-ink">{{ q.label }}</span>
                  <span class="block text-[12px] text-ink-3 leading-summary">{{ q.desc }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="topTags.length" class="rounded-card border border-line bg-surface p-4">
          <h3 class="text-ds-sm font-semibold text-ink mb-3">常用标签</h3>
          <div v-if="!topTags.length && tagsPending" class="flex flex-wrap gap-1.5" aria-busy="true">
            <span v-for="i in 8" :key="i" class="h-5 w-16 rounded-full bg-surface-3 animate-pulse" />
          </div>
          <div v-else class="flex flex-wrap gap-1.5">
            <TagPill
              v-for="t in topTags"
              :key="t.name"
              :name="t.name"
              :count="t.count"
              :to="`/notes?tag=${encodeURIComponent(t.name)}`"
            />
          </div>
        </section>

        <section class="rounded-card border border-line bg-surface p-4">
          <h3 class="text-ds-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
            <Activity class="w-3.5 h-3.5 text-accent" />Vault 状态
          </h3>
          <dl class="space-y-1.5 text-[12px]">
            <div class="flex items-center justify-between">
              <dt class="text-ink-3">已发布笔记</dt>
              <dd class="font-mono text-ink-2 tabular-nums">{{ stats.total }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-ink-3">双向链接</dt>
              <dd class="font-mono text-ink-2 tabular-nums">{{ stats.links }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-ink-3">孤立笔记</dt>
              <dd class="font-mono text-ink-2 tabular-nums">{{ stats.isolated }}</dd>
            </div>
          </dl>
          <p class="mt-3 text-[12px] text-ink-3 leading-summary">
            保存到 vault 的 Markdown 由 watcher 自动同步入库。
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
