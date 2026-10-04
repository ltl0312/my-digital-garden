<template>
  <!-- 右栏：节点详情（计划书 T2.2） -->
  <div class="flex flex-col h-full">
    <div class="p-3 space-y-3 overflow-y-auto flex-1">
      <!-- 标题 + 色点 -->
      <div class="flex items-start gap-2">
        <span class="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" :style="{ background: color }"></span>
        <h2 class="text-ds-base font-semibold text-ink leading-snug break-words">{{ node.title }}</h2>
      </div>

      <!-- 摘要 -->
      <p v-if="node.summary" class="text-[12px] text-ink-2 leading-relaxed">{{ node.summary }}</p>

      <!-- 路径（Mono 11px） -->
      <p v-if="node.dirPath" class="font-mono text-[11px] text-ink-3 break-all">{{ node.dirPath }}</p>

      <!-- 徽章行 -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] text-ink-2 bg-surface-3">
          <span class="w-1.5 h-1.5 rounded-full" :style="{ background: MATURITY_COLORS[node.maturity] || 'var(--ink-3)' }"></span>
          {{ MATURITY_LABEL[node.maturity] || node.maturity }}
        </span>
        <button
          v-if="node.domain"
          type="button"
          class="inline-flex items-center h-[22px] px-2 rounded-full text-[11px] text-ink-2 bg-surface-3 hover:text-ink transition-colors duration-micro"
          :title="`只看「${node.domain}」`"
          @click="emit('onlyDomain', node.domain)"
        >
          {{ node.domain }}
        </button>
      </div>

      <!-- Meta 三格 -->
      <dl class="grid grid-cols-3 gap-2 rounded-ctl border border-line bg-surface-2 p-2 text-center">
        <div>
          <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ inLinks.length }}</dd>
          <dt class="text-[11px] text-ink-3">入链</dt>
        </div>
        <div>
          <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ outLinks.length }}</dd>
          <dt class="text-[11px] text-ink-3">出链</dt>
        </div>
        <div>
          <dd class="font-mono text-[12px] font-bold text-ink tabular-nums">{{ updatedLabel }}</dd>
          <dt class="text-[11px] text-ink-3">最近更新</dt>
        </div>
      </dl>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex-1 h-9 rounded-ctl bg-[var(--accent)] text-[var(--accent-ink)] text-ds-sm font-medium hover:opacity-90 transition-opacity duration-micro"
          data-testid="graph-open-note"
          @click="emit('open', node.slug)"
        >
          打开笔记
        </button>
        <button
          type="button"
          class="flex-1 h-9 rounded-ctl border border-line text-ds-sm text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
          data-testid="graph-focus-neighbors"
          @click="emit('focusNeighbors', node.id)"
        >
          聚焦邻居
        </button>
      </div>

      <!-- 入链 -->
      <section>
        <h3 class="text-[12px] font-semibold text-ink-3 mb-1.5">入链（{{ inLinks.length }}）</h3>
        <ul v-if="inLinks.length" class="space-y-0.5">
          <li v-for="n in inLinks" :key="n.id" class="group flex items-center gap-1">
            <button
              type="button"
              class="flex-1 min-w-0 text-left h-7 px-2 rounded-[6px] text-[12px] text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro truncate"
              @click="emit('select', n.id)"
            >
              {{ n.title }}
            </button>
            <button
              type="button"
              class="shrink-0 w-7 h-7 rounded-[6px] flex items-center justify-center text-ink-3 hover:text-accent hover:bg-surface-3 transition-colors duration-micro"
              :aria-label="`在图中定位 ${n.title}`"
              :title="`在图中定位 ${n.title}`"
              data-testid="graph-locate"
              @click="emit('locate', n.id)"
            >
              <Crosshair class="w-3.5 h-3.5" />
            </button>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-3">暂无入链</p>
      </section>

      <!-- 出链 -->
      <section>
        <h3 class="text-[12px] font-semibold text-ink-3 mb-1.5">出链（{{ outLinks.length }}）</h3>
        <ul v-if="outLinks.length" class="space-y-0.5">
          <li v-for="n in outLinks" :key="n.id" class="flex items-center gap-1">
            <button
              type="button"
              class="flex-1 min-w-0 text-left h-7 px-2 rounded-[6px] text-[12px] text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro truncate"
              @click="emit('select', n.id)"
            >
              {{ n.title }}
            </button>
            <button
              type="button"
              class="shrink-0 w-7 h-7 rounded-[6px] flex items-center justify-center text-ink-3 hover:text-accent hover:bg-surface-3 transition-colors duration-micro"
              :aria-label="`在图中定位 ${n.title}`"
              :title="`在图中定位 ${n.title}`"
              data-testid="graph-locate"
              @click="emit('locate', n.id)"
            >
              <Crosshair class="w-3.5 h-3.5" />
            </button>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-3">暂无出链</p>
      </section>

      <!-- 标签行（可点加入筛选） -->
      <section v-if="node.tags.length">
        <h3 class="text-[12px] font-semibold text-ink-3 mb-1.5">标签（{{ node.tags.length }}）</h3>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in node.tags"
            :key="t"
            type="button"
            class="inline-flex items-center h-[22px] px-2 rounded-full text-[11px] text-ink-2 bg-surface-3 hover:text-ink transition-colors duration-micro"
            :title="`筛选标签「${t}」`"
            @click="emit('tag', t)"
          >
            #{{ t }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Crosshair } from 'lucide-vue-next'
import { MATURITY_COLORS, MATURITY_LABEL } from '~/lib/graph-constants'
import type { GraphNodeProp } from '~/components/GraphView.vue'
import { domainColor } from '#shared/graph-domain'

const props = defineProps<{
  node: GraphNodeProp
  inLinks: GraphNodeProp[]
  outLinks: GraphNodeProp[]
}>()

const emit = defineEmits<{
  (e: 'open', slug: string): void
  (e: 'select', id: string): void
  (e: 'locate', id: string): void
  (e: 'focusNeighbors', id: string): void
  (e: 'onlyDomain', domain: string): void
  (e: 'tag', tag: string): void
}>()

const color = computed(() => (props.node.domain ? domainColor(props.node.domain) : 'var(--ink-3)'))

const updatedLabel = computed(() => {
  const raw = props.node.updatedAt
  if (!raw) return '—'
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  const day = 86_400_000
  if (diff < day) return '今天'
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前`
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
</script>
