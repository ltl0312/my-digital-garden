<script setup lang="ts">
import { ArrowRight, Search, Sparkles, Network, Library, KeyRound, Activity } from 'lucide-vue-next'

const requestFetch = useRequestFetch()
const commandOpen = useState<boolean>('shell-command-open', () => false)

// 取数与 E2 相同：无新增接口，全部复用既有只读数据源
const { data: list } = await useAsyncData('notes-recent', () =>
  requestFetch('/api/notes', { query: { pageSize: 6 } })
)

const { tags, totalNotes, domains, stats } = useFacets()

const domainCount = computed(() => domains.value.filter(d => d.name !== '其他').length)
const topTags = computed(() => [...(tags.value || [])].sort((a: any, b: any) => b.count - a.count).slice(0, 12))

const stats4 = computed(() => [
  { label: '笔记', value: totalNotes.value, to: '/notes' },
  { label: '标签', value: (tags.value || []).length, to: '/notes' },
  { label: '双向链接', value: stats.value.edges, to: '/graph' },
  { label: '知识领域', value: domainCount.value, to: '/notes' }
])

const quickLinks = [
  { to: '/notes', label: '全部笔记', desc: '按领域 / 标签 / 关键词浏览', icon: Library },
  { to: '/graph', label: '知识图谱', desc: '看清楚知识之间的连接', icon: Network },
  { to: '/admin', label: '访问密钥', desc: '查看自己的身份与权限边界', icon: KeyRound }
]

useHead({ title: '拾光' })
</script>

<template>
  <div class="max-w-[1120px] mx-auto px-4 sm:px-6 py-10">
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-10">
      <!-- 主列 -->
      <div class="min-w-0">
        <!-- Hero -->
        <section class="mb-10">
          <p class="font-serif italic text-ds-base text-accent mb-2">Non-linear Knowledge Sanctuary</p>
          <h1 class="text-[38px] sm:text-[46px] leading-[1.15] font-extrabold tracking-tight text-ink mb-3">
            ✨ 拾光
          </h1>
          <p class="text-ds-base text-ink-2 leading-summary max-w-[52ch] mb-6">
            把零散笔记养成一片会自己生长的花园 —— 双向链接彼此牵连，知识图谱自动成形，读与写都在同一处。
          </p>
          <div class="flex flex-wrap items-center gap-2.5">
            <NuxtLink
              to="/notes"
              class="px-4 py-2.5 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro inline-flex items-center gap-1.5"
            >
              开始浏览<ArrowRight class="w-4 h-4" />
            </NuxtLink>
            <NuxtLink
              to="/graph"
              class="px-4 py-2.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
            >
              <Network class="w-4 h-4" />打开图谱
            </NuxtLink>
            <button
              class="px-4 py-2.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
              @click="commandOpen = true"
            >
              <Search class="w-4 h-4" />搜索
              <kbd class="ml-1 text-[12px] font-mono bg-surface px-1.5 py-0.5 rounded border border-line">⌘K</kbd>
            </button>
          </div>
        </section>

        <!-- 统计条：全部来自现有接口的真实统计 -->
        <section class="mb-10 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NuxtLink
            v-for="s in stats4"
            :key="s.label"
            :to="s.to"
            class="px-4 py-3 rounded-card border border-line bg-surface hover:border-accent/40 transition-colors duration-base"
          >
            <p class="text-ds-2xl font-bold text-ink leading-title tabular-nums">{{ s.value }}</p>
            <p class="text-[12px] text-ink-3 mt-0.5">{{ s.label }}</p>
          </NuxtLink>
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
          <div class="flex flex-wrap gap-1.5">
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
              <dt class="text-ink-3">笔记节点</dt>
              <dd class="font-mono text-ink-2 tabular-nums">{{ stats.nodes }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-ink-3">连接</dt>
              <dd class="font-mono text-ink-2 tabular-nums">{{ stats.edges }}</dd>
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
